import { jest } from '@jest/globals';
import { executeCommand } from '../../../src/utils/command.js';
import {
  getIdbEnvironment,
  clearIdbEnvironmentCache,
  describeIdbProblems,
  assertHidWritesSupported,
  compareVersions,
} from '../../../src/utils/idb-environment.js';

jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

const ok = (stdout = '') => ({ stdout, stderr: '', code: 0 });
const fail = () => ({ stdout: '', stderr: '', code: 1 });

/**
 * Drive the probes by command shape, so tests stay readable and do not depend
 * on the order the implementation happens to run them in.
 */
function mockEnvironment(options: {
  idbCli?: boolean;
  companion?: boolean;
  brewVersion?: string | null;
  legacySimulatorKit?: boolean;
  idbState?: string | null;
  pidAlive?: boolean;
}) {
  const {
    idbCli = true,
    companion = true,
    brewVersion = '1.5.7',
    legacySimulatorKit = false,
    idbState = null,
    pidAlive = true,
  } = options;

  mockExecuteCommand.mockImplementation(async (command: string) => {
    if (command === 'command -v idb') return idbCli ? ok('/usr/local/bin/idb') : fail();
    if (command === 'command -v idb_companion')
      return companion ? ok('/opt/homebrew/bin/idb_companion') : fail();
    if (command.startsWith('brew list --versions'))
      return brewVersion ? ok(`idb-companion ${brewVersion}`) : fail();
    if (command === 'xcode-select -p') return ok('/Applications/Xcode.app/Contents/Developer');
    if (command.includes('SimulatorKit.framework')) return legacySimulatorKit ? ok() : fail();
    if (command.startsWith('cat /tmp/idb/state')) return idbState ? ok(idbState) : fail();
    if (command.startsWith('kill -0')) return pidAlive ? ok() : fail();
    return fail();
  });
}

describe('idb environment detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearIdbEnvironmentCache();
  });

  it('reports a healthy modern setup', async () => {
    mockEnvironment({ brewVersion: '1.5.7' });
    const environment = await getIdbEnvironment(true);

    expect(environment.cliInstalled).toBe(true);
    expect(environment.companionVersion).toBe('1.5.7');
    expect(environment.companionBelowFloor).toBe(false);
    expect(environment.hidWritesBroken).toBe(false);
    expect(describeIdbProblems(environment)).toEqual([]);
  });

  it('flags an old companion on the Xcode 27 layout as silently broken HID', async () => {
    mockEnvironment({ brewVersion: '1.1.8', legacySimulatorKit: false });
    const environment = await getIdbEnvironment(true);

    expect(environment.xcode27Layout).toBe(true);
    expect(environment.hidWritesBroken).toBe(true);
    expect(describeIdbProblems(environment).join('\n')).toContain('silently dropped');
  });

  it('does not flag an old companion on the legacy Xcode layout as broken HID', async () => {
    // Xcode 26 keeps SimulatorKit where old companions look, so 1.1.8 still taps.
    mockEnvironment({ brewVersion: '1.1.8', legacySimulatorKit: true });
    const environment = await getIdbEnvironment(true);

    expect(environment.xcode27Layout).toBe(false);
    expect(environment.hidWritesBroken).toBe(false);
  });

  it('treats an undeterminable version as unknown rather than old', async () => {
    // Installed outside Homebrew: refusing to work on a hunch is worse than the bug.
    mockEnvironment({ brewVersion: null });
    const environment = await getIdbEnvironment(true);

    expect(environment.companionVersion).toBeNull();
    expect(environment.companionBelowFloor).toBe(false);
    expect(environment.hidWritesBroken).toBe(false);
  });

  it('detects a companion registration whose process is gone', async () => {
    mockEnvironment({
      idbState: JSON.stringify([{ udid: 'ABC-123', pid: 4242 }]),
      pidAlive: false,
    });
    const environment = await getIdbEnvironment(true);

    expect(environment.staleRegistrations).toEqual(['ABC-123']);
    expect(describeIdbProblems(environment).join('\n')).toContain('idb disconnect ABC-123');
  });

  it('ignores a live companion registration', async () => {
    mockEnvironment({ idbState: JSON.stringify([{ udid: 'ABC-123', pid: 4242 }]), pidAlive: true });
    expect((await getIdbEnvironment(true)).staleRegistrations).toEqual([]);
  });

  it('survives an unparseable idb state file', async () => {
    mockEnvironment({ idbState: 'not json' });
    expect((await getIdbEnvironment(true)).staleRegistrations).toEqual([]);
  });
});

describe('describeIdbProblems', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearIdbEnvironmentCache();
  });

  it('reports a missing companion separately from a missing CLI', async () => {
    mockEnvironment({ idbCli: true, companion: false });
    const problems = describeIdbProblems(await getIdbEnvironment(true)).join('\n');

    expect(problems).toContain('idb_companion not found on PATH');
  });

  it('reports an old companion on the legacy layout as below floor, not as broken HID', async () => {
    // Xcode 26 still works with an old companion, so the wording must not claim
    // taps are being dropped - only that the version is unsupported.
    mockEnvironment({ brewVersion: '1.1.8', legacySimulatorKit: true });
    const environment = await getIdbEnvironment(true);
    const problems = describeIdbProblems(environment).join('\n');

    expect(environment.hidWritesBroken).toBe(false);
    expect(problems).toContain('below the supported floor');
    expect(problems).not.toContain('silently dropped');
  });
});

describe('assertHidWritesSupported', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearIdbEnvironmentCache();
  });

  it('allows writes on a healthy setup', async () => {
    mockEnvironment({});
    await expect(assertHidWritesSupported()).resolves.toBeUndefined();
  });

  it('blocks writes that would be silently dropped', async () => {
    mockEnvironment({ brewVersion: '1.1.8' });
    await expect(assertHidWritesSupported()).rejects.toThrow(/silently dropped/);
  });

  it('blocks writes when idb is missing', async () => {
    mockEnvironment({ idbCli: false });
    await expect(assertHidWritesSupported()).rejects.toThrow(/not installed/);
  });

  it('allows writes when the version cannot be determined', async () => {
    mockEnvironment({ brewVersion: null });
    await expect(assertHidWritesSupported()).resolves.toBeUndefined();
  });

  it('does not block writes merely because a stale registration exists', async () => {
    mockEnvironment({
      idbState: JSON.stringify([{ udid: 'OTHER', pid: 99 }]),
      pidAlive: false,
    });
    await expect(assertHidWritesSupported()).resolves.toBeUndefined();
  });
});

describe('compareVersions', () => {
  it.each([
    ['1.5.1', '1.5.1', 0],
    ['1.1.8', '1.5.1', -1],
    ['1.5.7', '1.5.1', 1],
    ['1.10.0', '1.9.0', 1],
    ['2.0', '1.9.9', 1],
  ])('compares %s to %s', (left, right, expected) => {
    const result = compareVersions(left as string, right as string);
    expect(Math.sign(result)).toBe(expected);
  });
});

describe('probe resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearIdbEnvironmentCache();
  });

  it('never blocks UI input when a probe itself throws', async () => {
    // A diagnostic must not break the thing it diagnoses.
    mockExecuteCommand.mockImplementation(async () => {
      throw new Error('command timed out');
    });

    const environment = await getIdbEnvironment(true);
    expect(environment.hidWritesBroken).toBe(false);
    await expect(assertHidWritesSupported()).resolves.toBeUndefined();
  });
});
