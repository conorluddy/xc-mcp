/**
 * Tests for the HangBuster pipeline — pure functions, no I/O.
 */

import {
  parseLogLine,
  isHangMessage,
  normaliseMessage,
  extractSymbol,
  bucketSeverity,
  computeFingerprint,
  aboveThreshold,
  clusterEvents,
  rankClusters,
  detectTemporalBursts,
  detectQuietPeriods,
  processDistribution,
  formatL0,
  formatL1,
  formatL2,
  formatClusterDetail,
  estimateTokens,
  compressToBudget,
  buildSummary,
  FINGERPRINT_VERSION,
  SEVERITY_WEIGHT,
  type NormalisedEvent,
  type Cluster,
  type SessionSummary,
} from '../../../src/tools/diagnostics/hang/pipeline.js';

// === Fixtures ===

const HANG_LINE =
  '2026-06-13 14:30:52.123456-0800 0x1234ab INFO 0x5678cd 1001 42 SpringBoard: Hang detected: main thread hung for 487 ms in [AppDelegate applicationDidBecomeActive:]';

const FROZEN_LINE =
  '2026-06-13 14:31:00.000000-0800 0xdeadbe INFO 0xfeedca 2002 1 backboardd: Hang detected by RunningBoard: main thread unresponsive for 3500 ms';

const NON_HANG_LINE =
  '2026-06-13 14:30:53.000000-0800 0xaabbcc INFO 0xddee11 3003 7 logd: Logging something unrelated to hangs at all';

function makeEvent(overrides: Partial<NormalisedEvent> = {}): NormalisedEvent {
  return {
    atMs: 0,
    durationMs: 487,
    severity: 'warn',
    process: 'SpringBoard',
    normalisedMessage: 'main thread hung for <n> ms',
    fingerprint: 'fp:abc123',
    ...overrides,
  };
}

// === isHangMessage ===

describe('isHangMessage', () => {
  it('returns true for messages containing "hang"', () => {
    expect(isHangMessage('Main thread hang detected')).toBe(true);
  });
  it('returns true for "stall"', () => {
    expect(isHangMessage('UI stall occurred')).toBe(true);
  });
  it('returns true for "watchdog"', () => {
    expect(isHangMessage('Watchdog terminated app')).toBe(true);
  });
  it('returns false for unrelated messages', () => {
    expect(isHangMessage('Logging something unrelated')).toBe(false);
  });
});

// === parseLogLine ===

describe('parseLogLine', () => {
  it('parses a realistic hang line and returns a NormalisedEvent', () => {
    const ev = parseLogLine(HANG_LINE);
    expect(ev).not.toBeNull();
    expect(ev!.durationMs).toBe(487);
    expect(ev!.severity).toBe('warn');
    expect(ev!.process).toBe('SpringBoard');
    expect(ev!.fingerprint).toMatch(/^fp:[0-9a-f]{16}$/);
  });

  it('parses a frozen hang line with ms duration', () => {
    const ev = parseLogLine(FROZEN_LINE);
    expect(ev).not.toBeNull();
    expect(ev!.durationMs).toBe(3500);
    expect(ev!.severity).toBe('frozen');
    expect(ev!.process).toBe('backboardd');
  });

  it('returns null for a non-hang line', () => {
    expect(parseLogLine(NON_HANG_LINE)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseLogLine('')).toBeNull();
  });

  it('parses seconds-based duration correctly ("1.2 seconds")', () => {
    const line =
      '2026-06-13 10:00:00.000000-0800 0x1111aa INFO 0x2222bb 99 1 myapp: Watchdog: duration 1.2 seconds exceeded';
    const ev = parseLogLine(line);
    expect(ev).not.toBeNull();
    expect(ev!.durationMs).toBeCloseTo(1200);
  });

  it('prefers ms over bare seconds to avoid ambiguity', () => {
    const line =
      '2026-06-13 10:00:00.000000-0800 0x1111aa INFO 0x2222bb 99 1 myapp: Hang: 2500 ms duration detected';
    const ev = parseLogLine(line);
    expect(ev).not.toBeNull();
    expect(ev!.durationMs).toBe(2500);
  });
});

