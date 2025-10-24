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
 * iOS requires >6000 px/sec for reliable swipe recognition.
 */
export interface SwipeProfile {
  name: 'flick' | 'swipe' | 'drag';
  description: string;
  distance: number; // Percentage of screen (e.g., 0.5 for 50%)
  duration: number; // Milliseconds
  minVelocity: number; // px/sec
}

/**
 * Swipe profiles for different gesture types
 *
 * Why: Different UIs respond to different gesture velocities.
 * Flick: Fast page changes, carousel navigation (fast = short duration)
 * Swipe: Standard list scrolling, navigation (balanced)
 * Drag: Slow controlled scrolling, custom interactions (slow = long duration)
 *
 * All profiles exceed iOS minimum velocity threshold of 6000 px/sec
 */
export const SWIPE_PROFILES: Record<'flick' | 'swipe' | 'drag', SwipeProfile> = {
  flick: {
    name: 'flick',
    description: 'Fast page changes and carousel navigation',
    distance: 0.5, // 50% of screen
    duration: 150, // 150ms for high velocity
    minVelocity: 13333, // ~5000px / 0.15s = 33k px/sec (very fast)
  },
  swipe: {
    name: 'swipe',
    description: 'Standard list scrolling and navigation',
    distance: 0.85, // 85% of screen
    duration: 250, // 250ms for balanced velocity
    minVelocity: 11050, // ~2755px / 0.25s = 11k px/sec (fast)
  },
  drag: {
    name: 'drag',
    description: 'Slow controlled scrolling and custom interactions',
    distance: 0.9, // 90% of screen
    duration: 800, // 800ms for low velocity
    minVelocity: 6500, // ~5200px / 0.8s = 6500 px/sec (minimum viable)
  },
};

/**
 * Calculate swipe velocity in pixels per second
 *
 * Why: iOS requires >6000 px/sec for reliable recognition.
 * Low velocity swipes are interpreted as drags, not swipes.
 *
 * @param distance - Distance traveled in pixels
 * @param durationMs - Duration in milliseconds
 * @returns Velocity in pixels per second
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
 *
 * @param velocity - Velocity in pixels per second
 * @param profile - Swipe profile for context
 * @returns Validation result with warning if velocity too low
 */
export function validateSwipeVelocity(
  velocity: number,
  _profile: SwipeProfile
): { valid: boolean; warning?: string } {
  const minVelocity = 6000; // iOS minimum for reliable swipe recognition

  if (velocity < minVelocity) {
    return {
      valid: false,
      warning: `Swipe velocity ${velocity.toFixed(0)} px/sec is below iOS minimum of ${minVelocity} px/sec. Gesture may not be recognized as a swipe.`,
    };
  }

  return { valid: true };
}

/**
 * Calculate directional swipe coordinates with optional profile
 *
 * Why: Convert high-level directions to precise integer coordinates.
 * Ensures consistent swipe behavior across different screen sizes.
 * New defaults: 85% distance, 250ms duration (250px/sec on iPhone 16).
 * Safety margins: 5% from edges to avoid UI controls.
 *
 * @param direction - Swipe direction
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @param profile - Optional swipe profile (defaults to 'swipe')
 * @returns Integer start and end coordinates
 */
export function calculateSwipeCoordinates(
  direction: 'up' | 'down' | 'left' | 'right',
  screenWidth: number,
  screenHeight: number,
  profile?: 'flick' | 'swipe' | 'drag'
): SwipePath {
  const selectedProfile = profile ? SWIPE_PROFILES[profile] : SWIPE_PROFILES.swipe;
  const distance = selectedProfile.distance;
  const safetyMargin = 0.05; // 5% safety margin from edges

  // Calculate center
  const centerX = toInt(screenWidth / 2);
  const centerY = toInt(screenHeight / 2);

  // Calculate swipe distance with safety margins
  // For vertical swipes: use screen height, apply safety margins
  // For horizontal swipes: use screen width, apply safety margins
  const verticalStart = toInt(screenHeight * (safetyMargin + distance / 2));
  const verticalEnd = toInt(screenHeight * (1 - safetyMargin - distance / 2));
  const horizontalStart = toInt(screenWidth * (safetyMargin + distance / 2));
  const horizontalEnd = toInt(screenWidth * (1 - safetyMargin - distance / 2));

  switch (direction) {
    case 'up':
      return {
        start: { x: centerX, y: verticalEnd },
        end: { x: centerX, y: verticalStart },
      };
    case 'down':
      return {
        start: { x: centerX, y: verticalStart },
        end: { x: centerX, y: verticalEnd },
      };
    case 'left':
      return {
        start: { x: horizontalEnd, y: centerY },
        end: { x: horizontalStart, y: centerY },
      };
    case 'right':
      return {
        start: { x: horizontalStart, y: centerY },
        end: { x: horizontalEnd, y: centerY },
      };
  }
}
