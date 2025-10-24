import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { resolveDeviceId } from '../../utils/device-detection.js';
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
import { getScreenDimensions } from '../../utils/element-extraction.js';

interface SimctlIoToolArgs {
  udid?: string;
  operation: 'screenshot' | 'video';
  outputPath?: string;
  codec?: string;
  // Screenshot size optimization (opt-out approach)
  size?: ScreenshotSize;
  // LLM optimization: semantic naming for screenshots
  appName?: string;
  screenName?: string;
  state?: string;
}

/**
 * Capture screenshot or record video from a simulator
 *
 * Examples:
 * - Screenshot: udid: "device-123", operation: "screenshot" (saves 256×512 optimized PNG)
 * - Full size: udid: "device-123", operation: "screenshot", size: "full" (native resolution)
 * - Custom output: udid: "device-123", operation: "screenshot", outputPath: "/tmp/my_screenshot.png"
 * - Semantic naming: udid: "device-123", operation: "screenshot", appName: "MyApp", screenName: "LoginScreen", state: "Empty"
 * - Record video: udid: "device-123", operation: "video"
 * - Custom codec: udid: "device-123", operation: "video", codec: "h264"
 *
 * Operations:
 * - screenshot: Capture current screen (with tile-aligned sizing)
 * - video: Record simulator screen (stop with Ctrl+C)
 *
 * Screenshot size optimization (default: 'half' for 50% token savings):
 * - half: 256×512 pixels, 1 tile, 170 tokens (DEFAULT)
 * - full: Native resolution, 2 tiles, 340 tokens
 * - quarter: 128×256 pixels, 1 tile, 170 tokens
 * - thumb: 128×128 pixels, 1 tile, 170 tokens
 *
 * Codecs for video: h264, hevc, prores
 *
 * LLM Optimization:
 * For semantic naming, provide appName, screenName, and state to generate filenames like:
 * MyApp_LoginScreen_Empty_2025-01-23.png (enables agents to reason about screens)
 *
 * **Full documentation:** See simctl/io.md for detailed parameters and examples
 */
