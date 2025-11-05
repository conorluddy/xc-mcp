import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Coordinate transformation for screenshot → device mapping
 *
 * <architecture>
 * Screenshots may be resized for token efficiency (e.g., 256×512 from 1179×2556).
 * User identifies elements at screenshot coordinates (100, 200).
 * IDB requires absolute device coordinates (200, 400).
 * This utility transforms between coordinate spaces.
 * </architecture>
 */

export interface CoordinateTransform {
  scaleX: number; // Device width / Screenshot width
  scaleY: number; // Device height / Screenshot height
  originalDimensions: { width: number; height: number };
  displayDimensions: { width: number; height: number };
}

export interface TransformToDeviceOptions {
  screenshotX: number;
  screenshotY: number;
  transform: CoordinateTransform;
}

export interface DeviceCoordinates {
  x: number;
  y: number;
}

export interface DeviceDimensions {
  width: number;
  height: number;
}

/**
 * Transform screenshot coordinates to device coordinates
 *
 * Why: Screenshots are resized for token efficiency, but IDB needs absolute device coordinates.
 * This function applies the scale transformation to convert between coordinate spaces.
 *
 * @param options - Screenshot coordinates and transformation parameters
 * @returns Device coordinates ready for IDB tap/swipe operations
 */
export function transformToDevice(options: TransformToDeviceOptions): DeviceCoordinates {
  const { screenshotX, screenshotY, transform } = options;

  return {
    x: Math.round(screenshotX * transform.scaleX),
    y: Math.round(screenshotY * transform.scaleY),
  };
}

/**
 * Transform device coordinates back to screenshot coordinates
 *
 * Why: For debugging and verification, convert device coordinates back to screenshot space.
 * Enables agents to verify "did I tap the right place on the screenshot?"
 *
 * @param deviceX - Device X coordinate
 * @param deviceY - Device Y coordinate
 * @param transform - Coordinate transformation parameters
 * @returns Screenshot coordinates
 */
export function transformToScreenshot(
  deviceX: number,
  deviceY: number,
  transform: CoordinateTransform
): DeviceCoordinates {
  return {
    x: Math.round(deviceX / transform.scaleX),
    y: Math.round(deviceY / transform.scaleY),
  };
}

/**
 * Validate coordinates are within device bounds
 *
 * Why: Prevent taps outside screen boundaries (causes IDB errors).
 * Better to fail fast with clear error than pass invalid coords to IDB.
 *
 * @param x - Device X coordinate
 * @param y - Device Y coordinate
 * @param deviceDimensions - Device screen dimensions
 * @throws McpError if coordinates are outside device bounds
 */
export function validateDeviceCoordinates(
  x: number,
  y: number,
  deviceDimensions: DeviceDimensions
): void {
  if (x < 0 || x > deviceDimensions.width) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `X coordinate ${x} is outside device width (0-${deviceDimensions.width}). ` +
        `Check coordinate transformation or use absolute device coordinates.`
    );
  }

  if (y < 0 || y > deviceDimensions.height) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Y coordinate ${y} is outside device height (0-${deviceDimensions.height}). ` +
        `Check coordinate transformation or use absolute device coordinates.`
    );
  }
}

/**
 * Create coordinate transform from screenshot size metadata
 *
 * Why: Convenience helper to create transform from screenshot-inline response.
 * Agents can pass coordinateTransform directly without manual calculation.
 *
 * @param originalWidth - Device screen width
 * @param originalHeight - Device screen height
 * @param displayWidth - Screenshot width
 * @param displayHeight - Screenshot height
 * @returns CoordinateTransform ready for transformToDevice()
 */
export function createCoordinateTransform(
  originalWidth: number,
  originalHeight: number,
  displayWidth: number,
  displayHeight: number
): CoordinateTransform {
  return {
    scaleX: originalWidth / displayWidth,
    scaleY: originalHeight / displayHeight,
    originalDimensions: { width: originalWidth, height: originalHeight },
    displayDimensions: { width: displayWidth, height: displayHeight },
  };
}
