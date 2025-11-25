import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface IdbListAppsArgs {
  udid?: string;
  filterType?: 'system' | 'user' | 'internal'; // Filter by install type
  runningOnly?: boolean; // Show only running apps
}

/**
 * List installed applications - discover apps available for testing with bundle IDs and running status
 *
 * **What it does:**
 * Enumerates all installed applications on iOS targets with structured metadata including bundle ID,
 * app name, install type (system/user/internal), running status, debuggability, and architecture.
 * Filters apps by install type or running status to focus on user apps or active processes. Parses
 * IDB's pipe-separated output into structured JSON for easy programmatic access.
 *
 * **Why you'd use it:**
 * - Discover bundle IDs for launching, terminating, or uninstalling apps - no manual lookup required
 * - Filter user-installed apps to focus on test targets vs. system apps
 * - Identify running apps for UI automation or determine if app launch is needed
 * - Check debuggability status before attaching debugger or collecting crash logs
 *
 * **Parameters:**
 * - udid (optional): Target identifier - auto-detects if omitted
 * - filterType (optional): "system" | "user" | "internal" - filter by install type
 * - runningOnly (optional): Boolean - show only currently running apps
 *
 * **Returns:**
 * Structured app list with summary counts (total, running, debuggable, by install type),
 * separate arrays for running vs. installed apps, applied filter details, and actionable
 * guidance for launching, terminating, installing, or debugging apps.
 *
 * **Example:**
 * ```typescript
 * // List user-installed apps to find test target
 * const result = await idbListAppsTool({
 *   filterType: 'user'
 * });
 *
 * // Find running app for UI automation
 * const running = await idbListAppsTool({ runningOnly: true });
 * ```
 *
 * **Full documentation:** See idb/list-apps.md for detailed parameters and output format
 *
 * @param args Tool arguments with optional filters
 * @returns Tool result with structured app list and metadata
 */
export async function idbListAppsTool(args: IdbListAppsArgs) {
  const { udid, filterType, runningOnly } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    // Validate filterType if provided
    if (filterType && !['system', 'user', 'internal'].includes(filterType)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'filterType must be "system", "user", or "internal"'
      );
    }

    // Resolve UDID and validate target is booted
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Query
    // ============================================================================

    const result = await executeListAppsOperation(resolvedUdid, { filterType, runningOnly });

    // Record successful query
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
      `idb-list-apps failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// QUERY EXECUTION
// ============================================================================

interface AppInfo {
  bundleId: string;
  appName: string;
  installType: 'system' | 'user' | 'internal';
  architecture: string;
  running: boolean;
  debuggable: boolean;
}

/**
 * Execute list-apps command and parse pipe-separated output
 *
 * Why: IDB outputs pipe-separated text, we convert to structured JSON.
 * Format: bundle_id | app_name | install_type | arch | running | debuggable
 *
 * Example raw output:
 * com.apple.Maps | Maps | system | arm64 | Not running | Not Debuggable
 * com.example.MyApp | MyApp | user | arm64 | Running | Debuggable
 */
async function executeListAppsOperation(
  udid: string,
  filters: {
    filterType?: 'system' | 'user' | 'internal';
    runningOnly?: boolean;
  }
): Promise<any> {
  const command = `idb list-apps --udid "${udid}"`;

  console.error(`[idb-list-apps] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 30000 });

  if (result.code !== 0) {
    return {
      success: false,
      error: result.stderr || 'Failed to list apps',
      guidance: [
        `❌ Failed to list apps`,
        ``,
        `Troubleshooting:`,
        `• Verify target is booted: idb-targets --operation list --state Booted`,
        `• Check IDB connection: idb list-targets`,
        `• For devices: Ensure USB connected and idb_companion running`,
        `• Retry: idb-list-apps --udid ${udid}`,
      ],
    };
  }

  // Parse pipe-separated output
  const lines = result.stdout
    .trim()
    .split('\n')
    .filter(line => line.trim());

  const apps: AppInfo[] = [];

  for (const line of lines) {
    // Split on pipe with whitespace trimming
    const parts = line.split('|').map(p => p.trim());

    if (parts.length !== 6) {
      console.warn(`[idb-list-apps] Skipping malformed line: ${line}`);
      continue;
    }

    const [bundleId, appName, installType, architecture, runningStatus, debuggableStatus] = parts;

    // Parse install type
    const parsedInstallType = installType.toLowerCase() as 'system' | 'user' | 'internal';

    // Parse running status
    const running = runningStatus.toLowerCase().includes('running');

    // Parse debuggable status
    const debuggable = debuggableStatus.toLowerCase().includes('debuggable');

    apps.push({
      bundleId,
      appName,
      installType: parsedInstallType,
      architecture,
      running,
      debuggable,
    });
  }

  // Apply filters
  let filteredApps = apps;

  if (filters.filterType) {
    filteredApps = filteredApps.filter(app => app.installType === filters.filterType);
  }

  if (filters.runningOnly) {
    filteredApps = filteredApps.filter(app => app.running);
  }

  // Separate running and non-running apps for better organization
  const runningApps = filteredApps.filter(app => app.running);
  const notRunningApps = filteredApps.filter(app => !app.running);

  // Count debuggable apps
  const debuggableCount = filteredApps.filter(app => app.debuggable).length;

  return {
    success: true,
    summary: {
      total: filteredApps.length,
      running: runningApps.length,
      notRunning: notRunningApps.length,
      debuggable: debuggableCount,
      byInstallType: {
        system: filteredApps.filter(app => app.installType === 'system').length,
        user: filteredApps.filter(app => app.installType === 'user').length,
        internal: filteredApps.filter(app => app.installType === 'internal').length,
      },
    },
    runningApps: runningApps.map(app => ({
      bundleId: app.bundleId,
      appName: app.appName,
      installType: app.installType,
      architecture: app.architecture,
      debuggable: app.debuggable,
    })),
    installedApps: notRunningApps.map(app => ({
      bundleId: app.bundleId,
      appName: app.appName,
      installType: app.installType,
      architecture: app.architecture,
      debuggable: app.debuggable,
    })),
    appliedFilters: {
      filterType: filters.filterType || 'none',
      runningOnly: filters.runningOnly || false,
    },
    guidance: formatGuidance(filteredApps, runningApps, filters, udid),
  };
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatGuidance(
  allApps: AppInfo[],
  runningApps: AppInfo[],
  filters: {
    filterType?: 'system' | 'user' | 'internal';
    runningOnly?: boolean;
  },
  udid: string
): string[] {
  const guidance: string[] = [];

  // Success message
  guidance.push(
    `✅ Found ${allApps.length} app(s)${filters.filterType ? ` (${filters.filterType} only)` : ''}`
  );
  guidance.push(``);

  // Running apps section
  if (runningApps.length > 0) {
    guidance.push(`Running apps (${runningApps.length}):`);
    runningApps.slice(0, 3).forEach(app => {
      guidance.push(`• ${app.appName} (${app.bundleId})${app.debuggable ? ' [Debuggable]' : ''}`);
    });
    if (runningApps.length > 3) {
      guidance.push(`• ... and ${runningApps.length - 3} more`);
    }
  } else {
    guidance.push(`⚠️ No apps currently running`);
  }

  guidance.push(``);
  guidance.push(`Next steps:`);

  // Suggest operations based on state
  if (runningApps.length > 0) {
    const firstRunning = runningApps[0];
    guidance.push(
      `• Terminate app: idb-terminate --bundle-id ${firstRunning.bundleId} --udid ${udid}`
    );
    guidance.push(`• Query UI: idb-ui-describe --operation all --udid ${udid}`);
    guidance.push(`• Take screenshot: simctl-screenshot-inline --udid ${udid}`);

    if (firstRunning.debuggable) {
      guidance.push(
        `• Attach debugger: idb debugserver start ${firstRunning.bundleId} --udid ${udid}`
      );
    }
  } else {
    const debuggableApps = allApps.filter(app => app.debuggable);
    if (debuggableApps.length > 0) {
      const firstDebuggable = debuggableApps[0];
      guidance.push(
        `• Launch app: idb-launch --bundle-id ${firstDebuggable.bundleId} --udid ${udid}`
      );
      guidance.push(`• Then interact: idb-ui-tap / idb-ui-input`);
    }
  }

  // Filter suggestions
  if (!filters.filterType) {
    guidance.push(`• Filter apps: idb-list-apps --filter-type user --udid ${udid}`);
  }

  if (!filters.runningOnly) {
    guidance.push(`• Show running only: idb-list-apps --running-only true --udid ${udid}`);
  }

  return guidance.filter(Boolean);
}

