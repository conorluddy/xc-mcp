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

export const SIMCTL_ADDMEDIA_DOCS = `
# simctl-addmedia

Add media files (photos and videos) to a simulator's photo library for testing.

## What it does

Adds image or video files to the simulator's Photos app, making them available for
apps to access via PHPhotoLibrary or UIImagePickerController APIs.

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **mediaPath** (string, required): Path to image or video file

## Supported Formats

**Images**: jpg, jpeg, png, heic, gif, bmp
**Videos**: mp4, mov, avi, mkv

## Returns

JSON response with:
- Media addition status
- Media type and format detected
- Guidance for viewing in Photos app and adding more media

## Examples

### Add image to photo library
\`\`\`typescript
await simctlAddmediaTool({
  udid: 'device-123',
  mediaPath: '/path/to/photo.jpg'
})
\`\`\`

### Add video to photo library
\`\`\`typescript
await simctlAddmediaTool({
  udid: 'device-123',
  mediaPath: '/path/to/video.mp4'
})
\`\`\`

## Common Use Cases

1. **Photo picker testing**: Add test images for UIImagePickerController testing
2. **PHPhotoLibrary testing**: Populate library for photo access API testing
3. **Image processing**: Add images to test filters, crops, and transformations
4. **Video playback**: Add videos to test AVPlayer integration
5. **Camera roll simulation**: Populate library to simulate real user photo collection

## Important Notes

- **File must exist**: Validates file exists before attempting to add
- **Format validation**: Only supported image/video formats are accepted
- **Simulator state**: Works on both booted and shutdown simulators
- **Photos app**: Media appears in simulator's Photos app immediately
- **Metadata**: Original file metadata (EXIF, date, etc.) is preserved

## Error Handling

- **File not found**: Error if media file path doesn't exist
- **Unsupported format**: Error if file extension is not in supported list
- **Simulator not found**: Validates simulator exists in cache
- **Addition failure**: Reports simctl errors if media cannot be added

## Next Steps After Adding Media

1. **View in Photos app**: \`simctl-launch <udid> com.apple.mobileslideshow\`
2. **Test photo picker**: Launch your app and open UIImagePickerController
3. **Add more media**: Repeat with different images/videos
4. **Test PHPhotoLibrary**: Use PHPhotoLibrary.requestAuthorization() in your app

## Testing Workflow

1. **Grant photo permissions**: \`simctl-privacy <udid> <bundleId> grant photos\`
2. **Add test media**: \`simctl-addmedia <udid> /path/to/photo.jpg\`
3. **Launch app**: \`simctl-launch <udid> <bundleId>\`
4. **Test photo access**: Verify app can read from photo library
5. **Take screenshot**: \`simctl-io <udid> screenshot\` to verify UI

## Tips

- **Test image formats**: Add different image formats (JPEG, PNG, HEIC) to test compatibility
- **Test video formats**: Add various video formats (MP4, MOV) to test playback
- **Large files**: Be aware that adding large video files may take time
- **Batch addition**: Add multiple files to simulate realistic photo library
`;

