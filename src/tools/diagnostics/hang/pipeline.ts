/**
 * HangBuster filter pipeline — pure functions, no I/O.
 *
 * Stages: parse → normalise → threshold → bucket → cluster → aggregate → rank → format.
 *
 * Each function is independently testable. Pure module: only 'crypto' (deterministic hash).
 * No fs, no child_process.
 */

import { createHash } from 'crypto';

// === CONSTANTS ===

export const FINGERPRINT_VERSION = 2;

export const DEFAULT_HANG_PREDICATE =
  '(subsystem == "com.apple.runningboard") OR (eventMessage CONTAINS "Hang detected") OR ((eventMessage CONTAINS[c] "main thread") AND (eventMessage CONTAINS[c] "hang"))';

const HEX_ADDR = /0x[0-9a-fA-F]{4,}/g;
const PID_REF = /\bpid[:= ]\s*\d+\b/gi;
const BARE_INT = /\b\d{4,}\b/g;
const WHITESPACE = /\s+/g;
const BOILERPLATE_PREFIXES = [
  'Hang detected by RunningBoard:',
  'Hang detected:',
  '[RunningBoard]',
] as const;

const SYMBOL_PATTERNS = [
  /([+-]?\[[A-Za-z_]\w*\s+[A-Za-z_][\w:]*\])/, // [Foo bar:] / +[Foo bar:]
  /\b([A-Z][A-Za-z0-9_]+\.[A-Za-z_]\w+(?:\([^)]*\))?)/, // Swift Foo.bar()
];

// Log line: <timestamp> <hex> <LEVEL> <hex> <PID> <THREAD> <PROCESS>: <MESSAGE>
const LOG_LINE_PATTERN =
  /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+(?:[+-]\d{4})?)\s+0x[\da-f]+\s+\S+\s+0x[\da-f]+\s+(\d+)\s+\d+\s+([^:]+):\s*(.*)/i;

// Duration patterns — ms BEFORE bare-s to avoid ambiguity (e.g. "487ms" ≠ 487 s)
const DURATION_MS_PATTERN = /(\d+(?:\.\d+)?)\s*(?:ms|milliseconds?)\b/i;
const DURATION_S_PATTERN = /(\d+(?:\.\d+)?)\s*(?:s|seconds?)\b/i;

const HH_MM_SS = /(\d{2}):(\d{2}):(\d{2})\.(\d+)/;

// === TYPES ===

export type Severity = 'minor' | 'warn' | 'critical' | 'frozen';

export interface NormalisedEvent {
  atMs: number;
  durationMs: number;
  severity: Severity;
  process: string;
  symbol?: string;
  normalisedMessage: string;
  fingerprint: string;
}

export interface Cluster {
  fingerprint: string;
  count: number;
  maxDurationMs: number;
  totalDurationMs: number;
  firstDeltaMs: number;
  severity: Severity;
  sampleEvent: NormalisedEvent;
}

export interface SessionSummary {
  sessionId: string;
  durationMs: number;
  totalEvents: number;
  droppedEvents: number;
  clusters: Cluster[];
  bursts: Array<{ startsAtMs: number; endsAtMs: number; count: number }>;
  quietPeriods: number;
  processDistribution: Record<string, number>;
  fingerprintVersion: number;
}

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  minor: 1,
  warn: 2,
  critical: 4,
  frozen: 8,
};

// === STAGE 1: PARSE ===

/** True if msg (lowercased) describes a hang/stall/watchdog event. */
export function isHangMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return ['hang', 'stall', 'unresponsive', 'watchdog', 'jetsam'].some(kw => lower.includes(kw));
}

/** Extract durationMs from message text. Returns undefined if not found. */
function extractDurationMs(message: string): number | undefined {
  const msMatch = DURATION_MS_PATTERN.exec(message);
  if (msMatch) return parseFloat(msMatch[1]);
  const sMatch = DURATION_S_PATTERN.exec(message);
  if (sMatch) return parseFloat(sMatch[1]) * 1000;
  return undefined;
}

/** Parse HH:MM:SS.fff to ms-of-day. Returns 0 if unparseable. */
function timestampToMs(ts: string): number {
  const m = HH_MM_SS.exec(ts);
  if (!m) return 0;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  // fractional part — normalise to ms
  const frac = m[4].padEnd(3, '0').slice(0, 3);
  const ms = parseInt(frac, 10);
  return h * 3_600_000 + min * 60_000 + s * 1_000 + ms;
}

