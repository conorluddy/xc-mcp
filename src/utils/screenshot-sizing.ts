/**
 * Screenshot sizing utilities for token optimization
 *
 * Claude vision API charges per 512×512 pixel tile. This module provides
 * tile-aligned sizing presets that minimize token usage while maximizing
 * visual clarity.
 *
 * Based on real-world testing documented in XC_MCP_IMPROVEMENTS.md:
 * - Default 'half' size saves 50% tokens (170 vs 340)
 * - 256×512 provides 57% more pixels than proportional scaling
 * - Power-of-2 dimensions enable faster image processing
 */

/**
 * Screenshot size presets optimized for Claude vision API token efficiency
 *
 * Each preset is tile-aligned to 512×512 pixel tiles for optimal token usage:
 * - full: Native resolution (2 tiles, 340 tokens) - use for detailed analysis
 * - half: 256×512 (1 tile, 170 tokens) - DEFAULT, best balance
 * - quarter: 128×256 (1 tile, 170 tokens) - use for thumbnails
 * - thumb: 128×128 (1 tile, 170 tokens) - use for minimal previews
 */
export type ScreenshotSize = 'full' | 'half' | 'quarter' | 'thumb';

/**
 * Screenshot size preset configuration
 */
export interface SizePreset {
  /** Display name for the preset */
  name: string;
  /** Target dimensions (undefined = native resolution) */
  dimensions?: {
    width: number;
    height: number;
  };
  /** Number of 512×512 tiles consumed */
  tiles: number;
  /** Approximate token count for Claude vision API */
  tokens: number;
  /** Description of use case */
  description: string;
}

/**
 * Tile-aligned size presets for screenshot optimization
 *
 * Following Claude vision API billing (170 tokens per 512×512 tile):
 * - 1 tile = 170 tokens
 * - 2 tiles = 340 tokens (typical iPhone screenshot at full size)
 */
export const SIZE_PRESETS: Record<ScreenshotSize, SizePreset> = {
  full: {
    name: 'Full Resolution',
    dimensions: undefined, // Native resolution
    tiles: 2,
    tokens: 340,
    description: 'Native device resolution - use for detailed UI analysis',
  },
  half: {
    name: 'Half Size (Tile-Aligned)',
    dimensions: { width: 256, height: 512 },
    tiles: 1,
    tokens: 170,
    description: 'Default - 50% token savings, 57% more pixels than proportional scaling',
  },
  quarter: {
    name: 'Quarter Size',
    dimensions: { width: 128, height: 256 },
    tiles: 1,
    tokens: 170,
    description: 'Thumbnail - suitable for layout verification',
  },
  thumb: {
    name: 'Thumbnail',
    dimensions: { width: 128, height: 128 },
    tiles: 1,
    tokens: 170,
    description: 'Minimal preview - suitable for quick visual checks',
  },
};

/**
 * Default screenshot size (opt-out approach for maximum token savings)
 */
export const DEFAULT_SCREENSHOT_SIZE: ScreenshotSize = 'half';

/**
 * Get size preset configuration
 *
 * @param size Size preset name
 * @returns Size preset configuration
 */
export function getSizePreset(size: ScreenshotSize): SizePreset {
  return SIZE_PRESETS[size];
}

/**
 * Validate screenshot size parameter
 *
 * @param size Size value to validate
 * @returns true if valid, false otherwise
 */
export function isValidScreenshotSize(size: unknown): size is ScreenshotSize {
  return (
    typeof size === 'string' &&
    (size === 'full' || size === 'half' || size === 'quarter' || size === 'thumb')
  );
}

/**
 * Build sips resize command for screenshot optimization
 *
 * Uses macOS 'sips' (scriptable image processing system) to resize images.
 * Power-of-2 dimensions enable faster processing and better compression.
 *
 * IMPORTANT: Uses -Z (capital Z) to preserve aspect ratio while fitting within bounds.
 * This prevents squashing and maintains accurate coordinate mapping for UI interaction.
 *
 * @param inputPath Path to source screenshot
 * @param outputPath Path to save resized screenshot
 * @param size Size preset to use
 * @returns sips command string
 */
