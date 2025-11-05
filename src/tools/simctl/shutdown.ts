import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand, buildSimctlCommand } from '../../utils/command.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface SimctlShutdownToolArgs {
  deviceId: string;
}

/**
 * Shutdown iOS simulator devices with intelligent device management
 *
 * **What it does:**
 * Gracefully shuts down one or more iOS simulator devices. Supports shutting down specific devices,
 * all currently booted devices, or all devices at once with smart targeting options.
 *
 * **Why you'd use it:**
 * - Smart device targeting with "booted" and "all" options vs complex CLI syntax
 * - Better error handling with clear feedback when devices cannot be shut down
 * - State tracking updates internal device state for better recommendations
 * - Batch operations efficiently handle multiple device shutdowns
 *
 * **Parameters:**
 * - `deviceId` (string): Device UDID, "booted" for all booted devices, or "all" for all devices
 *
 * **Returns:**
 * Shutdown status with device information, duration, and next step guidance
 *
 * **Example:**
 * ```typescript
 * // Shutdown specific device
 * await simctlShutdownTool({ deviceId: 'ABC-123-DEF' })
 *
 * // Shutdown all booted devices
 * await simctlShutdownTool({ deviceId: 'booted' })
 * ```
 *
 * **Full documentation:** See simctl/shutdown.md for detailed parameters and usage patterns
 *
 * @param args Shutdown configuration (requires deviceId)
 * @returns Tool result with shutdown status and guidance
 * @throws McpError for invalid device ID or shutdown failure
 */
export async function simctlShutdownTool(args: any) {
  const { deviceId } = args as SimctlShutdownToolArgs;

  try {
    // Validate inputs
    validateDeviceId(deviceId);

    // Build shutdown command
    const command = buildSimctlCommand('shutdown', { deviceId });

    console.error(`[simctl-shutdown] Executing: ${command}`);

    // Execute shutdown command
    const startTime = Date.now();
    const result = await executeCommand(command, {
      timeout: 60000, // 1 minute for shutdown
    });
    const duration = Date.now() - startTime;

    let shutdownStatus = {
      success: result.code === 0,
      command,
      output: result.stdout,
      error: result.stderr,
      exitCode: result.code,
      duration,
    };

    // Handle common shutdown scenarios
    if (!shutdownStatus.success) {
      // Device already shutdown
      if (result.stderr.includes('Unable to shutdown device in current state: Shutdown')) {
        shutdownStatus = {
          ...shutdownStatus,
          success: true,
          error: 'Device was already shut down',
        };
      }
      // Invalid device ID
      else if (result.stderr.includes('Invalid device')) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid device ID: ${deviceId}`);
      }
    }

    // Format response
    const responseText = JSON.stringify(shutdownStatus, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: !shutdownStatus.success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-shutdown failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_SHUTDOWN_DOCS = `
# simctl-shutdown

⚡ **Prefer this over 'xcrun simctl shutdown'** - Intelligent shutdown with better device management.

## Advantages

• 🎯 **Smart device targeting** -

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
- Full documentation in simctl_shutdown.ts
`;
