import { describe, it, expect } from '@jest/globals';
import {
  transformToDevice,
  transformToScreenshot,
  validateDeviceCoordinates,
  createCoordinateTransform,
  type CoordinateTransform,
} from '../../../src/utils/coordinate-transform.js';

describe('Coordinate Transformation', () => {
  describe('transformToDevice', () => {
    it('should transform screenshot coordinates to device coordinates', () => {
      // iPhone 16 Pro: 1179×2556 device, 256×512 screenshot
      const transform: CoordinateTransform = {
        scaleX: 1179 / 256, // ~4.6
        scaleY: 2556 / 512, // ~5.0
        originalDimensions: { width: 1179, height: 2556 },
        displayDimensions: { width: 256, height: 512 },
      };

      const result = transformToDevice({
        screenshotX: 100,
        screenshotY: 200,
        transform,
      });

      expect(result.x).toBe(461); // 100 × 4.60546875 ≈ 461
      expect(result.y).toBe(998); // 200 × 4.9921875 ≈ 998
    });

    it('should handle 1:1 scale (no transformation)', () => {
      const transform: CoordinateTransform = {
        scaleX: 1.0,
        scaleY: 1.0,
        originalDimensions: { width: 1179, height: 2556 },
        displayDimensions: { width: 1179, height: 2556 },
      };

      const result = transformToDevice({
        screenshotX: 100,
        screenshotY: 200,
        transform,
      });

      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
    });

    it('should round fractional coordinates', () => {
      const transform: CoordinateTransform = {
        scaleX: 1.33, // Results in fractional coords
        scaleY: 1.33,
        originalDimensions: { width: 400, height: 800 },
        displayDimensions: { width: 300, height: 600 },
      };

      const result = transformToDevice({
        screenshotX: 100,
        screenshotY: 200,
        transform,
      });

      // 100 × 1.33 = 133, 200 × 1.33 = 266
      expect(result.x).toBe(133);
      expect(result.y).toBe(266);
    });
  });

  describe('transformToScreenshot', () => {
    it('should transform device coordinates back to screenshot coordinates', () => {
      const transform: CoordinateTransform = {
        scaleX: 1179 / 256,
        scaleY: 2556 / 512,
        originalDimensions: { width: 1179, height: 2556 },
        displayDimensions: { width: 256, height: 512 },
      };

      // Round-trip: screenshot → device → screenshot
      const deviceCoords = transformToDevice({
        screenshotX: 100,
        screenshotY: 200,
        transform,
      });

      const screenshotCoords = transformToScreenshot(deviceCoords.x, deviceCoords.y, transform);

      expect(screenshotCoords.x).toBe(100);
      expect(screenshotCoords.y).toBe(200);
    });

    it('should handle inverse transformation accurately', () => {
      const transform: CoordinateTransform = {
        scaleX: 2.0,
        scaleY: 2.0,
        originalDimensions: { width: 1000, height: 2000 },
        displayDimensions: { width: 500, height: 1000 },
      };

      const result = transformToScreenshot(400, 800, transform);

      expect(result.x).toBe(200); // 400 / 2.0 = 200
      expect(result.y).toBe(400); // 800 / 2.0 = 400
    });
  });

  describe('validateDeviceCoordinates', () => {
    it('should accept coordinates within device bounds', () => {
      const deviceDimensions = { width: 1179, height: 2556 };

      // Should not throw
      expect(() => {
        validateDeviceCoordinates(100, 200, deviceDimensions);
      }).not.toThrow();

      expect(() => {
        validateDeviceCoordinates(0, 0, deviceDimensions);
      }).not.toThrow();

      expect(() => {
        validateDeviceCoordinates(1179, 2556, deviceDimensions);
      }).not.toThrow();
    });

    it('should reject X coordinate outside device width', () => {
      const deviceDimensions = { width: 1179, height: 2556 };

      expect(() => {
        validateDeviceCoordinates(1200, 500, deviceDimensions);
      }).toThrow('X coordinate 1200 is outside device width');
    });

    it('should reject negative X coordinate', () => {
      const deviceDimensions = { width: 1179, height: 2556 };

      expect(() => {
        validateDeviceCoordinates(-10, 500, deviceDimensions);
      }).toThrow('X coordinate -10 is outside device width');
    });

    it('should reject Y coordinate outside device height', () => {
      const deviceDimensions = { width: 1179, height: 2556 };

      expect(() => {
        validateDeviceCoordinates(500, 3000, deviceDimensions);
      }).toThrow('Y coordinate 3000 is outside device height');
    });

    it('should reject negative Y coordinate', () => {
      const deviceDimensions = { width: 1179, height: 2556 };

      expect(() => {
        validateDeviceCoordinates(500, -10, deviceDimensions);
      }).toThrow('Y coordinate -10 is outside device height');
    });
  });

  describe('createCoordinateTransform', () => {
    it('should create transform with correct scale factors', () => {
      // iPhone 16 Pro: 1179×2556 → 256×512
      const transform = createCoordinateTransform(1179, 2556, 256, 512);

      expect(transform.scaleX).toBeCloseTo(1179 / 256, 2);
      expect(transform.scaleY).toBeCloseTo(2556 / 512, 2);
      expect(transform.originalDimensions).toEqual({ width: 1179, height: 2556 });
      expect(transform.displayDimensions).toEqual({ width: 256, height: 512 });
    });

    it('should create 1:1 transform for same dimensions', () => {
      const transform = createCoordinateTransform(1000, 2000, 1000, 2000);

      expect(transform.scaleX).toBe(1.0);
      expect(transform.scaleY).toBe(1.0);
    });

    it('should work with transformToDevice', () => {
      const transform = createCoordinateTransform(1179, 2556, 256, 512);

      const result = transformToDevice({
        screenshotX: 128,
        screenshotY: 256,
        transform,
      });

      // Verify scale was applied correctly
      expect(result.x).toBeGreaterThan(128);
      expect(result.y).toBeGreaterThan(256);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle typical screenshot → tap workflow', () => {
      // 1. Agent takes screenshot at 256×512 (half size)
      const screenshotDimensions = { width: 256, height: 512 };
      const deviceDimensions = { width: 1179, height: 2556 };

      // 2. Agent identifies button at (100, 200) in screenshot
      const screenshotX = 100;
      const screenshotY = 200;

      // 3. Create transform from screenshot metadata
      const transform = createCoordinateTransform(
        deviceDimensions.width,
        deviceDimensions.height,
        screenshotDimensions.width,
        screenshotDimensions.height
      );

      // 4. Transform to device coordinates
      const deviceCoords = transformToDevice({
        screenshotX,
        screenshotY,
        transform,
      });

      // 5. Validate coordinates
      expect(() => {
        validateDeviceCoordinates(deviceCoords.x, deviceCoords.y, deviceDimensions);
      }).not.toThrow();

      // 6. Verify transformation makes sense
      expect(deviceCoords.x).toBeGreaterThan(screenshotX);
      expect(deviceCoords.y).toBeGreaterThan(screenshotY);
      expect(deviceCoords.x).toBeLessThanOrEqual(deviceDimensions.width);
      expect(deviceCoords.y).toBeLessThanOrEqual(deviceDimensions.height);
    });

    it('should handle quarter-size screenshot workflow', () => {
      // 1. Quarter size: 128×256 from 1179×2556
      const transform = createCoordinateTransform(1179, 2556, 128, 256);

      // 2. Agent identifies element at (64, 128) - center of screenshot
      const deviceCoords = transformToDevice({
        screenshotX: 64,
        screenshotY: 128,
        transform,
      });

      // 3. Should be roughly center of device (within rounding)
      expect(deviceCoords.x).toBeCloseTo(1179 / 2, -1); // Within 10px
      expect(deviceCoords.y).toBeCloseTo(2556 / 2, -1); // Within 10px
    });
  });
});
