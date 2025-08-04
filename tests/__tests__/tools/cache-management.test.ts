import { jest } from '@jest/globals';
import {
  getCacheStatsTool,
  setCacheConfigTool,
  clearCacheTool,
  getCacheConfigTool,
} from '../../../src/tools/cache/cache-management.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { projectCache } from '../../../src/state/project-cache.js';
import { responseCache } from '../../../src/utils/response-cache.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock the cache modules
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    getCacheStats: jest.fn(),
    setCacheMaxAge: jest.fn(),
    clearCache: jest.fn(),
    getCacheMaxAge: jest.fn(),
  },
}));

jest.mock('../../../src/state/project-cache.js', () => ({
  projectCache: {
    getCacheStats: jest.fn(),
    setCacheMaxAge: jest.fn(),
    clearCache: jest.fn(),
    getCacheMaxAge: jest.fn(),
  },
}));

jest.mock('../../../src/utils/response-cache.js', () => ({
  responseCache: {
    getStats: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;
const mockProjectCache = projectCache as jest.Mocked<typeof projectCache>;
const mockResponseCache = responseCache as jest.Mocked<typeof responseCache>;

describe('Cache Management Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCacheStatsTool', () => {
    it('should return combined cache statistics', async () => {
      const mockSimStats = {
        isCached: true,
        lastUpdated: new Date(),
        cacheMaxAgeMs: 3600000,
        cacheMaxAgeHuman: '1h',
        deviceCount: 5,
        recentlyUsedCount: 3,
        isExpired: false,
        timeUntilExpiry: '30m',
      };
      const mockProjectStats = {
        projectCount: 3,
        buildHistoryCount: 15,
        dependencyCount: 8,
        cacheMaxAgeMs: 3600000,
        cacheMaxAgeHuman: '1h',
      };
      const mockResponseStats = { totalEntries: 10, byTool: { 'xcodebuild-build': 5 } };

      mockSimulatorCache.getCacheStats.mockReturnValue(mockSimStats);
      mockProjectCache.getCacheStats.mockReturnValue(mockProjectStats);
      mockResponseCache.getStats.mockReturnValue(mockResponseStats);

      const result = await getCacheStatsTool({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);
      expect(response.simulator).toMatchObject({
        ...mockSimStats,
        lastUpdated: mockSimStats.lastUpdated.toISOString(),
      });
      expect(response.project).toEqual(mockProjectStats);
      expect(response.response).toEqual(mockResponseStats);
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle errors from cache stats', async () => {
      mockSimulatorCache.getCacheStats.mockImplementation(() => {
        throw new Error('Simulator cache error');
      });

      await expect(getCacheStatsTool({})).rejects.toThrow(McpError);
      await expect(getCacheStatsTool({})).rejects.toThrow(
        'Failed to get cache stats: Simulator cache error'
      );
    });
  });

  describe('setCacheConfigTool', () => {
    it('should set cache config with maxAgeMs', async () => {
      const args = { cacheType: 'simulator', maxAgeMs: 5000 };

      const result = await setCacheConfigTool(args);

      expect(mockSimulatorCache.setCacheMaxAge).toHaveBeenCalledWith(5000);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Cache configuration updated');
      expect(response.results.simulator).toBe('Set to 5s');
    });

    it('should set cache config with maxAgeMinutes', async () => {
      const args = { cacheType: 'project', maxAgeMinutes: 10 };

      const result = await setCacheConfigTool(args);

      expect(mockProjectCache.setCacheMaxAge).toHaveBeenCalledWith(600000); // 10 * 60 * 1000
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);
      expect(response.results.project).toBe('Set to 10m 0s');
    });

    it('should set cache config with maxAgeHours', async () => {
      const args = { cacheType: 'all', maxAgeHours: 2 };

      const result = await setCacheConfigTool(args);

      const expectedMaxAge = 2 * 60 * 60 * 1000; // 7200000ms
      expect(mockSimulatorCache.setCacheMaxAge).toHaveBeenCalledWith(expectedMaxAge);
      expect(mockProjectCache.setCacheMaxAge).toHaveBeenCalledWith(expectedMaxAge);

      const response = JSON.parse(result.content[0].text);
      expect(response.results.simulator).toBe('Set to 2h 0m');
      expect(response.results.project).toBe('Set to 2h 0m');
      expect(response.results.response).toBe('Response cache config is fixed at 30 minutes');
    });

    it('should reject invalid cache type', async () => {
      const args = { cacheType: 'invalid', maxAgeMs: 5000 };

      await expect(setCacheConfigTool(args)).rejects.toThrow(McpError);
      await expect(setCacheConfigTool(args)).rejects.toThrow(
        'cacheType must be one of: simulator, project, response, all'
      );
    });

    it('should reject when no age parameter is provided', async () => {
      const args = { cacheType: 'simulator' };

      await expect(setCacheConfigTool(args)).rejects.toThrow(McpError);
      await expect(setCacheConfigTool(args)).rejects.toThrow(
        'Must specify one of: maxAgeMs, maxAgeMinutes, or maxAgeHours'
      );
    });

    it('should reject age less than 1000ms', async () => {
      const args = { cacheType: 'simulator', maxAgeMs: 500 };

      await expect(setCacheConfigTool(args)).rejects.toThrow(McpError);
      await expect(setCacheConfigTool(args)).rejects.toThrow(
        'Cache max age must be at least 1000ms (1 second)'
      );
    });

    it('should handle unexpected errors', async () => {
      const args = { cacheType: 'simulator', maxAgeMs: 5000 };
      mockSimulatorCache.setCacheMaxAge.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(setCacheConfigTool(args)).rejects.toThrow(McpError);
      await expect(setCacheConfigTool(args)).rejects.toThrow(
        'Failed to set cache config: Unexpected error'
      );
    });
  });

  describe('clearCacheTool', () => {
    it('should clear simulator cache', async () => {
      const args = { cacheType: 'simulator' };

      const result = await clearCacheTool(args);

      expect(mockSimulatorCache.clearCache).toHaveBeenCalled();
      expect(mockProjectCache.clearCache).not.toHaveBeenCalled();
      expect(mockResponseCache.clear).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Cache cleared successfully');
      expect(response.results.simulator).toBe('Cleared successfully');
      expect(response.results.project).toBeUndefined();
    });

    it('should clear project cache', async () => {
      const args = { cacheType: 'project' };

      const result = await clearCacheTool(args);

      expect(mockProjectCache.clearCache).toHaveBeenCalled();
      expect(mockSimulatorCache.clearCache).not.toHaveBeenCalled();
      expect(mockResponseCache.clear).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.results.project).toBe('Cleared successfully');
    });

    it('should clear response cache', async () => {
      const args = { cacheType: 'response' };

      const result = await clearCacheTool(args);

      expect(mockResponseCache.clear).toHaveBeenCalled();
      expect(mockSimulatorCache.clearCache).not.toHaveBeenCalled();
      expect(mockProjectCache.clearCache).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.results.response).toBe('Cleared successfully');
    });

    it('should clear all caches', async () => {
      const args = { cacheType: 'all' };

      const result = await clearCacheTool(args);

      expect(mockSimulatorCache.clearCache).toHaveBeenCalled();
      expect(mockProjectCache.clearCache).toHaveBeenCalled();
      expect(mockResponseCache.clear).toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.results.simulator).toBe('Cleared successfully');
      expect(response.results.project).toBe('Cleared successfully');
      expect(response.results.response).toBe('Cleared successfully');
    });

    it('should reject invalid cache type', async () => {
      const args = { cacheType: 'invalid' };

      await expect(clearCacheTool(args)).rejects.toThrow(McpError);
      await expect(clearCacheTool(args)).rejects.toThrow(
        'cacheType must be one of: simulator, project, response, all'
      );
    });

    it('should handle unexpected errors', async () => {
      const args = { cacheType: 'simulator' };
      mockSimulatorCache.clearCache.mockImplementation(() => {
        throw new Error('Clear failed');
      });

      await expect(clearCacheTool(args)).rejects.toThrow(McpError);
      await expect(clearCacheTool(args)).rejects.toThrow('Failed to clear cache: Clear failed');
    });
  });

  describe('getCacheConfigTool', () => {
    beforeEach(() => {
      mockSimulatorCache.getCacheMaxAge.mockReturnValue(3600000); // 1 hour
      mockProjectCache.getCacheMaxAge.mockReturnValue(7200000); // 2 hours
    });

    it('should get config for all caches by default', async () => {
      const result = await getCacheConfigTool({});

      expect(mockSimulatorCache.getCacheMaxAge).toHaveBeenCalled();
      expect(mockProjectCache.getCacheMaxAge).toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.cacheConfiguration.simulator).toEqual({
        maxAgeMs: 3600000,
        maxAgeHuman: '1h 0m',
      });
      expect(response.cacheConfiguration.project).toEqual({
        maxAgeMs: 7200000,
        maxAgeHuman: '2h 0m',
      });
      expect(response.cacheConfiguration.response).toEqual({
        maxAgeMs: 1800000, // 30 minutes
        maxAgeHuman: '30m',
        note: 'Response cache duration is currently fixed',
      });
    });

    it('should get config for specific cache type', async () => {
      const args = { cacheType: 'simulator' };

      const result = await getCacheConfigTool(args);

      expect(mockSimulatorCache.getCacheMaxAge).toHaveBeenCalled();
      expect(mockProjectCache.getCacheMaxAge).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.cacheConfiguration.simulator).toBeDefined();
      expect(response.cacheConfiguration.project).toBeUndefined();
      expect(response.cacheConfiguration.response).toBeUndefined();
    });

    it('should format durations correctly', async () => {
      // Test various durations
      const testCases = [
        { ms: 1000, expected: '1s' },
        { ms: 65000, expected: '1m 5s' },
        { ms: 3665000, expected: '1h 1m' },
        { ms: 90061000, expected: '1d 1h' },
      ];

      for (const testCase of testCases) {
        mockSimulatorCache.getCacheMaxAge.mockReturnValue(testCase.ms);

        const result = await getCacheConfigTool({ cacheType: 'simulator' });
        const response = JSON.parse(result.content[0].text);

        expect(response.cacheConfiguration.simulator.maxAgeHuman).toBe(testCase.expected);
      }
    });

    it('should reject invalid cache type', async () => {
      const args = { cacheType: 'invalid' };

      await expect(getCacheConfigTool(args)).rejects.toThrow(McpError);
      await expect(getCacheConfigTool(args)).rejects.toThrow(
        'cacheType must be one of: simulator, project, response, all'
      );
    });

    it('should handle unexpected errors', async () => {
      mockSimulatorCache.getCacheMaxAge.mockImplementation(() => {
        throw new Error('Config error');
      });

      await expect(getCacheConfigTool({})).rejects.toThrow(McpError);
      await expect(getCacheConfigTool({})).rejects.toThrow(
        'Failed to get cache config: Config error'
      );
    });
  });
});
