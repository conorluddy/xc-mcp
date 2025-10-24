import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import {
  extractAccessibilityElements,
  getScreenDimensions,
} from '../../utils/element-extraction.js';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { resolveDeviceId } from '../../utils/device-detection.js';

interface ScreenshotInlineToolArgs {
  udid?: string;
  // LLM optimization: semantic naming for screenshots
  appName?: string;
  screenName?: string;
  state?: string;
}

/**
 * Capture screenshot and return as optimized base64 image data (inline)
 *
 * Examples:
 * - Simple screenshot: udid: "device-123", returns base64 WebP image
 * - Semantic naming: udid: "device-123", appName: "MyApp", screenName: "LoginScreen", state: "Empty"
 *
 * The tool automatically optimizes the screenshot:
 * - Converts to WebP format for best compression (60% quality)
 * - 1:1 pixel dimensions (no resizing artifacts)
 * - Falls back to JPEG if WebP unavailable
 * - Returns base64-encoded data inline in response
 *
 * LLM Optimization:
 * For semantic naming, provide appName, screenName, and state to help agents
 * understand which screen was captured and track state progression.
 */
export async function simctlScreenshotInlineTool(args: any) {
  const { udid, appName, screenName, state } = args as ScreenshotInlineToolArgs;

  let tempPng: string | null = null;
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

    // Generate temp file paths
    tempPng = path.join(tempDir, 'screenshot.png');
    tempOptimized = path.join(tempDir, 'screenshot-optimized.webp');

    // Capture screenshot as PNG
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

    // Optimize to WebP with 60% quality
    // First try WebP, fall back to JPEG if WebP is not available
    let optimizationCommand = `sips -s format webp -s formatOptions 60 "${tempPng}" --out "${tempOptimized}"`;
    let formatUsed = 'webp';

    console.error(`[simctl-screenshot-inline] Optimizing to WebP: ${optimizationCommand}`);

    let optimizeResult = await executeCommand(optimizationCommand, {
      timeout: 10000,
    });

    // If WebP fails, try JPEG
    if (optimizeResult.code !== 0) {
      console.error('[simctl-screenshot-inline] WebP optimization failed, trying JPEG');
      tempOptimized = path.join(tempDir, 'screenshot-optimized.jpg');
      optimizationCommand = `sips -s format jpeg -s formatOptions 60 "${tempPng}" --out "${tempOptimized}"`;
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
    const pngStats = await fs.stat(tempPng);
    const optimizedStats = await fs.stat(tempOptimized);
    const compressionRatio = ((1 - optimizedStats.size / pngStats.size) * 100).toFixed(1);

    // Extract interactive elements from accessibility tree
    // This enables automated element discovery and reliable interaction
    let interactiveElements = undefined;
    let screenDimensions = undefined;
    try {
      // Get screen dimensions
      screenDimensions = await getScreenDimensions(resolvedUdid);

      // Try to extract elements - this requires the app to be running with accessibility enabled
      // Use a reasonable timeout and graceful failure
      const extractPromise = extractAccessibilityElements(
        resolvedUdid,
        appName ? `com.example.${appName.toLowerCase()}` : 'com.example.app'
      );
      const timeoutPromise = new Promise<any[]>(resolve => setTimeout(() => resolve([]), 2000));
      const elements = await Promise.race([extractPromise, timeoutPromise]);

      if (elements.length > 0) {
        // Filter to only tappable elements (buttons, text fields, etc.) with bounds
        interactiveElements = elements.filter(e => e.bounds && e.hittable !== false).slice(0, 20); // Limit to top 20 elements to avoid token overflow
      }
    } catch {
      // Element extraction is optional - gracefully degrade if it fails
      // This might fail if app is not running or accessibility is disabled
    }

    const responseData = {
      success: true,
      udid: resolvedUdid,
      simulatorInfo: {
        name: simulator.name,
        state: simulator.state,
      },
      imageFormat: formatUsed.toUpperCase(),
      imageSizes: {
        original: pngStats.size,
        optimized: optimizedStats.size,
        compressionRatio: `${compressionRatio}%`,
      },
      screenDimensions: screenDimensions || undefined,
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
      guidance: [
        `✅ Screenshot captured and optimized`,
        `Format: ${formatUsed.toUpperCase()} at 60% quality`,
        `Compression: ${compressionRatio}% reduction from original PNG`,
        `Size: ${optimizedStats.size} bytes`,
        appName && screenName && state ? `Screen: ${appName}/${screenName} (${state})` : undefined,
        interactiveElements
          ? `📍 ${interactiveElements.length} interactive element(s) detected`
          : undefined,
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
