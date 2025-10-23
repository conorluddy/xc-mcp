import { simctlTypeTextTool } from '../../../src/tools/simctl/type-text';
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

describe('simctlTypeTextTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(mockSimulator);
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlTypeTextTool({
          udid: '',
          text: 'hello',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('UDID'),
        })
      );
    });

    it('should reject empty text', async () => {
      await expect(
        simctlTypeTextTool({
          udid: 'device-iphone16pro',
          text: '',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(/[Tt]ext/),
        })
      );
    });

    it('should reject non-existent simulator', async () => {
      (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(null);

      await expect(
        simctlTypeTextTool({
          udid: 'invalid-udid',
          text: 'hello',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        })
      );
    });

    it('should handle whitespace-only input', async () => {
      await expect(
        simctlTypeTextTool({
          udid: 'device-iphone16pro',
          text: '   ',
        })
      ).rejects.toThrow();
    });
  });

  describe('successful text input', () => {
    it('should type simple text', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Text typed: "hello"',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.textInfo.textLength).toBe(5);
    });

    it('should type email address', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Text typed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'user@example.com',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.textInfo.textLength).toBe(16);
    });

    it('should type password', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Text typed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'P@ssw0rd!',
        isSensitive: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.textInfo.isSensitive).toBe(true);
    });

    it('should type multi-line text', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Text typed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'Line 1\nLine 2\nLine 3',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should type special characters', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Text typed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: '!@#$%^&*()',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should type unicode characters', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Text typed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'こんにちは',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should type very long text', async () => {
      const longText = 'a'.repeat(1000);

      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Text typed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: longText,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.textInfo.textLength).toBe(1000);
    });
  });

  describe('keyboard control', () => {
    it('should support delete operations', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Backspace executed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
        keyboardActions: ['backspace'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should support return/enter key', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Return executed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'search term',
        keyboardActions: ['return'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should support tab key', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Tab executed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'field1',
        keyboardActions: ['tab'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should support multiple keyboard actions', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Actions executed',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
        keyboardActions: ['backspace', 'backspace', 'return'],
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
        stderr: 'Typing failed: no text input field focused',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.cacheId).toBeDefined();
    });

    it('should warn if no input field is focused', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'No input field active',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('focused');
    });

    it('should handle simulator not booted', async () => {
      const shutdownSimulator = { ...mockSimulator, state: 'Shutdown' };
      (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(shutdownSimulator);

      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Simulator not available',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('boot');
    });
  });

  describe('response format', () => {
    it('should include simulator info', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
      expect(response.simulatorInfo.state).toBe('Booted');
    });

    it('should include text length information', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello world',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.textInfo.textLength).toBe(11);
    });

    it('should include text preview for long text', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'a'.repeat(500),
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.textInfo.textPreview).toBeDefined();
    });

    it('should mask sensitive text in response', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'secret123',
        isSensitive: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.textInfo.isSensitive).toBe(true);
      // Should not expose actual text
      expect(response.textInfo.textPreview).not.toContain('secret');
    });

    it('should include guidance suggestions', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
    });
  });

  describe('LLM optimization', () => {
    it('should support interaction sequence tracking', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'user@example.com',
        actionName: 'Enter email address',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should enable agent verification with screenshot', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'hello',
      });

      const response = JSON.parse(result.content[0].text);
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('screenshot');
    });

    it('should track text input for interaction validation', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Success',
        stderr: '',
      });

      const result = await simctlTypeTextTool({
        udid: 'device-iphone16pro',
        text: 'test input',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.timestamp).toBeDefined();
      expect(response.textInfo.textLength).toBe(10);
    });
  });
});
