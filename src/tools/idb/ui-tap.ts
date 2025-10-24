import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import {
  transformToDevice,
  validateDeviceCoordinates,
  type CoordinateTransform,
} from '../../utils/coordinate-transform.js';
import { toInt } from '../../types/coordinates.js';

interface IdbUiTapArgs {
  udid?: string;
  x: number;
  y: number;
  numberOfTaps?: number; // Default: 1
  duration?: number; // For long press (milliseconds)

  // Coordinate transformation (from screenshot-inline)
  applyScreenshotScale?: boolean;
  screenshotScaleX?: number;
  screenshotScaleY?: number;

  // LLM optimization: semantic tracking
  actionName?: string; // e.g., "Login Button Tap"
  screenContext?: string; // e.g., "LoginScreen"
  expectedOutcome?: string; // e.g., "Navigate to HomeScreen"
  testScenario?: string; // e.g., "Happy Path Login"
  step?: number; // e.g., 3
}

/**
 * Tap at coordinates on iOS screen - core UI automation primitive with screenshot coordinate transformation
 *
 * **What it does:**
 * Sends precise tap events to iOS targets at specified screen coordinates with automatic coordinate
 * transformation from screenshot space to device space. Supports single tap, double tap, and long press
 * gestures. Validates coordinates against device screen bounds and provides semantic action tracking for
 * test documentation. Works on both simulators and physical devices over USB/WiFi.
 *
 * **Why you'd use it:**
 * - Automate UI interactions from screenshot analysis - tap elements identified visually
 * - Transform screenshot coordinates automatically when screenshots are resized for token efficiency
 * - Validate tap coordinates against device bounds before execution to prevent out-of-range errors
 * - Track test scenarios with semantic metadata (actionName, expectedOutcome, testScenario, step)
 *
 * **Parameters:**
 * - x, y (required): Tap coordinates - device coords or screenshot coords with applyScreenshotScale
 * - udid (optional): Target identifier - auto-detects if omitted
 * - numberOfTaps (optional): Default 1, set 2 for double-tap
 * - duration (optional): Long press duration in milliseconds
 * - applyScreenshotScale (optional): Transform screenshot coords to device coords
 * - screenshotScaleX, screenshotScaleY (optional): Scale factors from screenshot-inline
 * - actionName, screenContext, expectedOutcome, testScenario, step (optional): Semantic tracking
 *
 * **Returns:**
 * Tap execution status with transformed coordinates, input coordinate details (if transformed),
 * action context metadata for test tracking, error details if failed, and verification guidance.
 *
 * **Example:**
 * ```typescript
 * // Tap from screenshot coordinates (auto-transformed)
 * const result = await idbUiTapTool({
 *   x: 150, y: 300,
 *   applyScreenshotScale: true,
 *   screenshotScaleX: 2.0, screenshotScaleY: 2.0,
 *   actionName: "Login Button Tap",
 *   expectedOutcome: "Navigate to HomeScreen"
 * });
 * ```
 *
 * **Full documentation:** See idb/ui-tap.md for detailed parameters and coordinate systems
 *
 * @param args Tool arguments with coordinates and optional transformation parameters
 * @returns Tool result with tap status and coordinate transformation details
 */
