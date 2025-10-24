import { jest } from '@jest/globals';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';
import * as command from '../../../src/utils/command.js';

// Mock the command module
jest.mock('../../../src/utils/command.js');

const mockExecuteCommand = command.executeCommand as jest.MockedFunction<
  typeof command.executeCommand
>;

describe('IDBTargetCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    IDBTargetCache.clearCache();
  });

  describe('Cache TTL Fix', () => {
    it('should use 5-second TTL by default to prevent stale boot state', () => {
      const stats = IDBTargetCache.getCacheStats();
      expect(stats.ttl).toBe(5000); // 5 seconds, not 60 seconds
    });

    it('should refresh cache after 5 seconds', async () => {
      // Mock idb list-targets output - first call shows Shutdown
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          udid: 'test-udid',
          name: 'iPhone 16 Pro',
          type: 'simulator',
          state: 'Shutdown',
          os_version: 'iOS 18.5',
          architecture: 'arm64',
          screen_dimensions: { width: 390, height: 844 },
        }),
        stderr: '',
      });

      // First call - should fetch from IDB
      const target1 = await IDBTargetCache.getTarget('test-udid');
      expect(target1.state).toBe('Shutdown');
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

      // Second call immediately - should use cache
      const target2 = await IDBTargetCache.getTarget('test-udid');
      expect(target2.state).toBe('Shutdown');
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1); // Still 1 - cache hit

      // Mock idb list-targets output - second call shows Booted
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          udid: 'test-udid',
          name: 'iPhone 16 Pro',
          type: 'simulator',
          state: 'Booted',
          os_version: 'iOS 18.5',
          architecture: 'arm64',
          screen_dimensions: { width: 390, height: 844 },
        }),
        stderr: '',
      });

      // Wait for cache to expire (5+ seconds)
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Third call - should refresh cache and get new state
      const target3 = await IDBTargetCache.getTarget('test-udid');
      expect(target3.state).toBe('Booted');
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2); // Cache refresh
    });

    it('should allow custom TTL configuration', () => {
      IDBTargetCache.setCacheTTL(10000); // 10 seconds
      const stats = IDBTargetCache.getCacheStats();
      expect(stats.ttl).toBe(10000);

      // Reset to default
      IDBTargetCache.setCacheTTL(5000);
    });

    it('should clear cache and force immediate refresh', async () => {
      // Mock idb list-targets output - first call
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          udid: 'test-udid',
          name: 'iPhone 16 Pro',
          type: 'simulator',
          state: 'Shutdown',
          os_version: 'iOS 18.5',
          architecture: 'arm64',
          screen_dimensions: { width: 390, height: 844 },
        }),
        stderr: '',
      });

      // First call - populate cache
      await IDBTargetCache.getTarget('test-udid');
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

      // Clear cache
      IDBTargetCache.clearCache();
      const stats = IDBTargetCache.getCacheStats();
      expect(stats.cacheAge).toBeGreaterThan(0); // lastFetched reset to 0

      // Mock idb list-targets output - second call
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify({
          udid: 'test-udid',
          name: 'iPhone 16 Pro',
          type: 'simulator',
          state: 'Booted',
          os_version: 'iOS 18.5',
          architecture: 'arm64',
          screen_dimensions: { width: 390, height: 844 },
        }),
        stderr: '',
      });

      // Next call should refresh immediately
      const target = await IDBTargetCache.getTarget('test-udid');
      expect(target.state).toBe('Booted');
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe('NDJSON Parsing', () => {
    it('should correctly parse NDJSON output from idb list-targets', async () => {
      // Mock NDJSON output (multiple JSON objects, one per line)
      const ndjsonOutput = [
        JSON.stringify({
          udid: 'uuid-1',
          name: 'iPhone 16 Pro',
          type: 'simulator',
          state: 'Booted',
          os_version: 'iOS 18.5',
        }),
        JSON.stringify({
          udid: 'uuid-2',
          name: 'iPad Pro',
          type: 'simulator',
          state: 'Shutdown',
          os_version: 'iOS 18.5',
        }),
      ].join('\n');

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const targets = await IDBTargetCache.listTargets();
      expect(targets).toHaveLength(2);
      expect(targets[0].udid).toBe('uuid-1');
      expect(targets[0].state).toBe('Booted');
      expect(targets[1].udid).toBe('uuid-2');
      expect(targets[1].state).toBe('Shutdown');
    });

    it('should handle empty lines in NDJSON output', async () => {
      const ndjsonOutput = [
        JSON.stringify({
          udid: 'uuid-1',
          name: 'iPhone 16 Pro',
          type: 'simulator',
          state: 'Booted',
          os_version: 'iOS 18.5',
        }),
        '', // Empty line
        JSON.stringify({
          udid: 'uuid-2',
          name: 'iPad Pro',
          type: 'simulator',
          state: 'Shutdown',
          os_version: 'iOS 18.5',
        }),
      ].join('\n');

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const targets = await IDBTargetCache.listTargets();
      expect(targets).toHaveLength(2); // Empty line ignored
    });
  });

  describe('State Filtering', () => {
    beforeEach(async () => {
      // Mock multiple targets with different states
      const ndjsonOutput = [
        JSON.stringify({
          udid: 'booted-1',
          name: 'iPhone 16 Pro',
          type: 'simulator',
          state: 'Booted',
          os_version: 'iOS 18.5',
        }),
        JSON.stringify({
          udid: 'shutdown-1',
          name: 'iPad Pro',
          type: 'simulator',
          state: 'Shutdown',
          os_version: 'iOS 18.5',
        }),
        JSON.stringify({
          udid: 'booted-2',
          name: 'iPhone 15',
          type: 'simulator',
          state: 'Booted',
          os_version: 'iOS 17.0',
        }),
      ].join('\n');

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });
    });

    it('should filter targets by Booted state', async () => {
      const bootedTargets = await IDBTargetCache.listTargets({ state: 'Booted' });
      expect(bootedTargets).toHaveLength(2);
      expect(bootedTargets.every(t => t.state === 'Booted')).toBe(true);
    });

    it('should filter targets by Shutdown state', async () => {
      const shutdownTargets = await IDBTargetCache.listTargets({ state: 'Shutdown' });
      expect(shutdownTargets).toHaveLength(1);
      expect(shutdownTargets[0].udid).toBe('shutdown-1');
    });

    it('should return last used booted target', async () => {
      const lastUsed = await IDBTargetCache.getLastUsedTarget();
      expect(lastUsed).toBeDefined();
      expect(lastUsed?.state).toBe('Booted');
    });
  });
});
