import { simctlTapTool } from '../../../src/tools/simctl/tap';
import { simulatorCache } from '../../../src/state/simulator-cache';
import { executeCommand } from '../../../src/utils/command';

jest.mock('../../../src/state/simulator-cache');
jest.mock('../../../src/utils/command');

const mockSimulator = {
  name: 'iPhone 16 Pro',
  udid: 'device-iphone16pro',
  state: 'Booted',
  isAvailable: true,
  runtime: 'iOS 18.0',
};

describe('simctlTapTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(mockSimulator);
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlTapTool({
          udid: '',
          x: 100,
          y: 200,
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('UDID'),
        })
      );
    });

    it('should reject missing coordinates', async () => {
      await expect(
        simctlTapTool({
          udid: 'device-iphone16pro',
          x: undefined,
          y: 200,
        })
      ).rejects.toThrow();
    });

    it('should reject negative coordinates', async () => {
      await expect(
        simctlTapTool({
          udid: 'device-iphone16pro',
          x: -10,
          y: 200,
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('non-negative'),
        })
      );
    });

    it('should reject non-existent simulator', async () => {
      (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(null);

      await expect(
        simctlTapTool({
          udid: 'invalid-udid',
          x: 100,
          y: 200,
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        })
      );
    });

    it('should handle whitespace-only UDID', async () => {
      await expect(
        simctlTapTool({
          udid: '   ',
          x: 100,
          y: 200,
        })
      ).rejects.toThrow();
    });
  });

  describe('successful tap operations', () => {
    it('should perform single tap', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tap performed',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.coordinates).toEqual({ x: 100, y: 200 });
    });

    it('should perform double tap', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Double tap performed',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
        numberOfTaps: 2,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.tapInfo.numberOfTaps).toBe(2);
      expect(response.cacheId).toBeDefined();
    });

    it('should perform long press', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Long press performed',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
        duration: 1.0,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.tapInfo.duration).toBe(1.0);
      expect(response.cacheId).toBeDefined();
    });

    it('should handle zero coordinates', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tap at origin',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 0,
        y: 0,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.coordinates).toEqual({ x: 0, y: 0 });
    });

    it('should handle large coordinate values', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tap performed',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 1920,
        y: 1080,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should record tap timestamp for tracking', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tap successful',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.tapInfo.timestamp).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle command execution failure', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Tap failed: coordinates out of bounds',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.cacheId).toBeDefined();
      expect(result.isError).toBe(true);
    });

    it('should warn if simulator is not booted', async () => {
      const shutdownSimulator = { ...mockSimulator, state: 'Shutdown' };
      (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(shutdownSimulator);

      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Simulator not available',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('booted');
    });

    it('should handle app not running scenario', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'App not running',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(result.isError).toBe(true);
    });
  });

  describe('response format', () => {
    it('should include simulator info', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tap successful',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      // Progressive disclosure: simulator info now includes essential fields
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
      expect(response.simulatorInfo.state).toBe('Booted');
    });

    it('should include coordinates in response', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 123,
        y: 456,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.coordinates).toEqual({ x: 123, y: 456 });
    });

    it('should include command executed', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      // Command is now cached, retrieved via cacheId
      expect(response.cacheId).toBeDefined();
      expect(response.guidance.join(' ')).toContain('simctl-get-interaction-details');
    });

    it('should include guidance for verification', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tap successful',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });
  });

  describe('tap variants', () => {
    it('should support configurable number of taps', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Taps performed',
        stderr: '',
      });

      for (let taps = 1; taps <= 3; taps++) {
        const result = await simctlTapTool({
          udid: 'device-iphone16pro',
          x: 100,
          y: 200,
          numberOfTaps: taps,
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      }
    });

    it('should support duration for long press', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Long press performed',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
        duration: 2.5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.tapInfo.duration).toBe(2.5);
    });
  });

  describe('LLM optimization', () => {
    it('should track tap for interaction sequences', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tap successful',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
        actionName: 'Login Button Tap',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should enable agent verification with screenshot', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tap successful',
        stderr: '',
      });

      const result = await simctlTapTool({
        udid: 'device-iphone16pro',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('screenshot');
    });
  });
});