// === bucketSeverity ===

describe('bucketSeverity', () => {
  it('returns minor below 250', () => expect(bucketSeverity(100)).toBe('minor'));
  it('returns minor at 0', () => expect(bucketSeverity(0)).toBe('minor'));
  it('returns warn at exactly 250', () => expect(bucketSeverity(250)).toBe('warn'));
  it('returns warn below 500', () => expect(bucketSeverity(499)).toBe('warn'));
  it('returns critical at exactly 500', () => expect(bucketSeverity(500)).toBe('critical'));
  it('returns critical below 2000', () => expect(bucketSeverity(1999)).toBe('critical'));
  it('returns frozen at exactly 2000', () => expect(bucketSeverity(2000)).toBe('frozen'));
  it('returns frozen above 2000', () => expect(bucketSeverity(5000)).toBe('frozen'));
});

// === normaliseMessage ===

describe('normaliseMessage', () => {
  it('strips "Hang detected:" prefix', () => {
    const result = normaliseMessage('Hang detected: main thread stalled');
    expect(result).not.toContain('Hang detected:');
  });

  it('redacts hex addresses', () => {
    const result = normaliseMessage('crash at 0xdeadbeef address');
    expect(result).toContain('<addr>');
    expect(result).not.toContain('0xdeadbeef');
  });

  it('redacts pid references', () => {
    const result = normaliseMessage('killed pid: 12345 by watchdog');
    expect(result).toContain('<pid>');
  });

  it('redacts bare integers with ≥4 digits', () => {
    const result = normaliseMessage('waited 1234 cycles');
    expect(result).toContain('<n>');
  });

  it('truncates to 40 chars', () => {
    const long = 'x'.repeat(100);
    expect(normaliseMessage(long).length).toBeLessThanOrEqual(40);
  });
});

// === extractSymbol ===

describe('extractSymbol', () => {
  it('extracts ObjC instance method', () => {
    expect(extractSymbol('hang in [AppDelegate applicationDidBecomeActive:]')).toBe(
      '[AppDelegate applicationDidBecomeActive:]'
    );
  });

  it('extracts ObjC class method with +', () => {
    expect(extractSymbol('backtrace: +[NSObject initialize]')).toBe('+[NSObject initialize]');
  });

  it('extracts Swift symbol', () => {
    expect(extractSymbol('stack: AppModule.loadUser()')).toBe('AppModule.loadUser()');
  });

  it('returns undefined when no symbol present', () => {
    expect(extractSymbol('generic hang message')).toBeUndefined();
  });
});

// === computeFingerprint ===

describe('computeFingerprint', () => {
  it('is deterministic', () => {
    const ev = makeEvent({ normalisedMessage: 'main thread hung', symbol: undefined });
    expect(computeFingerprint(ev)).toBe(computeFingerprint(ev));
  });

  it('produces an fp: prefixed 16-char hex hash', () => {
    const ev = makeEvent({ normalisedMessage: 'test message', symbol: undefined });
    expect(computeFingerprint(ev)).toMatch(/^fp:[0-9a-f]{16}$/);
  });

  it('two events with the same symbol share a fingerprint', () => {
    const ev1 = makeEvent({ symbol: '[Foo bar:]', normalisedMessage: 'different msg A' });
    const ev2 = makeEvent({ symbol: '[Foo bar:]', normalisedMessage: 'different msg B' });
    expect(computeFingerprint(ev1)).toBe(computeFingerprint(ev2));
  });

  it('two events with different symbols have different fingerprints', () => {
    const ev1 = makeEvent({ symbol: '[Foo bar:]' });
    const ev2 = makeEvent({ symbol: '[Baz qux:]' });
    expect(computeFingerprint(ev1)).not.toBe(computeFingerprint(ev2));
  });

  it('uses normalisedMessage when no symbol', () => {
    const ev1 = makeEvent({ symbol: undefined, normalisedMessage: 'msg A' });
    const ev2 = makeEvent({ symbol: undefined, normalisedMessage: 'msg B' });
    expect(computeFingerprint(ev1)).not.toBe(computeFingerprint(ev2));
  });
});

