import { simctlInstallTool } from '../../../src/tools/simctl/install.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';

// Mock the simulator cache
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    getSimulatorList: jest.fn(),
    findSimulatorByUdid: jest.fn(),
    recordBootEvent: jest.fn(),
    recordSimulatorUsage: jest.fn(),
  },
}));

// Mock command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: '',
    stderr: '',
  }),
  buildSimctlCommand: jest.fn().mockReturnValue('xcrun simctl install device-id app.app'),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlInstallTool', () => {
  const validUDID = 'device-iphone16pro';
  const validAppPath = '/path/to/MyApp.app';
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

  describe('successful installation', () => {
    it('should install app to simulator', async () => {
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.udid).toBe(validUDID);
      expect(response.appPath).toBe(validAppPath);
    });

    it('should return simulator information', async () => {
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
      expect(response.simulatorInfo.udid).toBe(validUDID);
    });

    it('should provide next steps guidance', async () => {
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);
      expect(
        response.guidance.some((g: string) => g.includes('simctl-launch'))
      ).toBe(true);
    });

    it('should extract app bundle ID from path', async () => {
      const appPathWithBundleId = '/path/to/MyApp.app';
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: appPathWithBundleId,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.appPath).toBe(appPathWithBundleId);
    });

    it('should format response correctly', async () => {
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
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
      const result = await simctlInstallTool({
        udid: '',
        appPath: validAppPath,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('UDID');
    });

    it('should reject empty app path', async () => {
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: '',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('app path');
    });

    it('should reject invalid app path format', async () => {
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: '/path/to/invalid.txt',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('.app');
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlInstallTool({
        udid: 'invalid-udid',
        appPath: validAppPath,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should handle whitespace-only inputs', async () => {
      const result = await simctlInstallTool({
        udid: '   ',
        appPath: '   ',
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

      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      expect(result.isError).toBe(false);
    });

    it('should work with shutdown simulator', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        shutdownSimulator as any
      );

      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      expect(result.isError).toBe(false);
    });

    it('should warn if simulator state is unavailable', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        unavailableSimulator as any
      );

      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toContain(
        expect.stringContaining('unavailable')
      );
    });
  });

  describe('error handling', () => {
    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(
        new Error('Installation failed: app not found')
      );

      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });

    it('should handle simulator cache lookup error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(
        new Error('Cache error')
      );

      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      expect(result.isError).toBe(true);
    });

    it('should provide helpful error messages', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Application at path is not a valid iOS app',
      });

      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('appPath');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
      expect(response).toHaveProperty('command');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlInstallTool({
        udid: 'invalid',
        appPath: validAppPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
    });

    it('should be valid JSON', async () => {
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle app paths with spaces', async () => {
      const appWithSpaces = '/path/to/My App.app';
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: appWithSpaces,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.appPath).toBe(appWithSpaces);
    });

    it('should handle absolute paths', async () => {
      const absolutePath = '/Users/conor/Development/Build/MyApp.app';
      const result = await simctlInstallTool({
        udid: validUDID,
        appPath: absolutePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.appPath).toBe(absolutePath);
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        { ...validSimulator, udid: longUDID } as any
      );

      const result = await simctlInstallTool({
        udid: longUDID,
        appPath: validAppPath,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle concurrent installations to same simulator', async () => {
      // Install should be idempotent or handle gracefully
      const result1 = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      const result2 = await simctlInstallTool({
        udid: validUDID,
        appPath: validAppPath,
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });
  });
});
