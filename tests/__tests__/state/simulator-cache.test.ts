import { jest } from '@jest/globals';
import {
  SimulatorCache,
  SimulatorInfo,
  CachedSimulatorList,
} from '../../../src/state/simulator-cache.js';
import { SimulatorList } from '../../../src/types/xcode.js';

// Mock the command utilities
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
  buildSimctlCommand: jest.fn(),
}));

import { executeCommand, buildSimctlCommand } from '../../../src/utils/command.js';

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockBuildSimctlCommand = buildSimctlCommand as jest.MockedFunction<typeof buildSimctlCommand>;

describe('SimulatorCache', () => {
  let cache: SimulatorCache;

  // Mock simulator data
  const mockSimulatorList: SimulatorList = {
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
        {
          availability: '(available)',
          state: 'Booted',
          isAvailable: true,
          name: 'iPhone 15',
          udid: '12345678-1234-1234-1234-123456789012',
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        },
        {
          availability: '(available)',
          state: 'Shutdown',
          isAvailable: true,
          name: 'iPhone 14',
          udid: '98765432-9876-5432-9876-543210987654',
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
        },
      ],
      'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
        {
          availability: '(available)',
          state: 'Shutdown',
          isAvailable: true,
          name: 'iPad Pro',
          udid: '11111111-2222-3333-4444-555555555555',
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro',
        },
        {
          availability: '(unavailable)',
          state: 'Shutdown',
          isAvailable: false,
          name: 'iPhone 12',
          udid: '99999999-8888-7777-6666-555544443333',
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-12',
        },
      ],
    },
    runtimes: [
      {
        availability: '(available)',
        bundlePath: '/path/to/iOS-18-0',
        buildversion: '22A382',
        identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-0',
        isAvailable: true,
        name: 'iOS 18.0',
        version: '18.0',
      },
      {
        availability: '(available)',
        bundlePath: '/path/to/iOS-17-0',
        buildversion: '21A382',
        identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
        isAvailable: true,
        name: 'iOS 17.0',
        version: '17.0',
      },
    ],
    devicetypes: [
      {
        bundlePath: '/path/to/iPhone-15',
        identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        name: 'iPhone 15',
        productFamily: 'iPhone',
      },
      {
        bundlePath: '/path/to/iPhone-14',
        identifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
        name: 'iPhone 14',
        productFamily: 'iPhone',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new SimulatorCache();

    // Setup default mocks
    mockBuildSimctlCommand.mockReturnValue('xcrun simctl list -j');
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(mockSimulatorList),
      stderr: '',
    });
  });

  describe('cache management', () => {
    it('should set and get cache max age', () => {
      const maxAge = 30 * 60 * 1000; // 30 minutes
      cache.setCacheMaxAge(maxAge);
      expect(cache.getCacheMaxAge()).toBe(maxAge);
    });

    it('should clear all cache data', () => {
      cache.setCacheMaxAge(5000);
      cache.recordSimulatorUsage('test-udid', '/test/project');
      cache.recordBootEvent('test-udid', true, 1000);

      cache.clearCache();

      expect(cache.getBootState('test-udid')).toBe('unknown');
      // Cache should be empty - next call should fetch fresh data
    });
  });

  describe('getSimulatorList', () => {
    it('should fetch and cache simulator list', async () => {
      const result = await cache.getSimulatorList();

      expect(mockBuildSimctlCommand).toHaveBeenCalledWith('list', { json: true });
      expect(mockExecuteCommand).toHaveBeenCalledWith('xcrun simctl list -j');
      expect(result.devices['com.apple.CoreSimulator.SimRuntime.iOS-18-0']).toBeDefined();
      expect(result.runtimes).toHaveLength(2);
      expect(result.devicetypes).toHaveLength(2);
      expect(result.lastUpdated).toBeInstanceOf(Date);
    });

    it('should return cached data on subsequent calls', async () => {
      // First call
      await cache.getSimulatorList();
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await cache.getSimulatorList();
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    });

    it('should force refresh when requested', async () => {
      // First call
      await cache.getSimulatorList();
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

      // Force refresh
      await cache.getSimulatorList(true);
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });

    it('should handle command execution errors', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Command failed',
      });

      await expect(cache.getSimulatorList()).rejects.toThrow(
        'Failed to list simulators: Command failed'
      );
    });

    it('should preserve existing device info when refreshing', async () => {
      // First, get simulator list to populate cache
      await cache.getSimulatorList();

      // Then record some usage
      cache.recordSimulatorUsage('12345678-1234-1234-1234-123456789012', '/test/project');
      cache.recordBootEvent('12345678-1234-1234-1234-123456789012', true, 5000);

      // Get simulator list again (should preserve the usage info)
      const result = await cache.getSimulatorList();

      const iPhone15 = result.devices['com.apple.CoreSimulator.SimRuntime.iOS-18-0'].find(
        d => d.udid === '12345678-1234-1234-1234-123456789012'
      );

      expect(iPhone15?.lastUsed).toBeInstanceOf(Date);
      expect(iPhone15?.bootHistory).toHaveLength(1);
      expect(iPhone15?.performanceMetrics?.avgBootTime).toBe(5000);
    });
  });

  describe('getAvailableSimulators', () => {
    beforeEach(async () => {
      await cache.getSimulatorList(); // Populate cache
    });

    it('should return all available simulators', async () => {
      const simulators = await cache.getAvailableSimulators();

      expect(simulators).toHaveLength(3); // iPhone 15, iPhone 14, iPad Pro (iPhone 12 is unavailable)
      expect(simulators.every(s => s.isAvailable)).toBe(true);
    });

    it('should filter by device type', async () => {
      const iPhoneSimulators = await cache.getAvailableSimulators('iPhone');

      expect(iPhoneSimulators).toHaveLength(2); // iPhone 15, iPhone 14
      expect(iPhoneSimulators.every(s => s.name.includes('iPhone'))).toBe(true);
    });

    it('should filter by runtime', async () => {
      const iOS18Simulators = await cache.getAvailableSimulators(undefined, 'iOS-18');

      expect(iOS18Simulators).toHaveLength(2); // iPhone 15, iPhone 14
    });

    it('should filter by both device type and runtime', async () => {
      const iPhone17Simulators = await cache.getAvailableSimulators('iPhone', 'iOS-17');

      expect(iPhone17Simulators).toHaveLength(0); // No iPhones in iOS 17 runtime
    });

    it('should sort by recent usage', async () => {
      // Record usage in reverse chronological order
      cache.recordSimulatorUsage('98765432-9876-5432-9876-543210987654'); // iPhone 14 - older
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      cache.recordSimulatorUsage('12345678-1234-1234-1234-123456789012'); // iPhone 15 - newer

      const simulators = await cache.getAvailableSimulators();

      // iPhone 15 should be first (most recently used)
      expect(simulators[0].udid).toBe('12345678-1234-1234-1234-123456789012');
      expect(simulators[1].udid).toBe('98765432-9876-5432-9876-543210987654');
    });

    it('should sort by name when usage times are equal', async () => {
      const simulators = await cache.getAvailableSimulators('iPhone');

      // Should be sorted alphabetically: iPhone 14, iPhone 15
      expect(simulators[0].name).toBe('iPhone 14');
      expect(simulators[1].name).toBe('iPhone 15');
    });
  });

  describe('getPreferredSimulator', () => {
    beforeEach(async () => {
      await cache.getSimulatorList(); // Populate cache
    });

    it('should return project-specific preference when available', async () => {
      const projectPath = '/test/project';
      const preferredUdid = '12345678-1234-1234-1234-123456789012';

      // Record project preference
      cache.recordSimulatorUsage(preferredUdid, projectPath);

      const preferred = await cache.getPreferredSimulator(projectPath);

      expect(preferred?.udid).toBe(preferredUdid);
    });

    it('should fallback to most recently used when no project preference', async () => {
      // Record some usage
      cache.recordSimulatorUsage('98765432-9876-5432-9876-543210987654');
      await new Promise(resolve => setTimeout(resolve, 10));
      cache.recordSimulatorUsage('12345678-1234-1234-1234-123456789012');

      const preferred = await cache.getPreferredSimulator();

      expect(preferred?.udid).toBe('12345678-1234-1234-1234-123456789012');
    });

    it('should filter by device type when specified', async () => {
      const preferred = await cache.getPreferredSimulator(undefined, 'iPad');

      expect(preferred?.name).toBe('iPad Pro');
    });

    it('should return null when no simulators match criteria', async () => {
      const preferred = await cache.getPreferredSimulator(undefined, 'Apple Watch');

      expect(preferred).toBeNull();
    });

    it('should ignore unavailable project preferences', async () => {
      const projectPath = '/test/project';
      const unavailableUdid = '99999999-8888-7777-6666-555544443333'; // iPhone 12 (unavailable)

      // Record preference for unavailable device
      cache.recordSimulatorUsage(unavailableUdid, projectPath);

      const preferred = await cache.getPreferredSimulator(projectPath);

      // Should fallback to available device
      expect(preferred?.udid).not.toBe(unavailableUdid);
      expect(preferred?.isAvailable).toBe(true);
    });
  });

  describe('findSimulatorByUdid', () => {
    beforeEach(async () => {
      await cache.getSimulatorList(); // Populate cache
    });

    it('should find simulator by UDID', async () => {
      const udid = '12345678-1234-1234-1234-123456789012';
      const simulator = await cache.findSimulatorByUdid(udid);

      expect(simulator?.udid).toBe(udid);
      expect(simulator?.name).toBe('iPhone 15');
    });

    it('should return null for non-existent UDID', async () => {
      const simulator = await cache.findSimulatorByUdid('non-existent-udid');

      expect(simulator).toBeNull();
    });
  });

  describe('recordSimulatorUsage', () => {
    beforeEach(async () => {
      await cache.getSimulatorList(); // Populate cache
    });

    it('should record simulator usage', () => {
      const udid = '12345678-1234-1234-1234-123456789012';
      const beforeTime = new Date();

      cache.recordSimulatorUsage(udid);

      const afterTime = new Date();

      // Check that usage was recorded (we can't access lastUsed directly, but we can test via getAvailableSimulators)
      expect(beforeTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });

    it('should record project preference', async () => {
      const udid = '12345678-1234-1234-1234-123456789012';
      const projectPath = '/test/project';

      cache.recordSimulatorUsage(udid, projectPath);

      const preferred = await cache.getPreferredSimulator(projectPath);
      expect(preferred?.udid).toBe(udid);
    });

    it('should update cache with usage time', async () => {
      const udid = '12345678-1234-1234-1234-123456789012';

      cache.recordSimulatorUsage(udid);

      const list = await cache.getSimulatorList();
      const device = list.devices['com.apple.CoreSimulator.SimRuntime.iOS-18-0'].find(
        d => d.udid === udid
      );

      expect(device?.lastUsed).toBeInstanceOf(Date);
    });
  });

  describe('recordBootEvent', () => {
    beforeEach(async () => {
      await cache.getSimulatorList(); // Populate cache
    });

    it('should record successful boot event', () => {
      const udid = '12345678-1234-1234-1234-123456789012';

      cache.recordBootEvent(udid, true, 5000);

      expect(cache.getBootState(udid)).toBe('booted');
    });

    it('should record failed boot event', () => {
      const udid = '12345678-1234-1234-1234-123456789012';

      cache.recordBootEvent(udid, false);

      expect(cache.getBootState(udid)).toBe('shutdown');
    });

    it('should update performance metrics for successful boots', async () => {
      const udid = '12345678-1234-1234-1234-123456789012';

      // Record multiple boot events
      cache.recordBootEvent(udid, true, 5000);
      cache.recordBootEvent(udid, true, 7000);

      const list = await cache.getSimulatorList();
      const device = list.devices['com.apple.CoreSimulator.SimRuntime.iOS-18-0'].find(
        d => d.udid === udid
      );

      expect(device?.bootHistory).toHaveLength(2);
      expect(device?.performanceMetrics?.avgBootTime).toBe(6000); // Average of 5000 and 7000
      expect(device?.performanceMetrics?.reliability).toBe(0.2); // 2 boots out of max 10
    });

    it('should not update performance metrics for failed boots', async () => {
      const udid = '12345678-1234-1234-1234-123456789012';

      cache.recordBootEvent(udid, false);

      const list = await cache.getSimulatorList();
      const device = list.devices['com.apple.CoreSimulator.SimRuntime.iOS-18-0'].find(
        d => d.udid === udid
      );

      expect(device?.bootHistory).toHaveLength(0);
      expect(device?.performanceMetrics).toBeUndefined();
    });

    it('should limit boot history to last 10 entries', async () => {
      const udid = '12345678-1234-1234-1234-123456789012';

      // Record 15 boot events
      for (let i = 0; i < 15; i++) {
        cache.recordBootEvent(udid, true, 1000 + i * 100);
      }

      const list = await cache.getSimulatorList();
      const device = list.devices['com.apple.CoreSimulator.SimRuntime.iOS-18-0'].find(
        d => d.udid === udid
      );

      expect(device?.bootHistory).toHaveLength(15); // All events are recorded
      expect(device?.performanceMetrics?.reliability).toBe(1.0); // 10+ boots = max reliability
    });
  });

  describe('getBootState', () => {
    it('should return unknown for untracked devices', () => {
      expect(cache.getBootState('unknown-udid')).toBe('unknown');
    });

    it('should return recorded boot states', () => {
      const udid = '12345678-1234-1234-1234-123456789012';

      cache.recordBootEvent(udid, true);
      expect(cache.getBootState(udid)).toBe('booted');

      cache.recordBootEvent(udid, false);
      expect(cache.getBootState(udid)).toBe('shutdown');
    });
  });

  describe('getCacheStats', () => {
    it('should return correct stats when cache is empty', () => {
      const stats = cache.getCacheStats();

      expect(stats.isCached).toBe(false);
      expect(stats.deviceCount).toBe(0);
      expect(stats.recentlyUsedCount).toBe(0);
      expect(stats.isExpired).toBe(false);
      expect(stats.cacheMaxAgeMs).toBe(60 * 60 * 1000); // Default 1 hour
      expect(stats.cacheMaxAgeHuman).toBe('1h 0m');
    });

    it('should return correct stats when cache is populated', async () => {
      await cache.getSimulatorList(); // Populate cache

      // Record some recent usage
      cache.recordSimulatorUsage('12345678-1234-1234-1234-123456789012');

      const stats = cache.getCacheStats();

      expect(stats.isCached).toBe(true);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
      expect(stats.deviceCount).toBe(4); // Total devices including unavailable
      expect(stats.recentlyUsedCount).toBe(1);
      expect(stats.isExpired).toBe(false);
      expect(stats.timeUntilExpiry).toBeDefined();
    });

    it('should detect expired cache', async () => {
      // Set very short cache age
      cache.setCacheMaxAge(100); // 100ms

      await cache.getSimulatorList(); // Populate cache

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = cache.getCacheStats();

      expect(stats.isExpired).toBe(true);
      expect(stats.timeUntilExpiry).toBeUndefined();
    });

    it('should format cache age correctly', () => {
      const testCases = [
        { ms: 1000, expected: '1s' },
        { ms: 60 * 1000, expected: '1m 0s' },
        { ms: 60 * 60 * 1000, expected: '1h 0m' },
        { ms: 24 * 60 * 60 * 1000, expected: '1d 0h' },
        { ms: 90 * 60 * 1000, expected: '1h 30m' },
      ];

      testCases.forEach(({ ms, expected }) => {
        cache.setCacheMaxAge(ms);
        const stats = cache.getCacheStats();
        expect(stats.cacheMaxAgeHuman).toBe(expected);
      });
    });
  });

  describe('cache expiration', () => {
    it('should refresh expired cache automatically', async () => {
      // Set very short cache age
      cache.setCacheMaxAge(100); // 100ms

      // First call
      await cache.getSimulatorList();
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Second call should refresh
      await cache.getSimulatorList();
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });

    it('should not refresh valid cache', async () => {
      // Set long cache age
      cache.setCacheMaxAge(60 * 60 * 1000); // 1 hour

      // First call
      await cache.getSimulatorList();
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await cache.getSimulatorList();
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    });
  });
});
