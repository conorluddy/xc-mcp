import * as fs from 'fs';
import { spawn } from 'child_process';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  DEFAULT_HANG_PREDICATE,
  parseLogLine,
  aboveThreshold,
  buildSummary,
  compressToBudget,
  formatL2,
  formatClusterDetail,
  type NormalisedEvent,
  type SessionSummary,
} from './pipeline.js';
import {
  createSession,
  readMeta,
  updateStatus,
  listSessions,
  readRawLog,
  writeSummary,
  readSummary,
  pruneExpired,
} from './sessions.js';

// === TYPES ===

interface HangStartArgs {
  udid?: string;
  predicate?: string;
  minHangMs?: number;
}
interface HangStopArgs {
  sessionId: string;
  topN?: number;
  budgetTokens?: number;
}
interface HangDetailsArgs {
  sessionId: string;
  cluster?: number;
}

// === HELPERS ===

function text(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function parseRawLog(
  raw: string,
  minHangMs: number
): { events: NormalisedEvent[]; dropped: number } {
  const events: NormalisedEvent[] = [];
  let dropped = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const ev = parseLogLine(line);
    if (!ev) continue;
    if (aboveThreshold(ev, minHangMs)) {
      events.push(ev);
    } else {
      dropped++;
    }
  }
  return { events, dropped };
}

// === TOOLS ===

/**
 * hang-start: begin a hang-capture session. Spawns a detached `simctl log stream`
 * whose output is written to the session's raw.log; parsing/clustering happens at hang-stop.
 */
