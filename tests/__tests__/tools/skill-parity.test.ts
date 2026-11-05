import { simctlEraseTool } from '../../../src/tools/simctl/erase.js';
import { simctlDeleteTool } from '../../../src/tools/simctl/delete.js';
import { simctlUninstallTool } from '../../../src/tools/simctl/uninstall.js';
import { idbUiInputTool } from '../../../src/tools/idb/ui-input.js';
import { idbUiGestureTool } from '../../../src/tools/idb/ui-gesture.js';
import { idbLibraryTool } from '../../../src/tools/idb/library.js';
import { idbSemanticActionTool, uniqueMarker } from '../../../src/tools/idb/semantic-action.js';
import { executeCommandWithArgs } from '../../../src/utils/command.js';
import { axElement } from '../../fixtures/idb-describe-all.js';
jest.mock('../../../src/utils/command.js', () => ({
  executeCommandWithArgs: jest.fn(),
  executeCommand: jest.fn(),
}));
jest.mock('../../../src/utils/idb-environment.js', () => ({ assertHidWritesSupported: jest.fn() }));
jest.mock('../../../src/utils/idb-device-detection.js', () => ({
  resolveIdbUdid: jest.fn().mockResolvedValue('12345678-1234-1234-1234-123456789ABC'),
  validateTargetBooted: jest.fn().mockResolvedValue({ name: 'Test' }),
}));
jest.mock('../../../src/state/idb-target-cache.js', () => ({
  IDBTargetCache: { recordSuccess: jest.fn() },
}));
const run = executeCommandWithArgs as jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  run.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
});
it('sends HID codes in order, with modifiers', async () => {
  await idbUiInputTool({
    operation: 'key-sequence',
    keySequence: ['a', 'return'],
    modifiers: ['command'],
  });
  expect(run.mock.calls.map(call => call[1].slice(-2))).toEqual([
    ['4', '--command'],
    ['40', '--command'],
  ]);
});
it('clears by selecting all then deleting', async () => {
  await idbUiInputTool({ operation: 'clear' });
  expect(run.mock.calls[0][1].slice(-2)).toEqual(['4', '--command']);
  expect(run.mock.calls[1][1].at(-1)).toBe('42');
});
it('validates a complete key sequence before sending events', async () => {
  await expect(
    idbUiInputTool({ operation: 'key-sequence', keySequence: ['a', 'invalid'] })
  ).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
it('converts long press milliseconds to seconds', async () => {
  await idbUiGestureTool({ operation: 'long-press', startX: 10, startY: 20, duration: 1500 });
  expect(run.mock.calls[0][1]).toEqual(expect.arrayContaining(['--duration', '1.5']));
});
it('refuses photo deletion without confirmation before calling idb', async () => {
  await expect(idbLibraryTool({ operation: 'photos-clear' })).rejects.toThrow('confirm');
  expect(run).not.toHaveBeenCalled();
});
it('caps notifications and reports the remaining count', async () => {
  run.mockResolvedValue({ code: 0, stdout: '{"identifier":"a"}\n{"identifier":"b"}', stderr: '' });
  const response = await idbLibraryTool({
    operation: 'notification-list',
    bundleId: 'example.app',
    limit: 1,
  });
  expect(JSON.parse(response.content[0].text)).toMatchObject({ total: 2, remaining: 1 });
});
it('rejects marker substrings shared by untyped nodes', () => {
  const element = { AXUniqueId: 'toggle', AXLabel: 'Wi-Fi' };
  expect(
    uniqueMarker(element, [element, { AXUniqueId: 'toggle-extra', AXLabel: 'Wi-Fi extra' }])
  ).toBeUndefined();
});
it('numeric AXValue satisfies an expected-value guard', async () => {
  const element = axElement({
    type: 'Switch',
    label: 'Wi-Fi',
    identifier: 'wifi',
    x: 10,
    y: 10,
    width: 50,
    height: 30,
  });
  run.mockResolvedValueOnce({
    code: 0,
    stdout: JSON.stringify([{ ...element, AXValue: 1 }]),
    stderr: '',
  });
  const response = await idbSemanticActionTool({ operation: 'press', query: 'wifi', expect: '1' });
  expect(response.isError).toBe(false);
  expect(run.mock.calls[1][1]).toContain('--match-key');
});
it('refuses mismatched expected values without sending a press', async () => {
  run.mockResolvedValueOnce({
    code: 0,
    stdout: JSON.stringify([
      axElement({
        type: 'Switch',
        label: 'Wi-Fi',
        identifier: 'wifi',
        value: '0',
        x: 10,
        y: 10,
        width: 50,
        height: 30,
      }),
    ]),
    stderr: '',
  });
  const response = await idbSemanticActionTool({ operation: 'press', query: 'wifi', expect: '1' });
  expect(response.isError).toBe(true);
  expect(run).toHaveBeenCalledTimes(1);
});

it.each([simctlEraseTool, simctlDeleteTool, simctlUninstallTool])(
  'requires explicit consent for destructive operations',
  async tool => {
    await expect(tool({})).rejects.toThrow('confirm');
    expect(run).not.toHaveBeenCalled();
  }
);
it('fails when a field value does not stick', async () => {
  const node = axElement({
    type: 'TextField',
    identifier: 'search',
    value: 'old',
    x: 1,
    y: 1,
    width: 100,
    height: 40,
  });
  run.mockImplementation(async (_binary, args) => ({
    code: 0,
    stdout: args.includes('describe-all') ? JSON.stringify([node]) : '',
    stderr: '',
  }));
  const response = await idbSemanticActionTool({
    operation: 'set-value',
    query: 'search',
    value: 'Zürich',
  });
  expect(response.isError).toBe(true);
  expect(response.content[0].text).toContain('did not stick');
});
it.each([
  ['power', 'LOCK'],
  ['side', 'SIDE_BUTTON'],
  ['apple-pay', 'APPLE_PAY'],
  ['volume-up', 'VOLUME_UP'],
  ['volume-down', 'VOLUME_DOWN'],
])('maps hardware alias %s', async (key, button) => {
  await idbUiInputTool({ operation: 'key', key });
  expect(run.mock.calls[0][1]).toEqual(expect.arrayContaining(['button', button]));
});
it('passes drag labels as separate arguments without shell interpretation', async () => {
  await idbUiGestureTool({ operation: 'drag', source: 'Row 1', destination: 'Row 4' });
  expect(run.mock.calls[0][1]).toEqual(expect.arrayContaining(['drag-and-drop', 'Row 1', 'Row 4']));
});
it('rejects invalid scroll counts before sending any events', async () => {
  await expect(
    idbUiGestureTool({ operation: 'scroll', direction: 'down', amount: -1 })
  ).rejects.toThrow('amount');
  expect(run).not.toHaveBeenCalled();
});

it('does not verify a label-only field using another field with the requested value', async () => {
  const target = {
    type: 'TextField',
    AXLabel: 'Search',
    AXValue: 'old',
    frame: { x: 1, y: 1, width: 100, height: 40 },
  };
  const other = { ...target, AXLabel: 'Other', AXValue: 'new' };
  run.mockImplementation(async (_binary, args) => ({
    code: 0,
    stdout: args.includes('describe-all') ? JSON.stringify([target, other]) : '',
    stderr: '',
  }));
  const result = await idbSemanticActionTool({
    operation: 'set-value',
    query: 'Search',
    value: 'new',
  });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('did not stick');
});
