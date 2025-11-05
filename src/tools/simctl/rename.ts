import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlRenameToolArgs {
  deviceId: string;
  newName: string;
}

/**
 * Rename iOS simulator devices for better organization
 *
 * **What it does:**
 * Changes the display name of a simulator without affecting its UDID or any data.
 * Useful for organizing and identifying simulators with descriptive names.
 *
 * **Why you'd use it:**
 * - Organization helps better manage and identify simulators in lists
 * - Easy identification enables use of descriptive names for test devices
 * - Data preserved means renaming does not affect UDID or stored data
 * - Quick operation completes instantly with no side effects
 *
 * **Parameters:**
 * - `deviceId` (string): Device UDID to rename (from simctl-list)
 * - `newName` (string): New display name for the simulator
 *
 * **Returns:**
 * Rename status showing old name, new name, and confirmation that UDID is unchanged
 *
 * **Example:**
 * ```typescript
 * // Rename simulator for clarity
 * await simctlRenameTool({
 *   deviceId: 'ABC-123-DEF',
 *   newName: 'Production Test Device'
 * })
 * ```
 *
 * **Full documentation:** See simctl/rename.md for naming conventions and best practices
 *
 * @param args Rename configuration (requires deviceId and newName)
 * @returns Tool result with rename status and guidance
 * @throws McpError for invalid device ID, duplicate name, or rename failure
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

export const SIMCTL_RENAME_DOCS = `
# simctl-rename

✏️ **Rename Simulator** - Change a simulator's display name.
Renames device while preserving all configuration and data.

## Advantages

• 🏷️ **Organization** - Better organize and identify your simulators
• 🔍 **Easy identification** - Use descriptive names for test devices
• 💾 **Data preserved** - Rename without affecting UDID or data

## Parameters

### Required
- (See implementation for parameters)

### Optional
- (See implementation for optional parameters)

## Returns

- Tool execution results with structured output
- Success/failure status
- Guidance for next steps

## Related Tools

- See MCP server documentation for related tools

## Notes

- Tool is auto-registered with MCP server
- Full documentation in simctl_rename.ts
`;
