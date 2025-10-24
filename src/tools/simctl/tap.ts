import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { responseCache } from '../../utils/response-cache.js';
import { resolveDeviceId } from '../../utils/device-detection.js';

interface SimctlTapToolArgs {
  udid?: string;
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
    // Resolve device ID (auto-detect if not provided)
    const resolvedUdid = await resolveDeviceId(udid);

    // Validate inputs
    if (!resolvedUdid || resolvedUdid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (x === undefined || y === undefined) {
      throw new McpError(ErrorCode.InvalidRequest, 'Coordinates (x, y) are required');
    }

    if (x < 0 || y < 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Coordinates must be non-negative integers');
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(resolvedUdid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${resolvedUdid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Build tap command
    let command = `xcrun simctl io "${resolvedUdid}" tap ${x} ${y}`;

    if (numberOfTaps > 1) {
      command = `xcrun simctl io "${resolvedUdid}" tap --count ${numberOfTaps} ${x} ${y}`;
    }

    if (duration && duration > 0) {
      command = `xcrun simctl io "${resolvedUdid}" tap --duration ${duration} ${x} ${y}`;
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
        udid: resolvedUdid,
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
      udid: resolvedUdid,
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
            `Verify result: screenshot`,
          ].filter(Boolean)
        : simulator.state !== 'Booted'
          ? [
              `❌ Failed to tap at {${x}, ${y}}`,
              `Simulator is not booted. Boot it first or use simctl-boot with auto-detection`,
            ]
          : [
              `❌ Failed to tap at {${x}, ${y}}`,
              `Coordinate validation failed. Possible reasons:`,
              `1. Coordinates out of bounds - verify screen dimensions`,
              `2. Tapping off-screen area - use simctl-query-ui to find element positions`,
              `3. App not in foreground - verify app is running and visible`,
              `4. Accessibility server not responding - try again or restart simulator`,
              ``,
              `Next steps:`,
              `• Use 'screenshot' tool to see current screen`,
              `• Use 'simctl-query-ui' with element predicates to find coordinates programmatically`,
              `• Check stderr output for detailed error: use 'simctl-get-interaction-details'`,
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
