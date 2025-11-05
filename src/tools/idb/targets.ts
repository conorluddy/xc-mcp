import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface IdbTargetsArgs {
  operation: 'list' | 'describe' | 'focus';
  udid?: string; // Required for describe/focus
  // Filters for list operation
  state?: 'Booted' | 'Shutdown';
  type?: 'device' | 'simulator';
}

/**
 * Query and manage iOS targets - discover simulators and physical devices available for testing
 *
 * **What it does:**
 * Provides discovery and management for all iOS targets (simulators and devices) connected via IDB.
 * Lists available targets with filtering by state (booted/shutdown) and type (device/simulator), retrieves
 * detailed target metadata including screen dimensions for coordinate validation, and focuses simulator
 * windows for interactive testing. Uses intelligent caching (IDBTargetCache) to avoid expensive IDB calls.
 *
 * **Why you'd use it:**
 * - Discover available targets before starting automation workflows - no manual UDID lookup required
 * - Filter booted targets for immediate testing vs. shutdown targets that need activation
 * - Get screen dimensions for coordinate transformation and tap validation in UI automation
 * - Focus simulator windows programmatically during multi-target test execution
 *
 * **Parameters:**
 * - operation (required): "list" | "describe" | "focus"
 * - udid (required for describe/focus): Target identifier
 * - state (optional, list only): "Booted" | "Shutdown" - filter by target state
 * - type (optional, list only): "device" | "simulator" - filter by target type
 *
 * **Returns:**
 * Structured target data with success status, summary counts, target arrays (booted/shutdown),
 * usage statistics (last used time, successful operations count), cache diagnostics, and
 * actionable guidance for next steps in automation workflow.
 *
 * **Example:**
 * ```typescript
 * // List all booted targets ready for testing
 * const result = await idbTargetsTool({
 *   operation: 'list',
 *   state: 'Booted'
 * });
 *
 * // Get detailed target info with screen dimensions
 * const details = await idbTargetsTool({
 *   operation: 'describe',
 *   udid: 'ABC-123-DEF'
 * });
 * ```
 *
 * **Full documentation:** See idb/targets.md for detailed parameters and operations
 *
 * @param args Tool arguments with operation type and optional filters
 * @returns Tool result with structured target information and guidance
 */
export async function idbTargetsTool(args: IdbTargetsArgs) {
  const { operation, udid, state, type } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation (~15 lines)
    // ============================================================================

    if (!operation || !['list', 'describe', 'focus'].includes(operation)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'operation must be "list", "describe", or "focus"'
      );
    }

    // Validate UDID for describe/focus operations
    if ((operation === 'describe' || operation === 'focus') && !udid) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${operation} operation requires udid parameter`
      );
    }

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Operation
    // ============================================================================

    let result: any;

    switch (operation) {
      case 'list':
        result = await executeListOperation(state, type);
        break;

      case 'describe':
        result = await executeDescribeOperation(udid!);
        break;

      case 'focus':
        result = await executeFocusOperation(udid!);
        break;
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
              duration,
            },
            null,
            2
          ),
        },
      ],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `idb-targets failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// OPERATION HANDLERS
// ============================================================================

/**
 * List available targets with optional filters
 *
 * Why: Provides overview of all available iOS targets.
 * Uses IDBTargetCache to avoid expensive IDB calls.
 */
async function executeListOperation(state?: 'Booted' | 'Shutdown', type?: 'device' | 'simulator') {
  const targets = await IDBTargetCache.listTargets({ state, type });

  // Separate booted and shutdown targets for better organization
  const booted = targets.filter(t => t.state === 'Booted');
  const shutdown = targets.filter(t => t.state === 'Shutdown');

  // Get cache stats for diagnostics
  const cacheStats = IDBTargetCache.getCacheStats();

  return {
    success: true,
    operation: 'list',
    summary: {
      total: targets.length,
      booted: booted.length,
      shutdown: shutdown.length,
      devices: targets.filter(t => t.type === 'device').length,
      simulators: targets.filter(t => t.type === 'simulator').length,
    },
    bootedTargets: booted.map(t => ({
      udid: t.udid,
      name: t.name,
      type: t.type,
      osVersion: t.osVersion,
      screenDimensions: t.screenDimensions,
      lastUsed: t.lastUsed ? new Date(t.lastUsed).toISOString() : undefined,
      successfulOperations: t.successfulOperations || 0,
    })),
    shutdownTargets: shutdown.map(t => ({
      udid: t.udid,
      name: t.name,
      type: t.type,
      osVersion: t.osVersion,
    })),
    cacheInfo: {
      cacheAge: cacheStats.cacheAge,
      ttl: cacheStats.ttl,
    },
    guidance: [
      booted.length > 0
        ? `✅ ${booted.length} booted target(s) ready for operations`
        : '⚠️ No booted targets found',
      ``,
      `Next steps:`,
      booted.length > 0
        ? [
            `• Get details: idb-targets --operation describe --udid ${booted[0].udid}`,
            `• Focus window: idb-targets --operation focus --udid ${booted[0].udid}`,
            `• Take screenshot: simctl-screenshot-inline --udid ${booted[0].udid}`,
            `• UI automation: idb-ui-tap --udid ${booted[0].udid} --x 200 --y 400`,
          ]
        : [
            `• Boot simulator: simctl-boot --udid ${shutdown[0]?.udid || '<udid>'}`,
            `• List available: simctl-list`,
          ],
    ]
      .flat()
      .filter(Boolean),
  };
}

