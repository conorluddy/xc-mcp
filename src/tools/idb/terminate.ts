import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface IdbTerminateArgs {
  udid?: string;
  bundleId: string; // App bundle identifier to terminate
}

/**
 * Terminate (kill) running application on iOS target
 *
 * Examples:
 * - Terminate app: bundleId: "com.example.MyApp"
 * - Auto-detect target: bundleId: "com.example.MyApp"
 * - Specific target: bundleId: "com.example.MyApp", udid: "ABC-123"
 *
 * Behavior:
 * - Immediately stops the running app
 * - Equivalent to force-quitting the app
 * - App state is not saved (no graceful shutdown)
 * - Use before reinstalling or debugging
 *
 * If app not running:
 * - Command succeeds (no error)
 * - Idempotent operation
 *
 * Device Support:
 * - Simulators: Full support ✅
 * - Physical Devices: Requires USB + idb_companion ✅
 */
export async function idbTerminateTool(args: IdbTerminateArgs) {
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
    // STAGE 2: Execute Termination
    // ============================================================================

    const result = await executeTerminateOperation(resolvedUdid, bundleId);

    // Record successful termination
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
      `idb-terminate failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// TERMINATION EXECUTION
// ============================================================================

/**
 * Execute app termination
 *
 * Why: IDB sends termination signal to running app.
 * Format: idb terminate <bundle-id> --udid <UDID>
 *
 * This is a force-kill operation (not graceful shutdown).
 */
async function executeTerminateOperation(udid: string, bundleId: string): Promise<any> {
  const command = `idb terminate ${bundleId} --udid "${udid}"`;

  console.error(`[idb-terminate] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 10000 });

  // Note: IDB terminate succeeds even if app not running (idempotent)
  const success = result.code === 0;

  if (!success) {
    return {
      success: false,
      bundleId,
      error: result.stderr || 'Termination failed',
      guidance: formatErrorGuidance(bundleId, result.stderr || '', udid),
    };
  }

  // Check if app was actually running by parsing output
  const wasRunning = !result.stdout.includes('not running') && !result.stdout.includes('not found');

  return {
    success: true,
    bundleId,
    wasRunning,
    output: result.stdout,
    guidance: formatSuccessGuidance(bundleId, wasRunning, udid),
  };
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatSuccessGuidance(bundleId: string, wasRunning: boolean, udid: string): string[] {
  const guidance: string[] = [];

  if (wasRunning) {
    guidance.push(`✅ Successfully terminated ${bundleId}`);
  } else {
    guidance.push(`✅ Termination command succeeded (app was not running)`);
  }

  guidance.push(``);
  guidance.push(`Next steps:`);

  if (wasRunning) {
    guidance.push(`• Verify termination: idb-list-apps --running-only true --udid ${udid}`);
    guidance.push(`• Relaunch app: idb-launch --bundle-id ${bundleId} --udid ${udid}`);
    guidance.push(`• Reinstall app: idb-uninstall then idb-install`);
  } else {
    guidance.push(`• Launch app: idb-launch --bundle-id ${bundleId} --udid ${udid}`);
    guidance.push(`• Check installed apps: idb-list-apps --udid ${udid}`);
  }

  guidance.push(`• Take screenshot: simctl-screenshot-inline --udid ${udid}`);

  return guidance;
}

function formatErrorGuidance(bundleId: string, stderr: string, udid: string): string[] {
  const guidance: string[] = [`❌ Failed to terminate ${bundleId}`, ``, `Error: ${stderr}`, ``];

  if (stderr.includes('not found') || stderr.includes('not installed')) {
    guidance.push(`App not installed:`);
    guidance.push(`• Verify app exists: idb-list-apps --udid ${udid}`);
    guidance.push(`• Check bundle ID is correct`);
    guidance.push(`• No termination needed if app not installed`);
  } else {
    guidance.push(`Troubleshooting:`);
    guidance.push(`• Verify target is booted: idb-targets --operation list --state Booted`);
    guidance.push(`• Check app installation: idb-list-apps --udid ${udid}`);
    guidance.push(`• Check IDB connection: idb list-targets`);
    guidance.push(`• Retry termination`);
  }

  return guidance;
}
