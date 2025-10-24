import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { responseCache } from '../../utils/response-cache.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { resolveDeviceId } from '../../utils/device-detection.js';

type ScrollDirection = 'up' | 'down' | 'left' | 'right';

interface SimctlScrollToolArgs {
  udid?: string;
  direction: ScrollDirection;
  x?: number;
  y?: number;
  velocity?: number;
  actionName?: string;
}

/**
 * Scroll content on the simulator screen
 *
 * Examples:
 * - Scroll down: direction: "down" (auto-uses booted simulator)
 * - Scroll up: direction: "up" (auto-uses booted simulator)
 * - Scroll at specific location: direction: "down", x: 375, y: 667
 * - Fast scroll: direction: "down", velocity: 10
 * - Scroll on specific device: udid: "device-123", direction: "down"
 *
 * Directions: up, down, left, right
 * Velocity: 1-10 (default: 3)
 * Coordinates: Center of screen by default (375, 667 for iPhone)
 * UDID: Optional, auto-detects booted simulator if not provided
 *
 * LLM Optimization:
 * Include actionName for scroll action tracking. Timestamp and direction enable
 * agents to verify scroll success with screenshots and element queries.
 */
export async function simctlScrollTool(args: any) {
  const { udid, direction, x, y, velocity = 3, actionName } = args as SimctlScrollToolArgs;

  try {
    // Resolve device UDID (auto-detect if not provided)
    const resolvedUdid = await resolveDeviceId(udid);

    const validDirections: ScrollDirection[] = ['up', 'down', 'left', 'right'];
    if (!direction || !validDirections.includes(direction)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Direction must be one of: ${validDirections.join(', ')}`
      );
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(resolvedUdid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${resolvedUdid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Default coordinates to screen center
    const scrollX = x || 375;
    const scrollY = y || 667;

    // Build scroll command using simctl io
    let command = `xcrun simctl io "${resolvedUdid}" scroll`;

    // Add coordinates and direction
    // Note: Actual implementation would depend on simctl scroll API
    // This is a placeholder for the XCUITest scroll functionality
    if (direction === 'up') {
      command += ` ${scrollX} ${scrollY} --up`;
    } else if (direction === 'down') {
      command += ` ${scrollX} ${scrollY} --down`;
    } else if (direction === 'left') {
      command += ` ${scrollX} ${scrollY} --left`;
    } else if (direction === 'right') {
      command += ` ${scrollX} ${scrollY} --right`;
    }

    if (velocity && velocity !== 3) {
      command += ` --velocity ${velocity}`;
    }

    console.error(`[simctl-scroll] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const success = result.code === 0;
    const timestamp = new Date().toISOString();

    // Store full response in cache for progressive disclosure
    const interactionId = responseCache.store({
      tool: 'simctl-scroll',
      fullOutput: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      command,
      metadata: {
        udid: resolvedUdid,
        direction,
        x: String(scrollX),
        y: String(scrollY),
        velocity: String(velocity || 3),
        actionName: actionName || 'unlabeled',
        timestamp,
      },
    });

    // Create summary response with caching
    const responseData = {
      success,
      udid: resolvedUdid,
      // Progressive disclosure: summary + cacheId
      scrollInfo: {
        direction,
        coordinates: { x: scrollX, y: scrollY },
        velocity: velocity || 3,
        actionName: actionName || undefined,
      },
      timestamp,
      simulatorInfo: {
        name: simulator.name,
        state: simulator.state,
      },
      cacheId: interactionId,
      guidance: success
        ? [
            `Scroll ${direction} executed at {${scrollX}, ${scrollY}}`,
            actionName ? `Action: ${actionName}` : undefined,
            `Use simctl-get-interaction-details to view command output`,
            `Verify scroll result with: simctl-io screenshot`,
            `Query for element at new position with: simctl-query-ui`,
          ].filter(Boolean)
        : [
            `Failed to scroll ${direction}`,
            `No scrollable element at coordinates {${scrollX}, ${scrollY}}`,
            simulator.state !== 'Booted'
              ? `Simulator is not booted. Boot it first with simctl-boot`
              : `Try different coordinates or check if content is scrollable`,
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
      `simctl-scroll failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
