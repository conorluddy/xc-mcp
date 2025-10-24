import { simctlHealthCheckTool } from '../../../src/tools/simctl/health-check.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/utils/validation.js', () => ({
  validateXcodeInstallation: jest.fn(),
}));

jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    getSimulatorList: jest.fn(),
  },
}));

const { validateXcodeInstallation } = require('../../../src/utils/validation.js');
const { executeCommand } = require('../../../src/utils/command.js');
const { simulatorCache } = require('../../../src/state/simulator-cache.js');

describe('simctlHealthCheckTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    validateXcodeInstallation.mockResolvedValue(undefined);
    executeCommand.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
    simulatorCache.getSimulatorList.mockResolvedValue({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
          {
            name: 'iPhone 16 Pro',
            udid: 'device-iphone16pro',
            state: 'Booted',
          },
          {
            name: 'iPhone 15',
            udid: 'device-iphone15',
            state: 'Shutdown',
          },
        ],
      },
      runtimes: [
        {
          name: 'iOS 17.0',
          version: '17.0',
          isAvailable: true,
        },
      ],
      devicetypes: [
        {
          name: 'iPhone 16 Pro',
          identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro',
        },
      ],
    });
  });

  describe('health check execution', () => {
    it('should return healthy status when all checks pass', async () => {
      executeCommand.mockResolvedValue({
        code: 0,
        stdout: '10GB 75%',
        stderr: '',
      });

      const result = await simctlHealthCheckTool();

      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response.healthy).toBe(true);
      expect(response.summary.passed).toBeGreaterThan(0);
      expect(response.checks).toBeInstanceOf(Array);
    });

    it('should include all required health check categories', async () => {
      executeCommand.mockResolvedValue({
        code: 0,
        stdout: '10GB 75%',
        stderr: '',
      });

      const result = await simctlHealthCheckTool();
      const response = JSON.parse(result.content[0].text);

      const checkNames = response.checks.map((c: any) => c.name);
      expect(checkNames).toContain('Xcode Command Line Tools');
      expect(checkNames).toContain('simctl Availability');
      expect(checkNames).toContain('Simulator List');
      expect(checkNames).toContain('Booted Simulators');
      expect(checkNames).toContain('Available Runtimes');
      expect(checkNames).toContain('Disk Space');
    });

    it('should mark as unhealthy when Xcode check fails', async () => {
      validateXcodeInstallation.mockRejectedValue(new Error('Xcode not found'));

      const result = await simctlHealthCheckTool();
      const response = JSON.parse(result.content[0].text);

      expect(response.healthy).toBe(false);
      const xcodeCheck = response.checks.find((c: any) => c.name === 'Xcode Command Line Tools');
      expect(xcodeCheck.pass).toBe(false);
    });

    it('should include booted simulator details in check response', async () => {
      executeCommand.mockResolvedValue({
        code: 0,
        stdout: '10GB 75%',
        stderr: '',
      });

      const result = await simctlHealthCheckTool();
      const response = JSON.parse(result.content[0].text);

      const bootedCheck = response.checks.find((c: any) => c.name === 'Booted Simulators');
      expect(bootedCheck.details).toBeDefined();
      expect(bootedCheck.details.devices).toBeDefined();
      expect(bootedCheck.details.devices.length).toBeGreaterThan(0);
    });
  });
});
