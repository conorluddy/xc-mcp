import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { responseCache } from '../../utils/response-cache.js';

interface SimctlTapToolArgs {
  udid: string;
  x: number;
  y: number;
  numberOfTaps?: number;
  duration?: number;
  actionName?: string;
}

/**
 * Simulate tap interactions on the simulator screen
 *
 * Examples:
 * - Single tap: udid: "device-123", x: 100, y: 200
 * - Double tap: udid: "device-123", x: 100, y: 200, numberOfTaps: 2
 * - Long press: udid: "device-123", x: 100, y: 200, duration: 1.0
 *
 * Coordinates are in screen pixels. Use simctl-query-ui to find element locations.
 *
 * LLM Optimization:
 * Include actionName to track tap interactions in agent workflows. Timestamp and
 * coordinates enable agents to verify tap success with screenshots.
 */
export async function simctlTapTool(args: any) {
  const { udid, x, y, numberOfTaps = 1, duration, actionName } = args as SimctlTapToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (x === undefined || y === undefined) {
      throw new McpError(ErrorCode.InvalidRequest, 'Coordinates (x, y) are required');
    }

    if (x < 0 || y < 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Coordinates must be non-negative integers');
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(udid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${udid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Build tap command
    let command = `xcrun simctl io "${udid}" tap ${x} ${y}`;

    if (numberOfTaps > 1) {
      command = `xcrun simctl io "${udid}" tap --count ${numberOfTaps} ${x} ${y}`;
    }

    if (duration && duration > 0) {
      command = `xcrun simctl io "${udid}" tap --duration ${duration} ${x} ${y}`;
    }

    console.error(`[simctl-tap] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const success = result.code === 0;
    const timestamp = new Date().toISOString();

    // Store full response in cache for progressive disclosure
    const interactionId = responseCache.store({
      tool: 'simctl-tap',
      fullOutput: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      command,
      metadata: {
        udid,
        x: String(x),
        y: String(y),
        numberOfTaps: String(numberOfTaps),
        duration: duration ? String(duration) : 'none',
        actionName: actionName || 'unlabeled',
        timestamp,
      },
    });

    // Create summary response with caching
    const responseData = {
      success,
      udid,
      coordinates: { x, y },
      // Progressive disclosure: summary + cacheId
      tapInfo: {
        numberOfTaps,
        duration: duration || undefined,
        actionName: actionName || undefined,
        timestamp,
      },
      simulatorInfo: {
        name: simulator.name,
        state: simulator.state,
      },
      cacheId: interactionId,
      guidance: success
        ? [
            `✅ Tap executed at {${x}, ${y}}`,
            actionName ? `Action: ${actionName}` : undefined,
            `Use simctl-get-interaction-details to view command output`,
            `Verify result: simctl-io ${udid} screenshot`,
          ].filter(Boolean)
        : [
            `❌ Failed to tap at {${x}, ${y}}`,
            simulator.state !== 'Booted'
              ? `Simulator is not booted. Boot it first: simctl-boot ${udid}`
              : `Check coordinates are on screen`,
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
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-tap failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
