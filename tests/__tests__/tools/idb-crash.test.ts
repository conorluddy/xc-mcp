/**
 * Crash tools, pinned to real `idb crash` output.
 *
 * Two formats matter here and neither is obvious:
 *  - `idb crash list` emits one JSON object per line (NDJSON).
 *  - `idb crash show` emits an `.ips`: TWO concatenated JSON documents, a single-line header
 *    followed by a pretty-printed body. Neither JSON.parse on the whole text nor parseFlexibleJson
 *    handles that, so summarizeCrashReport splits on the first newline.
 *
 * Fixtures are trimmed from a live capture (idb-companion 1.5.7, Xcode 27).
 */
import {
  idbCrashListTool,
  idbCrashShowTool,
  idbCrashDeleteTool,
  summarizeCrashReport,
} from '../../../src/tools/idb/crash.js';
import { executeCommand } from '../../../src/utils/command.js';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';

jest.mock('../../../src/utils/command.js');
jest.mock('../../../src/state/idb-target-cache.js');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockIDBTargetCache = IDBTargetCache as jest.Mocked<typeof IDBTargetCache>;

const UDID = 'test-udid-123';

/** Real shape: one JSON object per line, newest NOT guaranteed first. */
const CRASH_LIST_OUTPUT = [
  '{"name": ".MyApp-2026-09-12-104512.ips", "bundle_id": "com.example.MyApp", "process_name": "MyApp", "parent_process_name": "launchd_sim", "process_identifier": 19592, "timestamp": 1757671512}',
  '{"name": ".Widget-2025-11-11-222218.ips", "bundle_id": "", "process_name": "Widget", "parent_process_name": "launchd_sim", "process_identifier": 58635, "timestamp": 1762899733}',
  '{"name": ".MyApp-2026-01-02-090000.ips", "bundle_id": "com.example.MyApp", "process_name": "MyApp", "parent_process_name": "launchd_sim", "process_identifier": 12345, "timestamp": 1735808400}',
].join('\n');

/** Real shape: header line, then the body document. */
const CRASH_REPORT = [
  JSON.stringify({
    app_name: 'MyApp',
    timestamp: '2026-09-12 10:45:12.00 +0000',
    app_version: '1.0',
    bundleID: 'com.example.MyApp',
    bug_type: '309',
    os_version: 'iPhone OS 27.0 (25B5062e)',
    name: 'MyApp',
    incident_id: '84AB8F28-449C-4AFD-AE4D-2B5B021E5BFA',
  }),
  JSON.stringify(
    {
      procName: 'MyApp',
      captureTime: '2026-09-12 10:45:12.2984 +0000',
      faultingThread: 0,
      exception: { type: 'EXC_BREAKPOINT', signal: 'SIGTRAP', codes: '0x0000000000000001' },
      termination: { indicator: 'Trace/BPT trap: 5', namespace: 'SIGNAL', code: 5 },
      threads: [
        {
          triggered: true,
          id: 1,
          frames: [
            {
              imageOffset: 171856,
              symbol: 'MyApp.ViewModel.load()',
              symbolLocation: 876,
              imageIndex: 0,
            },
            {
              imageOffset: 12128,
              symbol: 'MyApp.HomeView.body.getter',
              symbolLocation: 212,
              imageIndex: 0,
            },
            { imageOffset: 11000, imageIndex: 1 },
          ],
        },
      ],
      usedImages: [
        { name: 'MyApp', arch: 'arm64' },
        { name: 'SwiftUI', arch: 'arm64' },
      ],
    },
    null,
    2
  ),
].join('\n');

beforeEach(() => {
  jest.clearAllMocks();

  const target = { udid: UDID, name: 'iPhone 17 Pro', type: 'simulator', state: 'Booted' };
  mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue(target);
  mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue(target);
  mockIDBTargetCache.recordSuccess = jest.fn();
});

const ok = (stdout: string) =>
  mockExecuteCommand.mockResolvedValue({ code: 0, stdout, stderr: '' } as any);

const textOf = (result: any) => JSON.parse(result.content[0].text);

