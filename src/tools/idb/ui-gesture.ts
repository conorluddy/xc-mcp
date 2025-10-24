import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { calculateSwipeCoordinates, toInt } from '../../types/coordinates.js';

interface IdbUiGestureArgs {
  udid?: string;
  operation: 'swipe' | 'button';

  // For 'swipe' operation
  direction?: 'up' | 'down' | 'left' | 'right';
  startX?: number; // Optional custom start point
  startY?: number;
  endX?: number; // Optional custom end point
  endY?: number;
  duration?: number; // Swipe duration in milliseconds (default: 500)

  // For 'button' operation
  buttonType?: 'HOME' | 'LOCK' | 'SIDE_BUTTON' | 'APPLE_PAY' | 'SIRI' | 'SCREENSHOT' | 'APP_SWITCH';

  // LLM optimization
  actionName?: string; // e.g., "Swipe to Next Screen"
  expectedOutcome?: string; // e.g., "Navigate to Gallery"
}

/**
 * Perform gestures and hardware button presses - swipes, scrolls, and device controls for navigation
 *
 * **What it does:**
 * Executes swipe gestures (directional or custom paths) and hardware button presses on iOS targets.
 * Supports standard swipe directions (up, down, left, right) with automatic screen-relative path calculation,
 * custom swipe paths with precise start/end coordinates, and hardware button simulation (HOME, LOCK, SIRI,
 * SCREENSHOT, APP_SWITCH). Validates coordinates against device bounds and provides semantic action tracking.
 *
 * **Why you'd use it:**
 * - Automate scroll and navigation gestures - swipe to reveal content, dismiss modals, page through carousels
 * - Test hardware button interactions without physical device access - home button, lock, app switching
 * - Execute precise custom swipe paths for complex gesture-based UIs (drawing, map navigation)
 * - Track gesture-based test scenarios with semantic metadata (actionName, expectedOutcome)
 *
 * **Parameters:**
 * - operation (required): "swipe" | "button"
 * - direction (for swipe): "up" | "down" | "left" | "right" - auto-calculates screen-relative path
 * - startX, startY, endX, endY (for custom swipe): Precise pixel coordinates for swipe path
 * - duration (optional, for swipe): Swipe duration in milliseconds - default 500ms
 * - buttonType (for button): "HOME" | "LOCK" | "SIDE_BUTTON" | "APPLE_PAY" | "SIRI" | "SCREENSHOT" | "APP_SWITCH"
 * - udid (optional): Target identifier - auto-detects if omitted
 * - actionName, expectedOutcome (optional): Semantic tracking for test documentation
 *
 * **Returns:**
 * Gesture execution status with operation details (direction/button, path coordinates for swipes),
 * duration, gesture context metadata, error details if failed, and verification guidance.
 *
 * **Example:**
 * ```typescript
 * // Swipe up to scroll content
 * const result = await idbUiGestureTool({
 *   operation: 'swipe',
 *   direction: 'up',
 *   actionName: 'Scroll to Bottom',
 *   expectedOutcome: 'Reveal footer content'
 * });
 *
 * // Press home button to background app
 * await idbUiGestureTool({ operation: 'button', buttonType: 'HOME' });
 * ```
 *
 * **Full documentation:** See idb/ui-gesture.md for detailed parameters and button types
 *
 * @param args Tool arguments with operation type and gesture/button details
 * @returns Tool result with gesture status and path information
 */
