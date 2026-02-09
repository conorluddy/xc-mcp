import { jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import {
  responseCache,
  extractBuildSummary,
  extractTestSummary,
  extractSimulatorSummary,
  createProgressiveSimulatorResponse,
} from '../../../src/utils/response-cache.js';
import { persistenceManager } from '../../../src/utils/persistence.js';

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
}));

// Mock persistence manager
jest.mock('../../../src/utils/persistence.js', () => ({
  persistenceManager: {
    isEnabled: jest.fn(),
    loadState: jest.fn(),
    saveState: jest.fn(),
  },
}));

const mockRandomUUID = randomUUID as jest.MockedFunction<typeof randomUUID>;
const mockPersistenceManager = persistenceManager as jest.Mocked<typeof persistenceManager>;

describe('ResponseCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    responseCache.clear();

    // Mock UUID generation
    let counter = 0;
    mockRandomUUID.mockImplementation(() => {
      counter++;
      return `mock-uuid-${counter}` as `${string}-${string}-${string}-${string}-${string}`;
    });

    // Default persistence mocks
    mockPersistenceManager.isEnabled.mockReturnValue(false);
    mockPersistenceManager.loadState.mockResolvedValue(null);
    mockPersistenceManager.saveState.mockResolvedValue(undefined);
  });

  describe('store and get', () => {
    it('should store and retrieve cached responses', () => {
      const data = {
        tool: 'xcodebuild-build',
        fullOutput: 'Build succeeded',
        stderr: '',
        exitCode: 0,
        command: 'xcodebuild build',
        metadata: { scheme: 'MyApp' },
      };

      const id = responseCache.store(data);

      expect(id).toBe('mock-uuid-1');

      const cached = responseCache.get(id);
      expect(cached).toMatchObject({
        ...data,
        id: 'mock-uuid-1',
      });
      expect(cached?.timestamp).toBeInstanceOf(Date);
    });

    it('should return undefined for non-existent IDs', () => {
      const cached = responseCache.get('non-existent-id');
      expect(cached).toBeUndefined();
    });

    it('should return undefined for expired entries', () => {
      const data = {
        tool: 'simctl-list',
        fullOutput: 'Device list',
        stderr: '',
        exitCode: 0,
        command: 'simctl list',
        metadata: {},
      };

      const id = responseCache.store(data);

      // Mock the cache to have an old timestamp
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cache = (responseCache as any).cache;
      const entry = cache.get(id);
      entry.timestamp = new Date(Date.now() - 31 * 60 * 1000); // 31 minutes ago

      const cached = responseCache.get(id);
      expect(cached).toBeUndefined();
      expect(cache.has(id)).toBe(false); // Should be deleted
    });
  });

  describe('getRecentByTool', () => {
    it('should return recent entries for a specific tool', () => {
      const tool = 'xcodebuild-build';

      // Store multiple entries with slight delays to ensure timestamp ordering
      const entries = [];
      for (let i = 1; i <= 3; i++) {
        const id = responseCache.store({
          tool,
          fullOutput: `Build ${i}`,
          stderr: '',
          exitCode: 0,
          command: `xcodebuild build ${i}`,
          metadata: {},
        });
        entries.push(id);

        // Manually adjust timestamp to ensure proper ordering for test
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cache = (responseCache as any).cache;
        const entry = cache.get(id);
        entry.timestamp = new Date(Date.now() + i * 1000); // Each entry 1 second later
      }

      // Store entry for different tool
      responseCache.store({
        tool: 'simctl-list',
        fullOutput: 'Devices',
        stderr: '',
        exitCode: 0,
        command: 'simctl list',
        metadata: {},
      });

      const recent = responseCache.getRecentByTool(tool);

      expect(recent).toHaveLength(3);
      expect(recent[0].fullOutput).toBe('Build 3'); // Most recent first
      expect(recent[1].fullOutput).toBe('Build 2');
      expect(recent[2].fullOutput).toBe('Build 1');
      expect(recent.every(entry => entry.tool === tool)).toBe(true);
    });

    it('should respect the limit parameter', () => {
      const tool = 'simctl-boot';

      for (let i = 1; i <= 10; i++) {
        const id = responseCache.store({
          tool,
          fullOutput: `Boot ${i}`,
          stderr: '',
          exitCode: 0,
          command: `simctl boot device-${i}`,
          metadata: {},
        });

        // Manually adjust timestamp to ensure proper ordering for test
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cache = (responseCache as any).cache;
        const entry = cache.get(id);
        entry.timestamp = new Date(Date.now() + i * 1000); // Each entry 1 second later
      }

      const recent = responseCache.getRecentByTool(tool, 3);
      expect(recent).toHaveLength(3);
      expect(recent[0].fullOutput).toBe('Boot 10');
    });

    it('should return empty array for unknown tool', () => {
      const recent = responseCache.getRecentByTool('unknown-tool');
      expect(recent).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete existing entries', () => {
      const id = responseCache.store({
        tool: 'test',
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'test',
        metadata: {},
      });

      expect(responseCache.get(id)).toBeDefined();
      expect(responseCache.delete(id)).toBe(true);
      expect(responseCache.get(id)).toBeUndefined();
    });

    it('should return false for non-existent entries', () => {
      expect(responseCache.delete('non-existent')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      responseCache.store({
        tool: 'test1',
        fullOutput: 'output1',
        stderr: '',
        exitCode: 0,
        command: 'test1',
        metadata: {},
      });

      responseCache.store({
        tool: 'test2',
        fullOutput: 'output2',
        stderr: '',
        exitCode: 0,
        command: 'test2',
        metadata: {},
      });

      expect(responseCache.getStats().totalEntries).toBe(2);

      responseCache.clear();

      expect(responseCache.getStats().totalEntries).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      responseCache.store({
        tool: 'xcodebuild-build',
        fullOutput: 'build1',
        stderr: '',
        exitCode: 0,
        command: 'build1',
        metadata: {},
      });

      responseCache.store({
        tool: 'xcodebuild-build',
        fullOutput: 'build2',
        stderr: '',
        exitCode: 0,
        command: 'build2',
        metadata: {},
      });

      responseCache.store({
        tool: 'simctl-list',
        fullOutput: 'list1',
        stderr: '',
        exitCode: 0,
        command: 'list1',
        metadata: {},
      });

      const stats = responseCache.getStats();

      expect(stats.totalEntries).toBe(3);
      expect(stats.byTool).toEqual({
        'xcodebuild-build': 2,
        'simctl-list': 1,
      });
    });

    it('should return empty stats for empty cache', () => {
      const stats = responseCache.getStats();

      expect(stats.totalEntries).toBe(0);
      expect(stats.byTool).toEqual({});
    });
  });

  describe('cleanup', () => {
    it('should remove entries exceeding maxEntries limit', () => {
      // Store more than maxEntries (100) - we'll store 105
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maxEntries = (responseCache as any).maxEntries;
      expect(maxEntries).toBe(100);

      // Add delay between stores to ensure different timestamps
      for (let i = 1; i <= 105; i++) {
        responseCache.store({
          tool: `tool-${i}`,
          fullOutput: `output-${i}`,
          stderr: '',
          exitCode: 0,
          command: `command-${i}`,
          metadata: {},
        });
      }

      const stats = responseCache.getStats();
      expect(stats.totalEntries).toBe(100); // Should be limited to maxEntries
    });

    it('should remove oldest entries when over limit', () => {
      // Override maxEntries for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalMaxEntries = (responseCache as any).maxEntries;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (responseCache as any).maxEntries = 3;

      try {
        // Store 5 entries
        const ids = [];
        for (let i = 1; i <= 5; i++) {
          const id = responseCache.store({
            tool: `tool-${i}`,
            fullOutput: `output-${i}`,
            stderr: '',
            exitCode: 0,
            command: `command-${i}`,
            metadata: {},
          });
          ids.push(id);
        }

        // Should only have the 3 most recent
        expect(responseCache.getStats().totalEntries).toBe(3);
        expect(responseCache.get(ids[0])).toBeUndefined(); // First two should be removed
        expect(responseCache.get(ids[1])).toBeUndefined();
        expect(responseCache.get(ids[2])).toBeDefined(); // Last three should remain
        expect(responseCache.get(ids[3])).toBeDefined();
        expect(responseCache.get(ids[4])).toBeDefined();
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (responseCache as any).maxEntries = originalMaxEntries;
      }
    });
  });
});

