import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlAddmediaToolArgs {
  udid: string;
  mediaPath: string;
}

/**
 * Add media files (photos, videos) to a simulator's photo library
 *
 * Examples:
 * - Add image: udid: "device-123", mediaPath: "/path/to/photo.jpg"
 * - Add video: udid: "device-123", mediaPath: "/path/to/video.mp4"
 *
 * Supported image formats: jpg, jpeg, png, heic, gif, bmp
 * Supported video formats: mp4, mov, avi, mkv
 *
 * **Full documentation:** See simctl/addmedia.md for detailed parameters and examples
 */
export async function simctlAddmediaTool(args: any) {
  const { udid, mediaPath } = args as SimctlAddmediaToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (!mediaPath || mediaPath.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Media path is required and cannot be empty');
    }

    // Validate file format
    const supportedExtensions = [
      'jpg',
      'jpeg',
      'png',
      'heic',
      'gif',
      'bmp', // images
      'mp4',
      'mov',
      'avi',
      'mkv', // videos
    ];

    const extension = mediaPath.split('.').pop()?.toLowerCase();
    if (!extension || !supportedExtensions.includes(extension)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unsupported media format: .${extension}. Supported formats: ${supportedExtensions.join(', ')}`
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

    // Execute addmedia command
    const command = `xcrun simctl addmedia "${udid}" "${mediaPath}"`;
    console.error(`[simctl-addmedia] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 30000, // 30 seconds for media addition
    });

    const success = result.code === 0;

    // Determine media type
    const imageExtensions = ['jpg', 'jpeg', 'png', 'heic', 'gif', 'bmp'];
    const mediaType = imageExtensions.includes(extension!) ? 'image' : 'video';

    // Extract filename
    const filename = mediaPath.split('/').pop() || 'media';

    // Build guidance messages
    const guidanceMessages: string[] = [];

    if (success) {
      guidanceMessages.push(
        `✅ Media "${filename}" added to "${simulator.name}" photo library`,
        `Media type: ${mediaType}`,
        `Format: ${extension?.toUpperCase()}`,
        `View in Photos app: simctl-launch ${udid} com.apple.mobileslideshow`,
        `Add more media: simctl-addmedia ${udid} /path/to/another/photo.jpg`
      );
    } else {
      guidanceMessages.push(
        `❌ Failed to add media: ${result.stderr || 'Unknown error'}`,
        `Check file exists: ${mediaPath}`,
        `Check format: .${extension}`,
        `Verify simulator is available: simctl-health-check`
      );
    }

    // Add warnings for simulator state regardless of success
    if (simulator.state !== 'Booted') {
      guidanceMessages.push(
        `⚠️ Warning: Simulator is in ${simulator.state} state. Boot the simulator for optimal functionality: simctl-boot ${udid}`
      );
    }
    if (simulator.isAvailable === false) {
      guidanceMessages.push(
        `⚠️ Warning: Simulator is marked as unavailable. This may cause issues with operations.`
      );
    }

    const responseData = {
      success,
      udid,
      mediaPath,
      mediaType,
      filename,
      format: extension?.toUpperCase(),
      simulatorInfo: {
        name: simulator.name,
        udid: simulator.udid,
        state: simulator.state,
        isAvailable: simulator.isAvailable,
      },
      command,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.code,
      guidance: guidanceMessages,
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
      `simctl-addmedia failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
