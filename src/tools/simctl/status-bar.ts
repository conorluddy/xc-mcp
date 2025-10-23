import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlStatusBarToolArgs {
  udid: string;
  operation: 'override' | 'clear';
  time?: string;
  dataNetwork?: string;
  wifiMode?: string;
  batteryState?: string;
  batteryLevel?: number;
}

/**
 * Manage simulator status bar appearance for testing
 *
 * Examples:
 * - Override appearance: udid: "device-123", operation: "override", time: "9:41", batteryLevel: 100
 * - Clear overrides: udid: "device-123", operation: "clear"
 * - Set poor signal: udid: "device-123", operation: "override", dataNetwork: "none", wifiMode: "failed"
 *
 * Parameters (for override):
 * - time: 24-hour format (e.g., "9:41", "23:59")
 * - dataNetwork: none, 1x, 3g, 4g, 5g, lte, lte-a
 * - wifiMode: active, searching, failed
 * - batteryState: charging, charged, discharging
 * - batteryLevel: 0-100
 */
export async function simctlStatusBarTool(args: any) {
  const { udid, operation, time, dataNetwork, wifiMode, batteryState, batteryLevel } =
    args as SimctlStatusBarToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'UDID is required and cannot be empty'
      );
    }

    if (!operation || !['override', 'clear'].includes(operation)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Operation must be either "override" or "clear"'
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

    // For override operation, validate parameters
    if (operation === 'override') {
      // Validate time format if provided
      if (time) {
        const timeRegex = /^\d{1,2}:\d{2}$/;
        if (!timeRegex.test(time)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Time must be in 24-hour format (e.g., "9:41", "23:59")'
          );
        }
      }

      // Validate battery level if provided
      if (batteryLevel !== undefined) {
        if (batteryLevel < 0 || batteryLevel > 100) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Battery level must be between 0 and 100'
          );
        }
      }
    }

    // Build command
    let command = `xcrun simctl status_bar "${udid}" ${operation}`;

    // Add parameters for override
    if (operation === 'override') {
      const options = [];

      if (time) {
        options.push(`--time "${time}"`);
      }
      if (dataNetwork) {
        options.push(`--dataNetwork "${dataNetwork}"`);
      }
      if (wifiMode) {
        options.push(`--wifiMode "${wifiMode}"`);
      }
      if (batteryState) {
        options.push(`--batteryState "${batteryState}"`);
      }
      if (batteryLevel !== undefined) {
        options.push(`--batteryLevel "${batteryLevel}"`);
      }

      if (options.length > 0) {
        command += ' ' + options.join(' ');
      }
    }

    console.error(`[simctl-status-bar] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const success = result.code === 0;

    const responseData = {
      success,
      udid,
      operation,
      parameters: operation === 'override' ? {
        time,
        dataNetwork,
        wifiMode,
        batteryState,
        batteryLevel,
      } : undefined,
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
        ? operation === 'override'
          ? [
              `✅ Status bar ${operation}d on "${simulator.name}"`,
              `Time: ${time || 'default'}`,
              `Network: ${dataNetwork || 'unchanged'}`,
              `WiFi: ${wifiMode || 'unchanged'}`,
              `Battery: ${batteryLevel !== undefined ? `${batteryLevel}%` : 'unchanged'} (${batteryState || 'unchanged'})`,
              `Take screenshot to verify: simctl-io ${udid} screenshot`,
            ]
          : [
              `✅ Status bar overrides cleared on "${simulator.name}"`,
              `Status bar will show actual device state`,
            ]
        : [
            `❌ Failed to ${operation} status bar: ${result.stderr || 'Unknown error'}`,
            `Check simulator version compatibility`,
            `Verify simulator is available: simctl-health-check`,
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
      `simctl-status-bar failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
