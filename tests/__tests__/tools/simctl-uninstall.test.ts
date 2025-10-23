import { simctlUninstallTool } from '../../../src/tools/simctl/uninstall.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock the simulator cache
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    findSimulatorByUdid: jest.fn(),
    getSimulatorList: jest.fn(),
  },
}));

// Mock command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: '',
    stderr: '',
  }),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlUninstallTool', () => {
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

  describe('successful uninstallation', () => {
    it('should uninstall app from simulator', async () => {
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.udid).toBe(validUDID);
      expect(response.bundleId).toBe(validBundleID);
    });

    it('should return simulator information', async () => {
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
      expect(response.simulatorInfo.udid).toBe(validUDID);
    });

    it('should provide next steps guidance', async () => {
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);
    });

    it('should format response correctly', async () => {
      const result = await simctlUninstallTool({
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
        simctlUninstallTool({
          udid: '',
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty bundle ID', async () => {
      await expect(
        simctlUninstallTool({
          udid: validUDID,
          bundleId: '',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject invalid bundle ID format', async () => {
      await expect(
        simctlUninstallTool({
          udid: validUDID,
          bundleId: 'invalid bundle id',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlUninstallTool({
          udid: 'invalid-udid',
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle whitespace-only inputs', async () => {
      await expect(
        simctlUninstallTool({
          udid: '   ',
          bundleId: '   ',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('bundle ID variations', () => {
    it('should handle standard Apple bundle IDs', async () => {
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: 'com.apple.mobilesafari',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.bundleId).toBe('com.apple.mobilesafari');
    });

    it('should handle bundle IDs with hyphens', async () => {
      const bundleId = 'com.example.my-app';
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: bundleId,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.bundleId).toBe(bundleId);
    });

    it('should handle bundle IDs with numbers', async () => {
      const bundleId = 'com.example.app2';
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: bundleId,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.bundleId).toBe(bundleId);
    });

    it('should handle very long bundle IDs', async () => {
      const bundleId = 'com.' + 'a'.repeat(200) + '.app';
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: bundleId,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.bundleId).toBe(bundleId);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(bootedSimulator as any);

      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
    });

    it('should work with shutdown simulator', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(shutdownSimulator as any);

      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
    });

    it('should work with unavailable simulator', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(unavailableSimulator as any);

      const result = await simctlUninstallTool({
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
        stderr: 'Error: App with bundle identifier not installed',
      });

      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('not installed');
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Uninstall failed'));

      await expect(
        simctlUninstallTool({
          udid: validUDID,
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle simulator cache lookup error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(new Error('Cache error'));

      await expect(
        simctlUninstallTool({
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
        stderr: 'Unable to uninstall: permission denied',
      });

      const result = await simctlUninstallTool({
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
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('bundleId');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlUninstallTool({
          udid: 'invalid',
          bundleId: validBundleID,
        })
      ).rejects.toThrow(McpError);
    });

    it('should be valid JSON', async () => {
      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle uninstalling non-existent app gracefully', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: not found',
      });

      const result = await simctlUninstallTool({
        udid: validUDID,
        bundleId: 'com.nonexistent.app',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle concurrent uninstalls', async () => {
      const result1 = await simctlUninstallTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const result2 = await simctlUninstallTool({
        udid: validUDID,
        bundleId: 'com.example.other',
      });

      // Both should handle gracefully
      expect(result1.content).toBeDefined();
      expect(result2.content).toBeDefined();
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce({
        ...validSimulator,
        udid: longUDID,
      } as any);

      const result = await simctlUninstallTool({
        udid: longUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
    });
  });
});
