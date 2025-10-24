/**
 * Coordinate Type System
 *
 * Why: IDB and simctl commands require integer coordinates, not floats.
 * Prevent floating point precision issues (e.g., 964.8000000000001) that cause CLI errors.
 *
 * Usage:
 * - Use IntCoordinate for all x/y values passed to IDB/simctl
 * - Use toInt() to safely convert floats to integers
 * - Use validateCoordinate() for input validation
 */

/**
 * Integer coordinate type
 *
 * Represents a screen coordinate that must be an integer.
 * IDB and simctl commands reject floats like "964.8000000000001".
 */
export type IntCoordinate = number;

/**
 * Convert any number to integer coordinate
 *
 * Why: Screen dimension calculations often produce floats (e.g., screenW * 0.8).
 * Math.round() ensures clean integers for CLI commands.
 *
 * @param value - Number to convert (can be float)
 * @returns Integer coordinate safe for IDB/simctl
 */
export function toInt(value: number): IntCoordinate {
  return Math.round(value);
}

/**
 * Validate coordinate is within screen bounds
 *
 * Why: Prevent out-of-bounds taps that always fail.
 * Provides clear error messages vs cryptic CLI failures.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @throws Error if coordinates out of bounds
 */
export function validateCoordinate(
  x: IntCoordinate,
  y: IntCoordinate,
  screenWidth: number,
  screenHeight: number
): void {
  if (x < 0 || x > screenWidth) {
    throw new Error(
      `X coordinate ${x} out of bounds (screen width: ${screenWidth}). Valid range: 0-${screenWidth}`
    );
  }

  if (y < 0 || y > screenHeight) {
    throw new Error(
      `Y coordinate ${y} out of bounds (screen height: ${screenHeight}). Valid range: 0-${screenHeight}`
    );
  }
}

/**
 * Point with integer coordinates
 */
export interface Point {
  x: IntCoordinate;
  y: IntCoordinate;
}

/**
 * Rectangle with integer coordinates
 */
export interface Rect {
  x: IntCoordinate;
  y: IntCoordinate;
  width: IntCoordinate;
  height: IntCoordinate;
}

/**
 * Swipe path with integer coordinates
 */
export interface SwipePath {
  start: Point;
  end: Point;
}

/**
 * Swipe profile definition
 *
 * Why: Different swipe scenarios require different velocities and durations.
 * iOS requires >650 points/sec for reliable swipe recognition.
 *
 * CRITICAL: All coordinates and distances are in POINT space (393×852 for iPhone 16 Pro),
 * NOT pixel space (1179×2556). IDB's swipe command expects POINT coordinates.
 */
export interface SwipeProfile {
  name: 'standard' | 'flick' | 'gentle';
  description: string;
  distancePercent: number; // Percentage of screen in points (e.g., 0.75 for 75%)
  durationSeconds: number; // Duration in seconds
  calculatedVelocity: number; // points/sec (for reference)
}

/**
 * Swipe profiles for different gesture types
 *
 * Empirically tested on iOS 18.5 (iPhone 16 Pro Simulator, 393×852 points)
 *
 * Why: Different UIs respond to different gesture velocities.
 * - Standard: Balanced velocity (1475 pts/sec) - perfect for general navigation
 * - Flick: Fast page changes (2775 pts/sec) - for carousel and rapid navigation
 * - Gentle: Slow scrolling (653 pts/sec) - reliable at near-minimum threshold
 *
 * IMPORTANT: Minimum threshold is ~667 points/sec. Below this, iOS doesn't recognize swipes.
 * All profiles tested and verified working on iOS home screen (page navigation).
 */
export const SWIPE_PROFILES: Record<'standard' | 'flick' | 'gentle', SwipeProfile> = {
  standard: {
    name: 'standard',
    description: 'Default swipe - best for general navigation (1475 pts/sec)',
    distancePercent: 0.75, // 295 points for 393w screen
    durationSeconds: 0.2, // 200ms
    calculatedVelocity: 1475, // 295 / 0.20 = 1475 points/sec
  },
  flick: {
    name: 'flick',
    description: 'Fast swipe - snappy and responsive (2775 pts/sec)',
    distancePercent: 0.85, // 333 points for 393w screen
    durationSeconds: 0.12, // 120ms
    calculatedVelocity: 2775, // 333 / 0.12 = 2775 points/sec
  },
  gentle: {
    name: 'gentle',
    description: 'Slow swipe - reliable but near-minimum threshold (653 pts/sec)',
    distancePercent: 0.5, // 196 points for 393w screen
    durationSeconds: 0.3, // 300ms
    calculatedVelocity: 653, // 196 / 0.30 = 653 points/sec
  },
};

