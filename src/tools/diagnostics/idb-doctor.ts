import * as fs from 'fs';
import * as path from 'path';
import { executeCommand } from '../../utils/command.js';
/**
 * idb-doctor: report whether this machine can actually drive a simulator's UI.
 *
 * Exists because the common failure is silent - on Xcode 27 an old
 * idb-companion reports success for every tap while delivering none of them.
 */

import {
  getIdbEnvironment,
  clearIdbEnvironmentCache,
  describeIdbProblems,
  MIN_COMPANION_VERSION,
  IDB_INSTALL_COMMAND,
} from '../../utils/idb-environment.js';

export async function idbDoctorTool() {
  clearIdbEnvironmentCache(); // always probe fresh; the user is asking right now
  const environment = await getIdbEnvironment(true);
  const problems = describeIdbProblems(environment);
  let cliVersion: string | null = null;
  let axbridgeGuest: string | null = null;
  try {
    const cli = await executeCommand('brew list --versions idb-cli', { timeout: 10000 });
    cliVersion = cli.code === 0 ? (cli.stdout.match(/\d+\.\d+\.\d+/)?.[0] ?? null) : null;
    if (
      cliVersion &&
      environment.companionVersion &&
      cliVersion.split('.').slice(0, 2).join('.') !==
        environment.companionVersion.split('.').slice(0, 2).join('.')
    )
      problems.push(
        `idb CLI ${cliVersion} and companion ${environment.companionVersion} have different minor versions; upgrade both together.`
      );
    const binary = await executeCommand('command -v idb_companion', { timeout: 5000 });
    if (binary.code === 0 && binary.stdout.trim()) {
      axbridgeGuest = path.join(
        path.dirname(fs.realpathSync(binary.stdout.trim())),
        'Resources',
        'SimulatorFrameworkBridge-iOS'
      );
      try {
        fs.accessSync(axbridgeGuest, fs.constants.X_OK);
      } catch {
        problems.push(
          `axbridge guest missing or not executable: ${axbridgeGuest}. Reinstall idb-companion for deep reads.`
        );
      }
    }
  } catch {
    /* Optional probes may be unavailable outside Homebrew installs. */
  }
  const healthy = problems.length === 0;

  const report = {
    healthy,
    idbCli: environment.cliInstalled ? 'installed' : 'missing',
    idbCompanion: environment.companionInstalled ? 'installed' : 'missing',
    cliVersion,
    axbridgeGuest,
    companionVersion: environment.companionVersion ?? 'unknown (not a Homebrew install)',
    minimumCompanionVersion: MIN_COMPANION_VERSION,
    xcodeFrameworkLayout: environment.xcode27Layout ? 'Xcode 27+' : 'Xcode 26 or earlier',
    uiInputWorks: environment.cliInstalled && !environment.hidWritesBroken,
    staleRegistrations: environment.staleRegistrations,
    problems,
    installCommand: IDB_INSTALL_COMMAND,
  };

  const summary = healthy
    ? '✅ idb environment is healthy - UI automation should work.'
    : `❌ ${problems.length} problem(s) found:\n${problems.join('\n')}`;

  return {
    content: [{ type: 'text' as const, text: `${summary}\n\n${JSON.stringify(report, null, 2)}` }],
  };
}

export const IDB_DOCTOR_DOCS = `Diagnose whether idb can drive simulator UI on this machine.

Checks the idb CLI and companion, the companion version against the ${MIN_COMPANION_VERSION} floor, the Xcode framework layout, and stale companion registrations.

Run this first when taps, swipes or typing appear to succeed but nothing happens on screen - on Xcode 27 an idb-companion older than ${MIN_COMPANION_VERSION} drops every HID event while still reporting success, and reads continue to work normally.

Returns a JSON report plus remediation commands.`;

export const IDB_DOCTOR_DOCS_MINI = 'Diagnose idb setup for UI automation.';
