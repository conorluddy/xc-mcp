import { simctlAppearanceTool } from '../../../src/tools/simctl/appearance.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Suppress console.error noise during tests
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  jest.restoreAllMocks();
});

// Mock the simulator cache
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    findSimulatorByUdid: jest.fn(),
    getSimulatorList: jest.fn(),
    getAvailableSimulators: jest.fn(),
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

const VALID_UDID = 'test-device-udid-123';
const VALID_SIMULATOR = {
  name: 'iPhone 16 Pro',
  udid: VALID_UDID,
  state: 'Booted',
  isAvailable: true,
};

function getExecuteCommand() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../src/utils/command.js').executeCommand as jest.Mock;
}

describe('simctlAppearanceTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatorCache.findSimulatorByUdid.mockResolvedValue(VALID_SIMULATOR as any);
    mockSimulatorCache.getAvailableSimulators.mockResolvedValue([VALID_SIMULATOR] as any);
    getExecuteCommand().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  });

  // === VALIDATION ===

  describe('input validation', () => {
    it('should reject call with no action params', async () => {
      await expect(simctlAppearanceTool({ udid: VALID_UDID })).rejects.toThrow(McpError);
    });

    it('should reject reset combined with theme', async () => {
      await expect(
        simctlAppearanceTool({ udid: VALID_UDID, reset: true, theme: 'dark' })
      ).rejects.toThrow(McpError);
    });

    it('should reject reset combined with textSize', async () => {
      await expect(
        simctlAppearanceTool({ udid: VALID_UDID, reset: true, textSize: 'L' })
      ).rejects.toThrow(McpError);
    });

    it('should reject reset combined with locale', async () => {
      await expect(
        simctlAppearanceTool({ udid: VALID_UDID, reset: true, locale: 'de' })
      ).rejects.toThrow(McpError);
    });

    it('should reject region without locale', async () => {
      await expect(
        simctlAppearanceTool({ udid: VALID_UDID, region: 'US', theme: 'dark' })
      ).rejects.toThrow(McpError);
    });

    it('should reject bundleId without locale', async () => {
      await expect(
        simctlAppearanceTool({ udid: VALID_UDID, bundleId: 'com.app', theme: 'dark' })
      ).rejects.toThrow(McpError);
    });

    it('should reject unknown textSize alias', async () => {
      await expect(simctlAppearanceTool({ udid: VALID_UDID, textSize: 'HUGE' })).rejects.toThrow(
        McpError
      );
    });

    it('should reject unknown simulator UDID', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);
      await expect(simctlAppearanceTool({ udid: 'bad-udid', theme: 'dark' })).rejects.toThrow(
        McpError
      );
    });

    it('should reject when no booted simulator and no udid provided', async () => {
      mockSimulatorCache.getAvailableSimulators.mockResolvedValueOnce([]);
      await expect(simctlAppearanceTool({ theme: 'dark' })).rejects.toThrow(McpError);
    });
  });

  // === THEME ===

  describe('theme', () => {
    it('should call correct command for light theme', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, theme: 'light' });

      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining(`simctl ui "${VALID_UDID}" appearance light`),
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });

    it('should call correct command for dark theme', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, theme: 'dark' });

      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining(`simctl ui "${VALID_UDID}" appearance dark`),
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });

    it('should report theme in results', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, theme: 'dark' });
      const data = JSON.parse(result.content[0].text);

      expect(data.results.theme).toBeDefined();
      expect(data.results.theme.success).toBe(true);
      expect(data.results.theme.message).toContain('dark');
    });
  });

  // === TEXT SIZE ===

  describe('textSize', () => {
    it('should resolve XS alias to extra-small token', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, textSize: 'XS' });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('content_size extra-small'),
        expect.any(Object)
      );
    });

    it('should resolve M alias to medium token', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, textSize: 'M' });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('content_size medium'),
        expect.any(Object)
      );
    });

    it('should resolve AX3 alias to accessibility-extra-large token', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, textSize: 'AX3' });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('content_size accessibility-extra-large'),
        expect.any(Object)
      );
    });

    it('should resolve AX5 alias to accessibility-extra-extra-extra-large token', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, textSize: 'AX5' });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('content_size accessibility-extra-extra-extra-large'),
        expect.any(Object)
      );
    });

    it('should include textSize in results', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, textSize: 'L' });
      const data = JSON.parse(result.content[0].text);
      expect(data.results.textSize).toBeDefined();
      expect(data.results.textSize.success).toBe(true);
    });
  });

  // === LOCALE ===

  describe('locale', () => {
    it('should write AppleLanguages defaults', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, locale: 'de' });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('AppleLanguages -array de'),
        expect.any(Object)
      );
    });

    it('should write AppleLocale defaults', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, locale: 'de' });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('AppleLocale -string de'),
        expect.any(Object)
      );
    });

    it('should combine locale and region into AppleLocale', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, locale: 'de', region: 'DE' });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('AppleLocale -string de_DE'),
        expect.any(Object)
      );
    });

    it('should flag RTL for Arabic locale', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, locale: 'ar' });
      const data = JSON.parse(result.content[0].text);
      expect(data.results.locale.message).toContain('[RTL layout]');
    });

    it('should flag RTL for Hebrew locale', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, locale: 'he' });
      const data = JSON.parse(result.content[0].text);
      expect(data.results.locale.message).toContain('[RTL layout]');
    });

    it('should NOT flag RTL for English locale', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, locale: 'en' });
      const data = JSON.parse(result.content[0].text);
      expect(data.results.locale.message).not.toContain('[RTL layout]');
    });

    it('should terminate and launch app when bundleId provided', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, locale: 'fr', bundleId: 'com.myapp' });

      const calls: string[] = getExecuteCommand().mock.calls.map(
        (c: string[][]) => c[0] as unknown as string
      );
      expect(calls.some((c: string) => c.includes('terminate') && c.includes('com.myapp'))).toBe(
        true
      );
      expect(calls.some((c: string) => c.includes('launch') && c.includes('com.myapp'))).toBe(true);
    });

    it('should note restart-needed when no bundleId', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, locale: 'ja' });
      const data = JSON.parse(result.content[0].text);
      expect(data.results.locale.message).toContain('restart app to apply');
    });
  });

  // === RESET ===

  describe('reset', () => {
    it('should reset theme to light', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, reset: true });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('appearance light'),
        expect.any(Object)
      );
    });

    it('should reset text size to medium', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, reset: true });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('content_size medium'),
        expect.any(Object)
      );
    });

    it('should reset locale to en_US', async () => {
      await simctlAppearanceTool({ udid: VALID_UDID, reset: true });
      expect(getExecuteCommand()).toHaveBeenCalledWith(
        expect.stringContaining('AppleLocale -string en_US'),
        expect.any(Object)
      );
    });

    it('should report success message for reset', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, reset: true });
      const data = JSON.parse(result.content[0].text);
      expect(data.results.reset.success).toBe(true);
      expect(data.results.reset.message).toContain('defaults');
    });
  });

  // === AUTO-DETECT UDID ===

  describe('udid auto-detection', () => {
    it('should auto-detect booted simulator when udid omitted', async () => {
      const result = await simctlAppearanceTool({ theme: 'dark' });
      const data = JSON.parse(result.content[0].text);
      expect(data.udid).toBe(VALID_UDID);
    });
  });

  // === RESPONSE FORMAT ===

  describe('response format', () => {
    it('should return valid JSON in text block', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, theme: 'light' });
      expect(result.content[0].type).toBe('text');
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include success, udid, results, guidance fields', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, theme: 'light' });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('udid');
      expect(data).toHaveProperty('results');
      expect(data).toHaveProperty('guidance');
    });

    it('should set isError false on success', async () => {
      const result = await simctlAppearanceTool({ udid: VALID_UDID, theme: 'light' });
      expect(result.isError).toBe(false);
    });

    it('should set isError true when command fails', async () => {
      getExecuteCommand().mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'Error' });
      const result = await simctlAppearanceTool({ udid: VALID_UDID, theme: 'dark' });
      expect(result.isError).toBe(true);
    });
  });

  // === ERROR HANDLING ===

  describe('error handling', () => {
    it('should wrap unexpected errors in McpError', async () => {
      getExecuteCommand().mockRejectedValueOnce(new Error('Subprocess crashed'));
      await expect(simctlAppearanceTool({ udid: VALID_UDID, theme: 'dark' })).rejects.toThrow(
        McpError
      );
    });

    it('should wrap cache errors in McpError', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockRejectedValueOnce(new Error('Cache failure'));
      await expect(simctlAppearanceTool({ udid: VALID_UDID, theme: 'dark' })).rejects.toThrow(
        McpError
      );
    });
  });
});
