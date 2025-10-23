import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlCloneToolArgs {
  deviceId: string;
  newName: string;
}

/**
 * Clone an iOS simulator device
 *
 * Creates a duplicate of an existing simulator with all its settings and state.
 * Useful for creating test snapshots or having multiple variants of the same device.
 *
 * Example:
 * - Clone device: deviceId: "ABC123-DEF456", newName: "MyDevice-TestSnapshot"
 * - Find UDIDs with: simctl-list
 */
export async function simctlCloneTool(args: any) {
  const { deviceId, newName } = args as SimctlCloneToolArgs;

  try {
    // Validate inputs
    validateDeviceId(deviceId);

    if (!newName || newName.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'New device name is required and cannot be empty'
      );
    }

    // Get source device info
    const sourceDevice = await simulatorCache.findSimulatorByUdid(deviceId);
    if (!sourceDevice) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Source simulator with UDID "${deviceId}" not found`
      );
    }

    // Build clone command
    const cloneCommand = `xcrun simctl clone "${deviceId}" "${newName}"`;

    console.error(`[simctl-clone] Executing: ${cloneCommand}`);

    // Execute clone command
    const result = await executeCommand(cloneCommand, {
      timeout: 120000, // 2 minutes to clone device (may copy significant data)
    });

    const success = result.code === 0;

    // Extract new UDID from output
    const newUdid = success ? result.stdout.trim() : null;

    // Invalidate simulator cache
    if (success) {
      simulatorCache.clearCache();
    }

    // Handle common errors
    if (!success) {
      if (result.stderr.includes('already exists')) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `A simulator named "${newName}" already exists`
        );
      }
      if (result.stderr.includes('does not exist')) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Source simulator with UDID "${deviceId}" does not exist`
        );
      }
    }

    const responseData = {
      success,
      sourceDeviceId: deviceId,
      sourceDeviceName: sourceDevice.name,
      newDeviceName: newName,
      newDeviceId: newUdid,
      command: cloneCommand,
      output: result.stdout,
      error: result.stderr || null,
      exitCode: result.code,
      guidance: success
        ? [
            `Simulator "${newName}" created as clone of "${sourceDevice.name}"`,
            `New device UDID: ${newUdid}`,
            `Boot cloned device: simctl-boot ${newUdid}`,
            `Manage cloned device: simctl-delete, simctl-erase, etc.`,
          ]
        : [
            `Failed to clone simulator: ${result.stderr || 'Unknown error'}`,
            'Check source device exists: simctl-list',
            'Ensure new name is unique: simctl-list',
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
      `simctl-clone failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
