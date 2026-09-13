/**
 * idb environment detection.
 *
 * Xcode 27 moved SimulatorKit.framework out of
 * Contents/Developer/Library/PrivateFrameworks and into Contents/SharedFrameworks.
 * idb-companion older than 1.5.1 only looks in the old place, and the failure is
 * silent in the worst way: the companion still starts, the accessibility tree
 * still reads correctly, and `idb ui tap/swipe/text` all report success - while
 * every HID event is dropped and nothing happens on screen.
 *
 * This module detects that combination so tools can fail loudly instead, and so
 * `idb-doctor` can explain it.
 */

import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from './command.js';

/** First idb-companion release that resolves SimulatorKit under the Xcode 27 layout. */
export const MIN_COMPANION_VERSION = '1.5.1';

export const IDB_INSTALL_COMMAND =
  'brew tap facebook/fb && brew install facebook/fb/idb-companion facebook/fb/idb-cli';

export interface IdbEnvironment {
  /** `idb` CLI resolvable on PATH. Every idb-* tool needs it. */
  cliInstalled: boolean;
  /** `idb_companion` resolvable on PATH. */
  companionInstalled: boolean;
  /** Companion version, when it could be determined (Homebrew installs only). */
  companionVersion: string | null;
  /** True only when a version was read AND it is below the floor. */
  companionBelowFloor: boolean;
  /** Xcode 27+ framework layout: SimulatorKit is no longer at the legacy path. */
  xcode27Layout: boolean;
  /** UDIDs whose registered companion process is gone; every idb call to them fails. */
  staleRegistrations: string[];
  /**
   * Confidently broken: the Xcode 27 layout with a companion known to be too old.
   * HID writes will be accepted and silently dropped.
   */
  hidWritesBroken: boolean;
}

const CACHE_TTL_MS = 60_000;
let cached: { value: IdbEnvironment; at: number } | null = null;

/** Detect the idb environment. Cached briefly so per-call preflight stays cheap. */
export async function getIdbEnvironment(force = false): Promise<IdbEnvironment> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }

  // A diagnostic must never break the thing it is diagnosing: if any probe
  // throws (command timeout, odd PATH), fall back to the permissive answer.
  const [cliInstalled, companionInstalled, companionVersion, xcode27Layout, staleRegistrations] =
    await Promise.all([
      safely(() => isOnPath('idb'), true),
      safely(() => isOnPath('idb_companion'), true),
      safely(detectCompanionVersion, null),
      safely(detectXcode27Layout, false),
      safely(detectStaleRegistrations, [] as string[]),
    ]);

  const companionBelowFloor =
    companionVersion !== null && compareVersions(companionVersion, MIN_COMPANION_VERSION) < 0;

  const value: IdbEnvironment = {
    cliInstalled,
    companionInstalled,
    companionVersion,
    companionBelowFloor,
    xcode27Layout,
    staleRegistrations,
    hidWritesBroken: xcode27Layout && companionBelowFloor,
  };

  cached = { value, at: Date.now() };
  return value;
}

/** Reset the cache. Test seam, and used by idb-doctor to force a fresh probe. */
export function clearIdbEnvironmentCache(): void {
  cached = null;
}

/**
 * Actionable remediation lines for whatever is wrong, or [] when the
 * environment is healthy.
 */
