/**
 * Tests for HangBuster session store (src/tools/diagnostics/hang/sessions.ts).
 *
 * Uses XC_MCP_HANG_DIR env var to redirect session root to a tmp dir,
 * avoiding any writes to ~/.xc-mcp during testing.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// Must set env var BEFORE importing the module so getSessionsRoot() picks it up.
const TEST_HANG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-mcp-hang-sessions-test-'));
process.env.XC_MCP_HANG_DIR = TEST_HANG_DIR;

import {
  createSession,
  deleteSession,
  getSessionDir,
  getSessionsRoot,
  listSessions,
  pruneExpired,
  readMeta,
  readRawLog,
  readSummary,
  updateStatus,
  writeMeta,
  writeSummary,
} from '../../../src/tools/diagnostics/hang/sessions.js';

// Suppress console noise from the module under test.
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  // Clean up temp dir.
  fs.rmSync(TEST_HANG_DIR, { recursive: true, force: true });
  jest.restoreAllMocks();
});

// Clear all sessions between tests.
afterEach(() => {
  const root = getSessionsRoot();
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        fs.rmSync(path.join(root, entry.name), { recursive: true, force: true });
      }
    }
  }
});

// === getSessionsRoot ===

test('getSessionsRoot returns the XC_MCP_HANG_DIR env var', () => {
  expect(getSessionsRoot()).toBe(TEST_HANG_DIR);
});

// === createSession ===

test('createSession creates session dir, meta.json, and raw.log with status running', () => {
  const meta = createSession({
    udid: 'device-123',
    predicate: 'process == "MyApp"',
    minHangMs: 500,
  });

  expect(meta.status).toBe('running');
  expect(meta.udid).toBe('device-123');
  expect(meta.predicate).toBe('process == "MyApp"');
  expect(meta.minHangMs).toBe(500);
  expect(meta.createdAt).toBeTruthy();
  expect(meta.sessionId).toMatch(/^hang-\d{8}-\d{6}-[0-9a-f]{4}$/);

  const sessionDir = getSessionDir(meta.sessionId);
  expect(fs.existsSync(sessionDir)).toBe(true);
  expect(fs.existsSync(path.join(sessionDir, 'meta.json'))).toBe(true);
  expect(fs.existsSync(path.join(sessionDir, 'raw.log'))).toBe(true);
});

// === readMeta ===

test('readMeta round-trips the SessionMeta written by createSession', () => {
  const created = createSession({
    udid: 'abc',
    predicate: 'subsystem == "com.app"',
    minHangMs: 250,
  });
  const read = readMeta(created.sessionId);

  expect(read).not.toBeNull();
  expect(read!.sessionId).toBe(created.sessionId);
  expect(read!.udid).toBe('abc');
  expect(read!.predicate).toBe('subsystem == "com.app"');
  expect(read!.minHangMs).toBe(250);
  expect(read!.status).toBe('running');
});

test('readMeta returns null for a non-existent session', () => {
  expect(readMeta('hang-00000000-000000-ffff')).toBeNull();
});

// === updateStatus ===

test('updateStatus to stopped persists and sets stoppedAt', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });

  const updated = updateStatus(meta.sessionId, 'stopped');

  expect(updated.status).toBe('stopped');
  expect(updated.stoppedAt).toBeTruthy();

  // Verify it's actually persisted on disk.
  const persisted = readMeta(meta.sessionId);
  expect(persisted!.status).toBe('stopped');
  expect(persisted!.stoppedAt).toBe(updated.stoppedAt);
});

test('updateStatus to crashed persists and sets stoppedAt', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });

  const updated = updateStatus(meta.sessionId, 'crashed');

  expect(updated.status).toBe('crashed');
  expect(updated.stoppedAt).toBeTruthy();
});

test('updateStatus accepts extra fields', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });

  const updated = updateStatus(meta.sessionId, 'stopped', { pid: 12345 });

  expect(updated.pid).toBe(12345);
  const persisted = readMeta(meta.sessionId);
  expect(persisted!.pid).toBe(12345);
});

// === listSessions ===

test('listSessions returns sessions newest first', async () => {
  const first = createSession({ udid: 'd1', predicate: 'p', minHangMs: 100 });

  // Sleep 10ms to ensure createdAt differs.
  await new Promise(r => setTimeout(r, 10));

  const second = createSession({ udid: 'd2', predicate: 'p', minHangMs: 100 });

  const sessions = listSessions();
  expect(sessions.length).toBeGreaterThanOrEqual(2);
  // Newest first — second session should appear before first.
  const ids = sessions.map(s => s.sessionId);
  expect(ids.indexOf(second.sessionId)).toBeLessThan(ids.indexOf(first.sessionId));
});

test('listSessions returns empty array when root is empty', () => {
  expect(listSessions()).toEqual([]);
});

// === writeSummary / readSummary ===

test('writeSummary and readSummary round-trip arbitrary data', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });
  const summary = { hangs: 3, durationMs: 5000, topOffenders: ['UIKit'] };

  writeSummary(meta.sessionId, summary);

  const read = readSummary(meta.sessionId);
  expect(read).toEqual(summary);
});

test('readSummary returns null when no summary exists', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });
  expect(readSummary(meta.sessionId)).toBeNull();
});

// === readRawLog ===

test('readRawLog returns content written to raw.log', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });
  const sessionDir = getSessionDir(meta.sessionId);
  const logContent = 'hang detected at 12:00:01\nhang ended at 12:00:03\n';

  fs.writeFileSync(path.join(sessionDir, 'raw.log'), logContent, 'utf8');

  expect(readRawLog(meta.sessionId)).toBe(logContent);
});

test('readRawLog returns empty string when raw.log is missing', () => {
  // Create a session then manually remove raw.log.
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });
  fs.unlinkSync(path.join(getSessionDir(meta.sessionId), 'raw.log'));

  expect(readRawLog(meta.sessionId)).toBe('');
});

// === deleteSession ===

test('deleteSession removes the session directory', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });
  const sessionDir = getSessionDir(meta.sessionId);

  expect(fs.existsSync(sessionDir)).toBe(true);
  const result = deleteSession(meta.sessionId);

  expect(result).toBe(true);
  expect(fs.existsSync(sessionDir)).toBe(false);
});

test('deleteSession returns false for a non-existent session', () => {
  expect(deleteSession('hang-00000000-000000-ffff')).toBe(false);
});

// === pruneExpired ===

test('pruneExpired deletes sessions older than the TTL', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });

  // Backdate the createdAt in meta to 25 hours ago.
  const backdated = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const staleMeta = { ...readMeta(meta.sessionId)!, createdAt: backdated };
  writeMeta(staleMeta);

  const deleted = pruneExpired(24);
  expect(deleted).toBe(1);
  expect(fs.existsSync(getSessionDir(meta.sessionId))).toBe(false);
});

test('pruneExpired does not delete recent sessions', () => {
  const meta = createSession({ udid: 'dev', predicate: 'p', minHangMs: 100 });

  const deleted = pruneExpired(24);
  expect(deleted).toBe(0);
  expect(fs.existsSync(getSessionDir(meta.sessionId))).toBe(true);
});
