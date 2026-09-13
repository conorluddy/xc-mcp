/**
 * Device-state wrappers (memory warning, keychain) and xctest listing.
 */
import {
  idbSimulateMemoryWarningTool,
  idbClearKeychainTool,
} from '../../../src/tools/idb/device-state.js';
import { idbXctestListTool, parseXctestOutput } from '../../../src/tools/idb/xctest.js';
import { executeCommand } from '../../../src/utils/command.js';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';

jest.mock('../../../src/utils/command.js');
jest.mock('../../../src/state/idb-target-cache.js');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockIDBTargetCache = IDBTargetCache as jest.Mocked<typeof IDBTargetCache>;

const UDID = 'test-udid-123';

beforeEach(() => {
  jest.clearAllMocks();

  const target = { udid: UDID, name: 'iPhone 17 Pro', type: 'simulator', state: 'Booted' };
  mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue(target);
  mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue(target);
  mockIDBTargetCache.recordSuccess = jest.fn();
});

const ok = (stdout = '') =>
  mockExecuteCommand.mockResolvedValue({ code: 0, stdout, stderr: '' } as any);

const textOf = (result: any) => JSON.parse(result.content[0].text);

describe('idb-simulate-memory-warning', () => {
  it('runs the idb command against the resolved target', async () => {
    ok();

    const response = textOf(await idbSimulateMemoryWarningTool({ udid: UDID }));

    expect(mockExecuteCommand.mock.calls[0][0]).toContain('idb simulate-memory-warning');
    expect(response.success).toBe(true);
  });

  it('records scenario and step in the audit entry for test reconstruction', async () => {
    ok();

    const response = textOf(
      await idbSimulateMemoryWarningTool({ udid: UDID, scenario: 'Checkout', step: 3 })
    );

    expect(response.auditEntry).toMatchObject({
      action: 'memory-warning',
      success: true,
      scenario: 'Checkout',
      step: 3,
    });
    expect(response.auditEntry.timestamp).toBeDefined();
  });

  it('omits scenario and step when not supplied, rather than emitting nulls', async () => {
    ok();

    const response = textOf(await idbSimulateMemoryWarningTool({ udid: UDID }));

    expect(response.auditEntry).not.toHaveProperty('scenario');
    expect(response.auditEntry).not.toHaveProperty('step');
  });

  it('points at crash checking, since a warning can get the app jettisoned', async () => {
    ok();

    const response = textOf(await idbSimulateMemoryWarningTool({ udid: UDID }));

    expect(response.guidance.join('\n')).toContain('idb-crash-list');
  });

  it('reports failure without throwing, and marks the audit entry unsuccessful', async () => {
    mockExecuteCommand.mockResolvedValue({ code: 1, stdout: '', stderr: 'boom' } as any);

    const result: any = await idbSimulateMemoryWarningTool({ udid: UDID });

    expect(result.isError).toBe(true);
    expect(textOf(result).auditEntry.success).toBe(false);
    expect(textOf(result).error).toBe('boom');
  });
});

describe('idb-clear-keychain', () => {
  it('runs the idb command and records the action', async () => {
    ok();

    const response = textOf(await idbClearKeychainTool({ udid: UDID, scenario: 'First run' }));

    expect(mockExecuteCommand.mock.calls[0][0]).toContain('idb clear-keychain');
    expect(response.auditEntry).toMatchObject({ action: 'clear-keychain', scenario: 'First run' });
  });

  it('warns that it affects every app, not just the one under test', async () => {
    ok();

    const response = textOf(await idbClearKeychainTool({ udid: UDID }));

    expect(response.guidance.join('\n')).toContain('every app');
  });
});

describe('parseXctestOutput', () => {
  it('returns an empty list for empty output', () => {
    expect(parseXctestOutput('')).toEqual([]);
    expect(parseXctestOutput('   \n  ')).toEqual([]);
  });

  it('parses a JSON array', () => {
    const output = JSON.stringify([{ bundle_id: 'com.example.Tests' }]);

    expect(parseXctestOutput(output)).toEqual([{ bundle_id: 'com.example.Tests' }]);
  });

  it('parses NDJSON objects', () => {
    const output = '{"bundle_id":"a"}\n{"bundle_id":"b"}';

    expect(parseXctestOutput(output)).toEqual([{ bundle_id: 'a' }, { bundle_id: 'b' }]);
  });

  it('preserves unrecognised plain lines as raw rather than dropping them', () => {
    const output = 'com.example.MyAppUITests.xctrunner\ncom.example.OtherTests';

    expect(parseXctestOutput(output)).toEqual([
      { raw: 'com.example.MyAppUITests.xctrunner' },
      { raw: 'com.example.OtherTests' },
    ]);
  });
});

describe('idb-xctest-list', () => {
  it('lists installed bundles by default', async () => {
    ok(JSON.stringify([{ bundle_id: 'com.example.Tests' }]));

    const response = textOf(await idbXctestListTool({ udid: UDID }));

    expect(mockExecuteCommand.mock.calls[0][0]).toContain('idb xctest list --udid');
    expect(response.count).toBe(1);
    expect(response.bundles).toHaveLength(1);
  });

  it('lists the tests inside a bundle when testBundleId is given', async () => {
    ok(JSON.stringify([{ name: 'testLogin' }]));

    const response = textOf(
      await idbXctestListTool({ udid: UDID, testBundleId: 'com.example.Tests' })
    );

    expect(mockExecuteCommand.mock.calls[0][0]).toContain('idb xctest list-bundle');
    expect(response.tests).toHaveLength(1);
    expect(response.bundles).toBeUndefined();
  });

  it('treats an empty list as a normal result, not an error', async () => {
    ok('');

    const result: any = await idbXctestListTool({ udid: UDID });
    const response = textOf(result);

    expect(result.isError).toBe(false);
    expect(response.success).toBe(true);
    expect(response.count).toBe(0);
    // Should redirect to the tool that actually builds and runs tests.
    expect(response.guidance.join('\n')).toContain('xcodebuild-test');
  });

  it('surfaces an idb failure with actionable guidance', async () => {
    mockExecuteCommand.mockResolvedValue({ code: 1, stdout: '', stderr: 'no companion' } as any);

    const result: any = await idbXctestListTool({ udid: UDID });

    expect(result.isError).toBe(true);
    expect(textOf(result).guidance.join('\n')).toContain('idb-doctor');
  });
});
