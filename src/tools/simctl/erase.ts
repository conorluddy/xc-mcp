import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand, buildSimctlCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlEraseToolArgs {
  deviceId: string;
  force?: boolean;
}

/**
 * Reset iOS simulator devices to factory settings
 *
 * **What it does:**
 * Resets a simulator to clean factory state without deleting the device itself. All apps
 * and data are removed, but the simulator persists and can be immediately reused.
 *
 * **Why you'd use it:**
 * - Clean state for fresh app installation testing without recreating simulators
 * - Data removal clears all apps, preferences, and user data
 * - Testing workflows benefit from repeatable clean states
 * - Device preserved means simulator remains available for immediate reuse
 *
 * **Parameters:**
 * - `deviceId` (string): Device UDID to erase (from simctl-list)
 * - `force` (boolean, optional): Force erase even if device is booted (default: false)
 *
 * **Returns:**
 * Erase status with device information and confirmation that device persists
 *
 * **Example:**
 * ```typescript
 * // Erase simulator to clean state
 * await simctlEraseTool({ deviceId: 'ABC-123-DEF' })
 *
 * // Force erase booted device
 * await simctlEraseTool({ deviceId: 'ABC-123-DEF', force: true })
 * ```
 *
 * **Full documentation:** See simctl/erase.md for clean state testing patterns
 *
 * @param args Erase configuration (requires deviceId)
 * @returns Tool result with erase status and guidance
 * @throws McpError for invalid device ID or erase failure
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

export const SIMCTL_ERASE_DOCS = `
# simctl-erase

🔄 **Erase Simulator** - Reset simulator to factory settings.
Resets device to clean state while keeping it available.

## Advantages

• 🔄 **Clean state** - Reset device without deleting it
• 📦 **Data removal** - Removes all apps and user data
• 🎯 **Testing** - Perfect for fresh app installation testing
• 💾 **Device preserved** - Simulator persists for reuse

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
- Full documentation in simctl_erase.ts
`;
