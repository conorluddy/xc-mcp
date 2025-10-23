import { simctlSuggestTool } from '../../../src/tools/simctl/suggest.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';

// Mock the simulator cache
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    getSuggestedSimulators: jest.fn(),
    recordBootEvent: jest.fn(),
    recordSimulatorUsage: jest.fn(),
  },
}));

// Mock command execution for boot
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: '',
    stderr: '',
  }),
  buildSimctlCommand: jest.fn().mockReturnValue('xcrun simctl boot device-id'),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;

describe('simctlSuggestTool', () => {
  const mockSuggestions = [
    {
      simulator: {
        name: 'iPhone 16 Pro',
        udid: 'device-iphone16pro',
        state: 'Shutdown',
        isAvailable: true,
        availability: '(available)',
        deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro',
        bootHistory: [new Date()],
        performanceMetrics: { avgBootTime: 8500, reliability: 0.9 },
        lastUsed: new Date(),
      },
      score: 105,
      reasons: ['Project preference', 'iPhone 18'],
    },
    {
      simulator: {
        name: 'iPhone 15',
        udid: 'device-iphone15',
        state: 'Shutdown',
        isAvailable: true,
        availability: '(available)',
        deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        bootHistory: [],
        performanceMetrics: { avgBootTime: 9200, reliability: 0.85 },
        lastUsed: new Date(Date.now() - 3600000),
      },
      score: 95,
      reasons: ['Recently used', 'iPhone 17'],
    },
    {
      simulator: {
        name: 'iPad Pro',
        udid: 'device-ipadpro',
        state: 'Shutdown',
        isAvailable: true,
        availability: '(available)',
        deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro',
        bootHistory: [],
        lastUsed: undefined,
      },
      score: 60,
      reasons: ['iPad', 'iOS 17'],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatorCache.getSuggestedSimulators.mockResolvedValue(mockSuggestions);
  });

  describe('successful suggestions', () => {
    it('should return suggestions with proper structure', async () => {
      const result = await simctlSuggestTool({});

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.isError).toBe(false);
    });

    it('should format suggestions with scores and reasons', async () => {
      const result = await simctlSuggestTool({});

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.suggestions).toBeDefined();
      expect(Array.isArray(response.suggestions)).toBe(true);

      const firstSuggestion = response.suggestions[0];
      expect(firstSuggestion.name).toBe('iPhone 16 Pro');
      expect(firstSuggestion.udid).toBe('device-iphone16pro');
      expect(firstSuggestion.score).toBeDefined();
      expect(firstSuggestion.reasons).toBeDefined();
      expect(Array.isArray(firstSuggestion.reasons)).toBe(true);
    });

    it('should rank suggestions correctly', async () => {
      const result = await simctlSuggestTool({});
      const response = JSON.parse(result.content[0].text);

      expect(response.suggestions[0].score).toBeGreaterThanOrEqual(
        response.suggestions[1].score
      );
      expect(response.suggestions[1].score).toBeGreaterThanOrEqual(
        response.suggestions[2].score
      );
    });

    it('should include boot history in response', async () => {
      const result = await simctlSuggestTool({});
      const response = JSON.parse(result.content[0].text);

      const firstSuggestion = response.suggestions[0];
      expect(firstSuggestion.bootHistory).toBeDefined();
      expect(firstSuggestion.bootHistory.count).toBeDefined();
      expect(firstSuggestion.bootHistory.avgBootTime).toBeDefined();
    });

    it('should pass projectPath to cache', async () => {
      const projectPath = '/path/to/project';
      await simctlSuggestTool({ projectPath });

      expect(mockSimulatorCache.getSuggestedSimulators).toHaveBeenCalledWith(
        projectPath,
        undefined,
        4
      );
    });

    it('should pass deviceType filter to cache', async () => {
      await simctlSuggestTool({ deviceType: 'iPhone' });

      expect(mockSimulatorCache.getSuggestedSimulators).toHaveBeenCalledWith(
        undefined,
        'iPhone',
        4
      );
    });

    it('should pass maxSuggestions to cache', async () => {
      await simctlSuggestTool({ maxSuggestions: 2 });

      expect(mockSimulatorCache.getSuggestedSimulators).toHaveBeenCalledWith(
        undefined,
        undefined,
        2
      );
    });

    it('should include project context in response', async () => {
      const projectPath = '/path/to/project';
      const result = await simctlSuggestTool({ projectPath });
      const response = JSON.parse(result.content[0].text);

      expect(response.projectContext).toBeDefined();
      expect(response.projectContext.projectPath).toBe(projectPath);
    });

    it('should include scoring criteria in response', async () => {
      const result = await simctlSuggestTool({});
      const response = JSON.parse(result.content[0].text);

      expect(response.summary).toBeDefined();
      expect(response.summary.scoringCriteria).toBeDefined();
      expect(response.summary.scoringCriteria.projectPreference).toBe('40 points');
    });
  });

  describe('auto-boot functionality', () => {
    it('should not boot by default', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      await simctlSuggestTool({});

      expect(executeCommand).not.toHaveBeenCalled();
    });

    it('should boot top suggestion when requested', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      await simctlSuggestTool({ autoBootTopSuggestion: true });

      expect(executeCommand).toHaveBeenCalled();
    });

    it('should record boot event when auto-booting', async () => {
      await simctlSuggestTool({ autoBootTopSuggestion: true });

      expect(mockSimulatorCache.recordBootEvent).toHaveBeenCalledWith(
        'device-iphone16pro',
        true
      );
    });

    it('should record simulator usage when auto-booting', async () => {
      const projectPath = '/path/to/project';
      await simctlSuggestTool({
        projectPath,
        autoBootTopSuggestion: true,
      });

      expect(mockSimulatorCache.recordSimulatorUsage).toHaveBeenCalledWith(
        'device-iphone16pro',
        projectPath
      );
    });

    it('should handle boot failures gracefully', async () => {
      const { executeCommand } = require('../../../src/utils/command.js');
      executeCommand.mockRejectedValueOnce(new Error('Boot failed'));

      const result = await simctlSuggestTool({ autoBootTopSuggestion: true });

      // Should still return suggestions even if boot fails
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.suggestions).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle no suggestions available', async () => {
      mockSimulatorCache.getSuggestedSimulators.mockResolvedValueOnce([]);

      const result = await simctlSuggestTool({});

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.message).toContain('No available simulators');
    });

    it('should provide guidance when no simulators available', async () => {
      mockSimulatorCache.getSuggestedSimulators.mockResolvedValueOnce([]);

      const result = await simctlSuggestTool({});
      const response = JSON.parse(result.content[0].text);

      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.some((g: string) => g.includes('simctl-create'))).toBe(
        true
      );
    });

    it('should handle cache errors', async () => {
      mockSimulatorCache.getSuggestedSimulators.mockRejectedValueOnce(
        new Error('Cache error')
      );

      await expect(simctlSuggestTool({})).rejects.toThrow();
    });
  });

  describe('guidance and recommendations', () => {
    it('should provide device-specific guidance', async () => {
      const result = await simctlSuggestTool({});
      const response = JSON.parse(result.content[0].text);

      expect(response.guidance).toBeDefined();
      const firstGuidance = response.guidance.find((g: string) =>
        g.includes('Top suggestion')
      );
      expect(firstGuidance).toBeDefined();
    });

    it('should include commands for next steps', async () => {
      const result = await simctlSuggestTool({});
      const response = JSON.parse(result.content[0].text);

      const bootCommand = response.guidance.find((g: string) =>
        g.includes('simctl-boot')
      );
      expect(bootCommand).toBeDefined();
    });
  });

  describe('response format', () => {
    it('should return properly formatted MCP response', async () => {
      const result = await simctlSuggestTool({});

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });

    it('should include summary statistics', async () => {
      const result = await simctlSuggestTool({});
      const response = JSON.parse(result.content[0].text);

      expect(response.summary).toBeDefined();
      expect(response.summary.totalSuggestions).toBe(3);
      expect(response.summary.topSuggestion).toBe('iPhone 16 Pro');
    });

    it('should JSON serialize without errors', async () => {
      const result = await simctlSuggestTool({});

      // Should not throw
      const response = JSON.parse(result.content[0].text);
      expect(response).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle single suggestion', async () => {
      mockSimulatorCache.getSuggestedSimulators.mockResolvedValueOnce([
        mockSuggestions[0],
      ]);

      const result = await simctlSuggestTool({});
      const response = JSON.parse(result.content[0].text);

      expect(response.suggestions.length).toBe(1);
      expect(response.summary.topSuggestion).toBe('iPhone 16 Pro');
    });

    it('should handle maxSuggestions smaller than available', async () => {
      await simctlSuggestTool({ maxSuggestions: 1 });

      expect(mockSimulatorCache.getSuggestedSimulators).toHaveBeenCalledWith(
        undefined,
        undefined,
        1
      );
    });

    it('should handle missing optional parameters', async () => {
      const result = await simctlSuggestTool({
        projectPath: undefined,
        deviceType: undefined,
        maxSuggestions: undefined,
        autoBootTopSuggestion: undefined,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should handle very long device names gracefully', async () => {
      const longNameSuggestion = {
        ...mockSuggestions[0],
        simulator: {
          ...mockSuggestions[0].simulator,
          name: 'iPhone with a very long device name for testing purposes',
        },
      };

      mockSimulatorCache.getSuggestedSimulators.mockResolvedValueOnce([
        longNameSuggestion,
      ]);

      const result = await simctlSuggestTool({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.suggestions[0].name).toContain('very long');
    });
  });
});