/**
 * Calculate swipe velocity in points per second
 *
 * Why: iOS requires >650 points/sec for reliable recognition.
 * Low velocity swipes are interpreted as drags, not swipes.
 * Uses POINT space (393×852), not pixel space (1179×2556).
 *
 * @param distance - Distance traveled in points
 * @param durationMs - Duration in milliseconds
 * @returns Velocity in points per second
 */
export function calculateSwipeVelocity(distance: number, durationMs: number): number {
  if (durationMs <= 0) {
    throw new Error('Duration must be positive');
  }
  return (distance / durationMs) * 1000; // Convert ms to seconds
}

/**
 * Validate swipe velocity meets iOS minimum threshold
 *
 * Why: iOS requires minimum velocity for swipe recognition.
 * Returns warning if velocity is too low, but execution proceeds.
 * Empirically tested minimum: ~667 points/sec
 *
 * @param velocity - Velocity in points per second
 * @param _profile - Swipe profile for context
 * @returns Validation result with warning if velocity too low
 */
export function validateSwipeVelocity(
  velocity: number,
  _profile: SwipeProfile
): { valid: boolean; warning?: string } {
  const minVelocity = 750; // Conservative minimum for reliable swipe recognition (empirically ~667)

  if (velocity < minVelocity) {
    return {
      valid: false,
      warning: `Swipe velocity ${velocity.toFixed(0)} points/sec is below recommended minimum of ${minVelocity} points/sec. Gesture may not be recognized reliably.`,
    };
  }

  return { valid: true };
}

/**
 * Calculate directional swipe coordinates with optional profile
 *
 * CRITICAL: Uses POINT coordinates (393×852 for iPhone 16 Pro), NOT pixel coordinates.
 * IDB's swipe command expects coordinates in point space.
 *
 * Why: Convert high-level directions to precise integer coordinates.
 * Ensures consistent swipe behavior across different screen sizes.
 * Profiles: Standard (1475 pts/sec), Flick (2775 pts/sec), Gentle (653 pts/sec)
 * Empirically tested on iOS 18.5 home screen (verified page navigation).
 *
 * @param direction - Swipe direction ('up', 'down', 'left', 'right')
 * @param screenWidth - Screen width in POINTS (393 for iPhone 16 Pro), NOT pixels
 * @param screenHeight - Screen height in POINTS (852 for iPhone 16 Pro), NOT pixels
 * @param profile - Optional swipe profile (defaults to 'standard')
 * @returns Integer start and end coordinates in POINT space
 */
export function calculateSwipeCoordinates(
  direction: 'up' | 'down' | 'left' | 'right',
  screenWidth: number,
  screenHeight: number,
  profile?: 'standard' | 'flick' | 'gentle'
): SwipePath {
  const selectedProfile = profile ? SWIPE_PROFILES[profile] : SWIPE_PROFILES.standard;
  const distancePercent = selectedProfile.distancePercent;

  // Calculate center point
  const centerX = toInt(screenWidth / 2);
  const centerY = toInt(screenHeight / 2);

  // Calculate swipe distance
  // For horizontal swipes: use screen width
  // For vertical swipes: use screen height
  const horizontalDistance = toInt(screenWidth * distancePercent);
  const verticalDistance = toInt(screenHeight * distancePercent);

  switch (direction) {
    case 'up':
      // Swipe from bottom to top
      return {
        start: { x: centerX, y: toInt(centerY + verticalDistance / 2) },
        end: { x: centerX, y: toInt(centerY - verticalDistance / 2) },
      };
    case 'down':
      // Swipe from top to bottom
      return {
        start: { x: centerX, y: toInt(centerY - verticalDistance / 2) },
        end: { x: centerX, y: toInt(centerY + verticalDistance / 2) },
      };
    case 'left':
      // Swipe from right to left
      return {
        start: { x: toInt(centerX + horizontalDistance / 2), y: centerY },
        end: { x: toInt(centerX - horizontalDistance / 2), y: centerY },
      };
    case 'right':
      // Swipe from left to right
      return {
        start: { x: toInt(centerX - horizontalDistance / 2), y: centerY },
        end: { x: toInt(centerX + horizontalDistance / 2), y: centerY },
      };
  }
}