export const IDB_LIST_APPS_DOCS = `
# idb-list-apps

List installed applications - discover apps available for testing with bundle IDs and running status.

## Overview

Enumerates all installed applications on iOS targets with structured metadata including bundle ID, app name, install type (system/user/internal), running status, debuggability, and architecture. Filters apps by install type or running status to focus on user apps or active processes. Parses IDB's pipe-separated output into structured JSON for easy programmatic access.

## Parameters

### Required
None - all parameters are optional

### Optional
- **udid** (string): Target identifier - auto-detects if omitted
- **filterType** (string): Filter by install type ("system", "user", or "internal")
- **runningOnly** (boolean): Show only currently running apps

## Returns

Structured app list with summary counts (total, running, debuggable, by install type), separate arrays for running vs. installed apps, applied filter details, and actionable guidance for launching, terminating, installing, or debugging apps.

## Examples

### List user-installed apps to find test target
\`\`\`typescript
const result = await idbListAppsTool({
  filterType: 'user'
});
\`\`\`

### Find running app for UI automation
\`\`\`typescript
const running = await idbListAppsTool({ runningOnly: true });
\`\`\`

### List all apps on specific device
\`\`\`typescript
const all = await idbListAppsTool({
  udid: 'DEVICE-UDID-123'
});
\`\`\`

## Related Tools

- idb-launch: Launch app by bundle ID discovered here
- idb-terminate: Stop running app found in list
- idb-install: Install new app to target

## Notes

- IDB outputs pipe-separated text, converted to structured JSON
- Output format: bundle_id | app_name | install_type | arch | running | debuggable
- Filter by install type to focus on user apps vs system apps
- Running status helps identify active processes for UI automation
- Debuggable status indicates if debugger can be attached
`;

export const IDB_LIST_APPS_DOCS_MINI =
  'List installed apps with bundle IDs. Use rtfm({ toolName: "idb-list-apps" }) for docs.';
