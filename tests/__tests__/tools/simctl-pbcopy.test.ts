import { simctlPbcopyTool } from '../../../src/tools/simctl/pbcopy.js';
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
    stdout: 'Hello World',
    stderr: '',
  }),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlPbcopyTool', () => {
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

  describe('successful paste operation', () => {
    it('should paste text to simulator clipboard', async () => {
      const textToPaste = 'Hello World';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: textToPaste,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.udid).toBe(validUDID);
    });

    it('should return simulator information', async () => {
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
    });

    it('should provide guidance', async () => {
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });

    it('should include text length in response', async () => {
      const text = 'Hello World';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.textLength).toBe(text.length);
    });
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlPbcopyTool({
          udid: '',
          text: 'Test',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty text', async () => {
      await expect(
        simctlPbcopyTool({
          udid: validUDID,
          text: '',
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlPbcopyTool({
          udid: 'invalid-udid',
          text: 'Test',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle whitespace-only inputs', async () => {
      await expect(
        simctlPbcopyTool({
          udid: '   ',
          text: '   ',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('text content variations', () => {
    it('should handle plain text', async () => {
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Plain text content',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.textLength).toBe('Plain text content'.length);
    });

    it('should handle text with newlines', async () => {
      const textWithNewlines = 'Line 1\nLine 2\nLine 3';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: textWithNewlines,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.textLength).toBe(textWithNewlines.length);
    });

    it('should handle text with special characters', async () => {
      const specialText = 'Special chars: !@#$%^&*()-_=+[]{}|;:\'",.<>?/';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: specialText,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle unicode text', async () => {
      const unicodeText = 'Unicode: 你好 🚀 مرحبا мир';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: unicodeText,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle URL strings', async () => {
      const url = 'https://example.com/path?query=value&other=123';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: url,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle JSON strings', async () => {
      const json = '{"key":"value","nested":{"deep":"data"}}';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: json,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle XML strings', async () => {
      const xml = '<root><child attr="value">content</child></root>';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: xml,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(bootedSimulator as any);

      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      expect(result.isError).toBe(false);
    });

    it('should work with shutdown simulator', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(shutdownSimulator as any);

      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      expect(result.isError).toBe(false);
    });

    it('should warn if simulator is unavailable', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(unavailableSimulator as any);

      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) => g.includes('unavailable'))).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle paste operation failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Failed to copy to clipboard',
      });

      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Command failed'));

      await expect(
        simctlPbcopyTool({
          udid: validUDID,
          text: 'Test',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle simulator cache error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(new Error('Cache error'));

      await expect(
        simctlPbcopyTool({
          udid: validUDID,
          text: 'Test',
        })
      ).rejects.toThrow(McpError);
    });

    it('should provide helpful error messages', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Clipboard operation not supported',
      });

      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('textLength');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
      expect(response).toHaveProperty('command');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      await expect(
        simctlPbcopyTool({
          udid: 'invalid',
          text: 'Test',
        })
      ).rejects.toThrow(McpError);
    });

    it('should be valid JSON', async () => {
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });

    it('should format response correctly', async () => {
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Test',
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle very long text', async () => {
      const longText = 'x'.repeat(100000);
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: longText,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.textLength).toBe(longText.length);
    });

    it('should handle text with null bytes', async () => {
      const textWithNull = 'Before\x00After';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: textWithNull,
      });

      expect(result.content).toBeDefined();
    });

    it('should handle concurrent paste operations', async () => {
      const result1 = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Text 1',
      });

      const result2 = await simctlPbcopyTool({
        udid: validUDID,
        text: 'Text 2',
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle multiple paste operations in sequence', async () => {
      for (let i = 0; i < 5; i++) {
        const result = await simctlPbcopyTool({
          udid: validUDID,
          text: `Text ${i}`,
        });
        expect(result.isError).toBe(false);
      }
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce({
        ...validSimulator,
        udid: longUDID,
      } as any);

      const result = await simctlPbcopyTool({
        udid: longUDID,
        text: 'Test',
      });

      expect(result.isError).toBe(false);
    });

    it('should handle single character text', async () => {
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: 'A',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.textLength).toBe(1);
    });

    it('should handle emoji-only text', async () => {
      const emojiText = '🚀💻🎉🌟✨';
      const result = await simctlPbcopyTool({
        udid: validUDID,
        text: emojiText,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });
});
