import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand, buildSimctlCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlDeleteToolArgs {
  deviceId: string;
}

/**
 * Delete an iOS simulator device
 *
 * Permanently removes a simulator and all its data.
 * This action cannot be undone.
 *
 * Example:
 * - Delete device by UDID: deviceId: "ABC123-DEF456-GHI789"
 * - Find UDIDs with: simctl-list
 */
export async function simctlDeleteTool(args: any) {
  const { deviceId } = args as SimctlDeleteToolArgs;

  try {
    // Validate device ID
    validateDeviceId(deviceId);

    // Get device info before deletion for confirmation
    const device = await simulatorCache.findSimulatorByUdid(deviceId);
    const deviceName = device?.name || 'Unknown Device';

    // Build delete command
    const deleteCommand = buildSimctlCommand('delete', { deviceId });

    console.error(`[simctl-delete] Executing: ${deleteCommand}`);

    // Execute delete command
    const result = await executeCommand(deleteCommand, {
      timeout: 30000, // 30 seconds to delete device
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
      if (result.stderr.includes('Booted')) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Cannot delete booted simulator "${deviceName}". Shut it down first with: simctl-shutdown ${deviceId}`
        );
      }
    }

    // Invalidate simulator cache so next call reflects deletion
    if (success) {
      simulatorCache.clearCache();
    }

    const responseData = {
      success,
      deviceId,
      deviceName,
      command: deleteCommand,
      output: result.stdout,
      error: result.stderr || null,
      exitCode: result.code,
      guidance: success
        ? [
            `Simulator "${deviceName}" (${deviceId}) has been permanently deleted`,
            'This action cannot be undone',
            'Use simctl-create to create new simulators',
          ]
        : [
            `Failed to delete simulator: ${result.stderr || 'Unknown error'}`,
            'If simulator is booted, shut it down first: simctl-shutdown',
            'Verify device exists: simctl-list',
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
      `simctl-delete failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
