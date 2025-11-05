import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlInstallToolArgs {
  udid: string;
  appPath: string;
}

/**
 * Install iOS apps to simulators for testing
 *
 * **What it does:**
 * Installs a built .app bundle to a simulator device, making it available for launching
 * and testing. Validates the app bundle format and simulator state before installation.
 *
 * **Why you'd use it:**
 * - Deploy built apps directly from Xcode DerivedData to any simulator
 * - Fast installation completes in seconds for quick test iterations
 * - Validation checks ensure app bundle and simulator are valid before attempting install
 * - Testing workflows integrate app installation into automated test pipelines
 *
 * **Parameters:**
 * - `udid` (string): Simulator UDID (from simctl-list)
 * - `appPath` (string): Path to .app bundle (e.g., /path/to/MyApp.app)
 *
 * **Returns:**
 * Installation status with app name, simulator info, and guidance for next steps
 *
 * **Example:**
 * ```typescript
 * // Install from Xcode build output
 * await simctlInstallTool({
 *   udid: 'ABC-123-DEF',
 *   appPath: '/Users/dev/Library/Developer/Xcode/DerivedData/MyApp-xxx/Build/Products/Debug-iphonesimulator/MyApp.app'
 * })
 * ```
 *
 * **Full documentation:** See simctl/install.md for app installation patterns
 *
 * @param args Installation configuration (requires udid and appPath)
 * @returns Tool result with installation status and guidance
 * @throws McpError for invalid app path, simulator not found, or installation failure
 */
export async function simctlInstallTool(args: any) {
  const { udid, appPath } = args as SimctlInstallToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'UDID is required and cannot be empty'
      );
    }

    if (!appPath || appPath.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'App path is required and cannot be empty'
      );
    }

    if (!appPath.endsWith('.app')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'App path must point to a .app bundle (e.g., /path/to/MyApp.app)'
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

    // Execute install command
    const command = `xcrun simctl install "${udid}" "${appPath}"`;
    console.error(`[simctl-install] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 60000, // 60 seconds for app installation
    });

    const success = result.code === 0;

    // Extract app bundle ID if available
    const appName = appPath.split('/').pop()?.replace('.app', '') || 'app';

    const responseData = {
      success,
      udid,
      appPath,
      appName,
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
            `✅ App "${appName}" installed successfully on "${simulator.name}"`,
            `Launch app: simctl-launch ${udid} com.example.bundle-id`,
            `Get app container: simctl-get-app-container ${udid} com.example.bundle-id`,
            `Uninstall app: simctl-uninstall ${udid} com.example.bundle-id`,
          ]
        : [
            `❌ Failed to install app: ${result.stderr || 'Unknown error'}`,
            `Check app path: ${appPath}`,
            `Verify simulator is available: simctl-health-check`,
            `Try rebuilding the app from Xcode`,
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
      `simctl-install failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_INSTALL_DOCS = `
# simctl-install

📦 **Install App to Simulator** - Deploy built apps to simulators for testing.
Installs an iOS app (.app bundle) to a specified simulator.
Returns: Installation status, app name, and guidance for next steps.

## Parameters

### Required
- (See implementation for parameters)

### Optional
- (See implementation for optional parameters)

## Returns

- Tool execution results with structured output
- Success/failure status
- Guidance for next steps

## Related Tools

- See MCP server documentation for related tools

## Notes

- Tool is auto-registered with MCP server
- Full documentation in simctl_install.ts
`;
