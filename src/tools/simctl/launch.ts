import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlLaunchToolArgs {
  udid: string;
  bundleId: string;
  arguments?: string[];
  environment?: Record<string, string>;
}

/**
 * Launch an iOS app on a simulator
 *
 * Examples:
 * - Launch app: udid: "device-123", bundleId: "com.example.MyApp"
 * - Launch with arguments: udid: "device-123", bundleId: "com.example.MyApp", arguments: ["--verbose", "--debug"]
 * - Launch with environment: udid: "device-123", bundleId: "com.example.MyApp", environment: { "DEBUG": "1" }
 *
 * Returns the process ID of the launched app
 */
export async function simctlLaunchTool(args: any) {
  const {
    udid,
    bundleId,
    arguments: appArgs = [],
    environment = {},
  } = args as SimctlLaunchToolArgs;

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

    // Build environment variables with SIMCTL_CHILD_ prefix
    // simctl requires environment variables to be prefixed with SIMCTL_CHILD_
    let envPrefix = '';
    for (const [key, value] of Object.entries(environment)) {
      envPrefix += `SIMCTL_CHILD_${key}="${value}" `;
    }

    // Build arguments string
    const argsString = appArgs.map(arg => `"${arg}"`).join(' ');

    // Build launch command with environment variables prefixed
    let command = `${envPrefix}xcrun simctl launch ${udid} "${bundleId}"`;
    if (argsString) {
      command += ` ${argsString}`;
    }

    console.error(`[simctl-launch] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 30000,
    });

    const success = result.code === 0;

    // Extract process ID from output
    const processIdMatch = result.stdout.match(/\d+/);
    const processId = processIdMatch ? parseInt(processIdMatch[0], 10) : null;

    const responseData = {
      success,
      udid,
      bundleId,
      processId: processId || undefined,
      arguments: appArgs.length > 0 ? appArgs : undefined,
      environment: Object.keys(environment).length > 0 ? environment : undefined,
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
            `✅ App "${bundleId}" launched on "${simulator.name}"`,
            `Process ID: ${processId}`,
            `Terminate app: simctl-terminate ${udid} ${bundleId}`,
            `Open URL in app: simctl-openurl ${udid} myapp://deeplink?param=value`,
            `Check app container: simctl-get-app-container ${udid} ${bundleId}`,
          ]
        : [
            `❌ Failed to launch app: ${result.stderr || 'Unknown error'}`,
            simulator.state !== 'Booted'
              ? `Simulator is not booted. Boot it first: simctl-boot ${udid}`
              : `Verify app is installed: simctl-install ${udid} /path/to/App.app`,
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
      `simctl-launch failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
