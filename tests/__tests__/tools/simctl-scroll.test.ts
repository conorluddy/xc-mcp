import { simctlScrollTool } from '../../../src/tools/simctl/scroll';
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

describe('simctlScrollTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(mockSimulator);
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlScrollTool({
          udid: '',
          direction: 'up',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('UDID'),
        })
      );
    });

    it('should reject invalid direction', async () => {
      await expect(
        simctlScrollTool({
          udid: 'device-iphone16pro',
          direction: 'diagonal' as any,
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(/[Dd]irection/),
        })
      );
    });

    it('should reject non-existent simulator', async () => {
      (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(null);

      await expect(
        simctlScrollTool({
          udid: 'invalid-udid',
          direction: 'up',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        })
      );
    });

    it('should handle whitespace-only UDID', async () => {
      await expect(
        simctlScrollTool({
          udid: '   ',
          direction: 'down',
        })
      ).rejects.toThrow();
    });
  });

  describe('successful scroll operations', () => {
    it('should scroll up', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll up executed',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'up',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.scrollInfo.direction).toBe('up');
    });

    it('should scroll down', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll down executed',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.scrollInfo.direction).toBe('down');
    });

    it('should scroll left', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll left executed',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'left',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.scrollInfo.direction).toBe('left');
    });

    it('should scroll right', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll right executed',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'right',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.scrollInfo.direction).toBe('right');
    });

    it('should scroll with custom coordinates', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll executed at coordinates',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'up',
        x: 375,
        y: 667,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should scroll with custom velocity', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll executed',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
        velocity: 5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.scrollInfo.velocity).toBe(5);
    });

    it('should scroll with default center coordinates', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll executed',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle command execution failure', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Scroll failed: no scrollable element',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'up',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
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

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
      });

      const response = JSON.parse(result.content[0].text);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('boot');
    });

    it('should handle no scrollable content', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'No scrollable element found',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
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
        stdout: 'Scroll successful',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'up',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
      expect(response.simulatorInfo.state).toBe('Booted');
    });

    it('should include scroll direction', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.scrollInfo.direction).toBe('down');
    });

    it('should include command executed', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'up',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.cacheId).toBeDefined();
    });

    it('should include guidance suggestions', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll successful',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });
  });

  describe('scroll variants', () => {
    it('should support all directions', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll successful',
        stderr: '',
      });

      const directions = ['up', 'down', 'left', 'right'];

      for (const direction of directions) {
        const result = await simctlScrollTool({
          udid: 'device-iphone16pro',
          direction: direction as any,
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
        expect(response.scrollInfo.direction).toBe(direction);
      }
    });

    it('should support velocity range', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll successful',
        stderr: '',
      });

      const velocities = [1, 3, 5, 10];

      for (const velocity of velocities) {
        const result = await simctlScrollTool({
          udid: 'device-iphone16pro',
          direction: 'down',
          velocity,
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.success).toBe(true);
      }
    });

    it('should allow custom scroll area', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll successful',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
        x: 300,
        y: 400,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('LLM optimization', () => {
    it('should enable agent to track scroll sequences', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll successful',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
        actionName: 'Scroll to bottom of list',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should suggest screenshot verification', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Scroll successful',
        stderr: '',
      });

      const result = await simctlScrollTool({
        udid: 'device-iphone16pro',
        direction: 'down',
      });

      const response = JSON.parse(result.content[0].text);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('screenshot');
    });
  });
});