export function buildResizeCommand(
  inputPath: string,
  outputPath: string,
  size: ScreenshotSize
): string | null {
  const preset = getSizePreset(size);

  // No resize needed for full resolution
  if (!preset.dimensions) {
    return null;
  }

  const { width, height } = preset.dimensions;

  // Use sips -Z (capital Z) to resize while preserving aspect ratio
  // Fits within width×height bounds without squashing
  // This is critical for accurate coordinate mapping to device screen
  return `sips -Z ${Math.max(width, height)} "${inputPath}" --out "${outputPath}"`;
}

/**
 * Coordinate transform for mapping screenshot coordinates to device coordinates
 *
 * When screenshots are resized, coordinates from the screenshot must be scaled
 * back to original device coordinates before tapping.
 *
 * Example: If element appears at (118, 256) in resized screenshot,
 * tap at (118 × scaleX, 256 × scaleY) on device.
 */
export interface CoordinateTransform {
  /** Original device screen dimensions */
  originalDimensions: {
    width: number;
    height: number;
  };
  /** Resized screenshot dimensions */
  displayDimensions: {
    width: number;
    height: number;
  };
  /** Scale factor for X coordinates (originalWidth / displayWidth) */
  scaleX: number;
  /** Scale factor for Y coordinates (originalHeight / displayHeight) */
  scaleY: number;
  /** Human-readable guidance */
  guidance: string;
}

/**
 * Calculate coordinate transform for mapping screenshot to device coordinates
 *
 * Computes scale factors needed to convert coordinates from resized screenshot
 * back to original device screen coordinates for accurate tap operations.
 *
 * @param originalWidth Original device screen width
 * @param originalHeight Original device screen height
 * @param displayWidth Resized screenshot width
 * @param displayHeight Resized screenshot height
 * @returns Coordinate transform metadata
 */
export function calculateCoordinateTransform(
  originalWidth: number,
  originalHeight: number,
  displayWidth: number,
  displayHeight: number
): CoordinateTransform {
  const scaleX = originalWidth / displayWidth;
  const scaleY = originalHeight / displayHeight;

  return {
    originalDimensions: {
      width: originalWidth,
      height: originalHeight,
    },
    displayDimensions: {
      width: displayWidth,
      height: displayHeight,
    },
    scaleX: Number(scaleX.toFixed(2)),
    scaleY: Number(scaleY.toFixed(2)),
    guidance: `To tap coordinates from screenshot, multiply by scale factors: deviceX = screenshotX × ${scaleX.toFixed(2)}, deviceY = screenshotY × ${scaleY.toFixed(2)}`,
  };
}

/**
 * Get screenshot size metadata for response
 *
 * Provides token savings information to help agents make informed decisions.
 *
 * @param size Size preset used
 * @param originalSize Original file size in bytes (optional)
 * @param optimizedSize Optimized file size in bytes (optional)
 * @returns Metadata object for inclusion in tool response
 */
export function getScreenshotSizeMetadata(
  size: ScreenshotSize,
  originalSize?: number,
  optimizedSize?: number
) {
  const preset = getSizePreset(size);

  const metadata: {
    size: ScreenshotSize;
    preset: string;
    dimensions: string;
    tiles: number;
    estimatedTokens: number;
    tokenSavings?: string;
    fileSizes?: {
      original: number;
      optimized: number;
      compressionRatio: string;
    };
  } = {
    size,
    preset: preset.name,
    dimensions: preset.dimensions
      ? `${preset.dimensions.width}×${preset.dimensions.height}`
      : 'native',
    tiles: preset.tiles,
    estimatedTokens: preset.tokens,
  };

  // Calculate token savings compared to full size
  if (size !== 'full') {
    const fullTokens = SIZE_PRESETS.full.tokens;
    const savings = ((1 - preset.tokens / fullTokens) * 100).toFixed(0);
    metadata.tokenSavings = `${savings}% vs full size`;
  }

  // Add file size information if available
  if (originalSize !== undefined && optimizedSize !== undefined) {
    const compressionRatio = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
    metadata.fileSizes = {
      original: originalSize,
      optimized: optimizedSize,
      compressionRatio: `${compressionRatio}%`,
    };
  }

  return metadata;
}