describe('extractBuildSummary', () => {
  it('should extract successful build summary', () => {
    const output = `
Building target MyApp with configuration Debug
** BUILD SUCCEEDED **
Total time: 45.2 seconds
    `;

    const summary = extractBuildSummary(output, '', 0);

    expect(summary).toEqual({
      success: true,
      exitCode: 0,
      errorCount: 0,
      warningCount: 0,
      duration: 45.2,
      target: 'MyApp',
      hasErrors: false,
      hasWarnings: false,
      firstError: undefined,
      errors: [],
      warnings: [],
      buildSizeBytes: output.length,
    });
  });

  it('should extract failed build summary', () => {
    const output = 'Building...';
    const stderr = `
error: Build failed
** BUILD FAILED **
    `;

    const summary = extractBuildSummary(output, stderr, 1);

    expect(summary).toEqual({
      success: false,
      exitCode: 1,
      errorCount: 2, // "error:" and "** BUILD FAILED **"
      warningCount: 0,
      duration: undefined,
      target: undefined,
      hasErrors: true,
      hasWarnings: false,
      firstError: 'error: Build failed',
      errors: ['error: Build failed', '** BUILD FAILED **'],
      warnings: [],
      buildSizeBytes: output.length + stderr.length,
    });
  });

  it('should extract warnings', () => {
    const output = `
warning: Unused variable 'foo'
warning: Deprecated API usage
** BUILD SUCCEEDED **
    `;

    const summary = extractBuildSummary(output, '', 0);

    expect(summary.warningCount).toBe(2);
    expect(summary.hasWarnings).toBe(true);
    expect(summary.warnings).toEqual([
      "warning: Unused variable 'foo'",
      'warning: Deprecated API usage',
    ]);
  });

  it('should handle output without timing info', () => {
    const output = '** BUILD SUCCEEDED **';

    const summary = extractBuildSummary(output, '', 0);

    expect(summary.duration).toBeUndefined();
  });

  it('should handle mixed success indicators and errors', () => {
    const output = `
** BUILD SUCCEEDED **
error: Some error that happened during success
    `;

    const summary = extractBuildSummary(output, '', 0);

    expect(summary.success).toBe(true); // Exit code 0 and has success indicator
    expect(summary.hasErrors).toBe(true); // But still has errors
    expect(summary.errorCount).toBe(1);
    expect(summary.errors).toEqual(['error: Some error that happened during success']);
  });

  it('should limit errors and warnings to first 10', () => {
    const warnings = Array.from({ length: 15 }, (_, i) => `warning: Warning number ${i + 1}`).join(
      '\n'
    );
    const errors = Array.from({ length: 12 }, (_, i) => `error: Error number ${i + 1}`).join('\n');
    const output = `${warnings}\n${errors}\n** BUILD FAILED **`;

    const summary = extractBuildSummary(output, '', 1);

    expect(summary.warningCount).toBe(15);
    expect(summary.errorCount).toBe(13); // 12 errors + BUILD FAILED
    expect(summary.warnings).toHaveLength(10); // Limited to 10
    expect(summary.errors).toHaveLength(10); // Limited to 10
    expect(summary.warnings[0]).toBe('warning: Warning number 1');
    expect(summary.warnings[9]).toBe('warning: Warning number 10');
  });
});