export async function hangStartTool(args: any) {
  const { udid, predicate, minHangMs = 250 } = args as HangStartArgs;
  try {
    pruneExpired(24);

    const device = udid?.trim() || 'booted';
    const pred = predicate?.trim() || DEFAULT_HANG_PREDICATE;
    const meta = createSession({ udid: device, predicate: pred, minHangMs });

    const out = fs.openSync(meta.rawLogPath, 'a');
    const child = spawn(
      'xcrun',
      ['simctl', 'spawn', device, 'log', 'stream', '--predicate', pred],
      { detached: true, stdio: ['ignore', out, 'ignore'] }
    );
    child.unref();
    fs.closeSync(out);

    updateStatus(meta.sessionId, 'running', { pid: child.pid });

    return text({
      success: true,
      sessionId: meta.sessionId,
      udid: device,
      pid: child.pid,
      minHangMs,
      guidance: [
        `Hang capture started (session ${meta.sessionId}).`,
        'Reproduce the hang/jank in the app now.',
        `Stop and analyze with: hang-stop sessionId="${meta.sessionId}"`,
      ],
    });
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `hang-start failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * hang-stop: stop a session's stream, parse raw.log through the pipeline, persist the
 * clustered summary, and return a token-budgeted view.
 */
export async function hangStopTool(args: any) {
  const { sessionId, topN, budgetTokens } = args as HangStopArgs;
  try {
    const meta = readMeta(sessionId);
    if (!meta) {
      throw new McpError(ErrorCode.InvalidRequest, `Unknown hang session: ${sessionId}`);
    }

    // Best-effort stop of the detached stream process
    if (meta.pid) {
      try {
        process.kill(meta.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }

    const raw = readRawLog(sessionId);
    const { events, dropped } = parseRawLog(raw, meta.minHangMs);
    const summary = buildSummary(sessionId, events, dropped, topN);
    writeSummary(sessionId, summary);
    updateStatus(sessionId, 'stopped');

    const formatted = compressToBudget(summary, budgetTokens);

    return text({
      success: true,
      sessionId,
      totalHangs: summary.totalEvents,
      droppedBelowThreshold: dropped,
      clusterCount: summary.clusters.length,
      summary: formatted,
      guidance:
        summary.totalEvents === 0
          ? [
              'No hangs captured above the threshold. The app may be responsive, or try a lower minHangMs.',
            ]
          : [
              `Captured ${summary.totalEvents} hang events in ${summary.clusters.length} clusters.`,
              `Full detail: hang-get-details sessionId="${sessionId}"`,
              `Drill a cluster: hang-get-details sessionId="${sessionId}" cluster=1`,
            ],
    });
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `hang-stop failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * hang-get-details: return the full L2 summary for a stopped session, or a specific
 * cluster's per-event detail when `cluster` (1-indexed) is given.
 */
export async function hangGetDetailsTool(args: any) {
  const { sessionId, cluster } = args as HangDetailsArgs;
  try {
    const summary = readSummary(sessionId) as SessionSummary | null;
    if (!summary) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `No summary for session ${sessionId}. Run hang-stop first.`
      );
    }

    if (cluster !== undefined) {
      const idx = cluster - 1;
      const c = summary.clusters[idx];
      if (!c) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Cluster ${cluster} out of range (1..${summary.clusters.length}).`
        );
      }
      return text({ success: true, sessionId, cluster, detail: formatClusterDetail(c) });
    }

    return text({ success: true, sessionId, detail: formatL2(summary) });
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `hang-get-details failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** hang-list: list all hang-capture sessions, newest first. */
export async function hangListTool() {
  try {
    const sessions = listSessions().map(s => ({
      sessionId: s.sessionId,
      status: s.status,
      udid: s.udid,
      createdAt: s.createdAt,
      stoppedAt: s.stoppedAt,
    }));
    return text({ success: true, count: sessions.length, sessions });
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `hang-list failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// === DOCS ===

export const HANG_START_DOCS = `# hang-start

Begin a HangBuster capture session. Spawns a detached \`simctl log stream\` filtered to
hang/stall/watchdog/jetsam events, writing to the session's raw log. Reproduce the hang,
then call \`hang-stop\` to parse, cluster, and rank the results.

## Parameters
- \`udid\` (optional): simulator UDID (default: booted)
- \`predicate\` (optional): override the os_log predicate
- \`minHangMs\` (optional, default 250): drop hang events shorter than this at stop time

## Returns
\`sessionId\` (pass to hang-stop / hang-get-details), pid, and guidance.`;

export const HANG_START_DOCS_MINI =
  'Start a hang-capture session. Use rtfm({ toolName: "hang-start" }) for docs.';

export const HANG_STOP_DOCS = `# hang-stop

Stop a HangBuster session, parse its captured log through the clustering pipeline
(parse → normalise → threshold → fingerprint → cluster → rank), persist the summary,
and return a token-budgeted view (L0/L1/L2 auto-selected).

## Parameters
- \`sessionId\` (required): the session from hang-start
- \`topN\` (optional): number of top clusters to keep (default 3)
- \`budgetTokens\` (optional): cap output size; picks L0/L1/L2 to fit

## Returns
Hang/cluster counts and a formatted summary. Drill deeper with hang-get-details.`;

export const HANG_STOP_DOCS_MINI =
  'Stop + analyze a hang session. Use rtfm({ toolName: "hang-stop" }) for docs.';

export const HANG_GET_DETAILS_DOCS = `# hang-get-details

Return the full L2 summary for a stopped HangBuster session, or the per-event detail of a
specific cluster.

## Parameters
- \`sessionId\` (required)
- \`cluster\` (optional, 1-indexed): drill into one cluster's events

## Returns
Formatted L2 summary (severity histogram, bursts, process distribution) or cluster detail.`;

export const HANG_GET_DETAILS_DOCS_MINI =
  'Get hang session details / cluster drill. Use rtfm({ toolName: "hang-get-details" }) for docs.';

export const HANG_LIST_DOCS = `# hang-list

List all HangBuster capture sessions (newest first) with status, device, and timestamps.

## Parameters
None.

## Returns
Array of sessions with sessionId/status/udid/createdAt/stoppedAt.`;

export const HANG_LIST_DOCS_MINI =
  'List hang-capture sessions. Use rtfm({ toolName: "hang-list" }) for docs.';
