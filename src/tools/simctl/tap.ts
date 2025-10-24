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
  retryOnFailure?: boolean;
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
  const {
    udid,
    x,
    y,
    numberOfTaps = 1,
    duration,
    actionName,
    retryOnFailure = true,
  } = args as SimctlTapToolArgs;

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

    // Try to execute tap with optional fallback retries
    const result = await executeTapWithRetry(
      resolvedUdid,
      x,
      y,
      numberOfTaps,
      duration,
      retryOnFailure
    );

    const success = result.code === 0;
    const timestamp = new Date().toISOString();

    // Store full response in cache for progressive disclosure
    const interactionId = responseCache.store({
      tool: 'simctl-tap',
      fullOutput: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      command: result.command,
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
            `✅ Tap executed${retryOnFailure && (result.stderr?.includes('adjusted') ? ' (with fallback retry)' : '')} at {${x}, ${y}}`,
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
              `Tap failed after ${retryOnFailure ? 'multiple retry attempts' : 'single attempt'}.`,
              `Coordinate validation failed. Possible reasons:`,
              `1. Coordinates out of bounds - verify screen dimensions`,
              `2. Tapping off-screen area - use simctl-query-ui to find element positions`,
              `3. App not in foreground - verify app is running and visible`,
              `4. Accessibility server not responding - try again or restart simulator`,
              `5. Element too small or obscured - try nearby coordinates or use query-ui`,
              ``,
              `Next steps:`,
              `• Use 'screenshot' tool to see current screen state`,
              `• Use 'simctl-query-ui' with element predicates to find coordinates programmatically`,
              `• Try tapping nearby coordinates (±5-10px) - fallback retry is enabled by default`,
              `• Check stderr output for detailed error: use 'simctl-get-interaction-details'`,
              `• Set retryOnFailure: false to disable automatic fallback retries`,
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

/**
 * Execute tap command with intelligent retry fallbacks
 *
 * Tries multiple strategies if initial tap fails:
 * 1. First attempt at exact coordinates
 * 2. Retry at center of likely element bounds (±10px)
 * 3. Retry with slight coordinate adjustments
 *
 * This addresses real-world coordinate validation issues where off-by-a-few
 * pixel measurements are common but tap still succeeds nearby.
 */
async function executeTapWithRetry(
  udid: string,
  x: number,
  y: number,
  numberOfTaps: number,
  duration: number | undefined,
  retryOnFailure: boolean
): Promise<{ code: number; stdout: string; stderr: string; command: string }> {
  // Build the base command
  const buildCommand = (tapX: number, tapY: number): string => {
    let cmd = `xcrun simctl io "${udid}" tap ${tapX} ${tapY}`;
    if (numberOfTaps > 1) {
      cmd = `xcrun simctl io "${udid}" tap --count ${numberOfTaps} ${tapX} ${tapY}`;
    }
    if (duration && duration > 0) {
      cmd = `xcrun simctl io "${udid}" tap --duration ${duration} ${tapX} ${tapY}`;
    }
    return cmd;
  };

  // Try primary coordinates
  const primaryCommand = buildCommand(x, y);
  console.error(`[simctl-tap] Executing: ${primaryCommand}`);
  let result = await executeCommand(primaryCommand, { timeout: 10000 });
  let lastCommand = primaryCommand;

  if (result.code === 0 || !retryOnFailure) {
    return { ...result, command: lastCommand };
  }

  // Fallback retry strategy: try nearby coordinates
  // iOS tap zones have some tolerance, so slightly offset coordinates might succeed
  const fallbackOffsets = [
    { dx: 0, dy: -5 }, // Try 5px up
    { dx: 5, dy: 0 }, // Try 5px right
    { dx: 0, dy: 5 }, // Try 5px down
    { dx: -5, dy: 0 }, // Try 5px left
  ];

  for (const offset of fallbackOffsets) {
    const retryX = Math.max(0, x + offset.dx);
    const retryY = Math.max(0, y + offset.dy);

    const retryCommand = buildCommand(retryX, retryY);
    console.error(`[simctl-tap] Retrying at adjusted coordinates: {${retryX}, ${retryY}}`);
    result = await executeCommand(retryCommand, { timeout: 10000 });
    lastCommand = retryCommand;

    if (result.code === 0) {
      console.error(`[simctl-tap] Retry succeeded at {${retryX}, ${retryY}}`);
      return { ...result, command: lastCommand };
    }
  }

  // Return final failed result
  return { ...result, command: lastCommand };
}