// === aboveThreshold ===

describe('aboveThreshold', () => {
  it('returns true at exactly 250ms', () => {
    expect(aboveThreshold(makeEvent({ durationMs: 250 }))).toBe(true);
  });
  it('returns false below 250ms', () => {
    expect(aboveThreshold(makeEvent({ durationMs: 249 }))).toBe(false);
  });
  it('respects custom minHangMs', () => {
    expect(aboveThreshold(makeEvent({ durationMs: 100 }), 100)).toBe(true);
  });
});

// === clusterEvents ===

describe('clusterEvents', () => {
  it('groups events by fingerprint', () => {
    const fp1 = 'fp:aaa';
    const fp2 = 'fp:bbb';
    const events: NormalisedEvent[] = [
      makeEvent({ fingerprint: fp1, durationMs: 300, atMs: 0 }),
      makeEvent({ fingerprint: fp1, durationMs: 600, atMs: 1000 }),
      makeEvent({ fingerprint: fp2, durationMs: 900, atMs: 500 }),
    ];
    const clusters = clusterEvents(events);
    expect(clusters).toHaveLength(2);
    const c1 = clusters.find(c => c.fingerprint === fp1)!;
    expect(c1.count).toBe(2);
    expect(c1.maxDurationMs).toBe(600);
    expect(c1.totalDurationMs).toBe(900);
    expect(c1.firstDeltaMs).toBe(0);
  });

  it('picks the highest-duration event as sampleEvent', () => {
    const fp = 'fp:zzz';
    const events: NormalisedEvent[] = [
      makeEvent({ fingerprint: fp, durationMs: 100, normalisedMessage: 'short' }),
      makeEvent({ fingerprint: fp, durationMs: 2500, normalisedMessage: 'long frozen' }),
    ];
    const [cluster] = clusterEvents(events);
    expect(cluster.sampleEvent.normalisedMessage).toBe('long frozen');
  });

  it('assigns max severity across the group', () => {
    const fp = 'fp:sev';
    const events: NormalisedEvent[] = [
      makeEvent({ fingerprint: fp, severity: 'minor' }),
      makeEvent({ fingerprint: fp, severity: 'frozen' }),
    ];
    const [cluster] = clusterEvents(events);
    expect(cluster.severity).toBe('frozen');
  });
});

// === rankClusters ===

describe('rankClusters', () => {
  it('orders clusters by score descending', () => {
    const clusters: Cluster[] = [
      {
        fingerprint: 'fp:low',
        count: 1,
        maxDurationMs: 300,
        totalDurationMs: 300,
        firstDeltaMs: 0,
        severity: 'warn',
        sampleEvent: makeEvent(),
      },
      {
        fingerprint: 'fp:high',
        count: 5,
        maxDurationMs: 3000,
        totalDurationMs: 10000,
        firstDeltaMs: 0,
        severity: 'frozen',
        sampleEvent: makeEvent({ durationMs: 3000, severity: 'frozen' }),
      },
    ];
    const ranked = rankClusters(clusters);
    expect(ranked[0].fingerprint).toBe('fp:high');
  });

  it('respects topN', () => {
    const clusters: Cluster[] = Array.from({ length: 5 }, (_, i) => ({
      fingerprint: `fp:${i}`,
      count: 1,
      maxDurationMs: (i + 1) * 100,
      totalDurationMs: (i + 1) * 100,
      firstDeltaMs: 0,
      severity: 'warn' as const,
      sampleEvent: makeEvent(),
    }));
    expect(rankClusters(clusters, 2)).toHaveLength(2);
  });
});

// === format functions ===

function makeSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  const cluster: Cluster = {
    fingerprint: 'fp:abc',
    count: 3,
    maxDurationMs: 2500,
    totalDurationMs: 6000,
    firstDeltaMs: 100,
    severity: 'frozen',
    sampleEvent: makeEvent({ durationMs: 2500, severity: 'frozen', symbol: '[AppDelegate run:]' }),
  };
  return {
    sessionId: 'sess-001',
    durationMs: 30000,
    totalEvents: 10,
    droppedEvents: 2,
    clusters: [cluster],
    bursts: [],
    quietPeriods: 0,
    processDistribution: { SpringBoard: 10 },
    fingerprintVersion: FINGERPRINT_VERSION,
    ...overrides,
  };
}

describe('formatL0', () => {
  it('returns a non-empty single-line string', () => {
    const result = formatL0(makeSummary());
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain('\n');
  });

  it('mentions session id', () => {
    expect(formatL0(makeSummary())).toContain('sess-001');
  });

  it('handles no-cluster case', () => {
    const result = formatL0(makeSummary({ clusters: [] }));
    expect(result).toContain('no hangs');
  });
});

describe('formatL1', () => {
  it('returns a non-empty multi-line string', () => {
    const result = formatL1(makeSummary());
    expect(result.length).toBeGreaterThan(0);
  });

  it('includes session id and drill hint', () => {
    const result = formatL1(makeSummary());
    expect(result).toContain('sess-001');
    expect(result).toContain('Drill:');
  });

  it('handles no-cluster case', () => {
    const result = formatL1(makeSummary({ clusters: [] }));
    expect(result).toContain('no hangs');
  });
});

describe('formatL2', () => {
  it('returns a non-empty string longer than L1', () => {
    const summary = makeSummary();
    const l1 = formatL1(summary);
    const l2 = formatL2(summary);
    expect(l2.length).toBeGreaterThan(0);
    expect(l2.length).toBeGreaterThanOrEqual(l1.length);
  });

  it('includes severity histogram', () => {
    const result = formatL2(makeSummary());
    expect(result).toContain('Severity:');
  });
});

describe('formatClusterDetail', () => {
  it('returns non-empty string with fingerprint', () => {
    const summary = makeSummary();
    const result = formatClusterDetail(summary.clusters[0]);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('fp:abc');
  });
});

// === compressToBudget ===

describe('compressToBudget', () => {
  const summary = makeSummary();

  it('returns L0 for tiny budget (5 tokens)', () => {
    const result = compressToBudget(summary, 5);
    // L0 is the shortest — L1/L2 won't fit, so we fall through to L0
    const l0 = formatL0(summary);
    expect(result).toBe(l0);
  });

  it('returns L2 for large budget (500 tokens)', () => {
    const result = compressToBudget(summary, 500);
    const l2 = formatL2(summary);
    expect(result).toBe(l2);
  });

  it('returns L1 when no maxTokens provided', () => {
    const result = compressToBudget(summary, undefined);
    expect(result).toBe(formatL1(summary));
  });
});

// === buildSummary ===

describe('buildSummary', () => {
  it('produces a SessionSummary with correct totalEvents', () => {
    const fp = computeFingerprint({ normalisedMessage: 'test hang', symbol: undefined });
    const events: NormalisedEvent[] = [
      makeEvent({ fingerprint: fp, atMs: 0 }),
      makeEvent({ fingerprint: fp, atMs: 500 }),
      makeEvent({ fingerprint: fp, atMs: 1000 }),
    ];
    const summary = buildSummary('s1', events, 0);
    expect(summary.totalEvents).toBe(3);
    expect(summary.clusters).toHaveLength(1);
    expect(summary.fingerprintVersion).toBe(FINGERPRINT_VERSION);
  });
});

// === constants ===

describe('constants', () => {
  it('FINGERPRINT_VERSION is 2', () => {
    expect(FINGERPRINT_VERSION).toBe(2);
  });

  it('SEVERITY_WEIGHT has correct values', () => {
    expect(SEVERITY_WEIGHT.minor).toBe(1);
    expect(SEVERITY_WEIGHT.warn).toBe(2);
    expect(SEVERITY_WEIGHT.critical).toBe(4);
    expect(SEVERITY_WEIGHT.frozen).toBe(8);
  });
});
