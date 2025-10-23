import { simctlGetAppContainerTool } from '../../../src/tools/simctl/get-app-container.js';
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
    stdout: '/Users/conor/Library/Developer/CoreSimulator/Devices/device-id/data/Containers/Bundle/Application/app-uuid',
    stderr: '',
  }),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlGetAppContainerTool', () => {
  const validUDID = 'device-iphone16pro';
  const validBundleID = 'com.example.MyApp';
  const validContainerPath = '/Users/conor/Library/Developer/CoreSimulator/Devices/device-id/data/Containers/Bundle/Application/app-uuid';
  const validSimulator = {
    name: 'iPhone 16 Pro',
    udid: validUDID,
    state: 'Booted',
    isAvailable: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatorCache.findSimulatorByUdid.mockResolvedValue(validSimulator as any);
    const { executeCommand } = require('../../../src/utils/command.js');
    executeCommand.mockResolvedValue({
      code: 0,
      stdout: validContainerPath,
      stderr: '',
    });
  });

  describe('successful container lookup', () => {
    it('should return app container path', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.containerPath).toBe(validContainerPath);
    });

    it('should return simulator information', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
      expect(response.simulatorInfo.udid).toBe(validUDID);
    });

    it('should include bundle ID in response', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.bundleId).toBe(validBundleID);
    });

    it('should provide guidance for accessing container', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);
    });

    it('should format response correctly', async () => {
      const result = await simctlGetAppContainerTool({
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
      const result = await simctlGetAppContainerTool({
        udid: '',
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('UDID');
    });

    it('should reject empty bundle ID', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: '',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('bundle');
    });

    it('should reject invalid bundle ID format', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: 'invalid bundle id',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('format');
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlGetAppContainerTool({
        udid: 'invalid-udid',
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should handle whitespace-only inputs', async () => {
      const result = await simctlGetAppContainerTool({
        udid: '   ',
        bundleId: '   ',
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('container path parsing', () => {
    it('should handle standard container paths', async () => {
      const standardPath = '/Users/conor/Library/Developer/CoreSimulator/Devices/UUID/data/Containers/Bundle/Application/app-uuid';
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: standardPath,
        stderr: '',
      });

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.containerPath).toBe(standardPath);
    });

    it('should extract app name from bundle ID', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: 'com.example.MyApp',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.bundleId).toBe('com.example.MyApp');
    });

    it('should handle paths with spaces', async () => {
      const pathWithSpaces = '/Users/conor/Library/Developer/CoreSimulator/Devices/device-id/data/Containers/Bundle/Application/app with spaces';
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: pathWithSpaces,
        stderr: '',
      });

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.containerPath).toBe(pathWithSpaces);
    });
  });

  describe('optional container type parameter', () => {
    it('should accept bundle container type', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
        containerType: 'bundle',
      });

      expect(result.isError).toBe(false);
    });

    it('should accept data container type', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
        containerType: 'data',
      });

      expect(result.isError).toBe(false);
    });

    it('should accept group container type', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
        containerType: 'group',
      });

      expect(result.isError).toBe(false);
    });

    it('should handle undefined container type', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
        containerType: undefined,
      });

      expect(result.isError).toBe(false);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        bootedSimulator as any
      );

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
    });

    it('should work with shutdown simulator', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        shutdownSimulator as any
      );

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
    });

    it('should warn about unavailable simulator', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        unavailableSimulator as any
      );

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toContain(
        expect.stringContaining('unavailable')
      );
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

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(
        new Error('Failed to get container')
      );

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle simulator cache lookup error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(
        new Error('Cache error')
      );

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle empty response from simctl', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('bundleId');
      expect(response).toHaveProperty('containerPath');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlGetAppContainerTool({
        udid: 'invalid',
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
    });

    it('should be valid JSON', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });
  });

  describe('practical usage scenarios', () => {
    it('should help locate app documents', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: 'com.example.DocumentApp',
        containerType: 'data',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) =>
        g.includes('documents') || g.includes('data')
      )).toBe(true);
    });

    it('should provide path for simulator file access', async () => {
      const result = await simctlGetAppContainerTool({
        udic: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) =>
        g.toLowerCase().includes('access') || g.toLowerCase().includes('file')
      )).toBe(true);
    });

    it('should help debugging with container path', async () => {
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: validBundleID,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.containerPath).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle very long bundle IDs', async () => {
      const longBundleId = 'com.' + 'a'.repeat(200) + '.app';
      const result = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: longBundleId,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.bundleId).toBe(longBundleId);
    });

    it('should handle concurrent container lookups', async () => {
      const result1 = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: 'com.example.app1',
      });

      const result2 = await simctlGetAppContainerTool({
        udid: validUDID,
        bundleId: 'com.example.app2',
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        { ...validSimulator, udid: longUDID } as any
      );

      const result = await simctlGetAppContainerTool({
        udid: longUDID,
        bundleId: validBundleID,
      });

      expect(result.isError).toBe(false);
    });
  });
});
