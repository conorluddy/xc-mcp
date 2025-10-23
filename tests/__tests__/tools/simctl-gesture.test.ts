import { simctlGestureTool } from '../../../src/tools/simctl/gesture';
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

describe('simctlGestureTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(mockSimulator);
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlGestureTool({
          udid: '',
          type: 'swipe',
          direction: 'left',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('UDID'),
        })
      );
    });

    it('should reject invalid gesture type', async () => {
      await expect(
        simctlGestureTool({
          udid: 'device-iphone16pro',
          type: 'invalid' as any,
          direction: 'left',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(/[Gg]esture [Tt]ype/),
        })
      );
    });

    it('should reject non-existent simulator', async () => {
      (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(null);

      await expect(
        simctlGestureTool({
          udid: 'invalid-udid',
          type: 'swipe',
          direction: 'left',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        })
      );
    });
  });

  describe('swipe gestures', () => {
    it('should perform swipe left', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Swipe left performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'left',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.gestureInfo.type).toBe('swipe');
      expect(response.gestureInfo.direction).toBe('left');
    });

    it('should perform swipe right', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Swipe right performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'right',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.gestureInfo.direction).toBe('right');
    });

    it('should perform swipe up', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Swipe up performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'up',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should perform swipe down', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Swipe down performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'down',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should support swipe with custom starting point', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Swipe performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'left',
        startX: 300,
        startY: 400,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('pinch gesture', () => {
    it('should perform pinch zoom', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Pinch zoom performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'pinch',
        scale: 2.0,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.gestureInfo.type).toBe('pinch');
    });

    it('should perform pinch with custom scale', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Pinch performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'pinch',
        scale: 0.5,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should perform pinch at specific location', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Pinch performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'pinch',
        scale: 1.5,
        centerX: 375,
        centerY: 667,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('rotation gesture', () => {
    it('should perform rotate gesture', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Rotation performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'rotate',
        angle: 45,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.gestureInfo.type).toBe('rotate');
    });

    it('should support rotation with custom angle', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Rotation performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'rotate',
        angle: 90,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('multi-touch gestures', () => {
    it('should perform two-finger tap', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Two-finger tap performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'multitouch',
        fingers: 2,
        action: 'tap',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.gestureInfo.fingers).toBe(2);
    });

    it('should support three-finger tap', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Three-finger tap performed',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'multitouch',
        fingers: 3,
        action: 'tap',
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
        stderr: 'Gesture failed: invalid parameters',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'left',
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

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'left',
      });

      const response = JSON.parse(result.content[0].text);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('boot');
    });
  });

  describe('response format', () => {
    it('should include simulator info', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Gesture successful',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'left',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
      expect(response.simulatorInfo.state).toBe('Booted');
    });

    it('should include gesture details', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'up',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.gestureInfo.type).toBe('swipe');
      expect(response.gestureInfo.direction).toBe('up');
    });

    it('should include guidance suggestions', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'left',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });
  });

  describe('LLM optimization', () => {
    it('should track gesture for interaction sequences', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'left',
        actionName: 'Swipe to next page',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should suggest screenshot verification after gesture', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlGestureTool({
        udid: 'device-iphone16pro',
        type: 'swipe',
        direction: 'right',
      });

      const response = JSON.parse(result.content[0].text);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('screenshot');
    });
  });
});
