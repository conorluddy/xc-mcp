import { jest } from '@jest/globals';

// Mock path module
jest.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

// Mock the command utilities
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
  buildXcodebuildCommand: jest.fn(),
}));

import { BuildSettingsCache, BuildSettings } from '../../../src/state/build-settings-cache.js';
import { executeCommand, buildXcodebuildCommand } from '../../../src/utils/command.js';

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockBuildXcodebuildCommand = buildXcodebuildCommand as jest.MockedFunction<
  typeof buildXcodebuildCommand
>;

describe('BuildSettingsCache', () => {
  let cache: BuildSettingsCache;

  const mockBuildSettings: BuildSettings = {
    PRODUCT_BUNDLE_IDENTIFIER: 'com.example.MyApp',
    DEPLOYMENT_TARGET: '15.0',
    TARGETED_DEVICE_FAMILY: '1,2',
    INFOPLIST_FILE: 'MyApp/Info.plist',
    CONFIGURATION_BUILD_DIR: '/path/to/DerivedData/Build/Products/Debug-iphonesimulator',
    PRODUCT_NAME: 'MyApp',
    PRODUCT_MODULE_NAME: 'MyApp',
    NSCameraUsageDescription: 'We need camera access for photos',
    NSLocationWhenInUseUsageDescription: 'We need location for mapping',
  };

  const mockXcodebuildOutput = JSON.stringify([
    {
      action: 'build',
      target: 'MyApp',
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER: 'com.example.MyApp',
        IPHONEOS_DEPLOYMENT_TARGET: '15.0',
        TARGETED_DEVICE_FAMILY: '1,2',
        INFOPLIST_FILE: 'MyApp/Info.plist',
        CONFIGURATION_BUILD_DIR: '/path/to/DerivedData/Build/Products/Debug-iphonesimulator',
        PRODUCT_NAME: 'MyApp',
        PRODUCT_MODULE_NAME: 'MyApp',
        NSCameraUsageDescription: 'We need camera access for photos',
        NSLocationWhenInUseUsageDescription: 'We need location for mapping',
      },
    },
  ]);

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new BuildSettingsCache();

    // Setup default mocks
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -showBuildSettings -json -project MyApp.xcodeproj -scheme MyApp -configuration Debug'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: mockXcodebuildOutput,
      stderr: '',
    });
  });

  describe('getBuildSettings', () => {
    it('should fetch and cache build settings', async () => {
      const settings = await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Debug');

      expect(settings).toEqual(mockBuildSettings);
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);
    });

    it('should return cached settings on subsequent calls', async () => {
      // First call
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Debug');

      // Second call should use cache
      const settings = await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Debug');

      expect(settings).toEqual(mockBuildSettings);
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1); // Only once
    });

    it('should cache different configurations separately', async () => {
      // Debug configuration
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Debug');

      // Release configuration
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Release');

      expect(mockExecuteCommand).toHaveBeenCalledTimes(2); // Once for each
    });

    it('should handle xcodebuild failure', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'xcodebuild error: scheme not found',
      });

      await expect(
        cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'Invalid', 'Debug')
      ).rejects.toThrow();
    });
  });

  describe('getBundleIdentifier', () => {
    it('should extract bundle identifier', async () => {
      const bundleId = await cache.getBundleIdentifier('/path/to/MyApp.xcodeproj', 'MyApp');

      expect(bundleId).toBe('com.example.MyApp');
    });
  });

  describe('getAppPath', () => {
    it('should construct correct app path', async () => {
      const appPath = await cache.getAppPath('/path/to/MyApp.xcodeproj', 'MyApp', 'Debug');

      expect(appPath).toBe('/path/to/DerivedData/Build/Products/Debug-iphonesimulator/MyApp.app');
    });
  });

  describe('getDeploymentTarget', () => {
    it('should extract deployment target version', async () => {
      const version = await cache.getDeploymentTarget('/path/to/MyApp.xcodeproj', 'MyApp');

      expect(version).toBe(15);
    });

    it('should handle non-numeric deployment targets', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([
          {
            buildSettings: {
              ...mockBuildSettings,
              IPHONEOS_DEPLOYMENT_TARGET: 'invalid',
            },
          },
        ]),
        stderr: '',
      });

      cache.invalidateCache(); // Clear cache
      const version = await cache.getDeploymentTarget('/path/to/MyApp.xcodeproj', 'MyApp');

      expect(version).toBe(14); // Default fallback
    });
  });

  describe('getDeviceFamilies', () => {
    it('should parse universal app (iPhone + iPad)', async () => {
      const families = await cache.getDeviceFamilies('/path/to/MyApp.xcodeproj', 'MyApp');

      expect(families).toEqual({
        supportsIPhone: true,
        supportsIPad: true,
      });
    });

    it('should parse iPhone-only app', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([
          {
            buildSettings: {
              ...mockBuildSettings,
              TARGETED_DEVICE_FAMILY: '1',
            },
          },
        ]),
        stderr: '',
      });

      cache.invalidateCache();
      const families = await cache.getDeviceFamilies('/path/to/MyApp.xcodeproj', 'MyApp');

      expect(families).toEqual({
        supportsIPhone: true,
        supportsIPad: false,
      });
    });

    it('should parse iPad-only app', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([
          {
            buildSettings: {
              ...mockBuildSettings,
              TARGETED_DEVICE_FAMILY: '2',
            },
          },
        ]),
        stderr: '',
      });

      cache.invalidateCache();
      const families = await cache.getDeviceFamilies('/path/to/MyApp.xcodeproj', 'MyApp');

      expect(families).toEqual({
        supportsIPhone: false,
        supportsIPad: true,
      });
    });
  });

  describe('getRequiredCapabilities', () => {
    it('should extract required capabilities', async () => {
      const capabilities = await cache.getRequiredCapabilities('/path/to/MyApp.xcodeproj', 'MyApp');

      expect(capabilities).toEqual(['camera', 'location']);
    });

    it('should return empty array when no capabilities', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify([
          {
            buildSettings: {
              ...mockBuildSettings,
              NSCameraUsageDescription: undefined,
              NSLocationWhenInUseUsageDescription: undefined,
            },
          },
        ]),
        stderr: '',
      });

      cache.invalidateCache();
      const capabilities = await cache.getRequiredCapabilities('/path/to/MyApp.xcodeproj', 'MyApp');

      expect(capabilities).toEqual([]);
    });
  });

  describe('invalidateCache', () => {
    it('should clear all cache when no params', async () => {
      // Cache some data
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Debug');
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

      // Invalidate all
      cache.invalidateCache();

      // Should fetch again
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Debug');
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });

    it('should clear cache for specific project', async () => {
      // Cache for project A
      await cache.getBuildSettings('/path/to/ProjectA.xcodeproj', 'ProjectA', 'Debug');
      // Cache for project B
      await cache.getBuildSettings('/path/to/ProjectB.xcodeproj', 'ProjectB', 'Debug');

      // Invalidate project A
      cache.invalidateCache('/path/to/ProjectA.xcodeproj');

      // Project A should refetch
      await cache.getBuildSettings('/path/to/ProjectA.xcodeproj', 'ProjectA', 'Debug');
      // Project B should use cache
      await cache.getBuildSettings('/path/to/ProjectB.xcodeproj', 'ProjectB', 'Debug');

      expect(mockExecuteCommand).toHaveBeenCalledTimes(3); // 2 initial + 1 refetch for A
    });

    it('should clear cache for specific scheme', async () => {
      // Cache for scheme A and B
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'SchemeA', 'Debug');
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'SchemeB', 'Debug');

      // Invalidate scheme A
      cache.invalidateCache('/path/to/MyApp.xcodeproj', 'SchemeA');

      // Scheme A should refetch
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'SchemeA', 'Debug');
      // Scheme B should use cache
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'SchemeB', 'Debug');

      expect(mockExecuteCommand).toHaveBeenCalledTimes(3); // 2 initial + 1 refetch for A
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      // Empty cache
      let stats = cache.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.oldestEntry).toBeNull();

      // Cache some data
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Debug');
      await cache.getBuildSettings('/path/to/MyApp.xcodeproj', 'MyApp', 'Release');

      stats = cache.getCacheStats();
      expect(stats.size).toBe(2);
      expect(stats.oldestEntry).toBeTruthy();
      expect(stats.newestEntry).toBeTruthy();
    });
  });
});
