import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlRenameToolArgs {
  deviceId: string;
  newName: string;
}

/**
 * Rename an iOS simulator device
 *
 * Changes the display name of a simulator without affecting its UDID or data.
 *
 * Example:
 * - Rename device: deviceId: "ABC123-DEF456", newName: "TestDevice-Updated"
 * - Find UDIDs with: simctl-list
 */
export async function simctlRenameTool(args: any) {
  const { deviceId, newName } = args as SimctlRenameToolArgs;

  try {
    // Validate inputs
    validateDeviceId(deviceId);

    if (!newName || newName.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'New device name is required and cannot be empty'
      );
    }

    // Get device info before rename
    const device = await simulatorCache.findSimulatorByUdid(deviceId);
    if (!device) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${deviceId}" not found`
      );
    }

    const oldName = device.name;

    // Build rename command
    const renameCommand = `xcrun simctl rename "${deviceId}" "${newName}"`;

    console.error(`[simctl-rename] Executing: ${renameCommand}`);

    // Execute rename command
    const result = await executeCommand(renameCommand, {
      timeout: 30000, // 30 seconds to rename device
    });

    const success = result.code === 0;

    // Invalidate simulator cache so next call sees new name
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
          `Simulator with UDID "${deviceId}" does not exist`
        );
      }
    }

    const responseData = {
      success,
      deviceId,
      oldName,
      newName,
      command: renameCommand,
      output: result.stdout,
      error: result.stderr || null,
      exitCode: result.code,
      guidance: success
        ? [
            `Simulator renamed from "${oldName}" to "${newName}"`,
            `Device UDID unchanged: ${deviceId}`,
            `All data and configuration preserved`,
          ]
        : [
            `Failed to rename simulator: ${result.stderr || 'Unknown error'}`,
            'Check device exists: simctl-list',
            `Ensure new name is unique and valid`,
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
      `simctl-rename failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
