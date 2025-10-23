import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { promises as fs } from 'fs';
import * as path from 'path';

interface SimctlIoToolArgs {
  udid: string;
  operation: 'screenshot' | 'video';
  outputPath?: string;
  codec?: string;
  // LLM optimization: semantic naming for screenshots
  appName?: string;
  screenName?: string;
  state?: string;
}

/**
 * Capture screenshot or record video from a simulator
 *
 * Examples:
 * - Screenshot: udid: "device-123", operation: "screenshot"
 * - Custom output: udid: "device-123", operation: "screenshot", outputPath: "/tmp/my_screenshot.png"
 * - Semantic naming: udid: "device-123", operation: "screenshot", appName: "MyApp", screenName: "LoginScreen", state: "Empty"
 * - Record video: udid: "device-123", operation: "video"
 * - Custom codec: udid: "device-123", operation: "video", codec: "h264"
 *
 * Operations:
 * - screenshot: Capture current screen
 * - video: Record simulator screen (stop with Ctrl+C)
 *
 * Codecs for video: h264, hevc, prores
 *
 * LLM Optimization:
 * For semantic naming, provide appName, screenName, and state to generate filenames like:
 * MyApp_LoginScreen_Empty_2025-01-23.png (enables agents to reason about screens)
 */
export async function simctlIoTool(args: any) {
  const { udid, operation, outputPath, codec, appName, screenName, state } =
    args as SimctlIoToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'UDID is required and cannot be empty'
      );
    }

    if (!operation || !['screenshot', 'video'].includes(operation)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Operation must be either "screenshot" or "video"'
      );
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(udid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${udid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Generate default output path if not provided
    let finalOutputPath = outputPath;
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

    // Build command
    let command = `xcrun simctl io "${udid}" ${operation} "${finalOutputPath}"`;
    if (operation === 'video' && codec) {
      command = `xcrun simctl io "${udid}" ${operation} --codec="${codec}" "${finalOutputPath}"`;
    }

    console.error(`[simctl-io] Executing: ${command}`);

    const timeout =
      operation === 'screenshot'
        ? 10000 // 10 seconds for screenshot
        : 5000; // 5 seconds to start video recording

    const result = await executeCommand(command, { timeout });

    const success = result.code === 0;

    // Check if file was created
    let fileExists = false;
    let fileSize = 0;
    if (success) {
      try {
        const stats = await fs.stat(finalOutputPath);
        fileExists = true;
        fileSize = stats.size;
      } catch {
        // File might not exist yet if recording
      }
    }

    const responseData = {
      success,
      udid,
      operation,
      filePath: finalOutputPath,
      outputPath: finalOutputPath,
      fileExists,
      fileSize: fileSize > 0 ? fileSize : undefined,
      codec: operation === 'video' ? codec || 'h264' : undefined,
      simulatorInfo: {
        name: simulator.name,
        udid: simulator.udid,
        state: simulator.state,
        isAvailable: simulator.isAvailable,
      },
      // LLM optimization: include semantic metadata when provided
      semanticMetadata: appName || screenName || state ? {
        appName: appName || undefined,
        screenName: screenName || undefined,
        state: state || undefined,
      } : undefined,
      command,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.code,
      guidance: success
        ? operation === 'screenshot'
          ? [
              `✅ Screenshot captured successfully`,
              `File: ${finalOutputPath}`,
              `File size: ${fileSize} bytes`,
              appName && screenName && state
                ? `Semantic path: ${appName}_${screenName}_${state}`
                : undefined,
              `View screenshot: open "${finalOutputPath}"`,
              `Copy to clipboard: pbcopy < "${finalOutputPath}"`,
            ].filter(Boolean)
          : [
              `✅ Video recording started`,
              `File: ${finalOutputPath}`,
              `Codec: ${codec || 'h264'}`,
              `Stop recording: Press Ctrl+C`,
              `View video: open "${finalOutputPath}"`,
            ]
        : [
            `❌ Failed to ${operation}: ${result.stderr || 'Unknown error'}`,
            simulator.state !== 'Booted'
              ? `Simulator is not booted. Boot it first: simctl-boot ${udid}`
              : `Check file path permissions: ${finalOutputPath}`,
            `Check simulator health: simctl-health-check`,
          ],
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
