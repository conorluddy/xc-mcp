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
