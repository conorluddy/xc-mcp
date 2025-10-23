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
 */
export async function simctlOpenUrlTool(args: any) {
  const { udid, url } = args as SimctlOpenUrlToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'UDID is required and cannot be empty'
      );
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
      guidance: success
        ? [
            `✅ URL opened on "${simulator.name}"`,
            `URL: ${url}`,
            `Scheme: ${scheme}`,
            `View open URLs in Safari: simctl-launch ${udid} com.apple.mobilesafari`,
            `Test deep links with different parameters`,
          ]
        : [
            `❌ Failed to open URL: ${result.stderr || 'Unknown error'}`,
            simulator.state !== 'Booted'
              ? `Simulator is not booted. Boot it first: simctl-boot ${udid}`
              : scheme !== 'http' && scheme !== 'https'
                ? `No handler registered for scheme "${scheme}". Install an app that handles this scheme.`
                : `Verify URL format: ${url}`,
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
      `simctl-openurl failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
