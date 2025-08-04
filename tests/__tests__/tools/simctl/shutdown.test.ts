import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { simctlShutdownTool } from '../../../../src/tools/simctl/shutdown.js';
import { setupTest, mockSimctlShutdown } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../../src/utils/__mocks__/command.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import { simulatorCache } from '../../../../src/state/simulator-cache.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('simctl-shutdown tool', () => {
  setupTest();

  beforeEach(() => {
    simulatorCache.clearCache();
  });

  it('should shutdown a device by ID', async () => {
    const deviceId = 'test-device-1';
    mockSimctlShutdown(deviceId);

    const result = await simctlShutdownTool({
      device: deviceId,
    });

    expect(result).toMatchObject({
      success: true,
      device: deviceId,
      message: expect.stringContaining('Device shut down successfully'),
    });
  });

  it('should shutdown all devices', async () => {
    setMockCommandConfig({
      'xcrun simctl shutdown all': {
        stdout: '',
        stderr: '',
        code: 0,
      },
    });

    const result = await simctlShutdownTool({
      device: 'all',
    });

    expect(result).toMatchObject({
      success: true,
      device: 'all',
      message: 'All devices shut down successfully',
    });
  });

  it('should shutdown booted devices', async () => {
    setMockCommandConfig({
      'xcrun simctl shutdown booted': {
        stdout: '',
        stderr: '',
        code: 0,
      },
    });

    const result = await simctlShutdownTool({
      device: 'booted',
    });

    expect(result).toMatchObject({
      success: true,
      device: 'booted',
      message: 'All booted devices shut down successfully',
    });
  });

  it('should handle already shutdown device', async () => {
    const deviceId = 'test-device-1';
    setMockCommandConfig({
      [`xcrun simctl shutdown ${deviceId}`]: {
        stdout: '',
        stderr: 'Unable to shutdown device in current state: Shutdown',
        code: 164,
      },
    });

    const result = await simctlShutdownTool({
      device: deviceId,
    });

    expect(result).toMatchObject({
      success: true,
      device: deviceId,
      message: 'Device is already shut down',
    });
  });

  it('should handle device not found', async () => {
    const deviceId = 'non-existent-device';
    setMockCommandConfig({
      [`xcrun simctl shutdown ${deviceId}`]: {
        stdout: '',
        stderr: 'Invalid device: non-existent-device',
        code: 161,
      },
    });

    const result = await simctlShutdownTool({
      device: deviceId,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Device not found'),
    });
  });

  it('should handle shutdown errors', async () => {
    const deviceId = 'test-device-1';
    setMockCommandConfig({
      [`xcrun simctl shutdown ${deviceId}`]: {
        stdout: '',
        stderr: 'Shutdown failed: device busy',
        code: 1,
      },
    });

    const result = await simctlShutdownTool({
      device: deviceId,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Failed to shut down device'),
    });
  });

  it('should handle missing device parameter', async () => {
    await expect(simctlShutdownTool({})).rejects.toThrow('Device ID is required');
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(
      simctlShutdownTool({
        device: 'test-device-1',
      })
    ).rejects.toThrow('Xcode is not installed');
  });

  it('should clear cache when shutting down all devices', async () => {
    const cache = simulatorCache;

    // Pre-populate cache
    cache.updateDevices([
      {
        udid: 'device-1',
        name: 'iPhone 15',
        state: 'Booted',
        isAvailable: true,
        deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        dataPath: '/path/to/data',
        dataPathSize: 1000000,
        logPath: '/path/to/logs',
      },
      {
        udid: 'device-2',
        name: 'iPhone 14',
        state: 'Booted',
        isAvailable: true,
        deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
        dataPath: '/path/to/data2',
        dataPathSize: 2000000,
        logPath: '/path/to/logs2',
      },
    ]);

    setMockCommandConfig({
      'xcrun simctl shutdown all': {
        stdout: '',
        stderr: '',
        code: 0,
      },
    });

    await simctlShutdownTool({
      device: 'all',
    });

    // Cache should be cleared after shutting down all
    expect(cache.getAllDevices()).toHaveLength(0);
  });

  it('should handle various error codes', async () => {
    const deviceId = 'test-device-1';

    // Test permission denied
    setMockCommandConfig({
      [`xcrun simctl shutdown ${deviceId}`]: {
        stdout: '',
        stderr: 'Operation not permitted',
        code: 159,
      },
    });

    const result = await simctlShutdownTool({
      device: deviceId,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Permission denied'),
    });
  });
});
