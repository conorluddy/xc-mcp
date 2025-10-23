import { simctlAddmediaTool } from '../../../src/tools/simctl/addmedia.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';

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
    stdout: '',
    stderr: '',
  }),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlAddmediaTool', () => {
  const validUDID = 'device-iphone16pro';
  const validImagePath = '/path/to/image.jpg';
  const validVideoPath = '/path/to/video.mp4';
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

  describe('successful media addition', () => {
    it('should add image to simulator photo library', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.udid).toBe(validUDID);
      expect(response.mediaPath).toBe(validImagePath);
    });

    it('should add video to simulator photo library', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validVideoPath,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should return simulator information', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
    });

    it('should provide next steps guidance', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);
    });

    it('should format response correctly', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      const result = await simctlAddmediaTool({
        udid: '',
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('UDID');
    });

    it('should reject empty media path', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('media path');
    });

    it('should reject invalid media file format', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/file.txt',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('format');
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlAddmediaTool({
        udid: 'invalid-udid',
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('not found');
    });

    it('should handle whitespace-only inputs', async () => {
      const result = await simctlAddmediaTool({
        udid: '   ',
        mediaPath: '   ',
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('supported media formats', () => {
    it('should accept JPEG images', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/image.jpg',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe('/path/to/image.jpg');
    });

    it('should accept PNG images', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/image.png',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe('/path/to/image.png');
    });

    it('should accept HEIC images', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/image.heic',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe('/path/to/image.heic');
    });

    it('should accept MP4 videos', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/video.mp4',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe('/path/to/video.mp4');
    });

    it('should accept MOV videos', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/video.mov',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe('/path/to/video.mov');
    });

    it('should reject unsupported formats', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/file.exe',
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('media path variations', () => {
    it('should handle absolute paths', async () => {
      const absolutePath = '/Users/conor/Documents/photo.jpg';
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: absolutePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe(absolutePath);
    });

    it('should handle paths with spaces', async () => {
      const pathWithSpaces = '/path/to/my photos/summer 2024.jpg';
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: pathWithSpaces,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe(pathWithSpaces);
    });

    it('should handle paths with special characters', async () => {
      const specialPath = '/path/to/photo-2024_01.jpg';
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: specialPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe(specialPath);
    });

    it('should handle very long file paths', async () => {
      const longPath = '/path/' + 'subdir/'.repeat(20) + 'media.jpg';
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: longPath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe(longPath);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        bootedSimulator as any
      );

      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(false);
    });

    it('should work with shutdown simulator', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        shutdownSimulator as any
      );

      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(false);
    });

    it('should warn if simulator is unavailable', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        unavailableSimulator as any
      );

      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) =>
        g.includes('unavailable')
      )).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle media file not found error', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: File not found',
      });

      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/nonexistent/file.jpg',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle corrupted media error', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Invalid media file',
      });

      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Command failed'));

      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle simulator cache error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(
        new Error('Cache error')
      );

      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(true);
    });

    it('should provide helpful error messages', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Unable to add media: insufficient disk space',
      });

      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('mediaPath');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
      expect(response).toHaveProperty('command');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlAddmediaTool({
        udid: 'invalid',
        mediaPath: validImagePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
    });

    it('should be valid JSON', async () => {
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle large image files', async () => {
      const largeImagePath = '/path/to/large_photo_50mb.jpg';
      const result = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: largeImagePath,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.mediaPath).toBe(largeImagePath);
    });

    it('should handle concurrent media additions', async () => {
      const result1 = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/photo1.jpg',
      });

      const result2 = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: '/path/to/photo2.jpg',
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle adding multiple files in sequence', async () => {
      const files = [
        '/path/to/photo1.jpg',
        '/path/to/photo2.png',
        '/path/to/video.mp4',
      ];

      for (const file of files) {
        const result = await simctlAddmediaTool({
          udid: validUDID,
          mediaPath: file,
        });
        expect(result.isError).toBe(false);
      }
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        { ...validSimulator, udid: longUDID } as any
      );

      const result = await simctlAddmediaTool({
        udid: longUDID,
        mediaPath: validImagePath,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle duplicate media files', async () => {
      const result1 = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      const result2 = await simctlAddmediaTool({
        udid: validUDID,
        mediaPath: validImagePath,
      });

      // Both should succeed (simulator handles duplicates)
      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });
  });

  describe('media type detection', () => {
    it('should detect image types', async () => {
      const imageFormats = ['jpg', 'jpeg', 'png', 'heic', 'gif', 'bmp'];
      for (const format of imageFormats) {
        const result = await simctlAddmediaTool({
          udid: validUDID,
          mediaPath: `/path/to/image.${format}`,
        });
        const response = JSON.parse(result.content[0].text);
        expect(response.mediaPath).toContain(format);
      }
    });

    it('should detect video types', async () => {
      const videoFormats = ['mp4', 'mov', 'avi', 'mkv'];
      for (const format of videoFormats) {
        const result = await simctlAddmediaTool({
          udid: validUDID,
          mediaPath: `/path/to/video.${format}`,
        });
        const response = JSON.parse(result.content[0].text);
        expect(response.mediaPath).toContain(format);
      }
    });
  });
});
