import { simctlPushTool } from '../../../src/tools/simctl/push.js';
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

describe('simctlPushTool', () => {
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

  describe('successful push notification', () => {
    it('should send push notification to app', async () => {
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test notification"}}',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.udid).toBe(validUDID);
      expect(response.bundleId).toBe(validBundleID);
    });

    it('should return simulator information', async () => {
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
    });

    it('should provide guidance', async () => {
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });

    it('should include parsed payload in response', async () => {
      const payload = '{"aps":{"alert":"Test notification","badge":1}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.payload).toBeDefined();
    });
  });

  describe('payload handling', () => {
    it('should accept JSON string payloads', async () => {
      const jsonPayload = '{"aps":{"alert":"Test"}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: jsonPayload,
      });

      expect(result.isError).toBe(false);
    });

    it('should accept payloads with custom data', async () => {
      const payloadWithData = '{"aps":{"alert":"Test"},"custom":"data","id":123}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: payloadWithData,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle payloads with sound', async () => {
      const payloadWithSound = '{"aps":{"alert":"Test","sound":"default"}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: payloadWithSound,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle payloads with badge', async () => {
      const payloadWithBadge = '{"aps":{"alert":"Test","badge":5}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: payloadWithBadge,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle complex nested payloads', async () => {
      const complexPayload =
        '{"aps":{"alert":{"title":"Test","body":"Message"},"badge":1,"sound":"default"},"customKey":"customValue","nested":{"deep":"data"}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: complexPayload,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlPushTool({
          udid: '',
          bundleId: validBundleID,
          payload: '{"aps":{"alert":"Test"}}',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty bundle ID', async () => {
      await expect(
        simctlPushTool({
          udid: validUDID,
          bundleId: '',
          payload: '{"aps":{"alert":"Test"}}',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty payload', async () => {
      await expect(
        simctlPushTool({
          udid: validUDID,
          bundleId: validBundleID,
          payload: '',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject invalid JSON payload', async () => {
      await expect(
        simctlPushTool({
          udid: validUDID,
          bundleId: validBundleID,
          payload: 'not valid json {]',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlPushTool({
          udid: 'invalid-udid',
          bundleId: validBundleID,
          payload: '{"aps":{"alert":"Test"}}',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle whitespace-only inputs', async () => {
      await expect(
        simctlPushTool({
          udid: '   ',
          bundleId: '   ',
          payload: '   ',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(bootedSimulator as any);

      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      expect(result.isError).toBe(false);
    });

    it('should warn if simulator is shutdown', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(shutdownSimulator as any);

      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      const response = JSON.parse(result.content[0].text);
      expect(
        response.guidance.some((g: string) => g.includes('boot') || g.includes('shutdown'))
      ).toBe(true);
    });

    it('should warn if simulator is unavailable', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(unavailableSimulator as any);

      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) => g.includes('unavailable'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle push delivery failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Failed to deliver push notification',
      });

      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle app not running error', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: App not running',
      });

      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Command failed'));

      await expect(
        simctlPushTool({
          udid: validUDID,
          bundleId: validBundleID,
          payload: '{"aps":{"alert":"Test"}}',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle simulator cache error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(new Error('Cache error'));

      await expect(
        simctlPushTool({
          udid: validUDID,
          bundleId: validBundleID,
          payload: '{"aps":{"alert":"Test"}}',
        })
      ).rejects.toThrow(McpError);
    });

    it('should provide helpful error messages', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'App bundle ID not found in simulator',
      });

      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('bundleId');
      expect(response).toHaveProperty('payload');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlPushTool({
          udid: 'invalid',
          bundleId: validBundleID,
          payload: '{"aps":{"alert":"Test"}}',
        })
      ).rejects.toThrow(McpError);
    });

    it('should be valid JSON', async () => {
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });

    it('should format response correctly', async () => {
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle very large payloads', async () => {
      const largePayload = '{"aps":{"alert":"' + 'x'.repeat(10000) + '"}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: largePayload,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.payload).toBeDefined();
    });

    it('should handle payloads with unicode characters', async () => {
      const unicodePayload = '{"aps":{"alert":"🚀 Test notification 测试"}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: unicodePayload,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle concurrent push notifications', async () => {
      const result1 = await simctlPushTool({
        udid: validUDID,
        bundleId: 'com.example.app1',
        payload: '{"aps":{"alert":"Test 1"}}',
      });

      const result2 = await simctlPushTool({
        udid: validUDID,
        bundleId: 'com.example.app2',
        payload: '{"aps":{"alert":"Test 2"}}',
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle multiple push notifications in sequence', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await simctlPushTool({
          udid: validUDID,
          bundleId: validBundleID,
          payload: `{"aps":{"alert":"Test ${i}","badge":${i}}}`,
        });
        expect(result.isError).toBe(false);
      }
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce({
        ...validSimulator,
        udid: longUDID,
      } as any);

      const result = await simctlPushTool({
        udid: longUDID,
        bundleId: validBundleID,
        payload: '{"aps":{"alert":"Test"}}',
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('APS payload validation', () => {
    it('should accept minimal APS payload', async () => {
      const minimalPayload = '{"aps":{"alert":"Test"}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: minimalPayload,
      });

      expect(result.isError).toBe(false);
    });

    it('should accept full APS payload', async () => {
      const fullPayload =
        '{"aps":{"alert":{"title":"Title","body":"Body"},"badge":1,"sound":"default","category":"CATEGORY","mutable-content":1,"custom-data":"value"}}';
      const result = await simctlPushTool({
        udid: validUDID,
        bundleId: validBundleID,
        payload: fullPayload,
      });

      expect(result.isError).toBe(false);
    });
  });
});