describe('extractTestSummary', () => {
  it('should extract successful test summary', () => {
    const output = `
Test Suite MyAppTests.xctest started
Test Suite MyAppTests.xctest passed
15 tests executed
    `;

    const summary = extractTestSummary(output, '', 0);

    expect(summary).toEqual({
      success: true,
      exitCode: 0,
      testsRun: 15,
      passed: true,
      resultSummary: expect.any(Array),
    });
  });

  it('should extract failed test summary', () => {
    const output = `
Test Suite MyAppTests.xctest started
Test Suite MyAppTests.xctest failed
8 tests executed
    `;

    const summary = extractTestSummary(output, '', 1);

    expect(summary).toEqual({
      success: false,
      exitCode: 1,
      testsRun: 8,
      passed: false,
      resultSummary: expect.any(Array),
    });
  });

  it('should handle multiple test counts', () => {
    const output = `
5 tests passed
3 tests failed
8 tests total
    `;

    const summary = extractTestSummary(output, '', 0);

    expect(summary.testsRun).toBe(16); // 5 + 3 + 8
  });

  it('should handle no test count info', () => {
    const output = 'Test Suite passed';

    const summary = extractTestSummary(output, '', 0);

    expect(summary.testsRun).toBe(0);
  });
});

describe('extractSimulatorSummary', () => {
  const mockCachedList = {
    devices: {
      'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
        {
          name: 'iPhone 15',
          udid: '123-456-789',
          state: 'Booted',
          isAvailable: true,
          lastUsed: new Date('2023-12-01T10:00:00Z'),
        },
        {
          name: 'iPhone 14',
          udid: '987-654-321',
          state: 'Shutdown',
          isAvailable: true,
          lastUsed: new Date('2023-12-01T09:00:00Z'),
        },
      ],
      'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
        {
          name: 'iPad Pro',
          udid: '111-222-333',
          state: 'Shutdown',
          isAvailable: true,
        },
      ],
    },
    lastUpdated: new Date('2023-12-01T12:00:00Z'),
  };

  it('should extract simulator summary correctly', () => {
    const summary = extractSimulatorSummary(mockCachedList);

    expect(summary).toMatchObject({
      totalDevices: 3,
      availableDevices: 3,
      bootedDevices: 1,
      deviceTypes: ['iPhone', 'iPad'],
      commonRuntimes: ['iOS 18.0', 'iOS 17.0'],
      lastUpdated: mockCachedList.lastUpdated,
      cacheAge: expect.any(String),
    });

    expect(summary.bootedList).toHaveLength(1);
    expect(summary.bootedList[0]).toMatchObject({
      name: 'iPhone 15',
      udid: '123-456-789',
      state: 'Booted',
    });

    expect(summary.recentlyUsed).toHaveLength(2);
    expect(summary.recentlyUsed[0].name).toBe('iPhone 15'); // Most recent first
  });

  it('should handle empty device list', () => {
    const emptyList = {
      devices: {},
      lastUpdated: new Date(),
    };

    const summary = extractSimulatorSummary(emptyList);

    expect(summary.totalDevices).toBe(0);
    expect(summary.availableDevices).toBe(0);
    expect(summary.bootedDevices).toBe(0);
    expect(summary.deviceTypes).toHaveLength(0);
    expect(summary.commonRuntimes).toHaveLength(0);
  });

  it('should filter unavailable devices', () => {
    const listWithUnavailable = {
      devices: {
        'iOS-18-0': [
          {
            name: 'iPhone 15',
            udid: '123',
            state: 'Booted',
            isAvailable: true,
          },
          {
            name: 'iPhone 14',
            udid: '456',
            state: 'Shutdown',
            isAvailable: false, // Unavailable
          },
        ],
      },
      lastUpdated: new Date(),
    };

    const summary = extractSimulatorSummary(listWithUnavailable);

    expect(summary.totalDevices).toBe(2);
    expect(summary.availableDevices).toBe(1);
    expect(summary.bootedDevices).toBe(1);
  });
});

