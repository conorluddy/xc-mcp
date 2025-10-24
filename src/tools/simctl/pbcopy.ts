import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlPbcopyToolArgs {
  udid: string;
  text: string;
}

/**
 * Copy text to the clipboard of a simulator (simulated UIPasteboard)
 *
 * Examples:
 * - Copy text: udid: "device-123", text: "Hello World"
 * - Copy URL: udid: "device-123", text: "https://example.com"
 * - Copy JSON: udid: "device-123", text: '{"key":"value"}'
 *
 * This simulates the pasteboard in the simulator, allowing apps to access
 * the pasted content via UIPasteboard.general.string
 *
 * **Full documentation:** See simctl/pbcopy.md for detailed parameters and examples
 */
export async function simctlPbcopyTool(args: any) {
  const { udid, text } = args as SimctlPbcopyToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (!text || text.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Text is required and cannot be empty');
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(udid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${udid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Write text to temp file
    const tempFile = `/tmp/pbcopy_${Date.now()}.txt`;
    const fs = await import('fs/promises');
    await fs.writeFile(tempFile, text, 'utf8');

    try {
      // Execute pbcopy command
      const command = `cat "${tempFile}" | xcrun simctl pbcopy "${udid}"`;
      console.error(`[simctl-pbcopy] Executing: xcrun simctl pbcopy "${udid}"`);

      const result = await executeCommand(command, {
        timeout: 10000,
      });

      const success = result.code === 0;

      // Build guidance messages
      const guidanceMessages: string[] = [];

      if (success) {
        guidanceMessages.push(
          `✅ Text copied to clipboard on "${simulator.name}"`,
          `Text length: ${text.length} characters`,
          `App can access via: UIPasteboard.general.string`,
          `Test paste in app: simctl-launch ${udid} com.example.app`
        );
      } else {
        guidanceMessages.push(
          `❌ Failed to copy to clipboard: ${result.stderr || 'Unknown error'}`,
          `Check simulator is available: simctl-health-check`,
          `Verify text format: ${text.substring(0, 50)}...`
        );
      }

      // Add warnings for simulator state regardless of success
      if (simulator.state !== 'Booted') {
        guidanceMessages.push(
          `⚠️ Warning: Simulator is in ${simulator.state} state. Boot the simulator for optimal functionality: simctl-boot ${udid}`
        );
      }
      if (simulator.isAvailable === false) {
        guidanceMessages.push(
          `⚠️ Warning: Simulator is marked as unavailable. This may cause issues with operations.`
        );
      }

      const responseData = {
        success,
        udid,
        textLength: text.length,
        textPreview: text.length > 100 ? text.substring(0, 100) + '...' : text,
        simulatorInfo: {
          name: simulator.name,
          udid: simulator.udid,
          state: simulator.state,
          isAvailable: simulator.isAvailable,
        },
        command,
        output: result.stdout,
        error: result.stderr || undefined,
        exitCode: result.code,
        guidance: guidanceMessages,
      };

      const responseText = JSON.stringify(responseData, null, 2);

      return {
        content: [
          {
            type: 'text' as const,
            text: responseText,
          },
        ],
        isError: !success,
      };
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-pbcopy failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
