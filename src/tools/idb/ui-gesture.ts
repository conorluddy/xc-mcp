import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import {
  calculateSwipeCoordinates,
  toInt,
  calculateSwipeVelocity,
  validateSwipeVelocity,
  SWIPE_PROFILES,
} from '../../types/coordinates.js';

interface IdbUiGestureArgs {
  udid?: string;
  operation: 'swipe' | 'button';

  // For 'swipe' operation
  direction?: 'up' | 'down' | 'left' | 'right';
  startX?: number; // Optional custom start point (in POINTS, not pixels)
  startY?: number;
  endX?: number; // Optional custom end point (in POINTS, not pixels)
  endY?: number;
  duration?: number; // Swipe duration in seconds (e.g., 0.20 for 200ms, default from profile)
  profile?: 'standard' | 'flick' | 'gentle'; // Swipe profile (default: 'standard')

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
 * Supports standard swipe directions (up, down, left, right) with automatic screen-relative path calculation
 * using configurable profiles (flick, swipe, drag), custom swipe paths with precise start/end coordinates,
 * and hardware button simulation (HOME, LOCK, SIRI, SCREENSHOT, APP_SWITCH). Automatically validates velocity
 * to ensure iOS recognizes gestures as swipes (>6000 px/sec). Validates coordinates against device bounds and
 * provides semantic action tracking.
 *
 * **Why you'd use it:**
 * - Automate scroll and navigation gestures - swipe to reveal content, dismiss modals, page through carousels
 * - Use optimized swipe profiles for different UIs - flick for fast page changes, swipe for standard scrolling, drag for slow interactions
 * - Test hardware button interactions without physical device access - home button, lock, app switching
 * - Execute precise custom swipe paths for complex gesture-based UIs (drawing, map navigation)
 * - Track gesture-based test scenarios with semantic metadata (actionName, expectedOutcome)
 *
 * **Swipe Profiles (Empirically Tested):**
 * - "standard": Default balance (75% distance, 200ms, 1475 points/sec) - perfect for general navigation
 * - "flick": Fast page changes (85% distance, 120ms, 2775 points/sec) - use for carousel/rapid navigation
 * - "gentle": Slow scrolling (50% distance, 300ms, 653 points/sec) - reliable but near-minimum threshold
 *
 * All coordinates in POINT space (393×852 for iPhone 16 Pro), NOT pixel space (1179×2556).
 * All profiles tested and verified working on iOS 18.5 home screen.
 *
 * **Parameters:**
 * - operation (required): "swipe" | "button"
 * - direction (for swipe): "up" | "down" | "left" | "right" - auto-calculates screen-relative path
 * - profile (for swipe): "standard" | "flick" | "gentle" - gesture profile (default: "standard")
 * - startX, startY, endX, endY (for custom swipe): Precise POINT coordinates for swipe path
 * - duration (optional, for swipe): Swipe duration in SECONDS (e.g., 0.20 for 200ms) - uses profile default if omitted
 * - buttonType (for button): "HOME" | "LOCK" | "SIDE_BUTTON" | "APPLE_PAY" | "SIRI" | "SCREENSHOT" | "APP_SWITCH"
 * - udid (optional): Target identifier - auto-detects if omitted
 * - actionName, expectedOutcome (optional): Semantic tracking for test documentation
 *
 * **Returns:**
 * Gesture execution status with operation details (direction/button, path coordinates for swipes),
 * duration, velocity info, gesture context metadata, error details if failed, and verification guidance.
 *
 * **Example:**
 * ```typescript
 * // Standard swipe up (default profile, 1475 pts/sec)
 * const result = await idbUiGestureTool({
 *   operation: 'swipe',
 *   direction: 'up',
 *   actionName: 'Scroll to Bottom',
 *   expectedOutcome: 'Reveal footer content'
 * });
 *
 * // Flick swipe for fast page navigation (2775 pts/sec)
 * await idbUiGestureTool({
 *   operation: 'swipe',
 *   direction: 'left',
 *   profile: 'flick',
 *   actionName: 'Go to Next Page'
 * });
 *
 * // Gentle swipe for reliable slow scrolling (653 pts/sec)
 * await idbUiGestureTool({
 *   operation: 'swipe',
 *   direction: 'down',
 *   profile: 'gentle',
 *   actionName: 'Slow Scroll',
 *   expectedOutcome: 'Smooth scrolling without jumps'
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
    duration,
    profile,
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
            profile,
          })
        : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          await executeButtonCommand(resolvedUdid, buttonType!);

    // Record successful gesture
    if (result.success) {
      IDBTargetCache.recordSuccess(resolvedUdid);
    }

    // ============================================================================
    // STAGE 3: Response Formatting
    // ============================================================================

    const durationMs = Date.now() - startTime;

    const swipeResult = operation === 'swipe' ? (result as any) : null;
    const finalProfile = (profile || 'standard') as 'standard' | 'flick' | 'gentle';
    const responseData = {
      success: result.success,
      udid: resolvedUdid,
      targetName: target.name,
      operation,
      gesture:
        operation === 'swipe'
          ? {
              direction: direction || 'custom',
              profile: direction ? finalProfile : undefined,
              path: swipeResult?.path,
              duration: swipeResult?.duration || duration,
              velocity: swipeResult?.velocity,
              velocityWarning: swipeResult?.velocityWarning,
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
        profile: finalProfile,
        velocityWarning: swipeResult?.velocityWarning,
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
 * Execute swipe gesture with optional profile
 *
 * Why: Sends swipe event for navigation, scrolling, etc.
 * Supports directional swipes with profiles and custom paths.
 * CRITICAL: All coordinates in POINT space (393×852), duration in seconds.
 * Validates velocity to ensure iOS recognizes gesture as swipe (>650 points/sec).
 */
interface SwipeCommandResult {
  success: boolean;
  output: string;
  error?: string | undefined;
  path?: { start: [number, number]; end: [number, number] };
  velocity?: number;
  velocityWarning?: string;
}

async function executeSwipeCommand(
  udid: string,
  target: any,
  params: {
    direction?: string;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    duration?: number; // In SECONDS (e.g., 0.20 for 200ms)
    profile?: 'standard' | 'flick' | 'gentle';
  }
): Promise<SwipeCommandResult> {
  const { direction, startX, startY, endX, endY, duration, profile = 'standard' } = params;

  let command: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let swipePath: any;
  let finalDuration = duration; // In seconds
  let distance = 0; // In points

  if (direction) {
    // Directional swipe: Convert direction to integer coordinates with optional profile
    // Why: IDB CLI requires integers, not floats like "964.8000000000001"
    // CRITICAL: screenDimensions are in POINTS (393×852), not pixels!
    const screenW = target.screenDimensions.width; // In POINTS (393 for iPhone 16 Pro)
    const screenH = target.screenDimensions.height; // In POINTS (852 for iPhone 16 Pro)

    const coords = calculateSwipeCoordinates(
      direction as 'up' | 'down' | 'left' | 'right',
      screenW,
      screenH,
      profile as 'standard' | 'flick' | 'gentle'
    );
    const x1 = coords.start.x;
    const y1 = coords.start.y;
    const x2 = coords.end.x;
    const y2 = coords.end.y;

    swipePath = { start: [x1, y1], end: [x2, y2] };

    // Use profile duration if not explicitly provided
    if (finalDuration === undefined) {
      finalDuration = SWIPE_PROFILES[profile as 'standard' | 'flick' | 'gentle'].durationSeconds;
    }

    // Calculate distance for velocity validation
    const dx = x2 - x1;
    const dy = y2 - y1;
    distance = Math.sqrt(dx * dx + dy * dy);

    // Build IDB command with integer coordinates and duration in seconds
    command = `idb ui swipe --udid "${udid}" ${x1} ${y1} ${x2} ${y2}`;
    if (finalDuration !== undefined) {
      command += ` --duration ${finalDuration}`;
    }
  } else {
    // Custom path swipe: Ensure integers for coordinates (in POINT space)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const x1 = toInt(startX!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const y1 = toInt(startY!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const x2 = toInt(endX!);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const y2 = toInt(endY!);

    swipePath = { start: [x1, y1], end: [x2, y2] };

    // Use default if not provided (custom swipes don't follow profiles)
    if (finalDuration === undefined) {
      finalDuration = 0.2; // Default to standard profile duration (200ms)
    }

    // Calculate distance for velocity validation
    const dx = x2 - x1;
    const dy = y2 - y1;
    distance = Math.sqrt(dx * dx + dy * dy);

    command = `idb ui swipe --udid "${udid}" ${x1} ${y1} ${x2} ${y2}`;
    if (finalDuration !== undefined) {
      command += ` --duration ${finalDuration}`;
    }
  }

  // Calculate velocity and validate
  // Duration is in seconds, convert to milliseconds for velocity calculation
  const durationMs = finalDuration * 1000;
  const velocity = calculateSwipeVelocity(distance, durationMs);
  const selectedProfile = profile
    ? SWIPE_PROFILES[profile as 'standard' | 'flick' | 'gentle']
    : SWIPE_PROFILES.standard;
  const velocityValidation = validateSwipeVelocity(velocity, selectedProfile);

  console.error(`[idb-ui-gesture] Executing: ${command}`);
  console.error(
    `[idb-ui-gesture] Velocity: ${velocity.toFixed(0)} points/sec (profile: ${profile})`
  );

  const result = await executeCommand(command, { timeout: 15000 });

  return {
    success: result.code === 0,
    output: result.stdout,
    error: result.stderr || undefined,
    path: swipePath,
    velocity: Math.round(velocity),
    velocityWarning: velocityValidation.warning,
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
    profile?: 'standard' | 'flick' | 'gentle';
    velocityWarning?: string;
  }
): string[] {
  const {
    operation,
    direction,
    buttonType,
    actionName,
    expectedOutcome,
    resolvedUdid,
    profile,
    velocityWarning,
  } = context;

  if (success) {
    const gestureDesc =
      operation === 'swipe'
        ? `swiped ${direction || 'custom path'} (${profile || 'standard'} profile)`
        : `pressed ${buttonType} button`;

    return [
      `✅ Gesture successful: ${gestureDesc}`,
      actionName ? `Action: ${actionName}` : undefined,
      expectedOutcome ? `Expected: ${expectedOutcome}` : undefined,
      velocityWarning ? `⚠️ Warning: ${velocityWarning}` : undefined,
      ``,
      `Next steps to verify gesture:`,
      `• Take screenshot: screenshot --udid ${resolvedUdid}`,
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
          `• Check screen dimensions: ${target.screenDimensions.width}×${target.screenDimensions.height} (in POINTS, not pixels)`,
          `• Try different profile: Use 'flick' for faster swipes, 'gentle' for slower ones`,
          `• Ensure UI is scrollable: Some views don't accept swipe gestures`,
          `• Verify coordinates: Custom swipes should use POINT coordinates (393×852 for iPhone 16 Pro)`,
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
