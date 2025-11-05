import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand, buildSimctlCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlDeleteToolArgs {
  deviceId: string;
}

/**
 * Permanently delete iOS simulator devices
 *
 * **What it does:**
 * Permanently removes a simulator device and all its data from the system. This action
 * cannot be undone. The simulator must be shut down before deletion.
 *
 * **Why you'd use it:**
 * - Clean up unused simulators to save disk space (simulators can be 5-10GB each)
 * - Quick operation for fast permanent deletion
 * - Safety checks prevent accidental deletion of booted devices
 * - Automated cleanup workflows for CI/CD environments
 *
 * **Parameters:**
 * - `deviceId` (string): Device UDID to delete (from simctl-list)
 *
 * **Returns:**
 * Deletion status with device information and confirmation that action is permanent
 *
 * **Example:**
 * ```typescript
 * // Delete specific simulator
 * await simctlDeleteTool({ deviceId: 'ABC-123-DEF' })
 * ```
 *
 * **Full documentation:** See simctl/delete.md for safety considerations and best practices
 *
 * @param args Deletion configuration (requires deviceId)
 * @returns Tool result with deletion status and guidance
 * @throws McpError for invalid device ID, booted device, or deletion failure
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

export const SIMCTL_DELETE_DOCS = `
# simctl-delete

🗑️ **Delete Simulator** - Permanently remove a simulator device.
⚠️ This action cannot be undone.

## Advantages

• 🧹 **Clean up** - Remove unused simulators to save disk space
• ⚡ **Quick operation** - Fast permanent deletion
• 💡 **Safety checks** - Prevents accidental deletion of booted devices

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
- Full documentation in simctl_delete.ts
`;
