import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlOpenUrlToolArgs {
  udid: string;
  url: string;
}

/**
 * Open a URL in a simulator (deep linking support)
 *
 * Examples:
 * - Open web URL: udid: "device-123", url: "https://example.com"
 * - Open deep link: udid: "device-123", url: "myapp://open?id=123"
 * - Open mailto: udid: "device-123", url: "mailto:test@example.com"
 * - Open tel: udid: "device-123", url: "tel:+1234567890"
 *
 * Supports:
 * - HTTP/HTTPS URLs
 * - Custom scheme deep links (myapp://)
 * - Special URLs (mailto:, tel:, sms:, etc.)
 *
 * **Full documentation:** See simctl/openurl.md for detailed parameters and examples
 */
export async function simctlOpenUrlTool(args: any) {
  const { udid, url } = args as SimctlOpenUrlToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (!url || url.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'URL is required and cannot be empty');
    }

    // Basic URL validation
    const urlRegex = /^([a-z][a-z0-9+.-]*:)?\/\/.+|^[a-z][a-z0-9+.-]*:.*$/i;
    if (!urlRegex.test(url)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'URL must be a valid format (e.g., https://example.com or myapp://deeplink)'
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

    // Execute openurl command
    const command = `xcrun simctl openurl "${udid}" "${url}"`;
    console.error(`[simctl-openurl] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 15000,
    });

    const success = result.code === 0;

    // Extract scheme from URL for response
    const schemeMatch = url.match(/^([a-z][a-z0-9+.-]*?):/i);
    const scheme = schemeMatch ? schemeMatch[1] : 'http';

    // Build guidance messages
    const guidanceMessages: string[] = [];

    if (success) {
      guidanceMessages.push(
        `✅ URL opened on "${simulator.name}"`,
        `URL: ${url}`,
        `Scheme: ${scheme}`,
        `View open URLs in Safari: simctl-launch ${udid} com.apple.mobilesafari`,
        `Test deep links with different parameters`
      );
    } else {
      guidanceMessages.push(
        `❌ Failed to open URL: ${result.stderr || 'Unknown error'}`,
        simulator.state !== 'Booted'
          ? `Simulator is not booted. Boot it first: simctl-boot ${udid}`
          : scheme !== 'http' && scheme !== 'https'
            ? `No handler registered for scheme "${scheme}". Install an app that handles this scheme.`
            : `Verify URL format: ${url}`,
        `Check simulator health: simctl-health-check`
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
      url,
      scheme,
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
      `simctl-openurl failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_OPENURL_DOCS = `
# simctl-openurl

Open URLs in a simulator, including web URLs, deep links, and special URL schemes.

## What it does

Opens a URL in the simulator, which can be a web URL (http/https), custom app deep link
(myapp://), or special URL scheme (mailto:, tel:, sms:). The system will route the URL
to the appropriate app handler.

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **url** (string, required): URL to open (e.g., https://example.com or myapp://deeplink?id=123)

## Supported URL Schemes

- **HTTP/HTTPS**: Web URLs (opens in Safari)
- **Custom schemes**: Deep links to your app (myapp://, yourapp://)
- **mailto**: Email composition (opens Mail app)
- **tel**: Phone dialer (opens Phone app on iPhone)
- **sms**: SMS composition (opens Messages app)
- **facetime**: FaceTime calls
- **maps**: Apple Maps URLs

## Returns

JSON response with:
- URL open status
- Detected URL scheme
- Guidance for testing URL handling and deep links

## Examples

### Open web URL
\`\`\`typescript
await simctlOpenUrlTool({
  udid: 'device-123',
  url: 'https://example.com'
})
\`\`\`

### Open deep link with parameters
\`\`\`typescript
await simctlOpenUrlTool({
  udid: 'device-123',
  url: 'myapp://open?id=123&action=view'
})
\`\`\`

### Open mailto link
\`\`\`typescript
await simctlOpenUrlTool({
  udid: 'device-123',
  url: 'mailto:test@example.com?subject=Hello'
})
\`\`\`

### Open tel link
\`\`\`typescript
await simctlOpenUrlTool({
  udid: 'device-123',
  url: 'tel:+1234567890'
})
\`\`\`

## Common Use Cases

1. **Deep link testing**: Verify app handles custom URL schemes correctly
2. **Universal links**: Test https:// URLs that open your app
3. **Navigation testing**: Confirm deep links navigate to correct screens
4. **Parameter parsing**: Verify URL parameters are parsed correctly
5. **Fallback handling**: Test behavior when no handler is registered

## Important Notes

- **Simulator must be booted**: URLs can only be opened on running simulators
- **Handler registration**: Custom schemes require an app that handles them
- **URL encoding**: Ensure URL parameters are properly encoded
- **Timing**: Consider launching app first if testing immediate URL handling

## Error Handling

- **No handler registered**: Error if no app handles the URL scheme
- **Simulator not booted**: Indicates simulator must be booted first
- **Invalid URL format**: Validates URL has proper scheme and format
- **Simulator not found**: Validates simulator exists in cache

## Deep Link Testing Workflow

1. **Install app**: \`simctl-install <udid> /path/to/App.app\`
2. **Launch app**: \`simctl-launch <udid> <bundleId>\`
3. **Open deep link**: \`simctl-openurl <udid> myapp://route?param=value\`
4. **Take screenshot**: \`simctl-io <udid> screenshot\` to verify navigation
5. **Check logs**: Monitor console for URL handling logs

## Testing Strategies

- **Parameter variations**: Test different query parameters
- **Invalid URLs**: Verify error handling for malformed URLs
- **Background handling**: Test URLs when app is backgrounded
- **Fresh launch**: Test URLs when app is not running
- **State preservation**: Verify app state is maintained after URL handling
`;

