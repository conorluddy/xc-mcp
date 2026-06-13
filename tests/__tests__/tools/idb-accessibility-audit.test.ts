import { accessibilityAuditTool } from '../../../src/tools/idb/accessibility-audit.js';
import { executeCommand } from '../../../src/utils/command.js';

jest.mock('../../../src/utils/command.js');
jest.mock('../../../src/utils/idb-device-detection.js', () => ({
  resolveIdbUdid: jest.fn(async (udid?: string) => udid || 'test-udid-123'),
  validateTargetBooted: jest.fn(async (udid: string) => ({
    udid,
    name: 'iPhone 16 Pro',
    type: 'simulator',
    state: 'Booted',
  })),
}));
jest.mock('../../../src/state/idb-target-cache.js', () => ({
  IDBTargetCache: { recordSuccess: jest.fn() },
}));

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

function tree(lines: object[]): string {
  return lines.map(l => JSON.stringify(l)).join('\n');
}

describe('accessibility-audit', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('flags a button with no label as a critical missing_label issue', async () => {
    mockExecuteCommand.mockResolvedValueOnce({
      code: 0,
      stdout: tree([{ type: 'Button', frame: '{{0, 0}, {100, 50}}', traits: ['button'] }]),
      stderr: '',
    });

    const result = await accessibilityAuditTool({ udid: 'test-udid-123', verbose: true });
    const data = JSON.parse((result.content[0] as any).text);

    expect(result.structuredContent).toBeDefined();
    expect((result.structuredContent as any).critical).toBeGreaterThanOrEqual(1);
    const rules = data.issues.map((i: any) => i.rule);
    expect(rules).toContain('missing_label');
  });

  it('flags a small but labelled+trait button as small_touch_target (parity improvement)', async () => {
    mockExecuteCommand.mockResolvedValueOnce({
      code: 0,
      stdout: tree([
        { type: 'Button', AXLabel: 'Tiny', traits: ['button'], frame: '{{0, 0}, {30, 30}}' },
      ]),
      stderr: '',
    });

    const result = await accessibilityAuditTool({ udid: 'test-udid-123', verbose: true });
    const data = JSON.parse((result.content[0] as any).text);

    const rules = data.issues.map((i: any) => i.rule);
    expect(rules).toContain('small_touch_target');
    expect((result.structuredContent as any).warning).toBeGreaterThanOrEqual(1);
  });

  it('returns severity counts and a clean tree yields no critical issues', async () => {
    mockExecuteCommand.mockResolvedValueOnce({
      code: 0,
      stdout: tree([
        {
          type: 'Button',
          AXLabel: 'Login',
          AXUniqueId: 'login-btn',
          traits: ['button'],
          frame: '{{0, 0}, {120, 50}}',
        },
      ]),
      stderr: '',
    });

    const result = await accessibilityAuditTool({ udid: 'test-udid-123' });
    const sc = result.structuredContent as any;
    expect(sc.critical).toBe(0);
    expect(typeof sc.total).toBe('number');
    expect(result.isError).toBe(false);
  });
});
