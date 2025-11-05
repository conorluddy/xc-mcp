import { simctlLaunchTool } from '../../../src/tools/simctl/launch.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock the simulator cache
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    findSimulatorByUdid: jest.fn(),
    getSimulatorList: jest.fn(),
    recordBootEvent: jest.fn(),
  },
}));

// Mock command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: '12345',
    stderr: '',
  }),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlLaunchTool', () => {
  const validUDID = 'device-iphone16pro';
  const validBundleID = 'com.example.MyApp';
  const validSimulator = {
    name: 'iPhone 16 Pro',
    udid: validUDID,
    state: 'Booted',
    isAvailable: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatorCache.findSimulatorByUdid.mockResolvedValue(validSimulator as any);
  });

  describe('successful app launch', () => {
    it('should launch app on simulator', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.udid).toBe(validUDID);
      expect(response.bundleId).toBe(validBundleID);
    });

    it('should return process ID on success', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.processId).toBeDefined();
      expect(typeof response.processId).toBe('number');
    });

    it('should return simulator information', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
    });

    it('should provide next steps guidance', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);
    });

    it('should format response correctly', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlLaunchTool({
          udid: '',
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty bundle ID', async () => {
      await expect(
        simctlLaunchTool({
          udid: validUDID,
          bundleId: '',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject invalid bundle ID format', async () => {
      await expect(
        simctlLaunchTool({
          udid: validUDID,
          bundleId: 'invalid bundle id',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlLaunchTool({
          udid: 'invalid-udid',
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle whitespace-only inputs', async () => {
      await expect(
        simctlLaunchTool({
          udid: '   ',
          bundleId: '   ',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('launch arguments and environment', () => {
    it('should accept launch arguments', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
        arguments: ['--verbose', '--debug'],
      });

      expect(result.isError).toBe(false);
    });

    it('should accept environment variables', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
        environment: { DEBUG_MODE: '1', LOG_LEVEL: 'verbose' },
      });

      expect(result.isError).toBe(false);
    });

    it('should handle both arguments and environment', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
        arguments: ['--test'],
        environment: { TEST_ENV: '1' },
      });

      expect(result.isError).toBe(false);
    });

    it('should handle empty arguments array', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
        arguments: [],
      });

      expect(result.isError).toBe(false);
    });

    it('should handle undefined arguments', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
        arguments: undefined,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(bootedSimulator as any);

      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
    });

    it('should work with shutdown simulator', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(shutdownSimulator as any);

      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo.state).toBe('Shutdown');
    });

    it('should work with unavailable simulator', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(unavailableSimulator as any);

      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo.isAvailable).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle app not installed error', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: App not found',
      });

      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Launch failed'));

      await expect(
        simctlLaunchTool({
          udid: validUDID,
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle simulator cache error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(new Error('Cache error'));

      await expect(
        simctlLaunchTool({
          udid: validUDID,
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should provide helpful error messages', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'The app has closed unexpectedly',
      });

      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('bundleId');
      expect(response).toHaveProperty('processId');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
      expect(response).toHaveProperty('command');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlLaunchTool({
          udid: 'invalid',
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should be valid JSON', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle launch with many arguments', async () => {
      const manyArgs = Array.from({ length: 50 }, (_, i) => `--arg${i}`);
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
        arguments: manyArgs,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle launch with many environment variables', async () => {
      const manyEnv = Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [`VAR_${i}`, `value${i}`])
      );
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
        environment: manyEnv,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle arguments with special characters', async () => {
      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
        arguments: ['--path=/tmp/test/', '--value="quoted"'],
      });

      expect(result.isError).toBe(false);
    });

    it('should handle concurrent launches', async () => {
      const result1 = await simctlLaunchTool({
        udid: validUDID,
        bundleId: 'com.example.app1',
      });

      const result2 = await simctlLaunchTool({
        udid: validUDID,
        bundleId: 'com.example.app2',
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce({
        ...validSimulator,
        udid: longUDID,
      } as any);

      const result = await simctlLaunchTool({
        udid: longUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('process ID parsing', () => {
    it('should extract numeric process ID from output', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '54321',
        stderr: '',
      });

      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.processId).toBe(54321);
    });

    it('should handle whitespace in process ID output', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '  12345  \n',
        stderr: '',
      });

      const result = await simctlLaunchTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.processId).toBe(12345);
    });
  });
});