describe('createProgressiveSimulatorResponse', () => {
  const mockSummary = {
    totalDevices: 10,
    availableDevices: 8,
    bootedDevices: 2,
    deviceTypes: ['iPhone', 'iPad'],
    commonRuntimes: ['iOS 18.0', 'iOS 17.0'],
    lastUpdated: new Date('2023-12-01T12:00:00Z'),
    cacheAge: '5 minutes ago',
    bootedList: [{ name: 'iPhone 15', udid: '123', state: 'Booted', runtime: 'iOS 18.0' }],
    recentlyUsed: [{ name: 'iPhone 15', udid: '123', lastUsed: '5 minutes ago' }],
  };

  it('should create progressive response structure', () => {
    const response = createProgressiveSimulatorResponse(mockSummary, 'cache-123', {
      deviceType: 'iPhone',
      runtime: 'iOS 18.0',
    });

    expect(response).toMatchObject({
      cacheId: 'cache-123',
      summary: {
        totalDevices: 10,
        availableDevices: 8,
        bootedDevices: 2,
        deviceTypes: ['iPhone', 'iPad'],
        commonRuntimes: ['iOS 18.0', 'iOS 17.0'],
        lastUpdated: '2023-12-01T12:00:00.000Z',
        cacheAge: '5 minutes ago',
      },
      quickAccess: {
        bootedDevices: mockSummary.bootedList,
        recentlyUsed: mockSummary.recentlyUsed,
        recommendedForBuild: mockSummary.bootedList,
      },
      nextSteps: expect.arrayContaining([
        expect.stringContaining('Found 8 available simulators'),
        expect.stringContaining('simctl-get-details'),
        expect.stringContaining('deviceType=iPhone'),
      ]),
      availableDetails: ['full-list', 'devices-only', 'runtimes-only', 'available-only'],
      smartFilters: expect.objectContaining({
        commonDeviceTypes: ['iPhone', 'iPad'],
        commonRuntimes: ['iOS 18.0', 'iOS 17.0'],
        suggestedFilters: expect.stringContaining('deviceType=iPhone'),
      }),
    });
  });

  it('should recommend recent devices when none are booted', () => {
    const summaryWithoutBooted = {
      ...mockSummary,
      bootedDevices: 0,
      bootedList: [],
    };

    const response = createProgressiveSimulatorResponse(summaryWithoutBooted, 'cache-123', {});

    expect(response.quickAccess.recommendedForBuild).toHaveLength(1);
    expect(response.quickAccess.recommendedForBuild[0]).toEqual(mockSummary.recentlyUsed[0]);
  });

  it('should handle missing filters gracefully', () => {
    const response = createProgressiveSimulatorResponse(mockSummary, 'cache-123', {});

    expect(
      response.nextSteps.some(
        step => step.includes('deviceType=iPhone') && step.includes('runtime=iOS 18.5')
      )
    ).toBe(true);
  });
});

