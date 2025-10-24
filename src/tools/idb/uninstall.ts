import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface IdbUninstallArgs {
  udid?: string;
  bundleId: string; // App bundle identifier to uninstall
}

/**
 * Uninstall (remove) application from iOS target
 *
 * Examples:
 * - Uninstall app: bundleId: "com.example.MyApp"
 * - Auto-detect target: bundleId: "com.example.MyApp"
 * - Specific target: bundleId: "com.example.MyApp", udid: "ABC-123"
 *
 * Behavior:
 * - Removes app from device/simulator
 * - Deletes app data and preferences
 * - Cannot uninstall system apps
 * - If app running, it will be terminated first
 *
 * Use cases:
 * - Clean install testing
 * - Removing old versions before reinstall
 * - Freeing device storage
 * - Resetting app state
 *
 * Device Support:
 * - Simulators: Full support ✅
 * - Physical Devices: Requires USB + idb_companion ✅
 */
export async function idbUninstallTool(args: IdbUninstallArgs) {
  const { udid, bundleId } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    if (!bundleId || bundleId.trim() === '') {
      throw new McpError(ErrorCode.InvalidRequest, 'bundleId is required');
    }

    // Resolve UDID and validate target is booted
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Uninstallation
    // ============================================================================

    const result = await executeUninstallOperation(resolvedUdid, bundleId);

    // Record successful uninstallation
    if (result.success) {
      IDBTargetCache.recordSuccess(resolvedUdid);
    }

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
              udid: resolvedUdid,
              targetName: target.name,
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
      `idb-uninstall failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// UNINSTALLATION EXECUTION
// ============================================================================

/**
 * Execute app uninstallation
 *
 * Why: IDB removes app from target system.
 * Format: idb uninstall <bundle-id> --udid <UDID>
 *
 * Automatically terminates app if running.
 */
async function executeUninstallOperation(udid: string, bundleId: string): Promise<any> {
  const command = `idb uninstall ${bundleId} --udid "${udid}"`;

  console.error(`[idb-uninstall] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 30000 });

  if (result.code !== 0) {
    return {
      success: false,
      bundleId,
      error: result.stderr || 'Uninstallation failed',
      guidance: formatErrorGuidance(bundleId, result.stderr || '', udid),
    };
  }

  return {
    success: true,
    bundleId,
    output: result.stdout,
    guidance: formatSuccessGuidance(bundleId, udid),
  };
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatSuccessGuidance(bundleId: string, udid: string): string[] {
  return [
    `✅ Successfully uninstalled ${bundleId}`,
    ``,
    `App and all data removed from target.`,
    ``,
    `Next steps:`,
    `• Verify removal: idb-list-apps --filter-type user --udid ${udid}`,
    `• Reinstall app: idb-install --app-path /path/to/App.app --udid ${udid}`,
    `• Install different version for testing`,
    `• Clean install testing workflow complete`,
  ];
}

function formatErrorGuidance(bundleId: string, stderr: string, udid: string): string[] {
  const guidance: string[] = [`❌ Failed to uninstall ${bundleId}`, ``, `Error: ${stderr}`, ``];

  if (stderr.includes('not found') || stderr.includes('not installed')) {
    guidance.push(`App not installed:`);
    guidance.push(`• App may already be uninstalled`);
    guidance.push(`• Verify with: idb-list-apps --udid ${udid}`);
    guidance.push(`• Check bundle ID is correct`);
  } else if (stderr.includes('system') || stderr.includes('cannot remove')) {
    guidance.push(`Cannot remove system app:`);
    guidance.push(`• System apps cannot be uninstalled`);
    guidance.push(`• Only user-installed apps can be removed`);
    guidance.push(`• Check install type: idb-list-apps --udid ${udid}`);
  } else {
    guidance.push(`Troubleshooting:`);
    guidance.push(`• Terminate app first: idb-terminate --bundle-id ${bundleId} --udid ${udid}`);
    guidance.push(`• Verify target is booted: idb-targets --operation list --state Booted`);
    guidance.push(`• Check app exists: idb-list-apps --udid ${udid}`);
    guidance.push(`• Retry uninstallation`);
    guidance.push(`• Try simctl-uninstall as alternative`);
  }

  return guidance;
}
