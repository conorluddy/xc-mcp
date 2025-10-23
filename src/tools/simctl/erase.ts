import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand, buildSimctlCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlEraseToolArgs {
  deviceId: string;
  force?: boolean;
}

/**
 * Erase an iOS simulator device to factory settings
 *
 * Resets simulator to clean state without deleting the device.
 * All apps and data will be removed, but the simulator device persists.
 * This is useful for testing fresh app installations and clean states.
 *
 * Example:
 * - Erase device: deviceId: "ABC123-DEF456-GHI789"
 * - Find UDIDs with: simctl-list
 */
export async function simctlEraseTool(args: any) {
  const { deviceId, force = false } = args as SimctlEraseToolArgs;

  try {
    // Validate device ID
    validateDeviceId(deviceId);

    // Get device info before erasing
    const device = await simulatorCache.findSimulatorByUdid(deviceId);
    const deviceName = device?.name || 'Unknown Device';
    const isBooted = device?.state === 'Booted';

    // Warn if device is booted
    if (isBooted && !force) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator "${deviceName}" is currently booted. Shut it down first with: simctl-shutdown ${deviceId}, or use force: true to erase without shutdown`
      );
    }

    // Build erase command
    const eraseCommand = buildSimctlCommand('erase', { deviceId });

    console.error(`[simctl-erase] Executing: ${eraseCommand}`);

    // Execute erase command
    const result = await executeCommand(eraseCommand, {
      timeout: 60000, // 60 seconds to erase device
    });

    const success = result.code === 0;

    // Handle common errors
    if (!success) {
      if (result.stderr.includes('does not exist')) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Simulator with UDID "${deviceId}" does not exist`
        );
      }
    }

    // Clear cache to ensure fresh data next time
    if (success) {
      simulatorCache.clearCache();
    }

    const responseData = {
      success,
      deviceId,
      deviceName,
      wasBooted: isBooted,
      command: eraseCommand,
      output: result.stdout,
      error: result.stderr || null,
      exitCode: result.code,
      guidance: success
        ? [
            `Simulator "${deviceName}" has been erased to factory settings`,
            'All apps and data have been removed',
            'The simulator device still exists and can be booted',
            `Boot device: simctl-boot ${deviceId}`,
          ]
        : [
            `Failed to erase simulator: ${result.stderr || 'Unknown error'}`,
            isBooted ? 'Device is booted - shut it down first: simctl-shutdown' : null,
            'Verify device exists: simctl-list',
          ].filter(Boolean),
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
      `simctl-erase failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