export function describeIdbProblems(environment: IdbEnvironment): string[] {
  const problems: string[] = [];

  if (!environment.cliInstalled) {
    problems.push(
      `idb CLI not found on PATH. Every idb-* tool requires it.`,
      `  Install: ${IDB_INSTALL_COMMAND}`
    );
  }

  if (!environment.companionInstalled) {
    problems.push(`idb_companion not found on PATH.`, `  Install: ${IDB_INSTALL_COMMAND}`);
  }

  if (environment.hidWritesBroken) {
    problems.push(
      `idb-companion ${environment.companionVersion} cannot drive the Xcode 27 framework layout.`,
      `  Taps, swipes and typing are accepted but silently dropped (reads still work).`,
      `  Upgrade (>= ${MIN_COMPANION_VERSION}): ${IDB_INSTALL_COMMAND}`
    );
  } else if (environment.companionBelowFloor) {
    problems.push(
      `idb-companion ${environment.companionVersion} is below the supported floor ${MIN_COMPANION_VERSION}.`,
      `  Upgrade: ${IDB_INSTALL_COMMAND}`
    );
  }

  for (const udid of environment.staleRegistrations) {
    problems.push(
      `Stale idb companion registered for ${udid}: its process is gone, so idb dials a dead socket.`,
      `  Fix: idb disconnect ${udid}`
    );
  }

  return problems;
}

/** Run a probe, falling back to `fallback` if it throws. */
async function safely<T>(probe: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await probe();
  } catch {
    return fallback;
  }
}

async function isOnPath(binary: string): Promise<boolean> {
  const result = await executeCommand(`command -v ${binary}`, { timeout: 5000 });
  return result.code === 0 && result.stdout.length > 0;
}

/**
 * Read the companion version. `idb_companion --version` only emits a build date,
 * with no semver, so Homebrew is the only reliable source - hence null for
 * installs from anywhere else, which callers must treat as "unknown", not "old".
 */
async function detectCompanionVersion(): Promise<string | null> {
  const result = await executeCommand('brew list --versions idb-companion', { timeout: 10000 });
  if (result.code !== 0) return null;
  const match = result.stdout.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

async function detectXcode27Layout(): Promise<boolean> {
  const developerDir = await executeCommand('xcode-select -p', { timeout: 5000 });
  if (developerDir.code !== 0 || !developerDir.stdout) return false;
  const legacyPath = `${developerDir.stdout}/Library/PrivateFrameworks/SimulatorKit.framework`;
  const exists = await executeCommand(`test -d "${legacyPath}"`, { timeout: 5000 });
  return exists.code !== 0;
}

/**
 * idb records running companions in /tmp/idb/state. An entry whose pid is gone
 * makes idb dial that dead socket rather than spawn a replacement, so every
 * later call fails with "Connection refused".
 */
async function detectStaleRegistrations(): Promise<string[]> {
  const state = await executeCommand('cat /tmp/idb/state 2>/dev/null', { timeout: 5000 });
  if (state.code !== 0 || !state.stdout) return [];

  let entries: Array<{ udid?: string; pid?: number }>;
  try {
    entries = JSON.parse(state.stdout);
  } catch {
    return []; // idb changed its format; not ours to interpret
  }
  if (!Array.isArray(entries)) return [];

  const stale: string[] = [];
  for (const entry of entries) {
    if (!entry?.pid || !entry?.udid) continue;
    const alive = await executeCommand(`kill -0 ${entry.pid} 2>/dev/null`, { timeout: 5000 });
    if (alive.code !== 0) stale.push(entry.udid);
  }
  return stale;
}

/** Numeric semver compare. Returns <0, 0 or >0. */
export function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Guard for tools that write HID events (tap, swipe, type, button).
 *
 * Throws only when we are confident: idb missing, or a known-too-old companion
 * on the Xcode 27 layout. An undetectable version (not a Homebrew install) is
 * deliberately allowed through - refusing to work on a hunch would be worse
 * than the bug. Reads are unaffected and never blocked.
 */
export async function assertHidWritesSupported(): Promise<void> {
  const environment = await getIdbEnvironment();
  if (environment.cliInstalled && !environment.hidWritesBroken) return;

  const problems = describeIdbProblems(environment).filter(
    line => !line.startsWith('Stale idb companion') // not fatal to a write; reported by idb-doctor
  );
  throw new McpError(
    ErrorCode.InvalidRequest,
    [
      environment.cliInstalled
        ? 'idb cannot deliver UI input in this environment.'
        : 'idb is not installed.',
      ...problems,
      '',
      'Run idb-doctor for a full environment report.',
    ].join('\n')
  );
}