export async function idbUiGestureTool(args: IdbUiGestureArgs) {
  const {
    udid,
    operation,
    direction,
    startX,
    startY,
    endX,
    endY,
    duration = 500,
    buttonType,
    actionName,
    expectedOutcome,
  } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    if (!operation || !['swipe', 'button'].includes(operation)) {
      throw new McpError(ErrorCode.InvalidRequest, 'operation must be "swipe" or "button"');
    }

    // Validate swipe parameters
    if (operation === 'swipe') {
      // Must have either direction OR custom coordinates
      const hasDirection = direction !== undefined;
      const hasCustomCoords =
        startX !== undefined && startY !== undefined && endX !== undefined && endY !== undefined;

      if (!hasDirection && !hasCustomCoords) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'swipe operation requires either "direction" OR custom coordinates (startX, startY, endX, endY)'
        );
      }

      if (hasDirection && !['up', 'down', 'left', 'right'].includes(direction)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'direction must be "up", "down", "left", or "right"'
        );
      }
    }

    // Validate button parameters
    if (operation === 'button' && !buttonType) {
      throw new McpError(ErrorCode.InvalidRequest, 'button operation requires buttonType');
    }

    // Resolve UDID and validate target is booted
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Gesture
    // ============================================================================

    const result =
      operation === 'swipe'
        ? await executeSwipeCommand(resolvedUdid, target, {
            direction,
            startX,
            startY,
            endX,
            endY,
            duration,
          })
        : await executeButtonCommand(resolvedUdid, buttonType!);

    // Record successful gesture
    if (result.success) {
      IDBTargetCache.recordSuccess(resolvedUdid);
    }

    // ============================================================================
    // STAGE 3: Response Formatting
    // ============================================================================

    const durationMs = Date.now() - startTime;

    const responseData = {
      success: result.success,
      udid: resolvedUdid,
      targetName: target.name,
      operation,
      gesture:
        operation === 'swipe'
          ? {
              direction: direction || 'custom',
              path: 'path' in result ? result.path : undefined,
              duration,
            }
          : {
              buttonType,
            },
      duration: durationMs,
      // LLM optimization: gesture context
      gestureContext:
        actionName || expectedOutcome
          ? {
              actionName,
              expectedOutcome,
            }
          : undefined,
      output: result.output,
      error: result.error || undefined,
      guidance: formatGuidance(result.success, target, {
        operation,
        direction,
        buttonType,
        actionName,
        expectedOutcome,
        resolvedUdid,
      }),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(responseData, null, 2),
        },
      ],
      isError: !result.success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `idb-ui-gesture failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// GESTURE EXECUTION
// ============================================================================

/**
 * Execute swipe gesture
 *
 * Why: Sends swipe event for navigation, scrolling, etc.
 * Supports directional swipes and custom paths.
 */
async function executeSwipeCommand(
  udid: string,
  target: any,
  params: {
    direction?: string;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    duration: number;
  }
): Promise<{ success: boolean; output: string; error?: string | undefined; path?: any }> {
  const { direction, startX, startY, endX, endY, duration } = params;

  let command: string;
  let swipePath: any;

  if (direction) {
    // Directional swipe: Convert direction to integer coordinates
    // Why: IDB CLI requires integers, not floats like "964.8000000000001"
    const screenW = target.screenDimensions.width;
    const screenH = target.screenDimensions.height;

    const coords = calculateSwipeCoordinates(
      direction as 'up' | 'down' | 'left' | 'right',
      screenW,
      screenH
    );
    const x1 = coords.start.x;
    const y1 = coords.start.y;
    const x2 = coords.end.x;
    const y2 = coords.end.y;

    swipePath = { start: [x1, y1], end: [x2, y2] };

    // Build IDB command with integer coordinates
    command = `idb ui swipe --udid "${udid}" ${x1} ${y1} ${x2} ${y2}`;
    if (duration !== 500) {
      // Only add if non-default
      command += ` --duration ${duration}`;
    }
  } else {
    // Custom path swipe: Ensure integers for coordinates
    const x1 = toInt(startX!);
    const y1 = toInt(startY!);
    const x2 = toInt(endX!);
    const y2 = toInt(endY!);

    command = `idb ui swipe --udid "${udid}" ${x1} ${y1} ${x2} ${y2}`;
    if (duration !== 500) {
      command += ` --duration ${duration}`;
    }

    swipePath = { start: [x1, y1], end: [x2, y2] };
  }

  console.error(`[idb-ui-gesture] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 15000 });

  return {
    success: result.code === 0,
    output: result.stdout,
    error: result.stderr || undefined,
    path: swipePath,
  };
}

/**
 * Execute hardware button press
 *
 * Why: Simulates physical button presses (HOME, LOCK, etc.).
 * Useful for testing app backgrounding, device states.
 */
async function executeButtonCommand(
  udid: string,
  buttonType: string
): Promise<{ success: boolean; output: string; error?: string }> {
  // Format: idb ui button --udid <UDID> <BUTTON_TYPE>
  const command = `idb ui button --udid "${udid}" ${buttonType}`;

  console.error(`[idb-ui-gesture] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 10000 });

  return {
    success: result.code === 0,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatGuidance(
  success: boolean,
  target: any,
  context: {
    operation: string;
    direction?: string;
    buttonType?: string;
    actionName?: string;
    expectedOutcome?: string;
    resolvedUdid: string;
  }
): string[] {
  const { operation, direction, buttonType, actionName, expectedOutcome, resolvedUdid } = context;

  if (success) {
    const gestureDesc =
      operation === 'swipe'
        ? `swiped ${direction || 'custom path'}`
        : `pressed ${buttonType} button`;

    return [
      `✅ Gesture successful: ${gestureDesc}`,
      actionName ? `Action: ${actionName}` : undefined,
      expectedOutcome ? `Expected: ${expectedOutcome}` : undefined,
      ``,
      `Next steps to verify gesture:`,
      `• Take screenshot: simctl-screenshot-inline --udid ${resolvedUdid}`,
      expectedOutcome
        ? `• Verify outcome: Check if ${expectedOutcome}`
        : `• Check UI state: Verify screen changed as expected`,
      operation === 'swipe' ? `• Continue navigation: Use idb-ui-gesture or idb-ui-tap` : undefined,
      operation === 'button' && buttonType === 'HOME'
        ? `• App backgrounded: Launch again with idb-launch`
        : undefined,
    ].filter(Boolean) as string[];
  }

  return [
    `❌ Failed to perform gesture: ${operation === 'swipe' ? `swipe ${direction || 'custom'}` : `button ${buttonType}`}`,
    ``,
    `Troubleshooting:`,
    operation === 'swipe'
      ? [
          `• Verify swipe direction: ${direction || `custom path`}`,
          `• Check screen dimensions: ${target.screenDimensions.width}×${target.screenDimensions.height}`,
          `• Try shorter duration: Some UIs need faster swipes`,
          `• Ensure UI is scrollable: Some views don't accept swipe gestures`,
        ]
      : [
          `• Verify button type: ${buttonType}`,
          `• Check target supports button: Not all buttons work on all devices`,
          `• Try alternative: Use idb-ui-tap for on-screen buttons`,
        ],
    ``,
    `Verify target state:`,
    `• idb-targets --operation describe --udid ${resolvedUdid}`,
    `• Take screenshot to see current UI`,
  ]
    .flat()
    .filter(Boolean) as string[];
}
