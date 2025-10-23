import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlInstallToolArgs {
  udid: string;
  appPath: string;
}

/**
 * Install an iOS app to a simulator
 *
 * Examples:
 * - Install built app: udid: "device-123", appPath: "/path/to/MyApp.app"
 * - Install from Xcode build: udid: "device-123", appPath: "/Users/conor/Library/Developer/Xcode/DerivedData/MyApp-xxx/Build/Products/Debug-iphonesimulator/MyApp.app"
 *
 * The app path should be the .app bundle directory (not the executable within it)
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
