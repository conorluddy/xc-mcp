import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import {
  extractAccessibilityElements,
  getScreenDimensions,
  AccessibilityElement,
} from '../../utils/element-extraction.js';
import { computeViewFingerprint, isViewCacheable } from '../../utils/view-fingerprinting.js';
import {
  ScreenshotSize,
  DEFAULT_SCREENSHOT_SIZE,
  isValidScreenshotSize,
  buildResizeCommand,
  getScreenshotSizeMetadata,
  calculateCoordinateTransform,
  CoordinateTransform,
} from '../../utils/screenshot-sizing.js';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { resolveDeviceId } from '../../utils/device-detection.js';

interface ScreenshotInlineToolArgs {
  udid?: string;
  // Screenshot size optimization (opt-out approach)
  size?: ScreenshotSize;
  // LLM optimization: semantic naming for screenshots
  appName?: string;
  screenName?: string;
  state?: string;
  // View coordinate caching (opt-in)
  enableCoordinateCaching?: boolean;
}

/**
 * Capture screenshot and return as optimized base64 image data (inline)
 *
 * Examples:
 * - Simple screenshot: udid: "device-123" (defaults to 256×512, 170 tokens)
 * - Full size: udid: "device-123", size: "full" (native resolution, 340 tokens)
 * - Quarter size: udid: "device-123", size: "quarter" (128×256, 170 tokens)
 * - Semantic naming: udid: "device-123", appName: "MyApp", screenName: "LoginScreen", state: "Empty"
 *
 * Screenshot size optimization (default: 'half' for 50% token savings):
 * - half: 256×512 pixels, 1 tile, 170 tokens (DEFAULT)
 * - full: Native resolution, 2 tiles, 340 tokens
 * - quarter: 128×256 pixels, 1 tile, 170 tokens
 * - thumb: 128×128 pixels, 1 tile, 170 tokens
 *
 * The tool automatically optimizes the screenshot:
 * - Resizes to tile-aligned dimensions (default: 256×512)
 * - Converts to WebP format for best compression (60% quality)
 * - Falls back to JPEG if WebP unavailable
 * - Returns base64-encoded data inline in response
 *
 * LLM Optimization:
 * For semantic naming, provide appName, screenName, and state to help agents
 * understand which screen was captured and track state progression.
 */
