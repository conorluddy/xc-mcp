import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { simctlShutdownTool } from '../../../../src/tools/simctl/shutdown.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig, setXcodeValidation } from '../../../__helpers__/test-utils.js';
import { simulatorCache } from '../../../../src/state/simulator-cache.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('simctl-shutdown tool', () => {
  setupTest();

  beforeEach(() => {
    simulatorCache.clearCache();
  });

  it('should shutdown a specific device', async () => {
    setMockCommandConfig({
      'xcrun simctl shutdown device-123': {
        stdout: '',
        stderr: '',
        code: 0,
      },
    });

    const result = await simctlShutdownTool({
      deviceId: 'device-123',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      success: true,
      deviceId: 'device-123',
      message: expect.stringContaining('Successfully shut down'),
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
      deviceId: 'all',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      success: true,
      deviceId: 'all',
      message: expect.stringContaining('all simulators'),
    });
  });

  it('should require device parameter', async () => {
    await expect(simctlShutdownTool({})).rejects.toThrow('Device ID is required');
  });

  it('should handle shutdown errors', async () => {
    setMockCommandConfig({
      'xcrun simctl shutdown device-123': {
        stdout: '',
        stderr: 'Unable to shutdown device',
        code: 1,
      },
    });

    await expect(
      simctlShutdownTool({
        deviceId: 'device-123',
      })
    ).rejects.toThrow('Failed to shutdown');
  });

  it('should handle device not found', async () => {
    setMockCommandConfig({
      'xcrun simctl shutdown invalid-device': {
        stdout: '',
        stderr: 'Invalid device: invalid-device',
        code: 1,
      },
    });

    await expect(
      simctlShutdownTool({
        deviceId: 'invalid-device',
      })
    ).rejects.toThrow('Failed to shutdown');
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(
      simctlShutdownTool({
        deviceId: 'device-123',
      })
    ).rejects.toThrow('Xcode is not installed');
  });
});
