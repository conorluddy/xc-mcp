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
 * Calculate directional swipe coordinates
 *
 * Why: Convert high-level directions to precise integer coordinates.
 * Ensures consistent swipe behavior across different screen sizes.
 *
 * @param direction - Swipe direction
 * @param screenWidth - Screen width in pixels
 * @param screenHeight - Screen height in pixels
 * @returns Integer start and end coordinates
 */
export function calculateSwipeCoordinates(
  direction: 'up' | 'down' | 'left' | 'right',
  screenWidth: number,
  screenHeight: number
): SwipePath {
  const centerX = toInt(screenWidth / 2);
  const centerY = toInt(screenHeight / 2);

  switch (direction) {
    case 'up':
      return {
        start: { x: centerX, y: toInt(screenHeight * 0.8) },
        end: { x: centerX, y: toInt(screenHeight * 0.2) },
      };
    case 'down':
      return {
        start: { x: centerX, y: toInt(screenHeight * 0.2) },
        end: { x: centerX, y: toInt(screenHeight * 0.8) },
      };
    case 'left':
      return {
        start: { x: toInt(screenWidth * 0.8), y: centerY },
        end: { x: toInt(screenWidth * 0.2), y: centerY },
      };
    case 'right':
      return {
        start: { x: toInt(screenWidth * 0.2), y: centerY },
        end: { x: toInt(screenWidth * 0.8), y: centerY },
      };
  }
}
