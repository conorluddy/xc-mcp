import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlTerminateToolArgs {
  udid: string;
  bundleId: string;
}

/**
 * Terminate a running iOS app on a simulator
 *
 * Examples:
 * - Terminate app: udid: "device-123", bundleId: "com.example.MyApp"
 *
 * Gracefully terminates the specified app. If the app is not running,
 * returns an error but can be safely ignored.
 */
export async function simctlTerminateTool(args: any) {
  const { udid, bundleId } = args as SimctlTerminateToolArgs;

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

    // Execute terminate command
    const command = `xcrun simctl terminate "${udid}" "${bundleId}"`;
    console.error(`[simctl-terminate] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
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
            `✅ App "${bundleId}" terminated successfully`,
            `Launch app again: simctl-launch ${udid} ${bundleId}`,
            `Uninstall app: simctl-uninstall ${udid} ${bundleId}`,
            `Check app container: simctl-get-app-container ${udid} ${bundleId}`,
          ]
        : [
            `⚠️ Failed to terminate app: ${result.stderr || 'Unknown error'}`,
            `App may not be running`,
            simulator.state !== 'Booted'
              ? `Simulator is not booted`
              : `Verify app is installed and running`,
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
      `simctl-terminate failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
