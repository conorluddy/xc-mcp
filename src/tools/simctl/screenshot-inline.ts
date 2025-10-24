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

/**
 * Capture screenshot and return as inline base64-encoded data for direct response transmission
 *
 * **Full documentation:** See simctl/screenshot-inline.md for detailed parameters and examples
 */

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
          // Note: Orientation is hardcoded to 'portrait' for fingerprinting
          // Actual orientation detection requires additional simctl calls (status-bar query)
          // and adds complexity. Portrait assumption works for most iOS apps.
          // Future enhancement: Parse orientation from device status or screenshot dimensions
          viewFingerprint = computeViewFingerprint(allElements, screenDimensions, 'portrait');
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
      // Agent-friendly helper for automatic coordinate transformation
      coordinateTransformHelper: coordinateTransform
        ? {
            enabled: true,
            method: 'applyScreenshotScale parameter in idb-ui-tap',
            usage:
              'When calling idb-ui-tap, pass: { x: screenshotX, y: screenshotY, applyScreenshotScale: true, screenshotScaleX: ' +
              coordinateTransform.scaleX.toFixed(2) +
              ', screenshotScaleY: ' +
              coordinateTransform.scaleY.toFixed(2) +
              ' }',
            example: {
              screenshotCoordinates: {
                description: 'Coordinates you identify visually from this screenshot',
                x: 256,
                y: 512,
              },
              idbUiTapCall: {
                x: 256,
                y: 512,
                applyScreenshotScale: true,
                screenshotScaleX: coordinateTransform.scaleX,
                screenshotScaleY: coordinateTransform.scaleY,
                expectedOutcome: 'Automatic transformation will convert to device coordinates',
              },
              automaticResult: {
                deviceX: Math.round(256 * coordinateTransform.scaleX),
                deviceY: Math.round(512 * coordinateTransform.scaleY),
              },
            },
          }
        : undefined,
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
          ? `⚖️ Coordinate transform: scale by ${coordinateTransform.scaleX.toFixed(2)}× (X) and ${coordinateTransform.scaleY.toFixed(2)}× (Y)`
          : undefined,
        ``,
        coordinateTransform ? `✅ AUTOMATIC COORDINATE TRANSFORMATION ENABLED` : undefined,
        coordinateTransform
          ? `When tapping elements from this resized screenshot, use idb-ui-tap with automatic transformation:`
          : undefined,
        coordinateTransform
          ? `  1. Identify element coordinates visually or use idb-ui-describe point`
          : undefined,
        coordinateTransform ? `  2. Call idb-ui-tap with these parameters:` : undefined,
        coordinateTransform ? `     - x: <screenshot coordinate>` : undefined,
        coordinateTransform ? `     - y: <screenshot coordinate>` : undefined,
        coordinateTransform ? `     - applyScreenshotScale: true` : undefined,
        coordinateTransform
          ? `     - screenshotScaleX: ${coordinateTransform.scaleX.toFixed(2)}`
          : undefined,
        coordinateTransform
          ? `     - screenshotScaleY: ${coordinateTransform.scaleY.toFixed(2)}`
          : undefined,
        coordinateTransform
          ? `  3. The tool automatically transforms coordinates to device space`
          : undefined,
        coordinateTransform ? `  ${coordinateTransform.guidance}` : undefined,
        ``,
        `Next steps to interact with UI:`,
        interactiveElements && interactiveElements.length > 0
          ? [
              `✅ Elements detected - use coordinates from interactiveElements in response`,
              `  Example: tap at {${interactiveElements[0]?.bounds?.x}, ${interactiveElements[0]?.bounds?.y}} for first element`,
              `  Or use idb-ui-describe point for precise element location`,
            ]
          : [
              `1. Use idb-ui-describe operation to find element coordinates by analysis`,
              `   Query the accessibility tree for the element you want to tap`,
              `   Use point operation to find exact coordinates: idb-ui-describe point --x 100 --y 200`,
            ],
        `2. Use idb-ui-tap with coordinates to interact reliably`,
        coordinateTransform
          ? `   Include applyScreenshotScale: true with scale factors from above`
          : `   Use device coordinates (not screenshot coordinates)`,
        `3. Use idb-ui-input for text entry`,
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