/**
 * Parse one `xcrun simctl spawn log stream` line.
 *
 * @param line  Raw log line.
 * @param baseMs  Optional base timestamp in ms for computing atMs from a relative offset.
 *               If omitted and the timestamp is unparseable, atMs = 0.
 * @returns NormalisedEvent or null if not a hang line / no duration.
 */
export function parseLogLine(line: string, baseMs?: number): NormalisedEvent | null {
  if (!line.trim()) return null;
  const m = LOG_LINE_PATTERN.exec(line);
  if (!m) return null;

  const [, timestampStr, , processName, message] = m;
  const msg = message.trim();

  if (!isHangMessage(msg)) return null;

  const durationMs = extractDurationMs(msg);
  if (durationMs === undefined) return null;

  const rawAtMs = timestampToMs(timestampStr);
  const atMs = baseMs !== undefined ? rawAtMs - baseMs : rawAtMs;

  const normalisedMessage = normaliseMessage(msg);
  const symbol = extractSymbol(msg) ?? undefined;
  const fingerprint = computeFingerprint({ normalisedMessage, symbol } as Pick<
    NormalisedEvent,
    'normalisedMessage' | 'symbol'
  >);

  return {
    atMs,
    durationMs,
    severity: bucketSeverity(durationMs),
    process: processName.trim(),
    symbol,
    normalisedMessage,
    fingerprint,
  };
}

// === STAGE 2: NORMALISE ===

/** Strip boilerplate prefixes, redact volatile tokens, truncate to 40 chars. */
export function normaliseMessage(msg: string, maxLen = 40): string {
  let text = msg;
  for (const prefix of BOILERPLATE_PREFIXES) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trimStart();
      break;
    }
  }
  text = text.replace(HEX_ADDR, '<addr>');
  text = text.replace(PID_REF, '<pid>');
  text = text.replace(BARE_INT, '<n>');
  text = text.replace(WHITESPACE, ' ').trim();
  if (text.length > maxLen) text = text.slice(0, maxLen).trimEnd();
  return text;
}

/** Return the first ObjC or Swift symbol found in message, or undefined. */
export function extractSymbol(msg: string): string | undefined {
  for (const pattern of SYMBOL_PATTERNS) {
    const m = pattern.exec(msg);
    if (m) return m[1];
  }
  return undefined;
}

// === STAGE 3: THRESHOLD ===

/** True if the event's duration is at or above minHangMs (default 250). */
export function aboveThreshold(ev: NormalisedEvent, minHangMs = 250): boolean {
  return ev.durationMs >= minHangMs;
}

// === STAGE 4: SEVERITY BUCKET ===

/** Map milliseconds to a severity band. */
export function bucketSeverity(durationMs: number): Severity {
  if (durationMs < 250) return 'minor';
  if (durationMs < 500) return 'warn';
  if (durationMs < 2000) return 'critical';
  return 'frozen';
}

// === STAGE 5: FINGERPRINT ===

/**
 * Stable identity hash for clustering.
 * Key = symbol if present, else normalisedMessage.
 * Returns 'fp:' + sha256(key).slice(0,16).
 */
export function computeFingerprint(
  ev: Pick<NormalisedEvent, 'normalisedMessage' | 'symbol'>
): string {
  const key = ev.symbol ? `sym:${ev.symbol}` : `msg:${ev.normalisedMessage}`;
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return `fp:${hash}`;
}

// === STAGE 6: CLUSTER ===

/** Group events by fingerprint, aggregating count + duration stats. */
export function clusterEvents(events: NormalisedEvent[]): Cluster[] {
  const byFp = new Map<string, NormalisedEvent[]>();
  for (const ev of events) {
    const group = byFp.get(ev.fingerprint) ?? [];
    group.push(ev);
    byFp.set(ev.fingerprint, group);
  }

  const clusters: Cluster[] = [];
  for (const [fingerprint, group] of byFp) {
    const maxDurationMs = Math.max(...group.map(e => e.durationMs));
    const totalDurationMs = group.reduce((acc, e) => acc + e.durationMs, 0);
    const minAtMs = Math.min(...group.map(e => e.atMs));
    const sampleEvent = group.reduce((best, e) => (e.durationMs > best.durationMs ? e : best));
    const severity = group.reduce<Severity>(
      (best, e) => (SEVERITY_WEIGHT[e.severity] > SEVERITY_WEIGHT[best] ? e.severity : best),
      'minor'
    );
    clusters.push({
      fingerprint,
      count: group.length,
      maxDurationMs,
      totalDurationMs,
      firstDeltaMs: minAtMs,
      severity,
      sampleEvent,
    });
  }
  return clusters;
}

