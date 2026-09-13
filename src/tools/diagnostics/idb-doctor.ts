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
  const healthy = problems.length === 0;

  const report = {
    healthy,
    idbCli: environment.cliInstalled ? 'installed' : 'missing',
    idbCompanion: environment.companionInstalled ? 'installed' : 'missing',
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
