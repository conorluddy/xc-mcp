import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock executeCommand before importing the tools
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

// Dynamic imports are resolved after jest.mock hoisting
import { testRecordStepTool } from '../../../src/tools/workflows/test-record-step.js';
import { testRecordReportTool } from '../../../src/tools/workflows/test-record-report.js';
import { executeCommand } from '../../../src/utils/command.js';

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

// Small fake NDJSON accessibility tree (3 elements)
const FAKE_IDB_OUTPUT = [
  JSON.stringify({ AXLabel: 'Email', AXValue: '', type: 'TextField' }),
  JSON.stringify({ AXLabel: 'Password', AXValue: '', type: 'SecureTextField' }),
  JSON.stringify({ AXLabel: 'Login', AXValue: '', type: 'Button' }),
].join('\n');

describe('test-record-step and test-record-report', () => {
  let tmpDir: string;
  const sessionName = 'test-session-jest';

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xc-mcp-test-'));
    process.env.XC_MCP_RECORDINGS_DIR = tmpDir;
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.XC_MCP_RECORDINGS_DIR;
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockExecuteCommand.mockReset();
    // Screenshot succeeds, idb returns fake tree
    mockExecuteCommand.mockImplementation(async (cmd: string) => {
      if (cmd.includes('simctl io')) {
        return { stdout: '', stderr: '', code: 0 };
      }
      if (cmd.includes('idb ui describe-all')) {
        return { stdout: FAKE_IDB_OUTPUT, stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    });
  });

  // ── test-record-step ─────────────────────────────────────────────────────

  describe('test-record-step', () => {
    it('creates session directory on first call', async () => {
      await testRecordStepTool({ sessionName, label: 'App launched' });

      const sessionPath = path.join(tmpDir, sessionName);
      expect(fs.existsSync(sessionPath)).toBe(true);
      expect(fs.existsSync(path.join(sessionPath, 'screenshots'))).toBe(true);
      expect(fs.existsSync(path.join(sessionPath, 'accessibility'))).toBe(true);
      expect(fs.existsSync(path.join(sessionPath, 'steps.json'))).toBe(true);
    });

    it('records step 1 with index 1 and correct screenshot path', async () => {
      // Reset session for isolated sub-test by using a fresh session name
      const s = `${sessionName}-idx`;
      const result = await testRecordStepTool({ sessionName: s, label: 'App launched' });

      const response = JSON.parse(result.content[0].text);
      expect(response.stepIndex).toBe(1);
      expect(response.screenshot).toContain('001-App-launched.png');
    });

    it('records two steps with incrementing indices', async () => {
      const s = `${sessionName}-two`;
      await testRecordStepTool({ sessionName: s, label: 'Step Alpha' });
      await testRecordStepTool({ sessionName: s, label: 'Step Beta' });

      const stepsJson = JSON.parse(fs.readFileSync(path.join(tmpDir, s, 'steps.json'), 'utf-8'));

      expect(stepsJson.steps).toHaveLength(2);
      expect(stepsJson.steps[0].index).toBe(1);
      expect(stepsJson.steps[1].index).toBe(2);
      expect(stepsJson.steps[0].screenshot).toContain('001-Step-Alpha.png');
      expect(stepsJson.steps[1].screenshot).toContain('002-Step-Beta.png');
    });

    it('records accessibility element count from idb output', async () => {
      const s = `${sessionName}-acc`;
      const result = await testRecordStepTool({ sessionName: s, label: 'Login screen' });
      const response = JSON.parse(result.content[0].text);
      // FAKE_IDB_OUTPUT has 3 lines starting with '{'
      expect(response.elementCount).toBe(3);
    });

    it('tolerates idb failure and records elementCount 0', async () => {
      mockExecuteCommand.mockImplementation(async (cmd: string) => {
        if (cmd.includes('simctl io')) return { stdout: '', stderr: '', code: 0 };
        if (cmd.includes('idb ui describe-all')) throw new Error('idb not found');
        return { stdout: '', stderr: '', code: 0 };
      });

      const s = `${sessionName}-idb-fail`;
      const result = await testRecordStepTool({ sessionName: s, label: 'Home screen' });
      const response = JSON.parse(result.content[0].text);
      expect(response.elementCount).toBe(0);
    });

    it('stores assertion in step record', async () => {
      const s = `${sessionName}-assert`;
      await testRecordStepTool({
        sessionName: s,
        label: 'Logged in',
        assertion: 'Home screen visible',
      });

      const stepsJson = JSON.parse(fs.readFileSync(path.join(tmpDir, s, 'steps.json'), 'utf-8'));
      expect(stepsJson.steps[0].assertion).toBe('Home screen visible');
    });

    it('stores metadata in step record', async () => {
      const s = `${sessionName}-meta`;
      await testRecordStepTool({
        sessionName: s,
        label: 'Credentials entered',
        metadata: { user: 'test@example.com', env: 'staging' },
      });

      const stepsJson = JSON.parse(fs.readFileSync(path.join(tmpDir, s, 'steps.json'), 'utf-8'));
      expect(stepsJson.steps[0].metadata).toEqual({ user: 'test@example.com', env: 'staging' });
    });

    it('uses udid in screenshot command when provided', async () => {
      const s = `${sessionName}-udid`;
      await testRecordStepTool({ sessionName: s, label: 'With udid', udid: 'device-abc' });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('"device-abc"'),
        expect.anything()
      );
    });

    it('throws McpError on missing sessionName', async () => {
      await expect(testRecordStepTool({ label: 'No session' })).rejects.toThrow(McpError);
    });

    it('throws McpError on missing label', async () => {
      await expect(testRecordStepTool({ sessionName })).rejects.toThrow(McpError);
    });
  });

  // ── test-record-report ───────────────────────────────────────────────────

  describe('test-record-report', () => {
    const reportSession = `${sessionName}-report`;

    beforeAll(async () => {
      // Record two steps to use for report tests
      await testRecordStepTool({ sessionName: reportSession, label: 'App launched' });
      await testRecordStepTool({
        sessionName: reportSession,
        label: 'Login tapped',
        assertion: 'Login form visible',
        metadata: { component: 'LoginButton' },
      });
    });

    it('generates report.md file', async () => {
      await testRecordReportTool({ sessionName: reportSession });

      const reportPath = path.join(tmpDir, reportSession, 'report.md');
      expect(fs.existsSync(reportPath)).toBe(true);
    });

    it('returns reportPath and stepCount in response', async () => {
      const result = await testRecordReportTool({ sessionName: reportSession });
      const response = JSON.parse(result.content[0].text);

      expect(response.reportPath).toContain('report.md');
      expect(response.stepCount).toBe(2);
    });

    it('markdown contains both step labels', async () => {
      const result = await testRecordReportTool({ sessionName: reportSession });
      const response = JSON.parse(result.content[0].text);

      expect(response.markdown).toContain('App launched');
      expect(response.markdown).toContain('Login tapped');
    });

    it('markdown contains assertion text', async () => {
      const result = await testRecordReportTool({ sessionName: reportSession });
      const response = JSON.parse(result.content[0].text);

      expect(response.markdown).toContain('Login form visible');
    });

    it('markdown contains metadata bullets', async () => {
      const result = await testRecordReportTool({ sessionName: reportSession });
      const response = JSON.parse(result.content[0].text);

      expect(response.markdown).toContain('LoginButton');
    });

    it('uses testName as report title when provided', async () => {
      const result = await testRecordReportTool({
        sessionName: reportSession,
        testName: 'My Custom Test',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.testName).toBe('My Custom Test');
      expect(response.markdown).toContain('My Custom Test');
    });

    it('defaults testName to sessionName when omitted', async () => {
      const result = await testRecordReportTool({ sessionName: reportSession });
      const response = JSON.parse(result.content[0].text);

      expect(response.testName).toBe(reportSession);
    });

    it('throws McpError InvalidRequest for non-existent session', async () => {
      await expect(testRecordReportTool({ sessionName: 'does-not-exist-xyz' })).rejects.toThrow(
        McpError
      );
    });

    it('throws McpError on missing sessionName', async () => {
      await expect(testRecordReportTool({})).rejects.toThrow(McpError);
    });
  });
});
