import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { parseFlexibleJson } from '../../utils/json-parser.js';
import { responseCache, responseResourceLink } from '../../utils/response-cache.js';
import { escapeShellArg } from '../../utils/shell-escape.js';

// ============================================================================
// TYPES
// ============================================================================

interface IdbCrashListArgs {
  udid?: string;
  bundleId?: string;
  since?: number;
  before?: number;
  limit?: number;
}

interface IdbCrashShowArgs {
  udid?: string;
  name: string;
}

interface IdbCrashDeleteArgs {
  udid?: string;
  name?: string;
  bundleId?: string;
  all?: boolean;
}

/** One row of `idb crash list` output. */
interface CrashRow {
  name: string;
  bundle_id?: string;
  process_name?: string;
  parent_process_name?: string;
  process_identifier?: number;
  timestamp?: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const IDB_CRASH_LIST_DOCS = `
# idb-crash-list

List crash reports on a simulator, so an agent can tell a crash from a no-op.

## Overview

Without this, a failed interaction is ambiguous: an agent cannot distinguish "my tap did nothing"
from "the app crashed and is gone". Crash reports are written by the OS and persist across app
launches and reboots.

**Simulators accumulate crashes from unrelated system processes.** An unfiltered list is mostly
noise from other apps and extensions. The useful question is scoped:
"did MY bundle crash since I launched it?" — so pass \`bundleId\` and \`since\`.

## Parameters

### Optional
- **udid** (string): Target identifier - auto-detects if omitted
- **bundleId** (string): Only crashes for this bundle (e.g. "com.example.MyApp")
- **since** (number): Unix timestamp in SECONDS - only crashes newer than this
- **before** (number): Unix timestamp in SECONDS - only crashes older than this
- **limit** (number, default 20): Maximum crashes to return, newest first

## Returns

\`crashCount\`, a \`crashes\` array (name, bundleId, processName, timestamp, occurredAt) and the
filters that were applied. Pass a \`name\` to \`idb-crash-show\` for the full report.

## Examples

### Did my app crash during this test run?
\`\`\`typescript
const launchedAt = Math.floor(Date.now() / 1000);
// ... drive the app ...
await idbCrashListTool({ bundleId: 'com.example.MyApp', since: launchedAt });
\`\`\`

### Everything recent, regardless of app
\`\`\`typescript
await idbCrashListTool({ since: Math.floor(Date.now() / 1000) - 3600 });
\`\`\`

## Related Tools

- idb-crash-show: Full report for one crash
- idb-crash-delete: Remove reports (e.g. to get a clean baseline before a test)
- simctl-stream-logs: Live log stream, which catches non-fatal errors a crash report will not
- hang-start: Main-thread hangs, which produce no crash report at all

## Notes

- Timestamps are unix SECONDS, not milliseconds.
- An empty list is a meaningful result: the app did not crash.
`;

export const IDB_CRASH_LIST_DOCS_MINI =
  'List simulator crash reports, filterable by bundle and time. Use rtfm({ toolName: "idb-crash-list" }) for docs.';

export const IDB_CRASH_SHOW_DOCS = `
# idb-crash-show

Fetch one crash report, summarized, with the full report available on demand.

## Overview

Crash reports are large — 10KB for a trivial one and far more with full thread backtraces — so this
returns a summary plus a cache ID rather than dumping the report into context. The full text is
retrievable as an MCP resource at \`xcmcp://response/{cacheId}\`.

An \`.ips\` file is TWO concatenated JSON documents: a single-line header followed by a
pretty-printed body. This tool parses both and merges the useful parts.

## Parameters

### Required
- **name** (string): Crash report name from idb-crash-list (e.g. ".MyApp-2026-09-12-104512.ips")

### Optional
- **udid** (string): Target identifier - auto-detects if omitted

## Returns

Summary with appName, bundleId, timestamp, osVersion, exception type/signal, termination reason,
and the top frames of the faulting thread — usually enough to identify the cause without reading
the full report. Plus \`cacheId\` and a resource link to the complete text.

## Examples

\`\`\`typescript
const crashes = await idbCrashListTool({ bundleId: 'com.example.MyApp' });
await idbCrashShowTool({ name: crashes.crashes[0].name });
\`\`\`

## Related Tools

- idb-crash-list: Find crash report names
- xcodebuild-get-details: The same progressive-disclosure pattern for build logs

## Notes

- Symbol names appear only where the binary is symbolicated; unsymbolicated frames show the image
  and offset instead.
`;

export const IDB_CRASH_SHOW_DOCS_MINI =
  'Fetch and summarize one crash report. Use rtfm({ toolName: "idb-crash-show" }) for docs.';

export const IDB_CRASH_DELETE_DOCS = `
# idb-crash-delete

Delete crash reports from a simulator.

## Overview

Mainly useful for establishing a clean baseline before a test run, so that any crash found
afterwards is known to belong to that run. Deletion is permanent.

## Parameters

### Optional (exactly one selector required)
- **name** (string): Delete one specific report, by name from idb-crash-list
- **bundleId** (string): Delete all reports for one bundle
- **all** (boolean): Delete every crash report on the target
- **udid** (string): Target identifier - auto-detects if omitted

## Returns

Confirmation with the selector used and the raw idb output.

## Examples

### Clean baseline before a test run
\`\`\`typescript
await idbCrashDeleteTool({ bundleId: 'com.example.MyApp' });
// ... run the test ...
await idbCrashListTool({ bundleId: 'com.example.MyApp' }); // anything here is from this run
\`\`\`

## Related Tools

- idb-crash-list: Inspect before deleting

## Notes

- Destructive and irreversible: clients may gate this behind confirmation.
- Requires exactly one of name / bundleId / all, to avoid deleting more than intended.
`;

export const IDB_CRASH_DELETE_DOCS_MINI =
  'Delete simulator crash reports. Use rtfm({ toolName: "idb-crash-delete" }) for docs.';

/**
 * List crash reports on a target.
 *
 * **What it does:** Wraps `idb crash list`, surfacing the bundle and time filters that make the
 * result meaningful on a shared simulator full of unrelated system crashes.
 *
 * **Full documentation:** IDB_CRASH_LIST_DOCS
 */
export async function idbCrashListTool(args: IdbCrashListArgs) {
  const { udid, bundleId, since, before, limit = 20 } = args;

  try {
    validateTimestamp(since, 'since');
    validateTimestamp(before, 'before');

    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    let command = `idb crash list --udid ${escapeShellArg(resolvedUdid)}`;
    if (bundleId) command += ` --bundle-id ${escapeShellArg(bundleId)}`;
    if (since !== undefined) command += ` --since ${Math.floor(since)}`;
    if (before !== undefined) command += ` --before ${Math.floor(before)}`;

    console.error(`[idb-crash-list] Executing: ${command}`);
    const result = await executeCommand(command, { timeout: 30000 });

    if (result.code !== 0) {
      return errorResult('idb-crash-list', result.stderr, resolvedUdid, target.name, [
        `❌ Failed to list crash reports`,
        `• Verify the target is booted: simctl-list`,
        `• Check the idb environment: idb-doctor`,
      ]);
    }

    IDBTargetCache.recordSuccess(resolvedUdid);

    const rows = parseFlexibleJson(result.stdout) as CrashRow[];
    const crashes = rows
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, limit)
      .map(row => ({
        name: row.name,
        bundleId: row.bundle_id || undefined,
        processName: row.process_name,
        processId: row.process_identifier,
        timestamp: row.timestamp,
        occurredAt: row.timestamp ? new Date(row.timestamp * 1000).toISOString() : undefined,
      }));

    const filteredBy = {
      ...(bundleId ? { bundleId } : {}),
      ...(since !== undefined ? { since } : {}),
      ...(before !== undefined ? { before } : {}),
    };
    const isFiltered = Object.keys(filteredBy).length > 0;

    const payload = {
      success: true,
      crashCount: crashes.length,
      totalMatched: rows.length,
      crashes,
      filteredBy: isFiltered ? filteredBy : undefined,
      udid: resolvedUdid,
      targetName: target.name,
      duration: Date.now() - startTime,
      guidance: buildListGuidance(crashes.length, rows.length, limit, isFiltered),
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
      structuredContent: {
        success: true,
        crashCount: crashes.length,
        totalMatched: rows.length,
        crashes,
      },
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `idb-crash-list failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Fetch one crash report, summarized, with the full text cached for on-demand retrieval.
 *
 * **Full documentation:** IDB_CRASH_SHOW_DOCS
 */
export async function idbCrashShowTool(args: IdbCrashShowArgs) {
  const { udid, name } = args;

  try {
    if (!name || name.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'name is required — get one from idb-crash-list'
      );
    }

    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();
    const command = `idb crash show ${escapeShellArg(name)} --udid ${escapeShellArg(resolvedUdid)}`;

    console.error(`[idb-crash-show] Executing: ${command}`);
    const result = await executeCommand(command, { timeout: 30000 });

    if (result.code !== 0) {
      return errorResult('idb-crash-show', result.stderr, resolvedUdid, target.name, [
        `❌ Failed to fetch crash report "${name}"`,
        `• Confirm the name with: idb-crash-list`,
        `• Names are exact, including the leading dot`,
      ]);
    }

    IDBTargetCache.recordSuccess(resolvedUdid);

    const cacheId = responseCache.store({
      tool: 'idb-crash-show',
      fullOutput: result.stdout,
      stderr: result.stderr || '',
      exitCode: result.code,
      command,
      metadata: {
        udid: resolvedUdid,
        targetName: target.name,
        crashName: name,
        timestamp: new Date().toISOString(),
      },
    });

    const summary = summarizeCrashReport(result.stdout);

    const payload = {
      success: true,
      crashId: cacheId,
      name,
      summary,
      udid: resolvedUdid,
      targetName: target.name,
      duration: Date.now() - startTime,
      guidance: [
        summary.exceptionType
          ? `💥 ${summary.processName ?? 'Process'} terminated: ${summary.exceptionType}${summary.signal ? ` (${summary.signal})` : ''}`
          : `📄 Crash report retrieved`,
        summary.terminationReason ? `Reason: ${summary.terminationReason}` : undefined,
        ``,
        `Full report: xcmcp://response/${cacheId} (30 min TTL)`,
        summary.topFrames?.length
          ? `Faulting thread ${summary.faultingThread ?? 0}, top frames included above`
          : `No symbolicated frames — the binary may be stripped`,
      ].filter(Boolean),
    };

