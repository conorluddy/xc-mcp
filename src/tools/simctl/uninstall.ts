import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlUninstallToolArgs {
  udid: string;
  bundleId: string;
}

/**
 * Uninstall an iOS app from a simulator
 *
 * Examples:
 * - Uninstall app: udid: "device-123", bundleId: "com.example.MyApp"
 * - Uninstall built-in app: udid: "device-123", bundleId: "com.apple.mobilesafari"
 *
 * Bundle ID format: com.company.appname
 */
export async function simctlUninstallTool(args: any) {
  const { udid, bundleId } = args as SimctlUninstallToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'UDID is required and cannot be empty'
      );
    }

    if (!bundleId || bundleId.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Bundle ID is required and cannot be empty'
      );
    }

    // Validate bundle ID format
    if (!bundleId.includes('.')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Bundle ID should follow the format: com.company.appname'
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

    // Execute uninstall command
    const command = `xcrun simctl uninstall "${udid}" "${bundleId}"`;
    console.error(`[simctl-uninstall] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 30000, // 30 seconds for app uninstallation
    });

    const success = result.code === 0;

    const responseData = {
      success,
      udid,
      bundleId,
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
            `✅ App "${bundleId}" uninstalled successfully from "${simulator.name}"`,
            `Install new app: simctl-install ${udid} /path/to/App.app`,
            `List installed apps: simctl-list ${udid}`,
            `Check app container: simctl-get-app-container ${udid} com.example.app`,
          ]
        : [
            `⚠️ Failed to uninstall app: ${result.stderr || 'Unknown error'}`,
            `App may not be installed`,
            `Verify bundle ID: ${bundleId}`,
            `Check simulator status: simctl-health-check`,
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
      `simctl-uninstall failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
