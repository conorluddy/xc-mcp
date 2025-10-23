import { simctlStatusBarTool } from '../../../src/tools/simctl/status-bar.js';
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

describe('simctlStatusBarTool', () => {
  const validUDID = 'device-iphone16pro';
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

  describe('successful status bar modification', () => {
    it('should override status bar appearance', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('override');
    });

    it('should clear status bar override', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'clear',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('clear');
    });

    it('should return simulator information', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
    });

    it('should provide guidance', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });
  });

  describe('supported operations', () => {
    it('should support override operation', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
        dataNetwork: '4g',
        wifiMode: 'active',
        batteryState: 'charged',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.operation).toBe('override');
    });

    it('should support clear operation', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'clear',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.operation).toBe('clear');
    });
  });

  describe('override parameters', () => {
    it('should accept time parameter', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '15:30',
      });

      expect(result.isError).toBe(false);
    });

    it('should accept dataNetwork parameter', async () => {
      const networks = ['none', '1x', '3g', '4g', '5g', 'lte', 'lte-a'];
      for (const network of networks) {
        const result = await simctlStatusBarTool({
          udid: validUDID,
          operation: 'override',
          dataNetwork: network,
        });
        expect(result.isError).toBe(false);
      }
    });

    it('should accept wifiMode parameter', async () => {
      const modes = ['active', 'searching', 'failed'];
      for (const mode of modes) {
        const result = await simctlStatusBarTool({
          udid: validUDID,
          operation: 'override',
          wifiMode: mode,
        });
        expect(result.isError).toBe(false);
      }
    });

    it('should accept batteryState parameter', async () => {
      const states = ['charged', 'charging', 'discharging'];
      for (const state of states) {
        const result = await simctlStatusBarTool({
          udid: validUDID,
          operation: 'override',
          batteryState: state,
        });
        expect(result.isError).toBe(false);
      }
    });

    it('should accept batteryLevel parameter', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        batteryLevel: 50,
      });

      expect(result.isError).toBe(false);
    });

    it('should accept all parameters together', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '12:00',
        dataNetwork: '4g',
        wifiMode: 'active',
        batteryState: 'charging',
        batteryLevel: 75,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlStatusBarTool({
          udid: '',
          operation: 'override',
          time: '9:41',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject invalid operation', async () => {
      await expect(
        simctlStatusBarTool({
          udid: validUDID,
          operation: 'invalid',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject invalid time format', async () => {
      await expect(
        simctlStatusBarTool({
          udid: validUDID,
          operation: 'override',
          time: 'invalid',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject invalid data network', async () => {
      await expect(
        simctlStatusBarTool({
          udid: validUDID,
          operation: 'override',
          dataNetwork: 'invalid',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject invalid battery level', async () => {
      await expect(
        simctlStatusBarTool({
          udid: validUDID,
          operation: 'override',
          batteryLevel: 150,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlStatusBarTool({
          udid: 'invalid-udid',
          operation: 'override',
          time: '9:41',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle whitespace-only UDID', async () => {
      await expect(
        simctlStatusBarTool({
          udid: '   ',
          operation: 'override',
          time: '9:41',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(bootedSimulator as any);

      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      expect(result.isError).toBe(false);
    });

    it('should work with shutdown simulator', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(shutdownSimulator as any);

      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      expect(result.isError).toBe(false);
    });

    it('should warn if simulator is unavailable', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(unavailableSimulator as any);

      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) => g.includes('unavailable'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle status bar modification failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Failed to modify status bar',
      });

      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Command failed'));

      await expect(
        simctlStatusBarTool({
          udid: validUDID,
          operation: 'override',
          time: '9:41',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle simulator cache error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(new Error('Cache error'));

      await expect(
        simctlStatusBarTool({
          udid: validUDID,
          operation: 'override',
          time: '9:41',
        })
      ).rejects.toThrow(McpError);
    });

    it('should provide helpful error messages', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Simulator version not supported',
      });

      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('operation');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlStatusBarTool({
          udid: 'invalid',
          operation: 'override',
          time: '9:41',
        })
      ).rejects.toThrow(McpError);
    });

    it('should be valid JSON', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });

    it('should format response correctly', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle midnight time', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '0:00',
      });

      expect(result.isError).toBe(false);
    });

    it('should handle late time', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '23:59',
      });

      expect(result.isError).toBe(false);
    });

    it('should handle zero battery level', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        batteryLevel: 0,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle full battery level', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        batteryLevel: 100,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle sequential override and clear', async () => {
      const result1 = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '9:41',
      });

      const result2 = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'clear',
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle concurrent status bar modifications', async () => {
      const result1 = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        dataNetwork: '4g',
      });

      const result2 = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        batteryLevel: 50,
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

      const result = await simctlStatusBarTool({
        udid: longUDID,
        operation: 'override',
        time: '9:41',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('practical testing scenarios', () => {
    it('should support realistic testing scenario - morning time with wifi', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '8:30',
        wifiMode: 'active',
        batteryState: 'discharging',
        batteryLevel: 85,
      });

      expect(result.isError).toBe(false);
    });

    it('should support realistic testing scenario - no signal', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        dataNetwork: 'none',
        wifiMode: 'failed',
        batteryState: 'discharging',
        batteryLevel: 20,
      });

      expect(result.isError).toBe(false);
    });

    it('should support realistic testing scenario - charging at night', async () => {
      const result = await simctlStatusBarTool({
        udid: validUDID,
        operation: 'override',
        time: '23:45',
        wifiMode: 'active',
        batteryState: 'charging',
        batteryLevel: 90,
      });

      expect(result.isError).toBe(false);
    });
  });
});
