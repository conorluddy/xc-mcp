import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { simctlBootTool } from '../../../../src/tools/simctl/boot.js';
import { setupTest, mockSimctlBoot } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../../src/utils/__mocks__/command.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import { simulatorCache } from '../../../../src/state/simulator-cache.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('simctl-boot tool', () => {
  setupTest();

  beforeEach(() => {
    simulatorCache.clearCache();
  });

  it('should boot a device by ID', async () => {
    const deviceId = 'test-device-1';
    mockSimctlBoot(deviceId);

    const result = await simctlBootTool({
      device: deviceId,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      success: true,
      device: deviceId,
      message: expect.stringContaining('Successfully booted'),
    });
  });

  it('should boot device with timeout', async () => {
    const deviceId = 'test-device-1';
    mockSimctlBoot(deviceId);

    const result = await simctlBootTool({
      device: deviceId,
      timeout: 120,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
  });

  it('should validate device ID is provided', async () => {
    await expect(simctlBootTool({})).rejects.toThrow('Device ID is required');
  });

  it('should handle empty device ID', async () => {
    await expect(
      simctlBootTool({
        device: '',
      })
    ).rejects.toThrow('Device ID is required');
  });

  it('should handle boot errors', async () => {
    const deviceId = 'test-device-1';
    setMockCommandConfig({
      [`xcrun simctl boot ${deviceId}`]: {
        stdout: '',
        stderr: 'Unable to boot device in current state: Booted',
        code: 149,
      },
    });

    const result = await simctlBootTool({
      device: deviceId,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      success: false,
      error: expect.stringContaining('Unable to boot device'),
    });
  });

  it('should handle device not found', async () => {
    const deviceId = 'non-existent-device';
    setMockCommandConfig({
      [`xcrun simctl boot ${deviceId}`]: {
        stdout: '',
        stderr: 'Invalid device: non-existent-device',
        code: 3,
      },
    });

    const result = await simctlBootTool({
      device: deviceId,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      success: false,
      error: expect.stringContaining('Invalid device'),
    });
  });

  it('should handle already booted device', async () => {
    const deviceId = 'test-device-1';
    setMockCommandConfig({
      [`xcrun simctl boot ${deviceId}`]: {
        stdout: '',
        stderr: 'Unable to boot device in current state: Booted',
        code: 149,
      },
    });

    const result = await simctlBootTool({
      device: deviceId,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('Unable to boot device');
  });

  it('should handle timeout during boot', async () => {
    const deviceId = 'test-device-1';
    // Mock initial boot success
    setMockCommandConfig({
      [`xcrun simctl boot ${deviceId}`]: {
        stdout: '',
        stderr: '',
        code: 0,
      },
    });

    // Mock status check to always show Shutdown (never boots)
    let callCount = 0;
    setMockCommandConfig({
      'xcrun simctl list devices -j': () => {
        callCount++;
        return {
          stdout: JSON.stringify({
            devices: {
              'iOS-17-0': [
                {
                  udid: deviceId,
                  name: 'iPhone 15',
                  state: 'Shutdown',
                  isAvailable: true,
                },
              ],
            },
          }),
          stderr: '',
          code: 0,
        };
      },
    });

    const result = await simctlBootTool({
      device: deviceId,
      timeout: 1, // 1 second timeout
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Boot verification timeout');
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(
      simctlBootTool({
        device: 'test-device',
      })
    ).rejects.toThrow('Xcode is not installed');
  });

  it('should record boot event in cache', async () => {
    const deviceId = 'test-device-1';

    // Mock the cache data
    (simulatorCache as any).cache = {
      devices: {
        'iOS-17-0': [
          {
            udid: deviceId,
            name: 'iPhone 15',
            state: 'Shutdown',
            isAvailable: true,
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            bootHistory: [],
            performanceMetrics: undefined,
          },
        ],
      },
      lastUpdated: new Date(),
      runtimes: [],
      devicetypes: [],
      preferredByProject: new Map(),
    };

    mockSimctlBoot(deviceId);

    const result = await simctlBootTool({
      device: deviceId,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);

    // Verify boot state was recorded
    expect(simulatorCache.getBootState(deviceId)).toBe('booted');
  });

  it('should handle verification check errors gracefully', async () => {
    const deviceId = 'test-device-1';

    // Mock successful boot command
    setMockCommandConfig({
      [`xcrun simctl boot ${deviceId}`]: {
        stdout: '',
        stderr: '',
        code: 0,
      },
    });

    // Mock error in status check
    setMockCommandConfig({
      'xcrun simctl list devices -j': {
        stdout: '',
        stderr: 'Failed to list devices',
        code: 1,
      },
    });

    const result = await simctlBootTool({
      device: deviceId,
      timeout: 5,
    });

    // Should still report success if boot command succeeded
    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.bootVerified).toBe(false);
  });
});
