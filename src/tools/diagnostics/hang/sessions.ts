/**
 * HangBuster session store — filesystem-backed, simplified from hang_sessions.py.
 *
 * Session root: $XC_MCP_HANG_DIR (tests) or ~/.xc-mcp/hang-sessions/ (production).
 * Each session: <root>/<sessionId>/ containing meta.json, raw.log, summary.json.
 *
 * No events.jsonl, no worker process management — just the store.
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

// === TYPES ===

export interface SessionMeta {
  sessionId: string;
  udid: string;
  predicate: string;
  pid?: number;
  status: 'running' | 'stopped' | 'crashed';
  createdAt: string; // ISO 8601
  stoppedAt?: string; // ISO 8601
  rawLogPath: string;
  minHangMs: number;
}

// === ROOT RESOLUTION ===

export function getSessionsRoot(): string {
  return process.env.XC_MCP_HANG_DIR ?? path.join(os.homedir(), '.xc-mcp', 'hang-sessions');
}

export function getSessionDir(sessionId: string): string {
  return path.join(getSessionsRoot(), sessionId);
}

// === ID GENERATION ===

/**
 * Generates a session ID in the format `hang-YYYYMMDD-HHMMSS-XXXX`
 * where XXXX is 4 hex chars from crypto.randomBytes.
 */
export function generateSessionId(): string {
  const now = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  const datePart =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const suffix = crypto.randomBytes(2).toString('hex');
  return `hang-${datePart}-${suffix}`;
}

// === ATOMIC WRITE HELPERS ===

function atomicWriteJson(filePath: string, data: unknown): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// === SESSION CRUD ===

/**
 * Create a new session directory with an empty raw.log and initial meta.json
 * with status 'running'. Returns the persisted SessionMeta.
 */
export function createSession(opts: {
  udid: string;
  predicate: string;
  minHangMs: number;
}): SessionMeta {
  const sessionId = generateSessionId();
  const sessionDir = getSessionDir(sessionId);

  fs.mkdirSync(sessionDir, { recursive: true });

  const rawLogPath = path.join(sessionDir, 'raw.log');
  fs.writeFileSync(rawLogPath, '', 'utf8');

  const meta: SessionMeta = {
    sessionId,
    udid: opts.udid,
    predicate: opts.predicate,
    minHangMs: opts.minHangMs,
    status: 'running',
    createdAt: new Date().toISOString(),
    rawLogPath,
  };

  writeMeta(meta);
  return meta;
}

/** Read meta.json for a session. Returns null if missing or corrupt. */
export function readMeta(sessionId: string): SessionMeta | null {
  const metaPath = path.join(getSessionDir(sessionId), 'meta.json');
  try {
    const raw = fs.readFileSync(metaPath, 'utf8');
    return JSON.parse(raw) as SessionMeta;
  } catch {
    return null;
  }
}

/** Atomically write meta.json. */
export function writeMeta(meta: SessionMeta): void {
  const metaPath = path.join(getSessionDir(meta.sessionId), 'meta.json');
  atomicWriteJson(metaPath, meta);
}

/**
 * Patch session status (and optional extra fields) then persist.
 * Sets stoppedAt when transitioning to 'stopped' or 'crashed'.
 */
export function updateStatus(
  sessionId: string,
  status: SessionMeta['status'],
  extra?: Partial<Omit<SessionMeta, 'sessionId' | 'status'>>
): SessionMeta {
  const meta = readMeta(sessionId);
  if (!meta) {
    throw new Error(`Session not found: ${sessionId}`);
  }

  meta.status = status;
  if ((status === 'stopped' || status === 'crashed') && !meta.stoppedAt) {
    meta.stoppedAt = new Date().toISOString();
  }
  if (extra) {
    Object.assign(meta, extra);
  }

  writeMeta(meta);
  return meta;
}

// === LISTING ===

/** List all sessions, newest first (by createdAt). Tolerates missing/corrupt dirs. */
export function listSessions(): SessionMeta[] {
  const root = getSessionsRoot();
  if (!fs.existsSync(root)) {
    return [];
  }

  const metas: SessionMeta[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const meta = readMeta(entry.name);
    if (meta) {
      metas.push(meta);
    }
  }

  metas.sort((a, b) => (a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0));
  return metas;
}

// === RAW LOG ===

/** Read the raw.log file for a session. Returns empty string if missing. */
export function readRawLog(sessionId: string): string {
  const logPath = path.join(getSessionDir(sessionId), 'raw.log');
  try {
    return fs.readFileSync(logPath, 'utf8');
  } catch {
    return '';
  }
}

// === SUMMARY ===

/** Atomically write summary.json for a session. */
export function writeSummary(sessionId: string, summary: unknown): void {
  const summaryPath = path.join(getSessionDir(sessionId), 'summary.json');
  atomicWriteJson(summaryPath, summary);
}

/** Read summary.json for a session. Returns null if missing or corrupt. */
export function readSummary(sessionId: string): unknown | null {
  const summaryPath = path.join(getSessionDir(sessionId), 'summary.json');
  try {
    const raw = fs.readFileSync(summaryPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// === LIFECYCLE ===

/**
 * Delete a session directory and all its contents.
 * Returns true if the directory existed and was removed, false otherwise.
 */
export function deleteSession(sessionId: string): boolean {
  const sessionDir = getSessionDir(sessionId);
  if (!fs.existsSync(sessionDir)) {
    return false;
  }
  fs.rmSync(sessionDir, { recursive: true, force: true });
  return true;
}

/**
 * Delete sessions whose createdAt is older than ttlHours (default 24).
 * Returns the number of sessions deleted.
 */
export function pruneExpired(ttlHours = 24): number {
  const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
  const sessions = listSessions();
  let deleted = 0;

  for (const meta of sessions) {
    const createdAt = new Date(meta.createdAt);
    if (createdAt < cutoff) {
      deleteSession(meta.sessionId);
      deleted++;
    }
  }

  return deleted;
}
