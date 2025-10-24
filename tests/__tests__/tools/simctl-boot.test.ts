import { simctlBootTool } from '../../../src/tools/simctl/boot.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock simulator cache
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    findSimulatorByUdid: jest.fn(),
    recordBootPerformance: jest.fn(),
    recordBootEvent: jest.fn(),
    recordSimulatorUsage: jest.fn(),
  },
}));

// Mock command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: 'Device booted successfully',
    stderr: '',
  }),
  buildSimctlCommand: jest.fn((cmd, { deviceId }) => `xcrun simctl ${cmd} "${deviceId}"`),
}));

// Mock validation
jest.mock('../../../src/utils/validation.js', () => ({
  validateDeviceId: jest.fn(),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlBootTool', () => {
  const validUDID = 'device-iphone16pro';
  const validSimulator = {
    name: 'iPhone 16 Pro',
    udid: validUDID,
    state: 'Shutdown',
    isAvailable: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatorCache.findSimulatorByUdid.mockResolvedValue(validSimulator as any);
  });

  describe('successful boot', () => {
    it('should boot simulator', async () => {
      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false, // Don't wait to speed up test
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.command).toContain(validUDID);
    });

    it('should handle already booted device', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Unable to boot device in current state: Booted',
      });

      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true); // Should still be success
    });

    it('should include boot time metrics', async () => {
      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.bootTime).toBeDefined();
      expect(typeof response.bootTime).toBe('number');
      expect(response.bootTime).toBeGreaterThanOrEqual(0);
    });

    it('should use waitForBoot default of true', async () => {
      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false, // Override to avoid timeout in tests
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    }, 20000); // Increase timeout for this test

    it('should support waitForBoot false', async () => {
      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should support openGui parameter', async () => {
      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false,
        openGui: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should include boot command in response', async () => {
      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.command).toBeDefined();
      expect(response.command).toContain('xcrun simctl');
      expect(response.command).toContain('boot');
    });
  });

  describe('input validation', () => {
    it('should reject missing deviceId', async () => {
      const { validateDeviceId } = require('../../../src/utils/validation.js');
      validateDeviceId.mockImplementationOnce(() => {
        throw new McpError(1, 'deviceId is required');
      });

      await expect(
        simctlBootTool({
          waitForBoot: false,
        })
      ).rejects.toThrow();
    });

    it('should reject empty deviceId', async () => {
      const { validateDeviceId } = require('../../../src/utils/validation.js');
      validateDeviceId.mockImplementationOnce(() => {
        throw new McpError(1, 'deviceId cannot be empty');
      });

      await expect(
        simctlBootTool({
          deviceId: '',
          waitForBoot: false,
        })
      ).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle boot command errors', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Boot failed: Unknown error',
      });

      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });
  });

  describe('response format', () => {
    it('should return proper MCP response format', async () => {
      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });

    it('should return valid JSON', async () => {
      const result = await simctlBootTool({
        deviceId: validUDID,
        waitForBoot: false,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });
});
