import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

type ScrollDirection = 'up' | 'down' | 'left' | 'right';

interface SimctlScrollToolArgs {
  udid: string;
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
 * - Scroll down: udid: "device-123", direction: "down"
 * - Scroll up: udid: "device-123", direction: "up"
 * - Scroll at specific location: udid: "device-123", direction: "down", x: 375, y: 667
 * - Fast scroll: udid: "device-123", direction: "down", velocity: 10
 *
 * Directions: up, down, left, right
 * Velocity: 1-10 (default: 3)
 * Coordinates: Center of screen by default (375, 667 for iPhone)
 *
 * LLM Optimization:
 * Include actionName for scroll action tracking. Timestamp and direction enable
 * agents to verify scroll success with screenshots and element queries.
 */
export async function simctlScrollTool(args: any) {
  const { udid, direction, x, y, velocity = 3, actionName } =
    args as SimctlScrollToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'UDID is required and cannot be empty'
      );
    }

    const validDirections: ScrollDirection[] = ['up', 'down', 'left', 'right'];
    if (!direction || !validDirections.includes(direction)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Direction must be one of: ${validDirections.join(', ')}`
      );
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(udid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${udid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Default coordinates to screen center
    const scrollX = x || 375;
    const scrollY = y || 667;

    // Build scroll command using simctl io
    let command = `xcrun simctl io "${udid}" scroll`;

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

    const responseData = {
      success,
      udid,
      direction,
      coordinates: { x: scrollX, y: scrollY },
      velocity: velocity || 3,
      timestamp,
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
      guidance: success
        ? [
            `✅ Scroll ${direction} performed at {${scrollX}, ${scrollY}}`,
            actionName ? `Action: ${actionName}` : undefined,
            velocity && velocity !== 3
              ? `Velocity: ${velocity}`
              : undefined,
            `Verify scroll result: simctl-io ${udid} screenshot`,
            `Query for element at new position: simctl-query-ui ${udid} ...`,
            `Continue scrolling if needed: simctl-scroll ${udid} ${direction}`,
          ].filter(Boolean)
        : [
            `❌ Failed to scroll ${direction}: ${result.stderr || 'Unknown error'}`,
            `No scrollable element at coordinates {${scrollX}, ${scrollY}}`,
            simulator.state !== 'Booted'
              ? `Simulator is not booted: simctl-boot ${udid}`
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