export async function idbUiTapTool(args: IdbUiTapArgs) {
  const {
    udid,
    x,
    y,
    numberOfTaps = 1,
    duration,
    applyScreenshotScale,
    screenshotScaleX,
    screenshotScaleY,
    actionName,
    screenContext,
    expectedOutcome,
    testScenario,
    step,
  } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    // Validate coordinates provided
    if (x === undefined || y === undefined) {
      throw new McpError(ErrorCode.InvalidRequest, 'x and y coordinates are required');
    }

    if (typeof x !== 'number' || typeof y !== 'number') {
      throw new McpError(ErrorCode.InvalidRequest, 'x and y must be numbers');
    }

    // Resolve UDID and validate target is booted
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    // Calculate tap coordinates (with optional transformation)
    const tapCoords = calculateTapCoordinates(args, target.screenDimensions);

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Tap
    // ============================================================================

    const result = await executeTapCommand(resolvedUdid, tapCoords, numberOfTaps, duration);

    // Record successful tap for usage tracking
    if (result.success) {
      IDBTargetCache.recordSuccess(resolvedUdid);
    }

    // ============================================================================
    // STAGE 3: Response Formatting
    // ============================================================================

    const duration_ms = Date.now() - startTime;

    const responseData = {
      success: result.success,
      udid: resolvedUdid,
      targetName: target.name,
      tappedAt: {
        x: tapCoords.x,
        y: tapCoords.y,
      },
      inputCoordinates: applyScreenshotScale
        ? {
            screenshotX: x,
            screenshotY: y,
            transformApplied: true,
            scaleX: screenshotScaleX,
            scaleY: screenshotScaleY,
          }
        : undefined,
      numberOfTaps,
      duration: duration_ms,
      // LLM optimization: action context
      actionContext:
        actionName || screenContext || expectedOutcome || testScenario || step
          ? {
              actionName,
              screenContext,
              expectedOutcome,
              testScenario,
              step,
            }
          : undefined,
      output: result.output,
      error: result.error || undefined,
      guidance: formatGuidance(result.success, target, tapCoords, {
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
      `idb-ui-tap failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// COORDINATE CALCULATION
// ============================================================================

/**
 * Calculate tap coordinates with optional screenshot transformation
 *
 * Why: Screenshots may be resized for token efficiency.
 * Transform screenshot coords → device coords for accurate tapping.
 */
function calculateTapCoordinates(
  args: IdbUiTapArgs,
  screenDimensions: { width: number; height: number }
): { x: number; y: number } {
  const { x, y, applyScreenshotScale, screenshotScaleX, screenshotScaleY } = args;

  // Use raw coordinates if no transformation requested
  if (!applyScreenshotScale) {
    // Validate raw coordinates are within bounds
    validateDeviceCoordinates(x, y, screenDimensions);
    return { x, y };
  }

  // Validate scale factors provided
  if (!screenshotScaleX || !screenshotScaleY) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'applyScreenshotScale is true but scale factors not provided. ' +
        'Include screenshotScaleX and screenshotScaleY from screenshot-inline response.'
    );
  }

  // Build coordinate transform
  const transform: CoordinateTransform = {
    scaleX: screenshotScaleX,
    scaleY: screenshotScaleY,
    originalDimensions: screenDimensions,
    displayDimensions: { width: 0, height: 0 }, // Not needed for transform
  };

  // Transform screenshot coords → device coords
  const deviceCoords = transformToDevice({
    screenshotX: x,
    screenshotY: y,
    transform,
  });

  // Validate transformed coordinates are within device bounds
  validateDeviceCoordinates(deviceCoords.x, deviceCoords.y, screenDimensions);

  return deviceCoords;
}

// ============================================================================
// TAP EXECUTION
// ============================================================================

/**
 * Execute IDB tap command
 *
 * Why: Sends tap event to target at specified coordinates.
 * Supports single tap, multi-tap, and long press.
 */
async function executeTapCommand(
  udid: string,
  coords: { x: number; y: number },
  numberOfTaps: number,
  duration?: number
): Promise<{ success: boolean; output: string; error?: string }> {
  // Build IDB tap command with integer coordinates
  // Why: IDB CLI requires integers, not floats
  const x = toInt(coords.x);
  const y = toInt(coords.y);
  let command = `idb ui tap --udid "${udid}" ${x} ${y}`;

  // Add duration for long press
  if (duration && duration > 0) {
    command += ` --duration ${duration}`;
  }

  console.error(`[idb-ui-tap] Executing: ${command}`);

  // Execute tap (may need multiple taps)
  let lastResult: any;
  for (let i = 0; i < numberOfTaps; i++) {
    lastResult = await executeCommand(command, { timeout: 10000 });

    if (lastResult.code !== 0) {
      return {
        success: false,
        output: lastResult.stdout,
        error: lastResult.stderr || 'Tap failed',
      };
    }

    // Small delay between taps for multi-tap
    if (i < numberOfTaps - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    success: lastResult.code === 0,
    output: lastResult.stdout,
  };
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatGuidance(
  success: boolean,
  target: any,
  coords: { x: number; y: number },
  context: {
    actionName?: string;
    expectedOutcome?: string;
    resolvedUdid: string;
  }
): string[] {
  const { actionName, expectedOutcome, resolvedUdid } = context;

  if (success) {
    return [
      `✅ Tapped at (${coords.x}, ${coords.y}) on "${target.name}"`,
      actionName ? `Action: ${actionName}` : undefined,
      expectedOutcome ? `Expected: ${expectedOutcome}` : undefined,
      ``,
      `Next steps to verify tap:`,
      `• Take screenshot: simctl-screenshot-inline --udid ${resolvedUdid}`,
      expectedOutcome
        ? `• Verify outcome: Check if UI changed as expected`
        : `• Check UI state: Use idb-ui-describe to query current UI`,
      `• Continue interaction: Use idb-ui-tap, idb-ui-input, idb-ui-gesture`,
    ].filter(Boolean) as string[];
  }

  return [
    `❌ Failed to tap at (${coords.x}, ${coords.y})`,
    ``,
    `Troubleshooting:`,
    `• Verify coordinates: Take screenshot and identify correct position`,
    `• Check target state: idb-targets --operation describe --udid ${resolvedUdid}`,
    `• Ensure UI is responsive: Element may not be tappable yet`,
    `• Try idb-ui-describe to find tappable elements`,
    ``,
    `Coordinate validation:`,
    `• Device screen: ${target.screenDimensions.width}×${target.screenDimensions.height}`,
    `• Tap coordinates: (${coords.x}, ${coords.y})`,
    `• Within bounds: ${coords.x >= 0 && coords.x <= target.screenDimensions.width && coords.y >= 0 && coords.y <= target.screenDimensions.height ? 'Yes ✅' : 'No ❌'}`,
  ];
}
