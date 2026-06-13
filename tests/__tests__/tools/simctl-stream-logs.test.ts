import { streamLogsTool } from '../../../src/tools/simctl/stream-logs.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: `2025-01-23 12:00:00.123 [MyApp] Application launched
2025-01-23 12:00:01.456 [MyApp] Login screen displayed
2025-01-23 12:00:02.789 [SystemLog] System event occurred`,
    stderr: '',
  }),
}));

describe('streamLogsTool', () => {
  const validUDID = 'device-iphone16pro';
  const validBundleID = 'com.example.MyApp';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful log streaming', () => {
    it('should stream logs from simulator', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.logs).toBeDefined();
      expect(response.logs.count).toBeGreaterThan(0);
    });

    it('should filter logs by bundle ID', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        bundleId: validBundleID,
        duration: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.logs.bundleId).toBe(validBundleID);
      expect(response.logs.predicate).toBe(`process == "${validBundleID}"`);
    });

    it('should use custom predicate when provided', async () => {
      const customPredicate = 'subsystem == "com.example" AND category == "network"';
      const result = await streamLogsTool({
        udid: validUDID,
        predicate: customPredicate,
        duration: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.logs.predicate).toBe(customPredicate);
    });

    it('should return log items with parsed data', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.logs.items).toBeDefined();
      expect(Array.isArray(response.logs.items)).toBe(true);
      expect(response.logs.items.length).toBeGreaterThan(0);

      const firstLog = response.logs.items[0];
      expect(firstLog).toHaveProperty('timestamp');
      expect(firstLog).toHaveProperty('process');
      expect(firstLog).toHaveProperty('message');
    });

    it('should limit returned logs to 100 items', async () => {
      // Mock many log lines
      const manyLogs = Array.from(
        { length: 200 },
        (_, i) => `2025-01-23 12:00:${String(i).padStart(2, '0')}.000 [MyApp] Log ${i}`
      ).join('\n');

      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: manyLogs,
        stderr: '',
      });

      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.logs.count).toBe(200);
      expect(response.logs.items.length).toBe(100);
    });

    it('should provide guidance for log streaming', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        bundleId: validBundleID,
        duration: 10,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);
    });

    it('should use default duration of 10 seconds', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.logs.duration).toBe(10);
    });

    it('should use custom duration when provided', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        duration: 30,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.logs.duration).toBe(30);
    });

    it('should default to "true" predicate when no filter specified', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.logs.predicate).toBe('true');
    });
  });

  describe('severity classification', () => {
    const makeMockLines = (lines: string[]) => ({
      code: 0,
      stdout: lines.join('\n'),
      stderr: '',
    });

    it('should classify error lines correctly', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce(
        makeMockLines([
          '2025-01-23 12:00:00.000 [App] Network error occurred',
          '2025-01-23 12:00:01.000 [App] Request failed with status 500',
          '2025-01-23 12:00:02.000 [App] Normal debug message',
        ])
      );

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.statistics.errors).toBe(2);
      expect(response.statistics.debug).toBe(1);
    });

    it('should classify warning lines correctly', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce(
        makeMockLines([
          '2025-01-23 12:00:00.000 [App] deprecated API used',
          '2025-01-23 12:00:01.000 [App] warning: low memory',
          '2025-01-23 12:00:02.000 [App] plain log',
        ])
      );

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.statistics.warnings).toBe(2);
    });

    it('should classify info lines correctly', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce(
        makeMockLines([
          '2025-01-23 12:00:00.000 [App] info: app started',
          '2025-01-23 12:00:01.000 [App] notice from subsystem',
        ])
      );

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.statistics.info).toBe(2);
    });

    it('should include severity field on each log item', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce(
        makeMockLines(['2025-01-23 12:00:00.000 [App] an error happened'])
      );

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.logs.items[0]).toHaveProperty('severity', 'error');
    });

    it('should return statistics with all four severity counts', async () => {
      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.statistics).toHaveProperty('totalLines');
      expect(response.statistics).toHaveProperty('errors');
      expect(response.statistics).toHaveProperty('warnings');
      expect(response.statistics).toHaveProperty('info');
      expect(response.statistics).toHaveProperty('debug');
    });
  });

  describe('severity filtering param', () => {
    const makeMock = (lines: string[]) => ({
      code: 0,
      stdout: lines.join('\n'),
      stderr: '',
    });

    it('should filter items to only requested severities (string)', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce(
        makeMock([
          '2025-01-23 12:00:00.000 [App] error in module',
          '2025-01-23 12:00:01.000 [App] warning low disk',
          '2025-01-23 12:00:02.000 [App] plain debug message',
        ])
      );

      const result = await streamLogsTool({ udid: validUDID, duration: 5, severity: 'error' });
      const response = JSON.parse(result.content[0].text);

      // items should only contain error-severity lines
      expect(response.logs.items.every((i: any) => i.severity === 'error')).toBe(true);
      expect(response.logs.count).toBe(1);
      // but statistics should still count all lines
      expect(response.statistics.totalLines).toBe(3);
    });

    it('should accept severity as array', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce(
        makeMock([
          '2025-01-23 12:00:00.000 [App] error occurred',
          '2025-01-23 12:00:01.000 [App] warning issued',
          '2025-01-23 12:00:02.000 [App] plain debug',
        ])
      );

      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
        severity: ['error', 'warning'],
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.logs.count).toBe(2);
      expect(response.statistics.totalLines).toBe(3);
    });

    it('should include severityFilter in response', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
        severity: 'error,warning',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.logs.severityFilter).toEqual(['error', 'warning']);
    });

    it('should default to all severities when not specified', async () => {
      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.logs.severityFilter).toEqual(['error', 'warning', 'info', 'debug']);
    });
  });

  describe('deduplication', () => {
    it('should deduplicate repeated error lines in topErrors', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: [
          '2025-01-23 12:00:00.000 [123] Connection error timeout',
          '2025-01-23 12:00:01.000 [456] Connection error timeout',
          '2025-01-23 12:00:02.000 [789] Connection error timeout',
        ].join('\n'),
        stderr: '',
      });

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      // Three identical (after stripping) error lines should collapse to one dedup entry
      expect(response.topErrors.length).toBe(1);
      expect(response.topErrors[0].count).toBe(3);
    });

    it('should deduplicate repeated warning lines in topWarnings', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: [
          '2025-01-23 12:00:00.000 [111] deprecated method called',
          '2025-01-23 12:00:01.000 [222] deprecated method called',
        ].join('\n'),
        stderr: '',
      });

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.topWarnings.length).toBe(1);
      expect(response.topWarnings[0].count).toBe(2);
    });

    it('should cap topErrors and topWarnings at 15 entries each', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      const lines = Array.from(
        { length: 30 },
        (_, i) =>
          `2025-01-23 12:00:${String(i).padStart(2, '0')}.000 [App] Unique error number ${i}`
      );
      executeCommand.mockResolvedValueOnce({ code: 0, stdout: lines.join('\n'), stderr: '' });

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.topErrors.length).toBeLessThanOrEqual(15);
    });

    it('should include message and count on each deduped entry', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '2025-01-23 12:00:00.000 [App] network error',
        stderr: '',
      });

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.topErrors[0]).toHaveProperty('message');
      expect(response.topErrors[0]).toHaveProperty('count');
      expect(response.topErrors[0].count).toBe(1);
    });
  });

  describe('statistics summary', () => {
    it('should return statistics object', async () => {
      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(response.statistics).toBeDefined();
      expect(typeof response.statistics.totalLines).toBe('number');
      expect(typeof response.statistics.errors).toBe('number');
      expect(typeof response.statistics.warnings).toBe('number');
      expect(typeof response.statistics.info).toBe('number');
      expect(typeof response.statistics.debug).toBe('number');
    });

    it('should return topErrors and topWarnings arrays', async () => {
      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(Array.isArray(response.topErrors)).toBe(true);
      expect(Array.isArray(response.topWarnings)).toBe(true);
    });

    it('should return sampleTail with up to 20 raw lines', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i}`);
      executeCommand.mockResolvedValueOnce({ code: 0, stdout: lines.join('\n'), stderr: '' });

      const result = await streamLogsTool({ udid: validUDID, duration: 5 });
      const response = JSON.parse(result.content[0].text);

      expect(Array.isArray(response.sampleTail)).toBe(true);
      expect(response.sampleTail.length).toBeLessThanOrEqual(20);
    });

    it('should count totalLines from all lines regardless of severity filter', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: [
          '2025-01-23 12:00:00.000 [App] error one',
          '2025-01-23 12:00:01.000 [App] plain debug',
          '2025-01-23 12:00:02.000 [App] another debug',
        ].join('\n'),
        stderr: '',
      });

      const result = await streamLogsTool({ udid: validUDID, duration: 5, severity: 'error' });
      const response = JSON.parse(result.content[0].text);

      expect(response.statistics.totalLines).toBe(3);
      expect(response.logs.count).toBe(1); // only error shown in items
    });
  });

  describe('input validation', () => {
    it('should reject missing UDID', async () => {
      await expect(
        streamLogsTool({
          duration: 5,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty UDID', async () => {
      await expect(
        streamLogsTool({
          udid: '',
          duration: 5,
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('error handling', () => {
    it('should handle command execution errors', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Command failed'));

      await expect(
        streamLogsTool({
          udid: validUDID,
          duration: 5,
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle empty log output', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.logs.count).toBe(0);
      expect(response.logs.items).toEqual([]);
    });
  });

  describe('response format', () => {
    it('should return proper MCP response format', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });

    it('should return valid JSON in text content', async () => {
      const result = await streamLogsTool({
        udid: validUDID,
        duration: 5,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });
});
