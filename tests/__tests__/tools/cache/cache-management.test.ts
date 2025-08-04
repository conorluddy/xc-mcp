import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { 
  getCacheStatsTool, 
  setCacheConfigTool, 
  getCacheConfigTool, 
  clearCacheTool 
} from '../../../../src/tools/cache/cache-management.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import { simulatorCache } from '../../../../src/state/simulator-cache.js';
import { projectCache } from '../../../../src/state/project-cache.js';
import { responseCache } from '../../../../src/utils/response-cache.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('cache management tools', () => {
  setupTest();

  beforeEach(() => {
    simulatorCache.clearCache();
    projectCache.clearCache();
    responseCache.clear();
  });

  describe('getCacheStatsTool', () => {
    it('should return cache statistics for all caches', async () => {
      // Populate some cache data
      const simCache = simulatorCache;
      const projCache = projectCache;
      const respCache = responseCache;

      // Mock simulator cache data
      (simCache as any).cache = {
        devices: {
          'iOS-17-0': [{
            udid: 'test-device',
            name: 'iPhone 15',
            state: 'Booted',
            isAvailable: true,
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            dataPath: '/path',
            dataPathSize: 1000000,
            logPath: '/logs'
          }]
        },
        lastUpdated: new Date(),
        runtimes: [],
        devicetypes: [],
        preferredByProject: new Map()
      };

      // Mock project cache data
      (projCache as any).projectConfigs.set('/path/to/project', {
        path: '/path/to/project',
        lastModified: new Date(),
        projectData: {
          project: {
            name: 'TestProject',
            schemes: ['TestScheme'],
            targets: ['TestTarget'],
            configurations: ['Debug', 'Release']
          }
        },
        preferredScheme: 'TestScheme'
      });

      respCache.store({
        tool: 'test-tool',
        fullOutput: 'Test output',
        stderr: '',
        exitCode: 0,
        command: 'test',
        metadata: {}
      });

      const result = await getCacheStatsTool({});

      expect(result.content[0].type).toBe('text');
      const stats = JSON.parse(result.content[0].text);
      
      expect(stats).toMatchObject({
        simulator: {
          deviceCount: 1,
          isCached: true
        },
        project: {
          projectCount: 1,
          isCached: true
        },
        response: {
          entryCount: 1,
          totalSize: expect.any(Number)
        }
      });
    });

    it('should handle empty caches', async () => {
      const result = await getCacheStatsTool({});

      expect(result.content[0].type).toBe('text');
      const stats = JSON.parse(result.content[0].text);
      
      expect(stats).toMatchObject({
        simulator: {
          deviceCount: 0,
          isCached: false
        },
        project: {
          projectCount: 0,
          isCached: false
        },
        response: {
          entryCount: 0,
          totalSize: 0
        }
      });
    });
  });

  describe('setCacheConfigTool', () => {
    it('should update cache configuration', async () => {
      const result = await setCacheConfigTool({
        simulatorCacheMaxAge: 7200000, // 2 hours
        projectCacheMaxAge: 3600000, // 1 hour
        responseCacheMaxAge: 1800000 // 30 minutes
      });

      expect(result.content[0].type).toBe('text');
      const config = JSON.parse(result.content[0].text);
      
      expect(config).toMatchObject({
        updated: {
          simulatorCacheMaxAge: 7200000,
          projectCacheMaxAge: 3600000,
          responseCacheMaxAge: 1800000
        }
      });

      // Verify settings were applied
      expect(simulatorCache.getCacheMaxAge()).toBe(7200000);
      expect(projectCache.getCacheMaxAge()).toBe(3600000);
    });

    it('should update partial configuration', async () => {
      const result = await setCacheConfigTool({
        simulatorCacheMaxAge: 1800000
      });

      expect(result.content[0].type).toBe('text');
      const config = JSON.parse(result.content[0].text);
      
      expect(config.updated).toMatchObject({
        simulatorCacheMaxAge: 1800000
      });
      expect(config.updated.projectCacheMaxAge).toBeUndefined();
    });

    it('should validate cache max age values', async () => {
      await expect(setCacheConfigTool({
        simulatorCacheMaxAge: -1
      })).rejects.toThrow('Cache max age must be positive');

      await expect(setCacheConfigTool({
        projectCacheMaxAge: 0
      })).rejects.toThrow('Cache max age must be positive');
    });
  });

  describe('getCacheConfigTool', () => {
    it('should return current cache configuration', async () => {
      // Set some config first
      simulatorCache.setCacheMaxAge(7200000);
      projectCache.setCacheMaxAge(3600000);

      const result = await getCacheConfigTool({});

      expect(result.content[0].type).toBe('text');
      const config = JSON.parse(result.content[0].text);
      
      expect(config).toMatchObject({
        config: {
          simulatorCacheMaxAge: 7200000,
          simulatorCacheMaxAgeHuman: '2 hours',
          projectCacheMaxAge: 3600000,
          projectCacheMaxAgeHuman: '1 hour',
          responseCacheMaxAge: expect.any(Number),
          responseCacheMaxAgeHuman: expect.any(String)
        }
      });
    });
  });

  describe('clearCacheTool', () => {
    it('should clear all caches by default', async () => {
      // Populate caches
      (simulatorCache as any).cache = {
        devices: { 'iOS-17-0': [] },
        lastUpdated: new Date(),
        runtimes: [],
        devicetypes: [],
        preferredByProject: new Map()
      };
      
      (projectCache as any).projectConfigs.set('/path/to/project', {});
      
      responseCache.store({
        tool: 'test',
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'test',
        metadata: {}
      });

      const result = await clearCacheTool({});

      expect(result.content[0].type).toBe('text');
      const cleared = JSON.parse(result.content[0].text);
      
      expect(cleared.cleared).toContain('simulator');
      expect(cleared.cleared).toContain('project');
      expect(cleared.cleared).toContain('response');

      // Verify caches are empty
      expect((simulatorCache as any).cache).toBeNull();
      expect((projectCache as any).projectConfigs.size).toBe(0);
      expect(responseCache.getStats().totalEntries).toBe(0);
    });

    it('should clear specific caches only', async () => {
      // Populate all caches
      (simulatorCache as any).cache = {
        devices: { 'iOS-17-0': [] },
        lastUpdated: new Date(),
        runtimes: [],
        devicetypes: [],
        preferredByProject: new Map()
      };
      
      (projectCache as any).projectConfigs.set('/path/to/project', {});
      
      responseCache.store({
        tool: 'test',
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'test',
        metadata: {}
      });

      const result = await clearCacheTool({
        caches: ['simulator']
      });

      expect(result.content[0].type).toBe('text');
      const cleared = JSON.parse(result.content[0].text);
      
      expect(cleared.cleared).toContain('simulator');
      expect(cleared.cleared).not.toContain('project');
      expect(cleared.cleared).not.toContain('response');

      // Verify only simulator cache was cleared
      expect((simulatorCache as any).cache).toBeNull();
      expect((projectCache as any).projectConfigs.size).toBe(1);
      expect(responseCache.getStats().totalEntries).toBe(1);
    });

    it('should handle invalid cache names', async () => {
      await expect(clearCacheTool({
        caches: ['invalid-cache']
      })).rejects.toThrow('Invalid cache name');
    });
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(getCacheStatsTool({})).rejects.toThrow('Xcode is not installed');
    await expect(setCacheConfigTool({})).rejects.toThrow('Xcode is not installed');
    await expect(getCacheConfigTool({})).rejects.toThrow('Xcode is not installed');
    await expect(clearCacheTool({})).rejects.toThrow('Xcode is not installed');
  });
});