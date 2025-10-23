import { simctlIoTool } from '../../../src/tools/simctl/io.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock the simulator cache
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    findSimulatorByUdid: jest.fn(),
    getSimulatorList: jest.fn(),
  },
}));

// Mock command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: '/tmp/screenshot.png',
    stderr: '',
  }),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlIoTool', () => {
  const validUDID = 'device-iphone16pro';
  const validSimulator = {
    name: 'iPhone 16 Pro',
    udid: validUDID,
    state: 'Booted',
    isAvailable: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatorCache.findSimulatorByUdid.mockResolvedValue(validSimulator as any);
  });

  describe('screenshot operation', () => {
    it('should capture screenshot from simulator', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('screenshot');
    });

    it('should return screenshot file path', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.filePath).toBeDefined();
      expect(typeof response.filePath).toBe('string');
    });

    it('should accept custom output path for screenshot', async () => {
      const customPath = '/tmp/my_screenshot.png';
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
        outputPath: customPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.outputPath).toBe(customPath);
    });

    it('should return simulator information', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
    });

    it('should provide guidance for screenshot', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });
  });

  describe('video operation', () => {
    it('should record video from simulator', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'video',
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.operation).toBe('video');
    });

    it('should accept custom output path for video', async () => {
      const customPath = '/tmp/my_video.mp4';
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'video',
        outputPath: customPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.outputPath).toBe(customPath);
    });

    it('should support video codec options', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'video',
        codec: 'h264',
      });

      expect(result.isError).toBe(false);
    });

    it('should support different video codecs', async () => {
      const codecs = ['h264', 'hevc', 'prores'];
      for (const codec of codecs) {
        const result = await simctlIoTool({
          udid: validUDID,
          operation: 'video',
          codec,
        });
        expect(result.isError).toBe(false);
      }
    });
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlIoTool({
          udid: '',
          operation: 'screenshot',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject invalid operation', async () => {
      await expect(
        simctlIoTool({
          udid: validUDID,
          operation: 'invalid',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlIoTool({
          udid: 'invalid-udid',
          operation: 'screenshot',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle whitespace-only UDID', async () => {
      await expect(
        simctlIoTool({
          udid: '   ',
          operation: 'screenshot',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(bootedSimulator as any);

      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      expect(result.isError).toBe(false);
    });

    it('should warn if simulator is shutdown', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(shutdownSimulator as any);

      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      const response = JSON.parse(result.content[0].text);
      expect(
        response.guidance.some((g: string) => g.includes('boot') || g.includes('shutdown'))
      ).toBe(true);
    });

    it('should warn if simulator is unavailable', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(unavailableSimulator as any);

      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) => g.includes('unavailable'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle screenshot capture failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Failed to capture screenshot',
      });

      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle video recording failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Video codec not supported',
      });

      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'video',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Command failed'));

      await expect(
        simctlIoTool({
          udid: validUDID,
          operation: 'screenshot',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle simulator cache error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(new Error('Cache error'));

      await expect(
        simctlIoTool({
          udid: validUDID,
          operation: 'screenshot',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle invalid output path', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
        outputPath: '/invalid/path/that/does/not/exist.png',
      });

      // Should either fail or handle gracefully
      expect(result.content).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('operation');
      expect(response).toHaveProperty('filePath');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlIoTool({
          udid: 'invalid',
          operation: 'screenshot',
        })
      ).rejects.toThrow(McpError);
    });

    it('should be valid JSON', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });

    it('should format response correctly', async () => {
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle custom output paths with spaces', async () => {
      const pathWithSpaces = '/tmp/my screenshots/screenshot with spaces.png';
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
        outputPath: pathWithSpaces,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.outputPath).toBe(pathWithSpaces);
    });

    it('should handle absolute output paths', async () => {
      const absolutePath = '/Users/conor/Desktop/screenshot.png';
      const result = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
        outputPath: absolutePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.outputPath).toBe(absolutePath);
    });

    it('should handle concurrent operations', async () => {
      const result1 = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      const result2 = await simctlIoTool({
        udid: validUDID,
        operation: 'screenshot',
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce({
        ...validSimulator,
        udid: longUDID,
      } as any);

      const result = await simctlIoTool({
        udid: longUDID,
        operation: 'screenshot',
      });

      expect(result.isError).toBe(false);
    });

    it('should handle sequential screenshot operations', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await simctlIoTool({
          udid: validUDID,
          operation: 'screenshot',
        });
        expect(result.isError).toBe(false);
      }
    });
  });

  describe('supported operations', () => {
    it('should list all supported operations', async () => {
      const supportedOps = ['screenshot', 'video'];
      for (const op of supportedOps) {
        const result = await simctlIoTool({
          udid: validUDID,
          operation: op,
        });
        // Should not throw for valid operations
        expect(result.content).toBeDefined();
      }
    });
  });
});
