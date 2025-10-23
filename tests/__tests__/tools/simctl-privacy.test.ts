import { simctlPrivacyTool } from '../../../src/tools/simctl/privacy.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';

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

describe('simctlPrivacyTool', () => {
  const validUDID = 'device-iphone16pro';
  const validBundleID = 'com.example.MyApp';
  const validService = 'camera';
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

  describe('successful privacy modification', () => {
    it('should grant privacy permission', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.action).toBe('grant');
    });

    it('should revoke privacy permission', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'revoke',
        service: validService,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.action).toBe('revoke');
    });

    it('should reset privacy permissions', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'reset',
        service: validService,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.action).toBe('reset');
    });

    it('should return simulator information', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
    });

    it('should provide guidance', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });
  });

  describe('supported privacy services', () => {
    const services = [
      'camera',
      'microphone',
      'location',
      'contacts',
      'photos',
      'calendar',
      'health',
      'reminders',
      'motion',
      'keyboard',
      'mediaLibrary',
      'calls',
      'siri',
    ];

    it('should support all standard privacy services', async () => {
      for (const service of services) {
        const result = await simctlPrivacyTool({
          udid: validUDID,
          bundleId: validBundleID,
          action: 'grant',
          service,
        });
        expect(result.isError).toBe(false);
      }
    });
  });

  describe('supported actions', () => {
    it('should support grant action', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.action).toBe('grant');
    });

    it('should support revoke action', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'revoke',
        service: validService,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.action).toBe('revoke');
    });

    it('should support reset action', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'reset',
        service: validService,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.action).toBe('reset');
    });
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      const result = await simctlPrivacyTool({
        udid: '',
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('UDID');
    });

    it('should reject empty bundle ID', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: '',
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('bundle');
    });

    it('should reject invalid action', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'invalid_action',
        service: validService,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('action');
    });

    it('should reject invalid service', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: 'invalid_service',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('service');
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlPrivacyTool({
        udid: 'invalid-udid',
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('not found');
    });

    it('should handle whitespace-only inputs', async () => {
      const result = await simctlPrivacyTool({
        udid: '   ',
        bundleId: '   ',
        action: '   ',
        service: '   ',
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        bootedSimulator as any
      );

      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(false);
    });

    it('should work with shutdown simulator', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        shutdownSimulator as any
      );

      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(false);
    });

    it('should warn if simulator is unavailable', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        unavailableSimulator as any
      );

      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) =>
        g.includes('unavailable')
      )).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle permission modification failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Unable to modify permission',
      });

      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Command failed'));

      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle simulator cache error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(
        new Error('Cache error')
      );

      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(true);
    });

    it('should provide helpful error messages', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'App not found in simulator',
      });

      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('bundleId');
      expect(response).toHaveProperty('action');
      expect(response).toHaveProperty('service');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlPrivacyTool({
        udid: 'invalid',
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
    });

    it('should be valid JSON', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });

    it('should format response correctly', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple permission modifications', async () => {
      const services = ['camera', 'microphone', 'location'];
      for (const service of services) {
        const result = await simctlPrivacyTool({
          udid: validUDID,
          bundleId: validBundleID,
          action: 'grant',
          service,
        });
        expect(result.isError).toBe(false);
      }
    });

    it('should handle resetting all permissions', async () => {
      const result = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: validBundleID,
        action: 'reset',
        service: 'all',
      });

      // Should handle gracefully
      expect(result.content).toBeDefined();
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        { ...validSimulator, udid: longUDID } as any
      );

      const result = await simctlPrivacyTool({
        udid: longUDID,
        bundleId: validBundleID,
        action: 'grant',
        service: validService,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle concurrent permission modifications', async () => {
      const result1 = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: 'com.example.app1',
        action: 'grant',
        service: validService,
      });

      const result2 = await simctlPrivacyTool({
        udid: validUDID,
        bundleId: 'com.example.app2',
        action: 'revoke',
        service: validService,
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle toggling permissions multiple times', async () => {
      for (let i = 0; i < 3; i++) {
        const action = i % 2 === 0 ? 'grant' : 'revoke';
        const result = await simctlPrivacyTool({
          udid: validUDID,
          bundleId: validBundleID,
          action,
          service: validService,
        });
        expect(result.isError).toBe(false);
      }
    });
  });
});
