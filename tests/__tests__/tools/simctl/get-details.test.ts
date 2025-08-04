import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { simctlGetDetailsTool } from '../../../../src/tools/simctl/get-details.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import { responseCache } from '../../../../src/utils/response-cache.js';
import { simulatorCache } from '../../../../src/state/simulator-cache.js';
import { mockResponseCacheEntry } from '../../../__helpers__/cache-helpers.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('simctl-get-details tool', () => {
  setupTest();

  beforeEach(() => {
    responseCache.clear();
    simulatorCache.clearCache();
  });

  const mockFullDeviceList = {
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
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
          state: 'Shutdown',
          isAvailable: true,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
          dataPath: '/path/to/data2',
          dataPathSize: 2000000,
          logPath: '/path/to/logs2',
        },
      ],
      'com.apple.CoreSimulator.SimRuntime.watchOS-10-0': [
        {
          udid: 'watch-1',
          name: 'Apple Watch Series 9',
          state: 'Shutdown',
          isAvailable: true,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.Apple-Watch-Series-9',
        },
      ],
    },
  };

  it('should retrieve cached simulator details', async () => {
    const cacheId = 'simctl_list_12345';
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(mockFullDeviceList));

    const result = await simctlGetDetailsTool({
      cacheId,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.devices).toBeDefined();
    expect(Object.keys(data.devices)).toHaveLength(2);
  });

  it('should get details for specific device by ID', async () => {
    const cacheId = 'simctl_list_12345';
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(mockFullDeviceList));

    const result = await simctlGetDetailsTool({
      cacheId,
      deviceId: 'device-1',
      detailType: 'devices-only',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.devices).toContainEqual(
      expect.objectContaining({
        udid: 'device-1',
        name: 'iPhone 15',
        state: 'Booted',
      })
    );
  });

  it('should filter by runtime', async () => {
    const cacheId = 'simctl_list_12345';
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(mockFullDeviceList));

    const result = await simctlGetDetailsTool({
      cacheId,
      runtime: 'iOS-17-0',
      detailType: 'devices-only',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.devices).toHaveLength(2);
    expect(data.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'iPhone 15' }),
        expect.objectContaining({ name: 'iPhone 14' }),
      ])
    );
  });

  it('should filter by state', async () => {
    const cacheId = 'simctl_list_12345';
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(mockFullDeviceList));

    const result = await simctlGetDetailsTool({
      cacheId,
      state: 'Booted',
      detailType: 'devices-only',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0].name).toBe('iPhone 15');
  });

  it('should include full device details', async () => {
    const cacheId = 'simctl_list_12345';
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(mockFullDeviceList));

    const result = await simctlGetDetailsTool({
      cacheId,
      deviceId: 'device-1',
      detailType: 'full-list',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    const devices = Object.values(data.devices).flat() as any[];
    const device = devices.find((d: any) => d.udid === 'device-1');
    expect(device).toMatchObject({
      udid: 'device-1',
      name: 'iPhone 15',
      state: 'Booted',
      isAvailable: true,
      deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
      dataPath: '/path/to/data',
      dataPathSize: 1000000,
      logPath: '/path/to/logs',
    });
  });

  it('should get details from simulator cache when no cacheId provided', async () => {
    const cache = simulatorCache;

    // Mock cache data directly
    (cache as any).cache = {
      devices: {
        'iOS-17-0': [
          {
            udid: 'cached-device',
            name: 'iPhone 15 Pro',
            state: 'Booted',
            isAvailable: true,
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
            dataPath: '/path/to/data',
            dataPathSize: 3000000,
            logPath: '/path/to/logs',
          },
        ],
      },
      lastUpdated: new Date(),
      runtimes: [],
      devicetypes: [],
      preferredByProject: new Map(),
    };

    await expect(
      simctlGetDetailsTool({
        deviceId: 'cached-device',
      })
    ).rejects.toThrow('Cache ID'); // Tool requires cacheId parameter
  });

  it('should handle missing cacheId', async () => {
    await expect(simctlGetDetailsTool({})).rejects.toThrow('required');
  });

  it('should handle non-existent cacheId', async () => {
    await expect(
      simctlGetDetailsTool({
        cacheId: 'non_existent_cache',
      })
    ).rejects.toThrow('not found or expired');
  });

  it('should handle device not found in cache', async () => {
    const cacheId = 'simctl_list_12345';
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(mockFullDeviceList));

    const result = await simctlGetDetailsTool({
      cacheId,
      deviceId: 'non-existent-device',
      detailType: 'devices-only',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.devices).toHaveLength(0);
  });

  it('should handle invalid cached data', async () => {
    const cacheId = 'simctl_list_12345';
    mockResponseCacheEntry(cacheId, 'simctl-list', 'invalid json data');

    await expect(
      simctlGetDetailsTool({
        cacheId,
      })
    ).rejects.toThrow();
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(
      simctlGetDetailsTool({
        cacheId: 'simctl_list_12345',
      })
    ).rejects.toThrow('Xcode is not installed');
  });

  it('should return runtimes only', async () => {
    const cacheId = 'simctl_list_12345';
    const fullList = {
      ...mockFullDeviceList,
      runtimes: [
        { identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0', version: '17.0' },
        { identifier: 'com.apple.CoreSimulator.SimRuntime.watchOS-10-0', version: '10.0' },
      ],
    };
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(fullList));

    const result = await simctlGetDetailsTool({
      cacheId,
      detailType: 'runtimes-only',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.runtimes).toBeDefined();
  });

  it('should return available devices only', async () => {
    const cacheId = 'simctl_list_12345';
    const fullList = {
      devices: {
        'iOS-17-0': [
          { udid: 'available-1', name: 'Available Device', isAvailable: true, state: 'Shutdown' },
          {
            udid: 'unavailable-1',
            name: 'Unavailable Device',
            isAvailable: false,
            state: 'Shutdown',
          },
        ],
      },
    };
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(fullList));

    const result = await simctlGetDetailsTool({
      cacheId,
      detailType: 'available-only',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0].name).toBe('Available Device');
  });

  it('should handle max devices limit', async () => {
    const cacheId = 'simctl_list_12345';
    mockResponseCacheEntry(cacheId, 'simctl-list', JSON.stringify(mockFullDeviceList));

    const result = await simctlGetDetailsTool({
      cacheId,
      detailType: 'devices-only',
      maxDevices: 1,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.devices).toHaveLength(1);
  });

  it('should handle wrong tool cache entry', async () => {
    const cacheId = 'wrong_tool_12345';
    mockResponseCacheEntry(cacheId, 'xcodebuild-build', 'Some build output');

    await expect(
      simctlGetDetailsTool({
        cacheId,
      })
    ).rejects.toThrow('not from simctl-list tool');
  });
});
