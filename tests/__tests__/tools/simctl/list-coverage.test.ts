import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { simctlListTool } from '../../../../src/tools/simctl/list.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../__helpers__/test-utils.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('simctl-list tool', () => {
  setupTest();

  const mockDeviceList = {
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
        {
          udid: 'device-1',
          name: 'iPhone 15',
          state: 'Booted',
          isAvailable: true,
        },
        {
          udid: 'device-2',
          name: 'iPhone 14',
          state: 'Shutdown',
          isAvailable: true,
        },
      ],
    },
    runtimes: [
      {
        identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
        version: '17.0',
        isAvailable: true,
      },
    ],
    devicetypes: [
      {
        identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        name: 'iPhone 15',
      },
    ],
  };

  beforeEach(() => {
    setMockCommandConfig({
      'xcrun simctl list -j': {
        stdout: JSON.stringify(mockDeviceList),
        stderr: '',
        code: 0,
      },
    });
  });

  it('should list all simulators', async () => {
    const result = await simctlListTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text as string);
    expect(data).toMatchObject({
      cacheId: expect.any(String),
      summary: {
        totalDevices: 2,
        bootedDevices: 1,
        availableDevices: 2,
      },
    });
    expect(data.summary.deviceTypes).toEqual(['iPhone']);
    expect(data.summary.commonRuntimes).toEqual(['iOS 17.0']);
  });

  it('should handle simctl errors', async () => {
    // Clear any cached data first
    const { simulatorCache } = await import('../../../../src/state/simulator-cache.js');
    simulatorCache.clearCache();

    setMockCommandConfig({
      'xcrun simctl list devices -j': {
        stdout: '',
        stderr: 'simctl: error: Unable to locate DeviceSupport',
        code: 1,
      },
    });

    await expect(simctlListTool({})).rejects.toThrow('simctl-list failed');
  });

  it('should handle malformed JSON', async () => {
    // Clear any cached data first
    const { simulatorCache } = await import('../../../../src/state/simulator-cache.js');
    simulatorCache.clearCache();

    setMockCommandConfig({
      'xcrun simctl list devices -j': {
        stdout: 'invalid json',
        stderr: '',
        code: 0,
      },
    });

    await expect(simctlListTool({})).rejects.toThrow('simctl-list failed');
  });

  it('should cache simulator data', async () => {
    const result = await simctlListTool({});
    const data = JSON.parse(result.content[0].text as string);

    expect(data.cacheId).toBeDefined();
    expect(data.nextSteps).toContainEqual(expect.stringContaining('simctl-get-details'));
  });
});
