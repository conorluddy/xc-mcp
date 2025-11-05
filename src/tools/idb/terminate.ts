import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { isValidBundleId } from '../../utils/shell-escape.js';
import { formatToolError } from '../../utils/error-formatter.js';

interface IdbTerminateArgs {
  udid?: string;
  bundleId: string; // App bundle identifier to terminate
}

/**
 * Terminate running application - force-quit apps for clean state testing and debugging
 *
 * **What it does:**
 * Force-terminates running applications by bundle ID with immediate stop (no graceful shutdown).
 * Idempotent operation that succeeds even if app not running. Detects whether app was actually
 * running from output parsing to provide accurate status. Essential for resetting app state between
 * test runs and preparing for reinstallation.
 *
 * **Why you'd use it:**
 * - Reset app state between test runs for clean-slate testing without full reinstallation
 * - Stop apps before uninstall/reinstall workflows to avoid "app in use" errors
 * - Force-quit frozen or unresponsive apps during debugging sessions
 * - Idempotent operation safe to call multiple times - no error if app already stopped
 *
 * **Parameters:**
 * - bundleId (required): App bundle identifier to terminate
 * - udid (optional): Target identifier - auto-detects if omitted
 *
 * **Returns:**
 * Termination status with success indicator, bundle ID, wasRunning flag (parsed from output
 * to distinguish actual termination from no-op), command output, error details if failed,
 * and next steps guidance (relaunch, reinstall, verification).
 *
 * **Example:**
 * ```typescript
 * // Force-quit app before reinstall
 * const result = await idbTerminateTool({
 *   bundleId: 'com.example.MyApp'
 * });
 *
 * // Stop app on specific device
 * await idbTerminateTool({
 *   bundleId: 'com.example.MyApp',
 *   udid: 'DEVICE-UDID-123'
 * });
 * ```
 *
 * **Full documentation:** See idb/terminate.md for detailed parameters and behavior
 *
 * @param args Tool arguments with bundle ID and optional target UDID
 * @returns Tool result with termination status and wasRunning indicator
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
  // Validate bundle ID to prevent command injection
  if (!isValidBundleId(bundleId)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Invalid bundle ID format: ${bundleId}. Expected format: com.example.app`
    );
  }

  const command = `idb terminate ${bundleId} --udid "${udid}"`;

  console.error(`[idb-terminate] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 10000 });

  // Note: IDB terminate succeeds even if app not running (idempotent)
  const success = result.code === 0;

  if (!success) {
    const condensedError = formatToolError(result.stderr, 'Termination failed');
    return {
      success: false,
      bundleId,
      error: condensedError,
      guidance: formatErrorGuidance(bundleId, condensedError, udid),
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

function formatErrorGuidance(bundleId: string, condensedError: string, udid: string): string[] {
  const guidance: string[] = [
    `❌ Failed to terminate ${bundleId}`,
    ``,
    `Reason: ${condensedError}`,
    ``,
  ];

  // Detect error type from condensed message
  if (
    condensedError.includes('not found') ||
    condensedError.includes('nothing to terminate') ||
    condensedError.includes('No such process')
  ) {
    guidance.push(`Next steps:`);
    guidance.push(`• List running apps: idb-list-apps --udid ${udid} --running-only`);
    guidance.push(`• Verify bundle ID: ${bundleId}`);
  } else if (condensedError.includes('not installed')) {
    guidance.push(`Next steps:`);
    guidance.push(`• Check installed apps: idb-list-apps --udid ${udid}`);
    guidance.push(`• Install app first if needed`);
  } else {
    guidance.push(`Troubleshooting:`);
    guidance.push(`• Check IDB connection: idb-connect --udid ${udid}`);
    guidance.push(`• Verify device is booted: idb-targets --operation list`);
    guidance.push(`• Retry termination`);
  }

  return guidance;
}

export const IDB_TERMINATE_DOCS = `
# idb-terminate

⏹️ Terminate (kill) running application on iOS target
Behavior:
- Immediately stops the running app
- Equivalent to force-quitting

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
- Full documentation in idb_terminate.ts
`;
