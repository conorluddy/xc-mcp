import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { simctlListTool } from '../../../../src/tools/simctl/list.js';
import { setupTest, mockSimctlList } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../../src/utils/__mocks__/command.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import { simulatorCache } from '../../../../src/state/simulator-cache.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('simctl-list tool', () => {
  setupTest();

  beforeEach(() => {
    simulatorCache.clearCache();
  });

  it('should list all devices', async () => {
    mockSimctlList();

    const result = await simctlListTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);

    expect(data).toMatchObject({
      summary: {
        totalDevices: 2,
        availableDevices: 2,
        bootedDevices: 1,
        devicesByState: {
          Shutdown: 1,
          Booted: 1,
        },
      },
      devices: expect.arrayContaining([
        expect.objectContaining({
          name: 'iPhone 15',
          state: 'Shutdown',
          udid: 'test-device-1',
        }),
        expect.objectContaining({
          name: 'iPhone 14',
          state: 'Booted',
          udid: 'test-device-2',
        }),
      ]),
    });
  });

  it('should filter by platform', async () => {
    mockSimctlList();

    const result = await simctlListTool({
      platform: 'iOS',
    });

    expect(result.devices).toHaveLength(2);
    expect(result.summary.totalDevices).toBe(2);
  });

  it('should filter by state', async () => {
    mockSimctlList();

    const result = await simctlListTool({
      state: 'Booted',
    });

    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].name).toBe('iPhone 14');
  });

  it('should filter by availability', async () => {
    setMockCommandConfig({
      'xcrun simctl list devices -j': {
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
              {
                udid: 'available-device',
                name: 'iPhone 15',
                state: 'Shutdown',
                isAvailable: true,
                deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
              },
              {
                udid: 'unavailable-device',
                name: 'iPhone 14',
                state: 'Shutdown',
                isAvailable: false,
                deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
                availabilityError: 'runtime profile not found',
              },
            ],
          },
        }),
        stderr: '',
        code: 0,
      },
    });

    const result = await simctlListTool({
      available: true,
    });

    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].name).toBe('iPhone 15');
  });

  it('should search by name', async () => {
    mockSimctlList();

    const result = await simctlListTool({
      search: '15',
    });

    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].name).toBe('iPhone 15');
  });

  it('should include device details', async () => {
    mockSimctlList();

    const result = await simctlListTool({
      detailed: true,
    });

    expect(result.devices[0]).toMatchObject({
      udid: 'test-device-1',
      name: 'iPhone 15',
      deviceType: 'iPhone-15',
      runtime: 'iOS-17-0',
      dataPath: '/path/to/device/data',
      dataPathSize: 1234567890,
    });
  });

  it('should cache results when output is large', async () => {
    const manyDevices = Array.from({ length: 50 }, i => ({
      udid: `device-${i}`,
      name: `iPhone ${i}`,
      state: 'Shutdown',
      isAvailable: true,
      deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
      dataPath: `/path/to/device${i}`,
      dataPathSize: 1000000 * i,
      logPath: `/path/to/logs${i}`,
    }));

    setMockCommandConfig({
      'xcrun simctl list devices -j': {
        stdout: JSON.stringify({
          devices: {
            'com.apple.CoreSimulator.SimRuntime.iOS-17-0': manyDevices,
          },
        }),
        stderr: '',
        code: 0,
      },
    });

    const result = await simctlListTool({});

    expect(result).toMatchObject({
      summary: {
        totalDevices: 50,
      },
      cacheId: expect.stringContaining('simctl_list_'),
    });
  });

  it('should handle empty device list', async () => {
    setMockCommandConfig({
      'xcrun simctl list devices -j': {
        stdout: JSON.stringify({ devices: {} }),
        stderr: '',
        code: 0,
      },
    });

    const result = await simctlListTool({});

    expect(result).toMatchObject({
      summary: {
        totalDevices: 0,
        availableDevices: 0,
        bootedDevices: 0,
      },
      devices: [],
    });
  });

  it('should handle command errors', async () => {
    setMockCommandConfig({
      'xcrun simctl list devices -j': {
        stdout: '',
        stderr: 'simctl: error: unable to find utility "simctl"',
        code: 1,
      },
    });

    const result = await simctlListTool({});

    expect(result).toMatchObject({
      error: expect.stringContaining('Failed to list simulators'),
    });
  });

  it('should handle malformed JSON', async () => {
    setMockCommandConfig({
      'xcrun simctl list devices -j': {
        stdout: 'invalid json',
        stderr: '',
        code: 0,
      },
    });

    const result = await simctlListTool({});

    expect(result).toMatchObject({
      error: expect.stringContaining('Failed to parse simulator list'),
    });
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(simctlListTool({})).rejects.toThrow();
  });

  it('should update simulator cache', async () => {
    mockSimctlList();
    const cache = simulatorCache;

    await simctlListTool({});

    expect(cache.getDevice('test-device-1')).toMatchObject({
      name: 'iPhone 15',
      state: 'Shutdown',
    });
    expect(cache.getDevice('test-device-2')).toMatchObject({
      name: 'iPhone 14',
      state: 'Booted',
    });
  });
});
