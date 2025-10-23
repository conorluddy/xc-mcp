import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { responseCache } from '../../utils/response-cache.js';

type GestureType = 'swipe' | 'pinch' | 'rotate' | 'multitouch';
type GestureDirection = 'up' | 'down' | 'left' | 'right';

interface SimctlGestureToolArgs {
  udid: string;
  type: GestureType;
  direction?: GestureDirection;
  scale?: number;
  angle?: number;
  startX?: number;
  startY?: number;
  centerX?: number;
  centerY?: number;
  fingers?: number;
  action?: string;
  actionName?: string;
}

/**
 * Perform complex gestures on the simulator
 *
 * Examples:
 * - Swipe left: udid: "device-123", type: "swipe", direction: "left"
 * - Pinch zoom: udid: "device-123", type: "pinch", scale: 2.0
 * - Rotate: udid: "device-123", type: "rotate", angle: 45
 * - Multi-touch: udid: "device-123", type: "multitouch", fingers: 2, action: "tap"
 *
 * Gesture Types:
 * - swipe: Directional swipe (up, down, left, right)
 * - pinch: Zoom gesture with scale factor
 * - rotate: Rotation gesture with angle
 * - multitouch: Multi-finger gestures
 *
 * LLM Optimization:
 * Include actionName for gesture tracking. Timestamp and gesture details enable
 * agents to verify gesture success and app state changes with screenshots.
 */
export async function simctlGestureTool(args: any) {
  const {
    udid,
    type,
    direction,
    scale,
    angle,
    startX,
    startY,
    centerX,
    centerY,
    fingers,
    action,
    actionName,
  } = args as SimctlGestureToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    const validGestureTypes: GestureType[] = ['swipe', 'pinch', 'rotate', 'multitouch'];
    if (!type || !validGestureTypes.includes(type)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Gesture type must be one of: ${validGestureTypes.join(', ')}`
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

    // Build gesture command
    let command = '';
    let gestureDetails = {};

    if (type === 'swipe') {
      if (!direction) {
        throw new McpError(ErrorCode.InvalidRequest, 'Direction is required for swipe gesture');
      }

      const x = startX || 375;
      const y = startY || 667;

      command = `xcrun simctl io "${udid}" swipe ${x} ${y} ${direction}`;
      gestureDetails = { direction, startX: x, startY: y };
    } else if (type === 'pinch') {
      if (scale === undefined) {
        throw new McpError(ErrorCode.InvalidRequest, 'Scale is required for pinch gesture');
      }

      const cx = centerX || 375;
      const cy = centerY || 667;

      command = `xcrun simctl io "${udid}" pinch ${cx} ${cy} ${scale}`;
      gestureDetails = { scale, centerX: cx, centerY: cy };
    } else if (type === 'rotate') {
      if (angle === undefined) {
        throw new McpError(ErrorCode.InvalidRequest, 'Angle is required for rotate gesture');
      }

      const cx = centerX || 375;
      const cy = centerY || 667;

      command = `xcrun simctl io "${udid}" rotate ${cx} ${cy} ${angle}`;
      gestureDetails = { angle, centerX: cx, centerY: cy };
    } else if (type === 'multitouch') {
      if (!fingers || fingers < 2) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'Fingers (minimum 2) is required for multitouch gesture'
        );
      }

      const x = startX || 375;
      const y = startY || 667;

      command = `xcrun simctl io "${udid}" multitouch ${fingers} ${action || 'tap'} ${x} ${y}`;
      gestureDetails = { fingers, action: action || 'tap', x, y };
    }

    console.error(`[simctl-gesture] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const success = result.code === 0;
    const timestamp = new Date().toISOString();

    // Store full response in cache for progressive disclosure
    const interactionId = responseCache.store({
      tool: 'simctl-gesture',
      fullOutput: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      command,
      metadata: {
        udid,
        gestureType: type,
        direction: direction || 'none',
        scale: scale ? String(scale) : 'none',
        angle: angle ? String(angle) : 'none',
        actionName: actionName || 'unlabeled',
        timestamp,
      },
    });

    // Build guidance messages
    const guidanceMessages: (string | undefined)[] = [];

    if (success) {
      guidanceMessages.push(
        `✅ Gesture executed: ${type}`,
        actionName ? `Action: ${actionName}` : undefined,
        `Use simctl-get-interaction-details to view command output`,
        `Verify gesture result: simctl-io ${udid} screenshot`,
        `Query for changes: simctl-query-ui ${udid} ...`
      );
    } else {
      guidanceMessages.push(
        `❌ Failed to perform ${type} gesture`,
        simulator.state !== 'Booted'
          ? `Simulator is not booted: simctl-boot ${udid}`
          : `Check gesture parameters`
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

    // Create summary response with caching
    const responseData = {
      success,
      udid,
      // Progressive disclosure: summary + cacheId
      gestureInfo: {
        type,
        ...gestureDetails,
        actionName: actionName || undefined,
      },
      timestamp,
      simulatorInfo: {
        name: simulator.name,
        state: simulator.state,
      },
      cacheId: interactionId,
      guidance: guidanceMessages.filter(Boolean),
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
      `simctl-gesture failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
