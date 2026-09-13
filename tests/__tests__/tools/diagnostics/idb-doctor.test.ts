import { jest } from '@jest/globals';
import { executeCommand } from '../../../../src/utils/command.js';
import { idbDoctorTool } from '../../../../src/tools/diagnostics/idb-doctor.js';

jest.mock('../../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

const ok = (stdout = '') => ({ stdout, stderr: '', code: 0 });
const fail = () => ({ stdout: '', stderr: '', code: 1 });

function mockEnvironment(options: {
  idbCli?: boolean;
  brewVersion?: string | null;
  legacySimulatorKit?: boolean;
  idbState?: string | null;
  pidAlive?: boolean;
}) {
  const {
    idbCli = true,
    brewVersion = '1.5.7',
    legacySimulatorKit = false,
    idbState = null,
    pidAlive = true,
  } = options;

  mockExecuteCommand.mockImplementation(async (command: string) => {
    if (command === 'command -v idb') return idbCli ? ok('/usr/local/bin/idb') : fail();
    if (command === 'command -v idb_companion') return ok('/opt/homebrew/bin/idb_companion');
    if (command.startsWith('brew list --versions'))
      return brewVersion ? ok(`idb-companion ${brewVersion}`) : fail();
    if (command === 'xcode-select -p') return ok('/Applications/Xcode.app/Contents/Developer');
    if (command.includes('SimulatorKit.framework')) return legacySimulatorKit ? ok() : fail();
    if (command.startsWith('cat /tmp/idb/state')) return idbState ? ok(idbState) : fail();
    if (command.startsWith('kill -0')) return pidAlive ? ok() : fail();
    return fail();
  });
}

/** The tool returns a summary line followed by a JSON report. */
function parseReport(text: string) {
  return JSON.parse(text.slice(text.indexOf('{')));
}

describe('idbDoctorTool', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports a healthy environment', async () => {
    mockEnvironment({ brewVersion: '1.5.7' });
    const result = await idbDoctorTool();
    const report = parseReport(result.content[0].text);

    expect(result.content[0].text).toContain('healthy');
    expect(report.healthy).toBe(true);
    expect(report.idbCli).toBe('installed');
    expect(report.companionVersion).toBe('1.5.7');
    expect(report.uiInputWorks).toBe(true);
    expect(report.problems).toEqual([]);
  });

  it('reports the Xcode 27 silent-tap failure with remediation', async () => {
    mockEnvironment({ brewVersion: '1.1.8' });
    const result = await idbDoctorTool();
    const report = parseReport(result.content[0].text);

    expect(report.healthy).toBe(false);
    expect(report.uiInputWorks).toBe(false);
    expect(report.xcodeFrameworkLayout).toBe('Xcode 27+');
    expect(report.problems.join('\n')).toContain('silently dropped');
    expect(report.installCommand).toContain('brew tap facebook/fb');
  });

  it('reports a missing idb CLI', async () => {
    mockEnvironment({ idbCli: false });
    const report = parseReport((await idbDoctorTool()).content[0].text);

    expect(report.healthy).toBe(false);
    expect(report.idbCli).toBe('missing');
    expect(report.uiInputWorks).toBe(false);
  });

  it('surfaces an unknown version without calling it old', async () => {
    mockEnvironment({ brewVersion: null });
    const report = parseReport((await idbDoctorTool()).content[0].text);

    expect(report.companionVersion).toContain('unknown');
    expect(report.healthy).toBe(true);
    expect(report.uiInputWorks).toBe(true);
  });

  it('lists stale companion registrations', async () => {
    mockEnvironment({ idbState: JSON.stringify([{ udid: 'ABC-123', pid: 42 }]), pidAlive: false });
    const report = parseReport((await idbDoctorTool()).content[0].text);

    expect(report.staleRegistrations).toEqual(['ABC-123']);
    expect(report.problems.join('\n')).toContain('idb disconnect ABC-123');
  });

  it('probes fresh rather than serving a cached reading', async () => {
    mockEnvironment({ brewVersion: '1.1.8' });
    expect(parseReport((await idbDoctorTool()).content[0].text).healthy).toBe(false);

    mockEnvironment({ brewVersion: '1.5.7' });
    expect(parseReport((await idbDoctorTool()).content[0].text).healthy).toBe(true);
  });
});