// === STAGE 7: AGGREGATE ===

/** Find windows containing minCount or more events within windowMs. */
export function detectTemporalBursts(
  events: NormalisedEvent[],
  windowMs = 1000,
  minCount = 3
): Array<{ startsAtMs: number; endsAtMs: number; count: number }> {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => a.atMs - b.atMs);
  const bursts: Array<{ startsAtMs: number; endsAtMs: number; count: number }> = [];
  let i = 0;
  while (i < sorted.length) {
    const windowStart = sorted[i].atMs;
    let j = i;
    while (j < sorted.length && sorted[j].atMs - windowStart <= windowMs) j++;
    const burstSize = j - i;
    if (burstSize >= minCount) {
      bursts.push({ startsAtMs: windowStart, endsAtMs: sorted[j - 1].atMs, count: burstSize });
      i = j;
    } else {
      i++;
    }
  }
  return bursts;
}

/** Find gaps between adjacent events that exceed gapMs. Returns count of such gaps. */
export function detectQuietPeriods(events: NormalisedEvent[], gapMs = 5000): number {
  if (events.length < 2) return 0;
  const sorted = [...events].sort((a, b) => a.atMs - b.atMs);
  let count = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].atMs - sorted[i - 1].atMs >= gapMs) count++;
  }
  return count;
}

/** Count events per process name. */
export function processDistribution(events: NormalisedEvent[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const ev of events) {
    dist[ev.process] = (dist[ev.process] ?? 0) + 1;
  }
  return dist;
}

// === STAGE 8: RANK ===

/** Score = SEVERITY_WEIGHT[severity] * maxDurationMs * log(count + 1), descending. */
export function rankClusters(clusters: Cluster[], topN?: number): Cluster[] {
  const score = (c: Cluster) =>
    SEVERITY_WEIGHT[c.severity] * c.maxDurationMs * Math.log(c.count + 1);
  const ranked = [...clusters].sort((a, b) => score(b) - score(a));
  return topN !== undefined ? ranked.slice(0, topN) : ranked;
}

// === STAGE 9: FORMAT ===

const SEVERITY_ICONS: Record<Severity, string> = {
  minor: '·',
  warn: '⚠',
  critical: '‼',
  frozen: '🛑',
};

function severityHistogram(clusters: Cluster[]): Record<Severity, number> {
  const hist: Record<Severity, number> = { minor: 0, warn: 0, critical: 0, frozen: 0 };
  for (const c of clusters) hist[c.severity] += c.count;
  return hist;
}

/** Single-line status (~20 tokens). Cache-friendly for agent context. */
export function formatL0(summary: SessionSummary): string {
  if (!summary.clusters.length) {
    return `Session ${summary.sessionId}: no hangs above threshold.`;
  }
  const top = summary.clusters[0];
  const critical = summary.clusters.filter(
    c => c.severity === 'critical' || c.severity === 'frozen'
  ).length;
  const label = top.sampleEvent.symbol ?? top.sampleEvent.normalisedMessage;
  return (
    `Session ${summary.sessionId}: ${(summary.durationMs / 1000).toFixed(1)}s, ` +
    `${summary.totalEvents} hangs (${critical} critical), top: ` +
    `${label} ${top.maxDurationMs.toFixed(0)}ms ×${top.count}`
  );
}

/** Default ~80-120 token output: header + top-N clusters + drill hint. */
export function formatL1(summary: SessionSummary, topN = 3): string {
  if (!summary.clusters.length) {
    return (
      `Session ${summary.sessionId}: ${(summary.durationMs / 1000).toFixed(1)}s, ` +
      `no hangs ≥ threshold.\n` +
      `Drill: xc-mcp hang-details ${summary.sessionId}`
    );
  }
  const lines: string[] = [
    `Session ${summary.sessionId}: ${(summary.durationMs / 1000).toFixed(1)}s captured, ` +
      `${summary.clusters.length} clusters (${summary.totalEvents} events)`,
  ];
  for (const cluster of summary.clusters.slice(0, topN)) {
    const icon = SEVERITY_ICONS[cluster.severity];
    const at = `${(cluster.firstDeltaMs / 1000).toFixed(1)}s`;
    const label = cluster.sampleEvent.symbol ?? cluster.sampleEvent.normalisedMessage;
    lines.push(
      `${icon} ${cluster.maxDurationMs.toFixed(0)}ms × ${cluster.count} — ${label} at ${at}`
    );
  }
  lines.push(`Drill: xc-mcp hang-details ${summary.sessionId} [--cluster N]`);
  return lines.join('\n');
}

