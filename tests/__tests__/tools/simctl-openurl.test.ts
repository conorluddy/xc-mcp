import { simctlOpenUrlTool } from '../../../src/tools/simctl/openurl.js';
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

describe('simctlOpenUrlTool', () => {
  const validUDID = 'device-iphone16pro';
  const validURL = 'https://example.com';
  const validDeepLink = 'myapp://open?id=123';
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

  describe('successful URL opening', () => {
    it('should open URL on simulator', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.udid).toBe(validUDID);
      expect(response.url).toBe(validURL);
    });

    it('should open deep link URL', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validDeepLink,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.url).toBe(validDeepLink);
    });

    it('should return simulator information', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
    });

    it('should provide next steps guidance', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);
    });

    it('should format response correctly', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
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
      const result = await simctlOpenUrlTool({
        udid: '',
        url: validURL,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('UDID');
    });

    it('should reject empty URL', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: '',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('URL');
    });

    it('should reject invalid URL format', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'not a url',
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('URL');
    });

    it('should reject non-existent simulator', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlOpenUrlTool({
        udid: 'invalid-udid',
        url: validURL,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('not found');
    });

    it('should handle whitespace-only inputs', async () => {
      const result = await simctlOpenUrlTool({
        udid: '   ',
        url: '   ',
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('URL format support', () => {
    it('should handle http URLs', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'http://example.com',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle https URLs', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'https://example.com',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle custom scheme deep links', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'myapp://open?id=123',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle URLs with query parameters', async () => {
      const urlWithParams = 'https://example.com/path?key1=value1&key2=value2';
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: urlWithParams,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.url).toBe(urlWithParams);
    });

    it('should handle URLs with fragments', async () => {
      const urlWithFragment = 'https://example.com/page#section';
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: urlWithFragment,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.url).toBe(urlWithFragment);
    });

    it('should handle URLs with special characters', async () => {
      const urlWithSpecialChars = 'https://example.com/search?q=%40user&type=email';
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: urlWithSpecialChars,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.url).toBe(urlWithSpecialChars);
    });

    it('should handle mailto URLs', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'mailto:test@example.com',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle tel URLs', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'tel:+1234567890',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle sms URLs', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'sms:+1234567890?body=Hello',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('simulator state handling', () => {
    it('should work with booted simulator', async () => {
      const bootedSimulator = { ...validSimulator, state: 'Booted' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        bootedSimulator as any
      );

      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      expect(result.isError).toBe(false);
    });

    it('should warn if simulator is shutdown', async () => {
      const shutdownSimulator = { ...validSimulator, state: 'Shutdown' };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        shutdownSimulator as any
      );

      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) =>
        g.includes('boot') || g.includes('shutdown')
      )).toBe(true);
    });

    it('should warn if simulator is unavailable', async () => {
      const unavailableSimulator = { ...validSimulator, isAvailable: false };
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        unavailableSimulator as any
      );

      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) =>
        g.includes('unavailable')
      )).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle URL open failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: Unable to open URL',
      });

      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle invalid scheme error', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Error: No handler for scheme',
      });

      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'unknownscheme://something',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle command execution failure', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Command failed'));

      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      expect(result.isError).toBe(true);
    });

    it('should handle simulator cache error', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(
        new Error('Cache error')
      );

      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      expect(result.isError).toBe(true);
    });

    it('should provide helpful error messages', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Unable to open: scheme not supported',
      });

      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should include all required fields on success', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('url');
      expect(response).toHaveProperty('simulatorInfo');
      expect(response).toHaveProperty('guidance');
      expect(response).toHaveProperty('command');
    });

    it('should include error details on failure', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);

      const result = await simctlOpenUrlTool({
        udid: 'invalid',
        url: validURL,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('error');
    });

    it('should be valid JSON', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: validURL,
      });

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle very long URLs', async () => {
      const longUrl = 'https://example.com/path?' +
        Array.from({ length: 100 }, (_, i) => `param${i}=value${i}`).join('&');
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: longUrl,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.url).toBe(longUrl);
    });

    it('should handle URLs with unicode characters', async () => {
      const urlWithUnicode = 'https://example.com/search?q=🚀';
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: urlWithUnicode,
      });

      expect(result.content).toBeDefined();
    });

    it('should handle concurrent URL opens', async () => {
      const result1 = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'https://example.com/page1',
      });

      const result2 = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'https://example.com/page2',
      });

      expect(result1.isError).toBe(false);
      expect(result2.isError).toBe(false);
    });

    it('should handle very long UDID values', async () => {
      const longUDID = 'a'.repeat(100);
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(
        { ...validSimulator, udid: longUDID } as any
      );

      const result = await simctlOpenUrlTool({
        udid: longUDID,
        url: validURL,
      });

      expect(result.isError).toBe(false);
    });

    it('should handle localhost URLs', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'http://localhost:8080/api',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle IP-based URLs', async () => {
      const result = await simctlOpenUrlTool({
        udid: validUDID,
        url: 'http://192.168.1.1:3000',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });
});