export async function simctlScreenshotInlineTool(args: ScreenshotInlineToolArgs) {
  const { udid, size, appName, screenName, state, enableCoordinateCaching } = args;

  // Validate and set size (default to 'half' for 50% token savings)
  const screenshotSize: ScreenshotSize =
    size && isValidScreenshotSize(size) ? size : DEFAULT_SCREENSHOT_SIZE;

  let tempPng: string | null = null;
  let tempResized: string | null = null;
  let tempOptimized: string | null = null;

  try {
    // Resolve device ID (auto-detect if not provided)
    const resolvedUdid = await resolveDeviceId(udid);

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(resolvedUdid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${resolvedUdid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Create temp directory
    const tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'xc-mcp-screenshot-'));

    // ============================================================================
    // SCREENSHOT CAPTURE
    // ============================================================================

    // Generate temp file paths
    tempPng = path.join(tempDir, 'screenshot.png');
    tempResized = path.join(tempDir, 'screenshot-resized.png');
    tempOptimized = path.join(tempDir, 'screenshot-optimized.webp');

    // Capture screenshot as PNG at native resolution
    const captureCommand = `xcrun simctl io "${resolvedUdid}" screenshot "${tempPng}"`;
    console.error(`[simctl-screenshot-inline] Capturing: ${captureCommand}`);

    const captureResult = await executeCommand(captureCommand, {
      timeout: 15000,
    });

    if (captureResult.code !== 0) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to capture screenshot: ${captureResult.stderr || 'Unknown error'}`
      );
    }

    // Get original PNG size for metadata
    const originalPngStats = await fs.stat(tempPng);

    // ============================================================================
    // SIZE OPTIMIZATION (TILE-ALIGNED RESIZING)
    // ============================================================================

    // Resize to tile-aligned dimensions if not full size
    let sourceForOptimization = tempPng;
    const resizeCommand = buildResizeCommand(tempPng, tempResized, screenshotSize);

    if (resizeCommand) {
      console.error(`[simctl-screenshot-inline] Resizing to ${screenshotSize}: ${resizeCommand}`);
      const resizeResult = await executeCommand(resizeCommand, {
        timeout: 10000,
      });

      if (resizeResult.code !== 0) {
        console.warn(
          `[simctl-screenshot-inline] Resize failed, using original: ${resizeResult.stderr}`
        );
        // Continue with original if resize fails
      } else {
        sourceForOptimization = tempResized;
      }
    }

    // ============================================================================
    // FORMAT OPTIMIZATION (WEBP/JPEG COMPRESSION)
    // ============================================================================

    // Optimize to WebP with 60% quality (best compression)
    // Fall back to JPEG if WebP is not available
    let optimizationCommand = `sips -s format webp -s formatOptions 60 "${sourceForOptimization}" --out "${tempOptimized}"`;
    let formatUsed = 'webp';

    console.error(`[simctl-screenshot-inline] Optimizing to WebP: ${optimizationCommand}`);

    let optimizeResult = await executeCommand(optimizationCommand, {
      timeout: 10000,
    });

    // If WebP fails, try JPEG
    if (optimizeResult.code !== 0) {
      console.error('[simctl-screenshot-inline] WebP optimization failed, trying JPEG');
      tempOptimized = path.join(tempDir, 'screenshot-optimized.jpg');
      optimizationCommand = `sips -s format jpeg -s formatOptions 60 "${sourceForOptimization}" --out "${tempOptimized}"`;
      formatUsed = 'jpeg';

      console.error(`[simctl-screenshot-inline] Optimizing to JPEG: ${optimizationCommand}`);
      optimizeResult = await executeCommand(optimizationCommand, {
        timeout: 10000,
      });

      if (optimizeResult.code !== 0) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to optimize screenshot: ${optimizeResult.stderr || 'Unknown error'}`
        );
      }
    }

    // Read and encode the optimized image
    const imageData = await fs.readFile(tempOptimized);
    const base64Data = imageData.toString('base64');

    // Get file sizes for diagnostics
    const optimizedStats = await fs.stat(tempOptimized);
    const compressionRatio = ((1 - optimizedStats.size / originalPngStats.size) * 100).toFixed(1);

    // Get actual dimensions of resized/optimized image using sips
    let displayWidth: number | undefined;
    let displayHeight: number | undefined;
    try {
      const dimensionCommand = `sips -g pixelWidth -g pixelHeight "${sourceForOptimization}" | grep -E 'pixelWidth|pixelHeight' | awk '{print $2}'`;
      const dimensionResult = await executeCommand(dimensionCommand, { timeout: 5000 });
      if (dimensionResult.code === 0) {
        const [widthStr, heightStr] = dimensionResult.stdout.trim().split('\n');
        displayWidth = parseInt(widthStr, 10);
        displayHeight = parseInt(heightStr, 10);
      }
    } catch {
      // Ignore dimension detection errors - coordinateTransform will be undefined
    }

    // Get screenshot size metadata for response
    const sizeMetadata = getScreenshotSizeMetadata(
      screenshotSize,
      originalPngStats.size,
      optimizedStats.size
    );

    // Extract interactive elements from accessibility tree
    // This enables automated element discovery and reliable interaction
    let interactiveElements = undefined;
    let screenDimensions = undefined;
    let allElements: AccessibilityElement[] = []; // Store all elements for fingerprinting
    try {
      // Get screen dimensions
      screenDimensions = await getScreenDimensions(resolvedUdid);

      // Try to extract elements - this requires the app to be running with accessibility enabled
      // Use a reasonable timeout and graceful failure
      const extractPromise = extractAccessibilityElements(
        resolvedUdid,
        appName ? `com.example.${appName.toLowerCase()}` : 'com.example.app'
      );
      const timeoutPromise = new Promise<AccessibilityElement[]>(resolve =>
        setTimeout(() => resolve([]), 2000)
      );
      const elements = await Promise.race([extractPromise, timeoutPromise]);
      allElements = elements; // Save for fingerprinting

      if (elements.length > 0) {
        // Filter to only tappable elements (buttons, text fields, etc.) with bounds
        interactiveElements = elements.filter(e => e.bounds && e.hittable !== false).slice(0, 20); // Limit to top 20 elements to avoid token overflow
      }
    } catch {
      // Element extraction is optional - gracefully degrade if it fails
      // This might fail if app is not running or accessibility is disabled
    }

    // Calculate coordinate transform for mapping screenshot to device coordinates
    let coordinateTransform: CoordinateTransform | undefined;
    if (screenDimensions && displayWidth && displayHeight && screenshotSize !== 'full') {
      coordinateTransform = calculateCoordinateTransform(
        screenDimensions.width,
        screenDimensions.height,
        displayWidth,
        displayHeight
      );
    }

    // Compute view fingerprint for coordinate caching (opt-in)
    let viewFingerprint = undefined;
    let cacheableView = false;
    if (enableCoordinateCaching && screenDimensions && allElements.length > 0) {
      try {
        // Check if view is cacheable (excludes loading/animation states)
        cacheableView = isViewCacheable(allElements);

        if (cacheableView) {
          viewFingerprint = computeViewFingerprint(
            allElements,
            screenDimensions,
            'portrait' // TODO: Detect actual orientation from device
          );
        }
      } catch (error) {
        // Fingerprint computation is optional
        console.warn('[screenshot-inline] Failed to compute view fingerprint:', error);
      }
    }

    const responseData = {
      success: true,
      udid: resolvedUdid,
      simulatorInfo: {
        name: simulator.name,
        state: simulator.state,
      },
      imageFormat: formatUsed.toUpperCase(),
      // Screenshot size optimization metadata
      screenshotSize: sizeMetadata,
      imageSizes: {
        original: originalPngStats.size,
        optimized: optimizedStats.size,
        compressionRatio: `${compressionRatio}%`,
      },
      screenDimensions: screenDimensions || undefined,
      // Coordinate transform for mapping screenshot coordinates to device coordinates
      coordinateTransform: coordinateTransform || undefined,
      // LLM optimization: semantic metadata when provided
      semanticMetadata:
        appName || screenName || state
          ? {
              appName: appName || undefined,
              screenName: screenName || undefined,
              state: state || undefined,
            }
          : undefined,
      // Element metadata for programmatic interaction
      interactiveElements: interactiveElements
        ? {
            count: interactiveElements.length,
            elements: interactiveElements.map(e => ({
              type: e.type.replace('XCUIElementType', ''),
              label: e.label || undefined,
              identifier: e.identifier || undefined,
              bounds: e.bounds,
              tappable: e.hittable !== false,
            })),
          }
        : undefined,
      // View fingerprint for coordinate caching (opt-in Phase 1 feature)
      viewFingerprint: viewFingerprint
        ? {
            hash: viewFingerprint.elementStructureHash,
            cacheable: cacheableView,
            elementCount: viewFingerprint.elementCount,
            orientation: viewFingerprint.orientation,
            guidance: cacheableView
              ? 'View is cacheable - coordinates can be stored and reused'
              : 'View contains dynamic content - caching disabled',
          }
        : undefined,
      guidance: [
        `✅ Screenshot captured and optimized`,
        `Size: ${sizeMetadata.preset} (${sizeMetadata.dimensions})`,
        `Estimated tokens: ${sizeMetadata.estimatedTokens} (${sizeMetadata.tiles} tile${sizeMetadata.tiles > 1 ? 's' : ''})`,
        sizeMetadata.tokenSavings ? `Token savings: ${sizeMetadata.tokenSavings}` : undefined,
        `Format: ${formatUsed.toUpperCase()} at 60% quality`,
        `Compression: ${compressionRatio}% reduction from original`,
        `File size: ${optimizedStats.size} bytes`,
        appName && screenName && state ? `Screen: ${appName}/${screenName} (${state})` : undefined,
        interactiveElements
          ? `📍 ${interactiveElements.length} interactive element(s) detected`
          : undefined,
        coordinateTransform
          ? `⚖️ Coordinate transform: scale by ${coordinateTransform.scaleX}× (X) and ${coordinateTransform.scaleY}× (Y)`
          : undefined,
        ``,
        coordinateTransform
          ? `⚠️ Screenshot is resized - multiply coordinates by scale factors before tapping:`
          : undefined,
        coordinateTransform ? `  ${coordinateTransform.guidance}` : undefined,
        ``,
        `Next steps to interact with UI:`,
        interactiveElements && interactiveElements.length > 0
          ? [
              `✅ Elements detected - use coordinates from interactiveElements in response`,
              `  Example: tap at {${interactiveElements[0]?.bounds?.x}, ${interactiveElements[0]?.bounds?.y}} for first element`,
              `  Or use simctl-query-ui for more specific element queries`,
            ]
          : [
              `1. Use simctl-query-ui to find element coordinates by predicate`,
              `   Example: predicate = 'type == "XCUIElementTypeButton"' or 'label == "Initialize Database"'`,
              `   IMPORTANT: Use captureLocation: true to get coordinate information`,
            ],
        `2. Use simctl-tap with coordinates to interact reliably`,
        `3. Use simctl-type-text for text input`,
      ]
        .flat()
        .filter(Boolean),
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [
        {
          type: 'image' as const,
          data: base64Data,
          mimeType: `image/${formatUsed}`,
        },
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-screenshot-inline failed: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    // Clean up temp files
    if (tempPng) {
      try {
        await fs.unlink(tempPng);
      } catch {
        // Ignore cleanup errors
      }
    }
    if (tempResized) {
      try {
        await fs.unlink(tempResized);
      } catch {
        // Ignore cleanup errors
      }
    }
    if (tempOptimized) {
      try {
        await fs.unlink(tempOptimized);
      } catch {
        // Ignore cleanup errors
      }
    }
    // Clean up temp directory
    if (tempPng) {
      try {
        const tempDir = path.dirname(tempPng);
        await fs.rmdir(tempDir);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
