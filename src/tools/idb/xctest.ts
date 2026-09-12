import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { parseFlexibleJson } from '../../utils/json-parser.js';
import { escapeShellArg } from '../../utils/shell-escape.js';

interface IdbXctestListArgs {
  udid?: string;
  /** When given, list the tests INSIDE this bundle instead of listing installed bundles. */
  testBundleId?: string;
}

export const IDB_XCTEST_LIST_DOCS = `
# idb-xctest-list

List xctest bundles installed on a target, or the tests inside one.

## Overview

This is NOT a replacement for \`xcodebuild-test\`. It does not build anything: it inspects test
bundles that are **already installed** on the simulator (put there by \`idb install\` of a
\`.xctest\` bundle, typically produced by \`xcodebuild build-for-testing\`).

Use it to discover what is installed before running tests through idb, or to confirm an install
succeeded. If you just want to run a project's tests, use \`xcodebuild-test\`.

## Parameters

### Optional
- **udid** (string): Target identifier - auto-detects if omitted
- **testBundleId** (string): List the tests inside this bundle instead of listing bundles

## Returns

\`bundles\` (or \`tests\` when testBundleId is given) plus a count. An empty list is normal and means
no test bundle is installed — it is not an error.

## Examples

### What test bundles are installed?
\`\`\`typescript
await idbXctestListTool({});
\`\`\`

### What tests are in one bundle?
\`\`\`typescript
await idbXctestListTool({ testBundleId: 'com.example.MyAppUITests.xctrunner' });
\`\`\`

## Related Tools

- xcodebuild-test: Build and run a project's tests — the usual choice
- idb-install: Install a .xctest bundle so it appears here
- idb-list-apps: List regular apps rather than test bundles

## Notes

- Output parsing is deliberately tolerant: idb has emitted both JSON and plain lines across
  versions, so both are handled and unrecognised lines are preserved as raw text.
- An empty result on a simulator with no installed test bundle is expected.
`;

export const IDB_XCTEST_LIST_DOCS_MINI =
  'List installed xctest bundles or their tests. Use rtfm({ toolName: "idb-xctest-list" }) for docs.';

/**
 * List installed xctest bundles, or the tests within one bundle.
 *
 * **Full documentation:** IDB_XCTEST_LIST_DOCS
 */
export async function idbXctestListTool(args: IdbXctestListArgs) {
  const { udid, testBundleId } = args;

  try {
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    const command = testBundleId
      ? `idb xctest list-bundle ${escapeShellArg(testBundleId)} --udid ${escapeShellArg(resolvedUdid)}`
      : `idb xctest list --udid ${escapeShellArg(resolvedUdid)}`;

    console.error(`[idb-xctest-list] Executing: ${command}`);
    const result = await executeCommand(command, { timeout: 30000 });

    if (result.code !== 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: false,
                error: result.stderr || 'Unknown error',
                udid: resolvedUdid,
                targetName: target.name,
                guidance: [
                  `❌ Failed to list xctest ${testBundleId ? 'tests' : 'bundles'}`,
                  testBundleId
                    ? `• Confirm the bundle is installed: idb-xctest-list (no testBundleId)`
                    : `• Install a test bundle first: idb-install --appPath <path>.xctest`,
                  `• Check the idb environment: idb-doctor`,
                ],
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    IDBTargetCache.recordSuccess(resolvedUdid);

    const entries = parseXctestOutput(result.stdout);

    const payload = {
      success: true,
      ...(testBundleId ? { testBundleId, tests: entries } : { bundles: entries }),
      count: entries.length,
      udid: resolvedUdid,
      targetName: target.name,
      duration: Date.now() - startTime,
      guidance:
        entries.length === 0
          ? [
              testBundleId
                ? `No tests listed in "${testBundleId}"`
                : `No xctest bundles are installed on "${target.name}"`,
              ``,
              `This is not an error. To run a project's tests, use xcodebuild-test.`,
              `To use idb instead: xcodebuild build-for-testing, then idb-install the .xctest bundle.`,
            ]
          : [
              `✅ Found ${entries.length} ${testBundleId ? 'test' : 'bundle'}${entries.length === 1 ? '' : 's'}`,
              testBundleId ? undefined : `Inspect one: idb-xctest-list --testBundleId "<id>"`,
            ].filter(Boolean),
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `idb-xctest-list failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse `idb xctest list` / `list-bundle` output.
 *
 * Tolerant by design: idb has emitted JSON objects, JSON arrays and bare lines across versions, and
 * this output could not be verified against a populated bundle list on the development machine.
 * Rather than assume one shape, accept JSON where present and fall back to raw lines — an
 * unrecognised line is surfaced as `{ raw }` instead of being silently dropped.
 */
export function parseXctestOutput(stdout: string): Array<Record<string, unknown>> {
  if (!stdout || !stdout.trim()) {
    return [];
  }

  const parsed = parseFlexibleJson(stdout);
  if (parsed.length > 0) {
    return parsed.map(entry =>
      typeof entry === 'object' && entry !== null ? entry : { raw: String(entry) }
    );
  }

  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => ({ raw: line }));
}