describe('idb-crash-list', () => {
  it('parses NDJSON rows and sorts newest first', async () => {
    ok(CRASH_LIST_OUTPUT);

    const response = textOf(await idbCrashListTool({ udid: UDID }));

    expect(response.crashCount).toBe(3);
    expect(response.crashes[0].name).toBe('.Widget-2025-11-11-222218.ips'); // highest timestamp
    expect(response.crashes[0].occurredAt).toBe(new Date(1762899733 * 1000).toISOString());
  });

  it('normalizes an empty bundle_id to undefined rather than an empty string', async () => {
    ok(CRASH_LIST_OUTPUT);

    const response = textOf(await idbCrashListTool({ udid: UDID }));
    const widget = response.crashes.find((c: any) => c.processName === 'Widget');

    expect(widget.bundleId).toBeUndefined();
  });

  it('passes bundle and time filters through to idb', async () => {
    ok(CRASH_LIST_OUTPUT);

    await idbCrashListTool({ udid: UDID, bundleId: 'com.example.MyApp', since: 1757671000 });

    const command = mockExecuteCommand.mock.calls[0][0];
    expect(command).toContain('--bundle-id');
    expect(command).toContain('com.example.MyApp');
    expect(command).toContain('--since 1757671000');
  });

  it('applies limit while still reporting how many matched', async () => {
    ok(CRASH_LIST_OUTPUT);

    const response = textOf(await idbCrashListTool({ udid: UDID, limit: 1 }));

    expect(response.crashCount).toBe(1);
    expect(response.totalMatched).toBe(3);
  });

  it('warns that an unfiltered list is mostly unrelated system noise', async () => {
    ok(CRASH_LIST_OUTPUT);

    const response = textOf(await idbCrashListTool({ udid: UDID }));

    expect(response.guidance.join('\n')).toContain('Unfiltered');
  });

  it('treats no matches as a clear negative answer, not an error', async () => {
    ok('');

    const response = textOf(await idbCrashListTool({ udid: UDID, bundleId: 'com.example.MyApp' }));

    expect(response.success).toBe(true);
    expect(response.crashCount).toBe(0);
    expect(response.guidance.join('\n')).toContain('did not crash');
  });

  it('returns structuredContent matching the declared outputSchema', async () => {
    ok(CRASH_LIST_OUTPUT);

    const result: any = await idbCrashListTool({ udid: UDID });

    expect(result.structuredContent.success).toBe(true);
    expect(result.structuredContent.crashCount).toBe(3);
    expect(Array.isArray(result.structuredContent.crashes)).toBe(true);
  });

  it('rejects a millisecond timestamp, which would silently match nothing', async () => {
    ok(CRASH_LIST_OUTPUT);

    await expect(idbCrashListTool({ udid: UDID, since: Date.now() })).rejects.toThrow(
      /milliseconds/
    );
  });

  it('surfaces an idb failure without throwing', async () => {
    mockExecuteCommand.mockResolvedValue({ code: 1, stdout: '', stderr: 'no such target' } as any);

    const result: any = await idbCrashListTool({ udid: UDID });

    expect(result.isError).toBe(true);
    expect(textOf(result).error).toContain('no such target');
  });
});

describe('summarizeCrashReport', () => {
  it('parses the two concatenated JSON documents of an .ips', () => {
    const summary = summarizeCrashReport(CRASH_REPORT);

    expect(summary.appName).toBe('MyApp');
    expect(summary.bundleId).toBe('com.example.MyApp');
    expect(summary.exceptionType).toBe('EXC_BREAKPOINT');
    expect(summary.signal).toBe('SIGTRAP');
    expect(summary.terminationReason).toBe('Trace/BPT trap: 5');
    expect(summary.parseError).toBeUndefined();
  });

  it('renders symbolicated frames with their image', () => {
    const summary = summarizeCrashReport(CRASH_REPORT);

    expect(summary.topFrames?.[0]).toBe('MyApp.ViewModel.load() + 876 — MyApp');
  });

  it('falls back to image+offset for unsymbolicated frames', () => {
    const summary = summarizeCrashReport(CRASH_REPORT);

    expect(summary.topFrames?.[2]).toBe('SwiftUI + 11000');
  });

  it('degrades to header-only rather than failing when the body is unparseable', () => {
    const header = CRASH_REPORT.split('\n')[0];
    const summary = summarizeCrashReport(`${header}\nnot json at all`);

    expect(summary.appName).toBe('MyApp');
    expect(summary.parseError).toContain('body');
  });

  it('reports a parse error for text with no header/body split', () => {
    expect(summarizeCrashReport('{"app_name":"MyApp"}').parseError).toContain('header/body split');
  });
});

describe('idb-crash-show', () => {
  it('returns a summary plus a resource link, not the whole report', async () => {
    ok(CRASH_REPORT);

    const result: any = await idbCrashShowTool({
      udid: UDID,
      name: '.MyApp-2026-09-12-104512.ips',
    });
    const response = textOf(result);

    expect(response.summary.exceptionType).toBe('EXC_BREAKPOINT');
    expect(response.crashId).toBeDefined();
    expect(result.content[1].type).toBe('resource_link');
    expect(result.content[1].uri).toBe(`xcmcp://response/${response.crashId}`);
    // The point of the tool: the payload must be much smaller than the raw report.
    expect(result.content[0].text.length).toBeLessThan(CRASH_REPORT.length);
  });

  it('requires a crash name', async () => {
    await expect(idbCrashShowTool({ udid: UDID, name: '' })).rejects.toThrow(/name is required/);
  });
});

describe('idb-crash-delete', () => {
  it('deletes one report by name', async () => {
    ok('');

    await idbCrashDeleteTool({ udid: UDID, name: '.MyApp-2026-09-12-104512.ips' });

    expect(mockExecuteCommand.mock.calls[0][0]).toContain('idb crash delete');
  });

  it('deletes by bundle id', async () => {
    ok('');

    await idbCrashDeleteTool({ udid: UDID, bundleId: 'com.example.MyApp' });

    expect(mockExecuteCommand.mock.calls[0][0]).toContain('--bundle-id');
  });

  it('refuses an ambiguous selector rather than guessing at an irreversible delete', async () => {
    await expect(
      idbCrashDeleteTool({ udid: UDID, name: '.MyApp.ips', bundleId: 'com.example.MyApp' })
    ).rejects.toThrow(/exactly one/);
  });

  it('refuses when no selector is given', async () => {
    await expect(idbCrashDeleteTool({ udid: UDID })).rejects.toThrow(/exactly one/);
  });
});