describe('edge cases and cleanup', () => {
  it('should cleanup expired entries correctly', () => {
    const now = Date.now();
    const expiredData = {
      tool: 'expired-tool',
      fullOutput: 'expired output',
      stderr: '',
      exitCode: 0,
      command: 'expired command',
      metadata: {},
    };

    // Store an entry
    const id = responseCache.store(expiredData);

    // Mock the timestamp to be expired
    const cached = responseCache.get(id);
    if (cached) {
      // Directly manipulate the cache to simulate expired entry
      cached.timestamp = new Date(now - 35 * 60 * 1000); // 35 minutes ago (past 30min maxAge)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (responseCache as any).cache.set(id, cached);
    }

    // Force cleanup by calling store again (which triggers cleanup)
    responseCache.store({
      tool: 'new-tool',
      fullOutput: 'new output',
      stderr: '',
      exitCode: 0,
      command: 'new command',
      metadata: {},
    });

    // The expired entry should be removed
    expect(responseCache.get(id)).toBeUndefined();
  });
});

describe('ExtractSimulatorSummary edge cases', () => {
  it('should handle various device types in extractSimulatorSummary', () => {
    const complexList = {
      devices: {
        'iOS-18-0': [
          { name: 'iPhone 15 Pro', udid: '1', state: 'Booted', isAvailable: true },
          { name: 'iPad Air', udid: '2', state: 'Shutdown', isAvailable: true },
        ],
        'watchOS-10-0': [
          { name: 'Apple Watch Series 9', udid: '3', state: 'Shutdown', isAvailable: true },
        ],
        'tvOS-17-0': [{ name: 'Apple TV 4K', udid: '4', state: 'Shutdown', isAvailable: true }],
        'visionOS-1-0': [
          { name: 'Apple Vision Pro', udid: '5', state: 'Shutdown', isAvailable: true },
        ],
      },
      lastUpdated: new Date(),
    };

    const summary = extractSimulatorSummary(complexList);

    expect(summary.deviceTypes).toEqual([
      'iPhone',
      'iPad',
      'Apple Watch',
      'Apple TV',
      'Apple Vision Pro',
    ]);
  });

  it('should handle unrecognized device names', () => {
    const listWithUnrecognized = {
      devices: {
        'iOS-18-0': [
          { name: 'Unknown Device XYZ', udid: '1', state: 'Shutdown', isAvailable: true },
        ],
      },
      lastUpdated: new Date(),
    };

    const summary = extractSimulatorSummary(listWithUnrecognized);

    expect(summary.deviceTypes).toEqual(['Other']);
  });

  it('should handle various runtime formats', () => {
    const listWithVariousRuntimes = {
      devices: {
        'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
          { name: 'iPhone 15', udid: '1', state: 'Shutdown', isAvailable: true },
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-17-5': [
          { name: 'iPhone 14', udid: '2', state: 'Shutdown', isAvailable: true },
        ],
        'watchOS-10-0': [{ name: 'Apple Watch', udid: '3', state: 'Shutdown', isAvailable: true }],
      },
      lastUpdated: new Date(),
    };

    const summary = extractSimulatorSummary(listWithVariousRuntimes);

    expect(summary.commonRuntimes).toContain('iOS 18.0');
    expect(summary.commonRuntimes).toContain('iOS 17.5');
  });
});