/**
 * Get detailed target information
 *
 * Why: Provides comprehensive metadata about a specific target.
 * Includes screen dimensions needed for coordinate validation.
 */
async function executeDescribeOperation(udid: string) {
  const target = await IDBTargetCache.getTarget(udid);

  return {
    success: true,
    operation: 'describe',
    target: {
      udid: target.udid,
      name: target.name,
      type: target.type,
      state: target.state,
      osVersion: target.osVersion,
      architecture: target.architecture,
      screenDimensions: target.screenDimensions,
      connectionType: target.connectionType,
      companionPort: target.companionPort,
      usageStats: {
        lastUsed: target.lastUsed ? new Date(target.lastUsed).toISOString() : 'Never',
        successfulOperations: target.successfulOperations || 0,
      },
    },
    guidance: [
      `✅ Target "${target.name}" details retrieved`,
      ``,
      `Device info:`,
      `• Type: ${target.type}`,
      `• State: ${target.state}`,
      `• OS: ${target.osVersion}`,
      `• Screen: ${target.screenDimensions.width}×${target.screenDimensions.height}`,
      ``,
      target.state === 'Booted'
        ? [
            `Ready for operations:`,
            `• Take screenshot: simctl-screenshot-inline --udid ${udid}`,
            `• UI automation: idb-ui-tap --udid ${udid} --x 200 --y 400`,
            `• Install app: idb-install --udid ${udid} --path /path/to/App.app`,
          ]
        : [
            `Not booted. Start with:`,
            `• Boot: simctl-boot --udid ${udid}`,
            `• Then retry operations`,
          ],
    ]
      .flat()
      .filter(Boolean),
  };
}

/**
 * Focus simulator window (bring to foreground)
 *
 * Why: Useful for bringing simulator to foreground during automation.
 * macOS-only operation (no-op for physical devices).
 */
async function executeFocusOperation(udid: string) {
  const target = await IDBTargetCache.getTarget(udid);

  // Focus only works for simulators
  if (target.type === 'device') {
    return {
      success: false,
      operation: 'focus',
      udid,
      error: 'Focus operation only supported for simulators (not physical devices)',
      guidance: [
        `❌ Cannot focus physical device "${target.name}"`,
        ``,
        `Focus is a macOS window management operation.`,
        `Physical devices don't have simulator windows.`,
        ``,
        `For devices, wake and unlock manually.`,
      ],
    };
  }

  // Execute IDB focus command
  const result = await executeCommand(`idb focus --udid "${udid}"`, {
    timeout: 5000,
  });

  const success = result.code === 0;

  return {
    success,
    operation: 'focus',
    udid,
    targetName: target.name,
    output: result.stdout,
    error: result.stderr || undefined,
    guidance: success
      ? [
          `✅ Simulator "${target.name}" brought to foreground`,
          ``,
          `Window is now focused and ready for interaction.`,
          ``,
          `Next steps:`,
          `• Take screenshot: simctl-screenshot-inline --udid ${udid}`,
          `• UI automation: idb-ui-tap --udid ${udid} --x 200 --y 400`,
        ]
      : [
          `❌ Failed to focus simulator: ${result.stderr || 'Unknown error'}`,
          ``,
          `Troubleshooting:`,
          `• Verify simulator is booted: idb-targets --operation list --state Booted`,
          `• Try reopening Simulator.app`,
          `• Check macOS window permissions`,
        ],
  };
}

export const IDB_TARGETS_DOCS = `
# idb-targets

**Query and manage iOS targets** - discover simulators and physical devices available for testing

## What it does

Provides discovery and management for all iOS targets (simulators and devices) connected via IDB. Lists available targets with filtering by state (booted/shutdown) and type (device/simulator), retrieves detailed target metadata including screen dimensions for coordinate validation, and focuses simulator windows for interactive testing. Uses intelligent caching (IDBTargetCache) to avoid expensive IDB calls.

## Why you'd use it

- Discover available targets before starting automation workflows - no manual UDID lookup required
- Filter booted targets for immediate testing vs. shutdown targets that need activation
- Get screen dimensions for coordinate transformation and tap validation in UI automation
- Focus simulator windows programmatically during multi-target test execution

## Parameters

### Required
- **operation** (string): "list" | "describe" | "focus"

### Operation-specific parameters
- **udid** (string, required for describe/focus): Target identifier
- **state** (string, optional for list): "Booted" | "Shutdown" - filter by target state
- **type** (string, optional for list): "device" | "simulator" - filter by target type

## Returns

Structured target data with success status, summary counts, target arrays (booted/shutdown), usage statistics (last used time, successful operations count), cache diagnostics, and actionable guidance for next steps in automation workflow.

## Examples

### List all booted targets
\`\`\`typescript
const result = await idbTargetsTool({
  operation: 'list',
  state: 'Booted'
});
\`\`\`

### Get detailed target info
\`\`\`typescript
const details = await idbTargetsTool({
  operation: 'describe',
  udid: 'ABC-123-DEF'
});
\`\`\`

## Related Tools

- idb-connect: Establish companion connection to target
- idb-list-apps: List apps on target
`;
