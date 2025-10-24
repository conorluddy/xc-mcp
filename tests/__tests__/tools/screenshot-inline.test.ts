import { simctlScreenshotInlineTool } from '../../../src/tools/simctl/screenshot-inline.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/utils/device-detection.js', () => ({
  resolveDeviceId: jest.fn(),
}));

jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    findSimulatorByUdid: jest.fn(),
  },
}));

const { resolveDeviceId } = require('../../../src/utils/device-detection.js');
const { simulatorCache } = require('../../../src/state/simulator-cache.js');

describe('simctlScreenshotInlineTool', () => {
  const validUdid = 'device-iphone16pro';
  const mockSimulator = {
    name: 'iPhone 16 Pro',
    udid: validUdid,
    state: 'Booted',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resolveDeviceId.mockResolvedValue(validUdid);
    simulatorCache.findSimulatorByUdid.mockResolvedValue(mockSimulator);
  });

  describe('argument validation', () => {
    it('should reject with McpError if device not found', async () => {
      simulatorCache.findSimulatorByUdid.mockResolvedValue(null);

      await expect(
        simctlScreenshotInlineTool({
          udid: 'unknown-device',
        })
      ).rejects.toThrow(McpError);
    });

    it('should call resolveDeviceId with provided UDID', async () => {
      simulatorCache.findSimulatorByUdid.mockResolvedValue(null);

      try {
        await simctlScreenshotInlineTool({ udid: 'test-udid' });
      } catch {
        // Expected to throw
      }

      expect(resolveDeviceId).toHaveBeenCalledWith('test-udid');
    });

    it('should auto-detect UDID when not provided', async () => {
      simulatorCache.findSimulatorByUdid.mockResolvedValue(null);

      try {
        await simctlScreenshotInlineTool({});
      } catch {
        // Expected to throw
      }

      expect(resolveDeviceId).toHaveBeenCalledWith(undefined);
    });
  });

  describe('simulator resolution', () => {
    it('should validate simulator exists', async () => {
      simulatorCache.findSimulatorByUdid.mockResolvedValue(null);

      const error = await simctlScreenshotInlineTool({
        udid: validUdid,
      }).catch(e => e);

      expect(error).toBeInstanceOf(McpError);
      expect(error.message).toContain('not found');
    });
  });
});
