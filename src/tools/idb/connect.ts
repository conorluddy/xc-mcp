import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateDeviceReady } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface IdbConnectArgs {
  udid?: string;
  operation?: 'connect' | 'disconnect'; // Default: connect
}

/**
 * Manage IDB companion connections for persistent target access
 *
 * Examples:
 * - Connect to target: udid: "ABC-123"
 * - Auto-detect and connect: (no parameters)
 * - Disconnect: udid: "ABC-123", operation: "disconnect"
 *
 * Why: IDB maintains persistent gRPC connections to targets.
 * Connecting registers the companion for faster subsequent operations.
 *
 * Note: IDB CLI auto-connects when needed, so explicit connect is optional.
 * Useful for warming up connections or troubleshooting connectivity.
 */
export async function idbConnectTool(args: IdbConnectArgs) {
  const { udid, operation = 'connect' } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await IDBTargetCache.getTarget(resolvedUdid);

    // Validate device readiness for physical devices
    if (target.type === 'device') {
      await validateDeviceReady(resolvedUdid);
    }

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Operation
    // ============================================================================

    const result =
      operation === 'connect'
        ? await executeConnectOperation(resolvedUdid, target)
        : await executeDisconnectOperation(resolvedUdid, target);

    // ============================================================================
    // STAGE 3: Response Formatting
    // ============================================================================

    const duration = Date.now() - startTime;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ...result,
              duration,
            },
            null,
            2
          ),
        },
      ],
      isError: !result.success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `idb-connect failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// OPERATION HANDLERS
// ============================================================================

/**
 * Connect to IDB companion for persistent access
 *
 * Why: Registers companion and verifies connectivity.
 * Auto-started by IDB CLI if not already running.
 */
async function executeConnectOperation(udid: string, target: any) {
  const result = await executeCommand(`idb connect --udid "${udid}"`, {
    timeout: 10000,
  });

  const success = result.code === 0;

  // Record successful connection for usage tracking
  if (success) {
    IDBTargetCache.recordSuccess(udid);
  }

  return {
    success,
    operation: 'connect',
    udid,
    targetName: target.name,
    targetType: target.type,
    connectionType: target.connectionType,
    output: result.stdout,
    error: result.stderr || undefined,
    guidance: success
      ? [
          `✅ Connected to "${target.name}" (${target.type})`,
          ``,
          `IDB companion is ready for operations.`,
          target.type === 'device' ? `Connection: ${target.connectionType || 'USB'}` : undefined,
          ``,
          `Next steps:`,
          `• List apps: idb-list-apps --udid ${udid}`,
          `• Install app: idb-install --udid ${udid} --path /path/to/App.app`,
          `• Take screenshot: simctl-screenshot-inline --udid ${udid}`,
          `• UI automation: idb-ui-tap --udid ${udid} --x 200 --y 400`,
        ].filter(Boolean)
      : [
          `❌ Failed to connect to "${target.name}": ${result.stderr || 'Unknown error'}`,
          ``,
          `Troubleshooting:`,
          target.type === 'device'
            ? [
                `For physical devices:`,
                `• Verify USB connection or WiFi network`,
                `• Trust this computer on device`,
                `• Ensure idb_companion running: brew services start idb-companion`,
                `• Check connection: idb list-targets`,
              ]
            : [
                `For simulators:`,
                `• Verify simulator is booted: simctl-boot --udid ${udid}`,
                `• Check IDB installation: idb --version`,
                `• Reinstall if needed: brew reinstall idb-companion`,
              ],
        ]
          .flat()
          .filter(Boolean),
  };
}

/**
 * Disconnect from IDB companion
 *
 * Why: Cleanup persistent connection when no longer needed.
 * Frees resources and closes gRPC channel.
 */
async function executeDisconnectOperation(udid: string, target: any) {
  const result = await executeCommand(`idb disconnect --udid "${udid}"`, {
    timeout: 5000,
  });

  const success = result.code === 0;

  return {
    success,
    operation: 'disconnect',
    udid,
    targetName: target.name,
    output: result.stdout,
    error: result.stderr || undefined,
    guidance: success
      ? [
          `✅ Disconnected from "${target.name}"`,
          ``,
          `IDB companion connection closed.`,
          ``,
          `To reconnect:`,
          `• idb-connect --udid ${udid}`,
        ]
      : [
          `❌ Failed to disconnect: ${result.stderr || 'Unknown error'}`,
          ``,
          `Note: Disconnect may fail if no active connection exists.`,
          `This is usually harmless - IDB will clean up automatically.`,
        ],
  };
}