export async function simctlIoTool(args: SimctlIoToolArgs) {
  const { udid, operation, outputPath, codec, size, appName, screenName, state } = args;

  try {
    // Resolve device ID (auto-detect if not provided)
    const resolvedUdid = await resolveDeviceId(udid);

    if (!operation || !['screenshot', 'video'].includes(operation)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Operation must be either "screenshot" or "video"'
      );
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(resolvedUdid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${resolvedUdid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Validate and set size for screenshots (default to 'half' for 50% token savings)
    const screenshotSize: ScreenshotSize =
      operation === 'screenshot' && size && isValidScreenshotSize(size)
        ? size
        : DEFAULT_SCREENSHOT_SIZE;

    // Generate default output path if not provided
    let finalOutputPath = outputPath;
    let tempNativePath: string | null = null; // For resize workflow

    if (!finalOutputPath) {
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const extension = operation === 'screenshot' ? 'png' : 'mp4';

      // Use semantic naming if appName, screenName, and state are provided
      // Format: {appName}_{screenName}_{state}_{date}.{ext}
      if (appName && screenName && state && operation === 'screenshot') {
        finalOutputPath = `/tmp/${appName}_${screenName}_${state}_${date}.${extension}`;
      } else {
        // Fallback to generic naming
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        finalOutputPath = `/tmp/simulator_${operation}_${timestamp}.${extension}`;
      }
    }

    // For screenshot resizing, capture to temp path first
    let captureOutputPath = finalOutputPath;
    if (operation === 'screenshot' && screenshotSize !== 'full') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      tempNativePath = `/tmp/screenshot_native_${timestamp}.png`;
      captureOutputPath = tempNativePath;
    }

    // Build command (map 'video' operation to 'recordVideo' simctl command)
    const simctlOperation = operation === 'video' ? 'recordVideo' : operation;
    let command = `xcrun simctl io "${resolvedUdid}" ${simctlOperation} "${captureOutputPath}"`;
    if (operation === 'video' && codec) {
      command = `xcrun simctl io "${resolvedUdid}" ${simctlOperation} --codec="${codec}" "${captureOutputPath}"`;
    }

    console.error(`[simctl-io] Executing: ${command}`);

    const timeout =
      operation === 'screenshot'
        ? 10000 // 10 seconds for screenshot
        : 5000; // 5 seconds to start video recording

    const result = await executeCommand(command, { timeout });

    const success = result.code === 0;

    // Get original file size for metadata
    let originalFileSize = 0;
    if (success && operation === 'screenshot') {
      try {
        const stats = await fs.stat(captureOutputPath);
        originalFileSize = stats.size;
      } catch {
        // Ignore if file doesn't exist
      }
    }

    // Resize screenshot if needed
    let sizeMetadata = undefined;
    if (success && operation === 'screenshot' && tempNativePath) {
      const resizeCommand = buildResizeCommand(tempNativePath, finalOutputPath, screenshotSize);

      if (resizeCommand) {
        console.error(`[simctl-io] Resizing to ${screenshotSize}: ${resizeCommand}`);
        const resizeResult = await executeCommand(resizeCommand, { timeout: 10000 });

        if (resizeResult.code !== 0) {
          console.warn(`[simctl-io] Resize failed, copying original: ${resizeResult.stderr}`);
          // Copy original if resize fails
          await fs.copyFile(tempNativePath, finalOutputPath);
        }
      }

      // Clean up temp file
      try {
        await fs.unlink(tempNativePath);
      } catch {
        // Ignore cleanup errors
      }
    }

    // Check if file was created and get final size
    let fileExists = false;
    let fileSize = 0;
    let coordinateTransform: CoordinateTransform | undefined;

    if (success) {
      try {
        const stats = await fs.stat(finalOutputPath);
        fileExists = true;
        fileSize = stats.size;

        // Generate size metadata and coordinate transform for screenshots
        if (operation === 'screenshot') {
          sizeMetadata = getScreenshotSizeMetadata(screenshotSize, originalFileSize, fileSize);

          // Calculate coordinate transform if resized
          if (screenshotSize !== 'full') {
            try {
              // Get device screen dimensions
              const screenDimensions = await getScreenDimensions(resolvedUdid);

              // Get actual dimensions of resized screenshot
              const dimensionCommand = `sips -g pixelWidth -g pixelHeight "${finalOutputPath}" | grep -E 'pixelWidth|pixelHeight' | awk '{print $2}'`;
              const dimensionResult = await executeCommand(dimensionCommand, { timeout: 5000 });

              if (dimensionResult.code === 0 && screenDimensions) {
                const [widthStr, heightStr] = dimensionResult.stdout.trim().split('\n');
                const displayWidth = parseInt(widthStr, 10);
                const displayHeight = parseInt(heightStr, 10);

                coordinateTransform = calculateCoordinateTransform(
                  screenDimensions.width,
                  screenDimensions.height,
                  displayWidth,
                  displayHeight
                );
              }
            } catch {
              // Coordinate transform is optional
            }
          }
        }
      } catch {
        // File might not exist yet if recording
      }
    }

    // Build guidance messages
    const guidanceMessages: (string | undefined)[] = [];

    if (success) {
      if (operation === 'screenshot') {
        guidanceMessages.push(
          `✅ Screenshot captured successfully`,
          sizeMetadata ? `Size: ${sizeMetadata.preset} (${sizeMetadata.dimensions})` : undefined,
          sizeMetadata
            ? `Estimated tokens: ${sizeMetadata.estimatedTokens} (${sizeMetadata.tiles} tile${sizeMetadata.tiles > 1 ? 's' : ''})`
            : undefined,
          sizeMetadata && sizeMetadata.tokenSavings
            ? `Token savings: ${sizeMetadata.tokenSavings}`
            : undefined,
          coordinateTransform
            ? `⚖️ Coordinate transform: scale by ${coordinateTransform.scaleX}× (X) and ${coordinateTransform.scaleY}× (Y)`
            : undefined,
          `File: ${finalOutputPath}`,
          `File size: ${fileSize} bytes`,
          appName && screenName && state
            ? `Semantic path: ${appName}_${screenName}_${state}`
            : undefined,
          coordinateTransform
            ? `⚠️ Screenshot is resized - ${coordinateTransform.guidance}`
            : undefined,
          `View screenshot: open "${finalOutputPath}"`,
          `Copy to clipboard: pbcopy < "${finalOutputPath}"`
        );
      } else {
        guidanceMessages.push(
          `✅ Video recording started`,
          `File: ${finalOutputPath}`,
          `Codec: ${codec || 'h264'}`,
          `Stop recording: Press Ctrl+C`,
          `View video: open "${finalOutputPath}"`
        );
      }
    } else {
      guidanceMessages.push(
        `❌ Failed to ${operation}: ${result.stderr || 'Unknown error'}`,
        simulator.state !== 'Booted'
          ? `Simulator is not booted. Boot it first: simctl-boot`
          : `Check file path permissions: ${finalOutputPath}`,
        `Check simulator health: simctl-health-check`
      );
    }

    // Add warnings for simulator state regardless of success
    if (simulator.state !== 'Booted') {
      guidanceMessages.push(
        `⚠️ Warning: Simulator is in ${simulator.state} state. Boot the simulator for optimal functionality: simctl-boot`
      );
    }
    if (simulator.isAvailable === false) {
      guidanceMessages.push(
        `⚠️ Warning: Simulator is marked as unavailable. This may cause issues with operations.`
      );
    }

    const responseData = {
      success,
      udid: resolvedUdid,
      operation,
      filePath: finalOutputPath,
      outputPath: finalOutputPath,
      fileExists,
      fileSize: fileSize > 0 ? fileSize : undefined,
      codec: operation === 'video' ? codec || 'h264' : undefined,
      // Screenshot size optimization metadata
      screenshotSize: operation === 'screenshot' ? sizeMetadata : undefined,
      // Coordinate transform for mapping screenshot coordinates to device coordinates
      coordinateTransform: operation === 'screenshot' ? coordinateTransform : undefined,
      simulatorInfo: {
        name: simulator.name,
        udid: simulator.udid,
        state: simulator.state,
        isAvailable: simulator.isAvailable,
      },
      // LLM optimization: include semantic metadata when provided
      semanticMetadata:
        appName || screenName || state
          ? {
              appName: appName || undefined,
              screenName: screenName || undefined,
              state: state || undefined,
            }
          : undefined,
      command,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.code,
      guidance: guidanceMessages.filter(Boolean),
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: !success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-io failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