/** Expanded ~300 token output: all clusters + aggregates. */
export function formatL2(summary: SessionSummary): string {
  const parts: string[] = [formatL1(summary, summary.clusters.length)];
  const hist = severityHistogram(summary.clusters);
  const histStr = (Object.entries(hist) as Array<[Severity, number]>)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  if (histStr) parts.push(`Severity: ${histStr}`);

  if (summary.bursts.length) {
    const burstStr = summary.bursts
      .slice(0, 3)
      .map(
        b => `${b.count} in ${b.endsAtMs - b.startsAtMs}ms @ ${(b.startsAtMs / 1000).toFixed(1)}s`
      )
      .join('; ');
    parts.push(`Bursts: ${burstStr}`);
  }

  if (summary.quietPeriods > 0) {
    parts.push(`Quiet periods: ${summary.quietPeriods}`);
  }

  const proc = summary.processDistribution;
  if (Object.keys(proc).length > 1) {
    const topProcs = Object.entries(proc)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([p, c]) => `${p}(${c})`)
      .join(', ');
    parts.push(`Processes: ${topProcs}`);
  }

  parts.push(`Dropped: ${summary.droppedEvents} sub-threshold`);

  return parts.join('\n');
}

/** L3: per-cluster detail. */
export function formatClusterDetail(cluster: Cluster): string {
  const label = cluster.sampleEvent.symbol ?? cluster.sampleEvent.normalisedMessage;
  const lines: string[] = [
    `Cluster: ${label}`,
    `  fingerprint=${cluster.fingerprint} severity=${cluster.severity}`,
    `  count=${cluster.count} max=${cluster.maxDurationMs.toFixed(0)}ms total=${cluster.totalDurationMs.toFixed(0)}ms first@${cluster.firstDeltaMs}ms`,
    `  sample: ${cluster.sampleEvent.normalisedMessage}`,
  ];
  return lines.join('\n');
}

// === STAGE 10: TOKEN BUDGET ===

/** Documented char/4 heuristic. */
export function estimateTokens(text: string): number {
  return Math.floor(text.length / 4);
}

/**
 * Pick the densest level that fits maxTokens.
 * null → L1 unconditionally; ≥200 try L2; ≥60 try L1; else L0.
 */
export function compressToBudget(summary: SessionSummary, maxTokens?: number): string {
  if (maxTokens === undefined) return formatL1(summary);

  if (maxTokens >= 200) {
    const candidate = formatL2(summary);
    if (estimateTokens(candidate) <= maxTokens) return candidate;
  }

  if (maxTokens >= 60) {
    for (const n of [3, 2, 1]) {
      const candidate = formatL1(summary, n);
      if (estimateTokens(candidate) <= maxTokens) return candidate;
    }
  }

  return formatL0(summary);
}

// === BUILDER ===

/** Convenience function to cluster, rank, and aggregate events into a SessionSummary. */
export function buildSummary(
  sessionId: string,
  events: NormalisedEvent[],
  droppedEvents: number,
  topN?: number
): SessionSummary {
  const clusters = rankClusters(clusterEvents(events), topN);
  const bursts = detectTemporalBursts(events);
  const quietPeriods = detectQuietPeriods(events);
  const distribution = processDistribution(events);

  // durationMs = span from first to last event (or 0 if ≤1 event)
  const atMs = events.map(e => e.atMs);
  const durationMs = atMs.length > 1 ? Math.max(...atMs) - Math.min(...atMs) : 0;

  return {
    sessionId,
    durationMs,
    totalEvents: events.length,
    droppedEvents,
    clusters,
    bursts,
    quietPeriods,
    processDistribution: distribution,
    fingerprintVersion: FINGERPRINT_VERSION,
  };
}