    return {
      content: [
        { type: 'text' as const, text: JSON.stringify(payload, null, 2) },
        responseResourceLink(cacheId, 'idb-crash-show', `Full crash report for "${name}"`),
      ],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `idb-crash-show failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete crash reports. Destructive and irreversible.
 *
 * **Full documentation:** IDB_CRASH_DELETE_DOCS
 */
export async function idbCrashDeleteTool(args: IdbCrashDeleteArgs) {
  const { udid, name, bundleId, all } = args;

  try {
    const selectors = [name, bundleId, all ? 'all' : undefined].filter(Boolean);
    if (selectors.length !== 1) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Provide exactly one of name, bundleId, or all — deleting crash reports is irreversible, ' +
          'so an ambiguous selector is rejected rather than guessed at.'
      );
    }

    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    let command = `idb crash delete `;
    if (name) command += escapeShellArg(name);
    else if (bundleId) command += `--bundle-id ${escapeShellArg(bundleId)}`;
    else command += `--all`;
    command += ` --udid ${escapeShellArg(resolvedUdid)}`;

    console.error(`[idb-crash-delete] Executing: ${command}`);
    const result = await executeCommand(command, { timeout: 30000 });

    if (result.code !== 0) {
      return errorResult('idb-crash-delete', result.stderr, resolvedUdid, target.name, [
        `❌ Failed to delete crash reports`,
        `• Confirm the name with: idb-crash-list`,
      ]);
    }

    IDBTargetCache.recordSuccess(resolvedUdid);

    const payload = {
      success: true,
      deletedBy: name ? { name } : bundleId ? { bundleId } : { all: true },
      output: result.stdout,
      udid: resolvedUdid,
      targetName: target.name,
      duration: Date.now() - startTime,
      guidance: [`✅ Crash reports deleted from "${target.name}"`, `Verify with: idb-crash-list`],
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `idb-crash-delete failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// HELPERS
// ============================================================================

export interface CrashSummary {
  appName?: string;
  bundleId?: string;
  processName?: string;
  occurredAt?: string;
  osVersion?: string;
  appVersion?: string;
  exceptionType?: string;
  signal?: string;
  terminationReason?: string;
  faultingThread?: number;
  topFrames?: string[];
  parseError?: string;
}

/**
 * Summarize an `.ips` crash report.
 *
 * An `.ips` is TWO concatenated JSON documents — a single-line header followed by a pretty-printed
 * body — so neither `JSON.parse` on the whole text nor `parseFlexibleJson` handles it. Split on the
 * first newline and parse each half independently.
 */
export function summarizeCrashReport(raw: string): CrashSummary {
  const newlineIndex = raw.indexOf('\n');
  if (newlineIndex === -1) {
    return { parseError: 'Crash report did not contain the expected header/body split' };
  }

  let header: Record<string, any> = {};
  let body: Record<string, any> = {};

  try {
    header = JSON.parse(raw.slice(0, newlineIndex));
  } catch {
    return { parseError: 'Could not parse the crash report header' };
  }

  try {
    body = JSON.parse(raw.slice(newlineIndex + 1));
  } catch {
    // The header alone still identifies the crash, so degrade rather than fail.
    return {
      appName: header.app_name,
      bundleId: header.bundleID,
      occurredAt: header.timestamp,
      osVersion: header.os_version,
      appVersion: header.app_version,
      parseError: 'Could not parse the crash report body; header fields only',
    };
  }

  const faultingThread = typeof body.faultingThread === 'number' ? body.faultingThread : 0;
  const thread = Array.isArray(body.threads) ? body.threads[faultingThread] : undefined;

  return {
    appName: header.app_name ?? body.procName,
    bundleId: header.bundleID,
    processName: body.procName ?? header.name,
    occurredAt: header.timestamp ?? body.captureTime,
    osVersion: header.os_version,
    appVersion: header.app_version,
    exceptionType: body.exception?.type,
    signal: body.exception?.signal,
    terminationReason: body.termination?.indicator,
    faultingThread,
    topFrames: formatFrames(thread?.frames, body.usedImages),
  };
}

/** Render the top stack frames as "symbol (+offset) — image" strings. */
function formatFrames(frames: any[] | undefined, usedImages: any[] | undefined): string[] {
  if (!Array.isArray(frames)) {
    return [];
  }

  return frames.slice(0, 8).map(frame => {
    const image = Array.isArray(usedImages) ? usedImages[frame.imageIndex] : undefined;
    const imageName = image?.name ?? `image#${frame.imageIndex}`;

    return frame.symbol
      ? `${frame.symbol} + ${frame.symbolLocation ?? 0} — ${imageName}`
      : `${imageName} + ${frame.imageOffset}`;
  });
}

function validateTimestamp(value: number | undefined, field: string): void {
  if (value === undefined) return;

  if (!Number.isFinite(value) || value < 0) {
    throw new McpError(ErrorCode.InvalidRequest, `${field} must be a positive unix timestamp`);
  }

  // A millisecond timestamp is ~1000x too large and would silently match nothing.
  if (value > 100_000_000_000) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `${field} looks like milliseconds (${value}); idb expects unix SECONDS — divide by 1000`
    );
  }
}

function buildListGuidance(
  returned: number,
  matched: number,
  limit: number,
  isFiltered: boolean
): string[] {
  if (matched === 0) {
    return [
      isFiltered
        ? `✅ No crash reports matched — the app did not crash under these filters`
        : `✅ No crash reports on this target`,
    ];
  }

  return [
    `💥 ${matched} crash report${matched === 1 ? '' : 's'} found${returned < matched ? `, showing newest ${limit}` : ''}`,
    !isFiltered
      ? `⚠️ Unfiltered: simulators collect crashes from unrelated system processes. Narrow with bundleId and since.`
      : undefined,
    `Inspect one: idb-crash-show --name "<name>"`,
  ].filter(Boolean) as string[];
}

function errorResult(
  tool: string,
  stderr: string,
  udid: string,
  targetName: string,
  guidance: string[]
) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { success: false, error: stderr || 'Unknown error', udid, targetName, tool, guidance },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}