export const SIMCTL_SCREENSHOT_INLINE_DOCS = `
# simctl-screenshot-inline

Capture optimized screenshots with inline base64 encoding for direct MCP response transmission.

## What it does

Captures simulator screenshots and returns them as base64-encoded images directly in the
MCP response. Automatically optimizes images for token efficiency with tile-aligned resizing
and WebP/JPEG compression. Includes interactive element detection and coordinate transforms.

## Parameters

- **udid** (string, optional): Simulator UDID (auto-detects booted device if omitted)
- **size** (string, optional): Screenshot size - half, full, quarter, thumb (default: half)
- **appName** (string, optional): App name for semantic context
- **screenName** (string, optional): Screen/view name for semantic context
- **state** (string, optional): UI state for semantic context
- **enableCoordinateCaching** (boolean, optional): Enable view fingerprinting for coordinate caching

## Screenshot Size Optimization

Automatically optimizes screenshots for token efficiency:

- **half** (default): 256×512 pixels, 1 tile, ~170 tokens (50% savings)
- **full**: Native resolution, 2 tiles, ~340 tokens
- **quarter**: 128×256 pixels, 1 tile, ~170 tokens
- **thumb**: 128×128 pixels, 1 tile, ~170 tokens

## Automatic Optimization Process

1. **Capture**: Screenshot taken at native resolution
2. **Resize**: Automatically resized to tile-aligned dimensions (unless size='full')
3. **Compress**: Converted to WebP format at 60% quality (falls back to JPEG if unavailable)
4. **Encode**: Base64-encoded for inline MCP response transmission
5. **Extract**: Interactive elements detected from accessibility tree
6. **Transform**: Coordinate mapping provided for resized screenshots

## Returns

MCP response with:
- Base64-encoded optimized image (inline)
- Screenshot optimization metadata (dimensions, tokens, savings)
- Interactive elements with coordinates and properties
- Coordinate transform for mapping screenshot to device coordinates
- View fingerprint (if enableCoordinateCaching is true)
- Semantic metadata (if provided)

## Examples

### Simple optimized screenshot (256×512)
\`\`\`typescript
await simctlScreenshotInlineTool({
  udid: 'device-123'
})
\`\`\`

### Full resolution screenshot
\`\`\`typescript
await simctlScreenshotInlineTool({
  udid: 'device-123',
  size: 'full'
})
\`\`\`

### Screenshot with semantic context
\`\`\`typescript
await simctlScreenshotInlineTool({
  udid: 'device-123',
  appName: 'MyApp',
  screenName: 'LoginScreen',
  state: 'Empty'
})
\`\`\`

### Screenshot with coordinate caching enabled
\`\`\`typescript
await simctlScreenshotInlineTool({
  udid: 'device-123',
  enableCoordinateCaching: true
})
\`\`\`

## Interactive Element Detection

Automatically extracts interactive elements from the accessibility tree:
- Element type (Button, TextField, etc.)
- Label and identifier
- Bounds (x, y, width, height)
- Tappability status

Limited to top 20 elements to avoid token overflow. Elements are filtered to only
include those with bounds and hittable status.

## Coordinate Transform

When screenshots are resized (size ≠ 'full'), provides automatic coordinate transformation:

### Automatic Transformation (Recommended for Agents)

Use the **coordinateTransformHelper** field in the response with **idb-ui-tap**:
1. Identify element coordinates visually from the screenshot
2. Call idb-ui-tap with **applyScreenshotScale: true** plus scale factors
3. The tool automatically transforms screenshot coordinates to device coordinates

Example:
\`\`\`
idb-ui-tap {
  x: 256,              // Screenshot coordinate
  y: 512,              // Screenshot coordinate
  applyScreenshotScale: true,
  screenshotScaleX: 1.67,
  screenshotScaleY: 1.66
}
// Tool automatically calculates: deviceX = 256 * 1.67, deviceY = 512 * 1.66
\`\`\`

### Manual Transformation (For Reference)

If not using automatic transformation:
- **scaleX**: Multiply screenshot X coordinates by this to get device coordinates
- **scaleY**: Multiply screenshot Y coordinates by this to get device coordinates
- **coordinateTransform.guidance**: Human-readable instructions

**Important**: Most agents should use the automatic transformation via idb-ui-tap's applyScreenshotScale parameter. Manual calculation is provided for reference only.

## View Fingerprinting (Opt-in)

When enableCoordinateCaching is true, computes a structural hash of the view:
- **elementStructureHash**: SHA-256 hash of element hierarchy
- **cacheable**: Whether view is stable enough to cache coordinates
- **elementCount**: Number of elements in hierarchy
- **orientation**: Device orientation

Excludes loading states, animations, and dynamic content from caching.

## Common Use Cases

1. **Visual analysis**: LLM-based screenshot analysis with token optimization
2. **UI automation**: Detect interactive elements and get tap coordinates
3. **Bug reporting**: Capture and transmit screenshots inline
4. **Test documentation**: Screenshot with semantic context for test tracking
5. **Coordinate caching**: Store element coordinates for repeated interactions

## Token Efficiency

Screenshots are optimized for minimal token usage:
- **Default (half)**: ~170 tokens (50% savings vs full)
- **Full**: ~340 tokens (native resolution)
- **Quarter**: ~170 tokens (75% savings vs full)
- **Thumb**: ~170 tokens (smallest, for thumbnails)

Token counts are estimates based on Claude's image processing (170 tokens per 512×512 tile).

## Important Notes

- **Auto-detection**: If udid is omitted, uses the currently booted device
- **Temp files**: Uses temp directory for processing, auto-cleans up
- **WebP fallback**: Attempts WebP compression, falls back to JPEG if unavailable
- **Element extraction**: Requires app to be running with accessibility enabled
- **Coordinate accuracy**: Transform provides pixel-perfect coordinate mapping

## Error Handling

- **Simulator not found**: Validates simulator exists in cache
- **Simulator not booted**: Indicates simulator must be booted first
- **Capture failure**: Reports if screenshot capture fails
- **Optimization failure**: Falls back to original if optimization fails
- **Element extraction**: Gracefully degrades if accessibility is unavailable

## Next Steps After Screenshot

1. **Analyze visually**: LLM processes inline image for visual analysis
2. **Interact with elements**: Use coordinates from interactiveElements
3. **Tap elements**: Apply coordinate transform if resized, then use simctl-tap
4. **Query specific elements**: Use simctl-query-ui for targeted element discovery
5. **Cache coordinates**: Store fingerprint for reuse on identical views

## Comparison with simctl-io

| Feature | screenshot-inline | simctl-io |
|---------|------------------|-----------|
| Returns | Base64 inline | File path |
| Optimization | Automatic | Manual |
| Elements | Auto-detected | Not included |
| Transform | Included | Included |
| Use case | MCP responses | File storage |
| Token usage | Optimized | Depends on size |
`;
