import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { responseCache } from '../../utils/response-cache.js';
import { promises as fs } from 'fs';

interface SimctlTypeTextToolArgs {
  udid: string;
  text: string;
  isSensitive?: boolean;
  keyboardActions?: string[];
  actionName?: string;
}

/**
 * Type text into the focused text field on the simulator
 *
 * Examples:
 * - Type simple text: udid: "device-123", text: "hello"
 * - Type email: udid: "device-123", text: "user@example.com"
 * - Type password: udid: "device-123", text: "secret123", isSensitive: true
 * - Type and press return: udid: "device-123", text: "search", keyboardActions: ["return"]
 *
 * Keyboard actions: backspace, return, tab, delete, space, etc.
 *
 * LLM Optimization:
 * Include actionName to track text input in agent workflows. isSensitive prevents
 * logging of sensitive data. Timestamp enables agent verification with screenshots.
 */
export async function simctlTypeTextTool(args: any) {
  const { udid, text, isSensitive, keyboardActions, actionName } = args as SimctlTypeTextToolArgs;

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

    // Write text to temp file for secure handling
    const tempFile = `/tmp/type_text_${Date.now()}.txt`;
    await fs.writeFile(tempFile, text, 'utf8');

    try {
      // Build type command
      const command = `cat "${tempFile}" | xcrun simctl io "${udid}" type`;

      console.error(`[simctl-type-text] Typing text to ${udid}`);

      const result = await executeCommand(command, {
        timeout: 10000,
      });

      // Execute keyboard actions if provided
      if (keyboardActions && keyboardActions.length > 0) {
        for (const action of keyboardActions) {
          const actionCmd = `xcrun simctl io "${udid}" key ${action}`;
          await executeCommand(actionCmd, { timeout: 5000 });
        }
      }

      const success = result.code === 0;
      const timestamp = new Date().toISOString();

      // Generate text preview
      let textPreview: string | undefined;
      if (text.length > 100) {
        textPreview = text.substring(0, 100) + '...';
      } else {
        textPreview = text;
      }

      // Store full response in cache for progressive disclosure
      const interactionId = responseCache.store({
        tool: 'simctl-type-text',
        fullOutput: result.stdout,
        stderr: result.stderr,
        exitCode: result.code,
        command: isSensitive ? 'xcrun simctl io [UDID] type [REDACTED]' : command,
        metadata: {
          udid,
          textLength: String(text.length),
          isSensitive: isSensitive ? 'true' : 'false',
          actionName: actionName || 'unlabeled',
          keyboardActionsCount: keyboardActions ? String(keyboardActions.length) : '0',
          timestamp,
        },
      });

      // Create summary response with caching
      const responseData = {
        success,
        udid,
        // Progressive disclosure: summary + cacheId
        textInfo: {
          textLength: text.length,
          textPreview: isSensitive ? '[REDACTED]' : textPreview,
          isSensitive: isSensitive || false,
          actionName: actionName || undefined,
        },
        keyboardActions: keyboardActions || undefined,
        timestamp,
        simulatorInfo: {
          name: simulator.name,
          state: simulator.state,
        },
        cacheId: interactionId,
        guidance: success
          ? [
              `✅ Text typed (${text.length} characters)`,
              actionName ? `Action: ${actionName}` : undefined,
              isSensitive ? `Sensitive data - output redacted` : `Preview: ${textPreview}`,
              `Use simctl-get-interaction-details to view full output`,
              `Verify input: simctl-io ${udid} screenshot`,
            ].filter(Boolean)
          : [
              `❌ Failed to type text`,
              `Make sure a text input field is focused`,
              `Tap on text field first: simctl-tap ${udid} <x> <y>`,
              simulator.state !== 'Booted'
                ? `Simulator is not booted: simctl-boot ${udid}`
                : `Verify simulator state`,
            ],
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
      `simctl-type-text failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
