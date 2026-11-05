import { gunzipSync } from 'zlib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

jest.mock('child_process');

import {
  hangStartTool,
  hangStopTool,
  hangGetDetailsTool,
  hangListTool,
} from '../../../src/tools/diagnostics/hang/tools.js';
import { getSessionDir } from '../../../src/tools/diagnostics/hang/sessions.js';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

const HANG_LINES = [
  '2026-06-13 14:30:52.123456-0800 0x1234ab INFO 0x5678cd 1001 42 SpringBoard: Hang detected: main thread hung for 3500 ms in [AppDelegate applicationDidBecomeActive:]',
  '2026-06-13 14:30:55.000000-0800 0xdeadbe INFO 0xfeedca 2002 1 SpringBoard: Hang detected: main thread hung for 2800 ms in [AppDelegate applicationDidBecomeActive:]',
  '2026-06-13 14:31:00.000000-0800 0xabcd12 INFO 0x3456ef 3003 7 backboardd: Hang detected by RunningBoard: main thread unresponsive for 600 ms',
].join('\n');

describe('HangBuster tools', () => {
  let tmpDir: string;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xcmcp-hang-'));
    process.env.XC_MCP_HANG_DIR = tmpDir;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSpawn.mockReturnValue({ pid: 999999, unref: jest.fn(), once: jest.fn() } as any);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    delete process.env.XC_MCP_HANG_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function parse(result: any) {
    return JSON.parse(result.content[0].text);
  }

  it('hang-start creates a running session and spawns the stream', async () => {
    const result = await hangStartTool({ udid: 'test-udid' });
    const data = parse(result);
    expect(data.success).toBe(true);
    expect(data.sessionId).toMatch(/^hang-/);
    expect(mockSpawn).toHaveBeenCalledWith(
      'xcrun',
      expect.arrayContaining(['simctl', 'spawn', 'test-udid', 'log', 'stream', '--predicate']),
      expect.objectContaining({ detached: true })
    );
  });

  it('hang-stop parses the raw log, clusters, and reports counts', async () => {
    const start = parse(await hangStartTool({ udid: 'test-udid' }));
    // Simulate captured stream output
    fs.writeFileSync(path.join(getSessionDir(start.sessionId), 'raw.log'), HANG_LINES, 'utf8');

    const stop = parse(await hangStopTool({ sessionId: start.sessionId }));
    expect(stop.success).toBe(true);
    expect(stop.totalHangs).toBe(3);
    // Two share a symbol/fingerprint, one is distinct → 2 clusters
    expect(stop.clusterCount).toBe(2);
    expect(typeof stop.summary).toBe('string');
  });

  it('hang-get-details returns L2 and cluster detail', async () => {
    const start = parse(await hangStartTool({ udid: 'test-udid' }));
    fs.writeFileSync(path.join(getSessionDir(start.sessionId), 'raw.log'), HANG_LINES, 'utf8');
    await hangStopTool({ sessionId: start.sessionId });

    const l2 = parse(await hangGetDetailsTool({ sessionId: start.sessionId }));
    expect(l2.detail).toBeTruthy();

    const c1 = parse(await hangGetDetailsTool({ sessionId: start.sessionId, cluster: 1 }));
    expect(c1.cluster).toBe(1);
    expect(c1.detail).toBeTruthy();
  });

  it('hang-list returns the created sessions', async () => {
    await hangStartTool({ udid: 'test-udid' });
    const list = parse(await hangListTool());
    expect(list.count).toBeGreaterThanOrEqual(1);
    expect(list.sessions[0].sessionId).toMatch(/^hang-/);
  });

  it('hang-stop on an unknown session throws', async () => {
    await expect(hangStopTool({ sessionId: 'hang-nope' })).rejects.toThrow();
  });
  it('raw capture writes a readable gzip artifact without clustering', async () => {
    const start = parse(await hangStartTool({ udid: 'test-udid', rawCapture: true }));
    const raw = '{"eventMessage":"unfiltered record"}\n';
    fs.writeFileSync(path.join(getSessionDir(start.sessionId), 'raw.log'), raw);
    const stop = parse(await hangStopTool({ sessionId: start.sessionId }));
    expect(stop.mode).toBe('raw');
    expect(gunzipSync(fs.readFileSync(stop.rawPath)).toString()).toBe(raw);
    expect(fs.existsSync(path.join(getSessionDir(start.sessionId), 'summary.json'))).toBe(false);
    expect(parse(await hangGetDetailsTool({ sessionId: start.sessionId })).rawPath).toBe(
      stop.rawPath
    );
  });
  it('bounds stream restarts and marks repeated failures crashed', async () => {
    jest.useFakeTimers();
    try {
      const { EventEmitter } = await import('events');
      const { readMeta } = await import('../../../src/tools/diagnostics/hang/sessions.js');
      const children: InstanceType<typeof EventEmitter>[] = [];
      mockSpawn.mockImplementation(() => {
        const child = Object.assign(new EventEmitter(), { pid: 999999, unref: jest.fn() });
        children.push(child);
        return child as any;
      });
      const start = parse(await hangStartTool({ udid: 'test-udid' }));
      for (let i = 0; i < 4; i++) {
        children[i].emit('close', 1);
        jest.advanceTimersByTime(250);
      }
      expect(children).toHaveLength(4);
      expect(readMeta(start.sessionId)?.status).toBe('crashed');
    } finally {
      jest.useRealTimers();
    }
  });
});
