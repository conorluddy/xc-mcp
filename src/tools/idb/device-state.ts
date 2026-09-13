import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { escapeShellArg } from '../../utils/shell-escape.js';

interface DeviceStateArgs {
  udid?: string;
  /** Test scenario this belongs to, for audit trails across a run. */
  scenario?: string;
  /** Step number within the scenario. */
  step?: number;
}

export const IDB_SIMULATE_MEMORY_WARNING_DOCS = `
# idb-simulate-memory-warning

Deliver a memory warning to a simulator, to exercise low-memory code paths.

## Overview

iOS reclaims memory aggressively, and the paths that respond to it — \`didReceiveMemoryWarning\`,
SwiftUI cache eviction, \`NSCache\` purging — are among the least exercised in a typical test run.
Bugs there surface as blank views or lost state on a real device under pressure, long after release.

This delivers the warning on demand, so those paths can be tested deliberately.

## Parameters

### Optional
- **udid** (string): Target identifier - auto-detects if omitted
- **scenario** (string): Test scenario name, recorded in the audit entry
- **step** (number): Step number within the scenario

## Returns

Confirmation with an audit entry (timestamp, action, scenario, step) for test-run reconstruction.

## Examples

\`\`\`typescript
// Check the app survives memory pressure mid-flow
await idbSimulateMemoryWarningTool({ scenario: 'Checkout under pressure', step: 3 });
await accessibilityQualityCheckTool({});  // did the UI survive?
\`\`\`

## Related Tools

- idb-crash-list: Check whether the warning actually killed the app
- accessibility-quality-check: Cheap check that the UI is still intact afterwards
- simctl-stream-logs: Watch for memory-related log output

## Notes

- The warning is advisory: iOS may or may not terminate the app depending on its footprint.
- Follow with idb-crash-list to distinguish "handled it" from "was jettisoned".
`;

export const IDB_SIMULATE_MEMORY_WARNING_DOCS_MINI =
  'Deliver a memory warning to a simulator. Use rtfm({ toolName: "idb-simulate-memory-warning" }) for docs.';

export const IDB_CLEAR_KEYCHAIN_DOCS = `
# idb-clear-keychain

Clear a simulator's keychain, for test isolation.

## Overview

Keychain entries survive app uninstall — that is the point of the keychain, and it is why a
"fresh install" test can still start logged in. Clearing it gives a genuinely clean credential
state before an onboarding or authentication test.

## Parameters

### Optional
- **udid** (string): Target identifier - auto-detects if omitted
- **scenario** (string): Test scenario name, recorded in the audit entry
- **step** (number): Step number within the scenario

## Returns

Confirmation with an audit entry (timestamp, action, scenario, step).

## Examples

\`\`\`typescript
// Genuinely clean login state — uninstalling the app alone would not do this
await idbClearKeychainTool({ scenario: 'First-run onboarding' });
await workflowFreshInstallTool({ projectPath: './MyApp.xcodeproj', scheme: 'MyApp' });
\`\`\`

## Related Tools

- workflow-fresh-install: Wipes app data, but NOT the keychain
- simctl-erase: Factory-resets the whole simulator (heavier; also clears the keychain)
- simctl-privacy: Reset permission grants, the other thing that survives reinstall

## Notes

- Destructive: clears credentials for EVERY app on the simulator, not just yours.
- Cheaper and more targeted than simctl-erase when credentials are all you need reset.
`;

export const IDB_CLEAR_KEYCHAIN_DOCS_MINI =
  'Clear the simulator keychain for test isolation. Use rtfm({ toolName: "idb-clear-keychain" }) for docs.';

/**
 * Deliver a memory warning to a simulator.
 *
 * **Full documentation:** IDB_SIMULATE_MEMORY_WARNING_DOCS
 */
export async function idbSimulateMemoryWarningTool(args: DeviceStateArgs) {
  return runDeviceStateCommand({
    args,
    tool: 'idb-simulate-memory-warning',
    buildCommand: udid => `idb simulate-memory-warning --udid ${escapeShellArg(udid)}`,
    action: 'memory-warning',
    successMessage: targetName => `✅ Memory warning delivered to "${targetName}"`,
    nextSteps: [
      `Check the app survived: accessibility-quality-check`,
      `Check it was not jettisoned: idb-crash-list --since <now>`,
    ],
  });
}

/**
 * Clear the simulator keychain.
 *
 * **Full documentation:** IDB_CLEAR_KEYCHAIN_DOCS
 */
export async function idbClearKeychainTool(args: DeviceStateArgs) {
  return runDeviceStateCommand({
    args,
    tool: 'idb-clear-keychain',
    buildCommand: udid => `idb clear-keychain --udid ${escapeShellArg(udid)}`,
    action: 'clear-keychain',
    successMessage: targetName => `✅ Keychain cleared on "${targetName}"`,
    nextSteps: [
      `Credentials for every app on this simulator are now gone`,
      `Reinstall the app for a true first-run state: workflow-fresh-install`,
    ],
  });
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Shared execution path for the fire-and-forget device-state commands.
 *
 * Both tools are the same shape — resolve target, run one idb command, report with an audit entry —
 * so the variation is expressed as parameters rather than duplicated. If a third tool needs a
 * genuinely different response shape, split rather than adding branches here.
 */
async function runDeviceStateCommand(options: {
  args: DeviceStateArgs;
  tool: string;
  buildCommand: (udid: string) => string;
  action: string;
  successMessage: (targetName: string) => string;
  nextSteps: string[];
}) {
  const { args, tool, buildCommand, action, successMessage, nextSteps } = options;
  const { udid, scenario, step } = args;

  try {
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();
    const command = buildCommand(resolvedUdid);

    console.error(`[${tool}] Executing: ${command}`);
    const result = await executeCommand(command, { timeout: 30000 });

    const succeeded = result.code === 0;
    if (succeeded) {
      IDBTargetCache.recordSuccess(resolvedUdid);
    }

    const payload = {
      success: succeeded,
      udid: resolvedUdid,
      targetName: target.name,
      auditEntry: {
        timestamp: new Date().toISOString(),
        action,
        success: succeeded,
        ...(scenario ? { scenario } : {}),
        ...(step !== undefined ? { step } : {}),
      },
      output: result.stdout,
      ...(succeeded ? {} : { error: result.stderr || 'Unknown error' }),
      duration: Date.now() - startTime,
      guidance: succeeded
        ? [successMessage(target.name), ``, `Next steps:`, ...nextSteps.map(s => `• ${s}`)]
        : [
            `❌ ${tool} failed`,
            `• Verify the target is booted: simctl-list`,
            `• Check the idb environment: idb-doctor`,
          ],
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
      isError: !succeeded,
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `${tool} failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
