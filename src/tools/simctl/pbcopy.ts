import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlPbcopyToolArgs {
  udid: string;
  text: string;
}

/**
 * Copy text to the clipboard of a simulator (simulated UIPasteboard)
 *
 * Examples:
 * - Copy text: udid: "device-123", text: "Hello World"
 * - Copy URL: udid: "device-123", text: "https://example.com"
 * - Copy JSON: udid: "device-123", text: '{"key":"value"}'
 *
 * This simulates the pasteboard in the simulator, allowing apps to access
 * the pasted content via UIPasteboard.general.string
 *
 * **Full documentation:** See simctl/pbcopy.md for detailed parameters and examples
 */
export async function simctlPbcopyTool(args: any) {
  const { udid, text } = args as SimctlPbcopyToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (!text || text.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Text is required and cannot be empty');
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(udid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${udid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Write text to temp file
    const tempFile = `/tmp/pbcopy_${Date.now()}.txt`;
    const fs = await import('fs/promises');
    await fs.writeFile(tempFile, text, 'utf8');

    try {
      // Execute pbcopy command
      const command = `cat "${tempFile}" | xcrun simctl pbcopy "${udid}"`;
      console.error(`[simctl-pbcopy] Executing: xcrun simctl pbcopy "${udid}"`);

      const result = await executeCommand(command, {
        timeout: 10000,
      });

      const success = result.code === 0;

      // Build guidance messages
      const guidanceMessages: string[] = [];

      if (success) {
        guidanceMessages.push(
          `✅ Text copied to clipboard on "${simulator.name}"`,
          `Text length: ${text.length} characters`,
          `App can access via: UIPasteboard.general.string`,
          `Test paste in app: simctl-launch ${udid} com.example.app`
        );
      } else {
        guidanceMessages.push(
          `❌ Failed to copy to clipboard: ${result.stderr || 'Unknown error'}`,
          `Check simulator is available: simctl-health-check`,
          `Verify text format: ${text.substring(0, 50)}...`
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
        textLength: text.length,
        textPreview: text.length > 100 ? text.substring(0, 100) + '...' : text,
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
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-pbcopy failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_PBCOPY_DOCS = `
# simctl-pbcopy

Copy text to simulator's clipboard for testing paste operations and UIPasteboard APIs.

## What it does

Copies text to the simulator's pasteboard (UIPasteboard.general), making it available for
apps to access via standard pasteboard APIs. Useful for testing paste functionality without
manual interaction.

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **text** (string, required): Text to copy to clipboard

## Returns

JSON response with:
- Copy operation status
- Text length and preview
- Guidance for accessing pasteboard in app

## Examples

### Copy simple text
\`\`\`typescript
await simctlPbcopyTool({
  udid: 'device-123',
  text: 'Hello World'
})
\`\`\`

### Copy URL
\`\`\`typescript
await simctlPbcopyTool({
  udid: 'device-123',
  text: 'https://example.com/path?param=value'
})
\`\`\`

### Copy JSON data
\`\`\`typescript
await simctlPbcopyTool({
  udid: 'device-123',
  text: JSON.stringify({ key: 'value', number: 123 })
})
\`\`\`

## Common Use Cases

1. **Paste testing**: Test text field paste functionality
2. **URL handling**: Test app URL detection from clipboard
3. **Data import**: Test importing data via clipboard
4. **Share functionality**: Test receiving shared text content
5. **Clipboard monitoring**: Test apps that monitor pasteboard changes

## How Apps Access the Text

Apps can access the clipboard text using:
\`\`\`swift
if let text = UIPasteboard.general.string {
    // Use the pasted text
}
\`\`\`

Or for URLs:
\`\`\`swift
if let url = UIPasteboard.general.url {
    // Handle the URL
}
\`\`\`

## Important Notes

- **Immediate availability**: Text is available on pasteboard immediately
- **Simulator-specific**: Each simulator has its own separate pasteboard
- **String only**: Only supports string data (no images, files, or custom types)
- **Persistent**: Clipboard content persists until overwritten or simulator resets

## Error Handling

- **Empty text**: Error if text string is empty
- **Simulator not found**: Validates simulator exists in cache
- **Write failure**: Reports if clipboard operation fails

## Testing Workflow

1. **Copy text**: \`simctl-pbcopy <udid> "Test text to paste"\`
2. **Launch app**: \`simctl-launch <udid> <bundleId>\`
3. **Navigate to input**: Use app to navigate to text field
4. **Test paste**: App should detect clipboard content
5. **Take screenshot**: \`simctl-io <udid> screenshot\` to verify paste

## Use Cases by Category

### Authentication Testing
- Copy and paste email addresses
- Copy and paste passwords (for test accounts only!)
- Copy verification codes from clipboard

### URL Handling
- Copy URLs and test app deep link detection
- Test universal link handling from clipboard
- Verify URL parameter parsing

### Data Import
- Copy JSON/CSV data for import testing
- Test clipboard-based data transfer
- Verify data format validation

### UX Testing
- Test long-press paste menu appearance
- Verify paste button states
- Test clipboard change notifications

## Clipboard Monitoring

Some apps monitor clipboard changes. To test this:
1. Launch app first
2. Copy text to clipboard
3. App should detect and respond to clipboard change
4. Take screenshot to verify UI update

## Limitations

- **String data only**: Cannot copy images, files, or custom types
- **No rich text**: Only plain text is supported
- **No pasteboard metadata**: Cannot set pasteboard change count or other metadata
- **Simulator scope**: Clipboard is not shared with host macOS clipboard
`;

