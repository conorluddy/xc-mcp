import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlCloneToolArgs {
  deviceId: string;
  newName: string;
}

/**
 * Clone iOS simulator devices with complete state preservation
 *
 * **What it does:**
 * Creates an exact duplicate of an existing simulator including all settings, installed apps,
 * and current state. The cloned simulator gets a new UDID but preserves all configuration.
 *
 * **Why you'd use it:**
 * - Snapshots create backups of configured simulators for safe experimentation
 * - Testing variants enable multiple versions for different test scenarios
 * - State preservation includes all apps, data, and configuration
 * - Quick setup duplicates existing configuration instead of manual recreation
 *
 * **Parameters:**
 * - `deviceId` (string): Source device UDID to clone (from simctl-list)
 * - `newName` (string): Display name for the cloned simulator
 *
 * **Returns:**
 * Clone status with both source and new device information, including new UDID
 *
 * **Example:**
 * ```typescript
 * // Clone simulator for testing
 * await simctlCloneTool({
 *   deviceId: 'ABC-123-DEF',
 *   newName: 'TestDevice-Snapshot'
 * })
 * ```
 *
 * **Full documentation:** See simctl/clone.md for cloning strategies and use cases
 *
 * @param args Clone configuration (requires deviceId and newName)
 * @returns Tool result with clone status, new UDID, and guidance
 * @throws McpError for invalid device ID, duplicate name, or clone failure
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

export const SIMCTL_CLONE_DOCS = `
# simctl-clone

📋 **Clone Simulator** - Create a duplicate of an existing simulator.
Creates a new simulator with same configuration and data as source.

## Advantages

• 📸 **Snapshots** - Create backups of configured simulators
• 🧪 **Testing variants** - Have multiple versions for different test scenarios
• 💾 **State preservation** - Cloned device includes all apps and data
• ⚡ **Quick setup** - Duplicate existing configuration instead of recreating

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
- Full documentation in simctl_clone.ts
`;
