import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { isValidBundleId } from '../../utils/shell-escape.js';
import { formatToolError } from '../../utils/error-formatter.js';

interface IdbUninstallArgs {
  udid?: string;
  bundleId: string; // App bundle identifier to uninstall
}

/**
 * Uninstall application from iOS target - remove apps with complete data deletion for clean installs
 *
 * **What it does:**
 * Removes installed applications by bundle ID with complete data and preferences deletion. Automatically
 * terminates running apps before uninstall. Cannot remove system apps (user-installed only). Provides
 * detailed error guidance for common failures (app not found, system app protection, uninstall errors).
 *
 * **Why you'd use it:**
 * - Clean install testing workflows - remove old version completely before installing new build
 * - Reset app state by deleting all data and preferences (more thorough than terminate alone)
 * - Free device storage by removing unused test apps from device farms
 * - Automate uninstall/reinstall cycles for testing fresh installs and onboarding flows
 *
 * **Parameters:**
 * - bundleId (required): App bundle identifier to uninstall
 * - udid (optional): Target identifier - auto-detects if omitted
 *
 * **Returns:**
 * Uninstallation status with success indicator, bundle ID, command output, error details
 * if failed, and troubleshooting guidance (app not found, system app protection, termination
 * advice, alternative tools).
 *
 * **Example:**
 * ```typescript
 * // Uninstall app for clean reinstall
 * const result = await idbUninstallTool({
 *   bundleId: 'com.example.MyApp'
 * });
 *
 * // Uninstall from specific device
 * await idbUninstallTool({
 *   bundleId: 'com.example.MyApp',
 *   udid: 'DEVICE-UDID-123'
 * });
 * ```
 *
 * **Full documentation:** See idb/uninstall.md for detailed parameters and behavior
 *
 * @param args Tool arguments with bundle ID and optional target UDID
 * @returns Tool result with uninstallation status and guidance
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
  // Validate bundle ID to prevent command injection
  if (!isValidBundleId(bundleId)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Invalid bundle ID format: ${bundleId}. Expected format: com.example.app`
    );
  }

  const command = `idb uninstall ${bundleId} --udid "${udid}"`;

  console.error(`[idb-uninstall] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 30000 });

  if (result.code !== 0) {
    const condensedError = formatToolError(result.stderr, 'Uninstallation failed');
    return {
      success: false,
      bundleId,
      error: condensedError,
      guidance: formatErrorGuidance(bundleId, condensedError, udid),
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

function formatErrorGuidance(bundleId: string, condensedError: string, udid: string): string[] {
  const guidance: string[] = [
    `❌ Failed to uninstall ${bundleId}`,
    ``,
    `Reason: ${condensedError}`,
    ``,
  ];

  if (condensedError.includes('not found') || condensedError.includes('not installed')) {
    guidance.push(`Next steps:`);
    guidance.push(`• Verify app exists: idb-list-apps --udid ${udid}`);
    guidance.push(`• Confirm bundle ID: ${bundleId}`);
  } else if (condensedError.includes('system') || condensedError.includes('cannot remove')) {
    guidance.push(`Cannot remove system app:`);
    guidance.push(`• Only user-installed apps can be uninstalled`);
    guidance.push(`• Check install type: idb-list-apps --udid ${udid}`);
  } else {
    guidance.push(`Troubleshooting:`);
    guidance.push(`• Terminate first: idb-terminate --bundle-id ${bundleId} --udid ${udid}`);
    guidance.push(`• Verify target is booted: idb-targets --operation list`);
    guidance.push(`• Check app exists: idb-list-apps --udid ${udid}`);
  }

  return guidance;
}

export const IDB_UNINSTALL_DOCS = `
# idb-uninstall

🗑️ Uninstall (remove) application from iOS target
Behavior:
- Removes app from device/simulator
- Deletes app data and preferences

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
- Full documentation in idb_uninstall.ts
`;
