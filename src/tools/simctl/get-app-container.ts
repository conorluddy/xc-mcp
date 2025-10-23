import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlGetAppContainerToolArgs {
  udid: string;
  bundleId: string;
  containerType?: string;
}

/**
 * Get the file system path to an app's container on a simulator
 *
 * Examples:
 * - Get app data container: udid: "device-123", bundleId: "com.example.MyApp"
 * - Get bundle container: udid: "device-123", bundleId: "com.example.MyApp", containerType: "bundle"
 * - Get app groups container: udid: "device-123", bundleId: "com.example.MyApp", containerType: "group"
 *
 * Container types:
 * - bundle: The app's bundle (.app directory)
 * - data: The app's Documents and Library directories
 * - group: App groups container (for shared data)
 */
export async function simctlGetAppContainerTool(args: any) {
  const { udid, bundleId, containerType } = args as SimctlGetAppContainerToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (!bundleId || bundleId.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Bundle ID is required and cannot be empty');
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

    // Build get_app_container command
    let command = `xcrun simctl get_app_container "${udid}" "${bundleId}"`;
    if (containerType) {
      command = `xcrun simctl get_app_container "${udid}" "${bundleId}" "${containerType}"`;
    }

    console.error(`[simctl-get-app-container] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const containerPath = result.code === 0 ? result.stdout.trim() : null;
    const success = !!(result.code === 0 && containerPath && containerPath.length > 0);

    // Extract container type for response
    const displayContainerType = containerType || 'data';

    // Build guidance messages
    const guidanceMessages: string[] = [];

    if (success) {
      guidanceMessages.push(
        `✅ Container path retrieved for "${bundleId}"`,
        `Path: ${containerPath}`,
        `Access files: cd "${containerPath}" && ls -la`,
        `View app documents: open "${containerPath}/Documents"`,
        `Inspect app data: find "${containerPath}" -type f | head -20`,
        `Container type: ${displayContainerType} (bundle/data/group)`
      );
    } else {
      guidanceMessages.push(
        `❌ Failed to get app container: ${result.stderr || 'Unknown error'}`,
        `App may not be installed on this simulator`,
        `Verify bundle ID: ${bundleId}`,
        `Install app first: simctl-install ${udid} /path/to/App.app`,
        `Check app is running: simctl-launch ${udid} ${bundleId}`
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
      bundleId,
      containerType: displayContainerType,
      containerPath: containerPath || undefined,
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
      `simctl-get-app-container failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
