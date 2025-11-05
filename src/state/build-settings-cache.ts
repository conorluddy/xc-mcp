/**
 * Build Settings Cache
 *
 * Caches Xcode build settings to avoid repeated expensive xcodebuild calls.
 * Settings include bundle identifier, deployment target, device families, and capabilities.
 *
 * Cache TTL: 1 hour (can be invalidated on project file changes)
 */

import { join } from 'path';
import { executeCommand, buildXcodebuildCommand } from '../utils/command.js';
import { parseBuildSettingsJson } from '../utils/build-settings-parser.js';

export interface BuildSettings {
  PRODUCT_BUNDLE_IDENTIFIER: string;
  DEPLOYMENT_TARGET: string;
  TARGETED_DEVICE_FAMILY: string; // "1" (iPhone), "2" (iPad), "1,2" (Universal)
  INFOPLIST_FILE: string;
  CONFIGURATION_BUILD_DIR: string;
  PRODUCT_NAME: string;
  PRODUCT_MODULE_NAME: string;
  // Capabilities from Info.plist
  NSCameraUsageDescription?: string;
  NSLocationWhenInUseUsageDescription?: string;
  NSLocationAlwaysAndWhenInUseUsageDescription?: string;
  NSMicrophoneUsageDescription?: string;
  NSContactsUsageDescription?: string;
  NSCalendarsUsageDescription?: string;
  NSRemindersUsageDescription?: string;
  NSPhotosUsageDescription?: string;
  NSHealthShareUsageDescription?: string;
  NSHealthUpdateUsageDescription?: string;
  NSBluetoothAlwaysUsageDescription?: string;
  NSUserTrackingUsageDescription?: string;
  NSSiriUsageDescription?: string;
}

interface CacheEntry {
  settings: BuildSettings;
  timestamp: number;
}

export class BuildSettingsCache {
  private cache = new Map<string, CacheEntry>();
  private CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Get all build settings for a given project, scheme, and configuration
   */
  async getBuildSettings(
    projectPath: string,
    scheme: string,
    configuration: string = 'Debug'
  ): Promise<BuildSettings> {
    const cacheKey = `${projectPath}:${scheme}:${configuration}`;

    // Check cache validity
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.settings;
    }

    // Execute xcodebuild -showBuildSettings
    const settings = await this.fetchBuildSettings(projectPath, scheme, configuration);

    // Store in cache
    this.cache.set(cacheKey, {
      settings,
      timestamp: Date.now(),
    });

    return settings;
  }

  /**
   * Get bundle identifier for quick lookup
   */
  async getBundleIdentifier(projectPath: string, scheme: string): Promise<string> {
    const settings = await this.getBuildSettings(projectPath, scheme);
    return settings.PRODUCT_BUNDLE_IDENTIFIER;
  }

  /**
   * Get app path for installation/launching
   */
  async getAppPath(
    projectPath: string,
    scheme: string,
    configuration: string = 'Debug'
  ): Promise<string> {
    const settings = await this.getBuildSettings(projectPath, scheme, configuration);
    return join(settings.CONFIGURATION_BUILD_DIR, `${settings.PRODUCT_NAME}.app`);
  }

  /**
   * Get deployment target version as iOS major version (e.g., 15, 16, 17)
   */
  async getDeploymentTarget(projectPath: string, scheme: string): Promise<number> {
    const settings = await this.getBuildSettings(projectPath, scheme);
    const match = settings.DEPLOYMENT_TARGET.match(/(\d+)/);
    return match ? parseInt(match[1]) : 14; // Default to iOS 14 if parsing fails
  }

  /**
   * Get supported device families
   * Returns: { supportsIPhone: boolean; supportsIPad: boolean }
   */
  async getDeviceFamilies(
    projectPath: string,
    scheme: string
  ): Promise<{
    supportsIPhone: boolean;
    supportsIPad: boolean;
  }> {
    const settings = await this.getBuildSettings(projectPath, scheme);
    const families = settings.TARGETED_DEVICE_FAMILY.split(',').map(f => f.trim());

    return {
      supportsIPhone: families.includes('1'),
      supportsIPad: families.includes('2'),
    };
  }

  /**
   * Get required capabilities from Info.plist keys
   */
  async getRequiredCapabilities(projectPath: string, scheme: string): Promise<string[]> {
    const settings = await this.getBuildSettings(projectPath, scheme);
    const capabilities = [];

    if (settings.NSCameraUsageDescription) capabilities.push('camera');
    if (
      settings.NSLocationWhenInUseUsageDescription ||
      settings.NSLocationAlwaysAndWhenInUseUsageDescription
    ) {
      capabilities.push('location');
    }
    if (settings.NSMicrophoneUsageDescription) capabilities.push('microphone');
    if (settings.NSContactsUsageDescription) capabilities.push('contacts');
    if (settings.NSCalendarsUsageDescription) capabilities.push('calendar');
    if (settings.NSRemindersUsageDescription) capabilities.push('reminders');
    if (settings.NSPhotosUsageDescription) capabilities.push('photos');
    if (settings.NSHealthShareUsageDescription || settings.NSHealthUpdateUsageDescription) {
      capabilities.push('health');
    }
    if (settings.NSBluetoothAlwaysUsageDescription) capabilities.push('bluetooth');
    if (settings.NSUserTrackingUsageDescription) capabilities.push('tracking');
    if (settings.NSSiriUsageDescription) capabilities.push('siri');

    return capabilities;
  }

  /**
   * Invalidate cache for specific project (after project changes)
   */
  invalidateCache(projectPath?: string, scheme?: string): void {
    if (!projectPath) {
      this.cache.clear();
      return;
    }

    if (!scheme) {
      // Clear all entries for this project
      for (const key of this.cache.keys()) {
        if (key.startsWith(projectPath)) {
          this.cache.delete(key);
        }
      }
      return;
    }

    // Clear specific entry
    const cacheKey = `${projectPath}:${scheme}`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(cacheKey)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let oldestTimestamp: number | null = null;
    let newestTimestamp: number | null = null;

    for (const entry of this.cache.values()) {
      if (oldestTimestamp === null || entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
      }
      if (newestTimestamp === null || entry.timestamp > newestTimestamp) {
        newestTimestamp = entry.timestamp;
      }
    }

    return {
      size: this.cache.size,
      oldestEntry: oldestTimestamp,
      newestEntry: newestTimestamp,
    };
  }

  /**
   * Fetch build settings from xcodebuild
   */
  private async fetchBuildSettings(
    projectPath: string,
    scheme: string,
    configuration: string
  ): Promise<BuildSettings> {
    // Build command using existing utility
    const command = buildXcodebuildCommand('-showBuildSettings', projectPath, {
      scheme,
      configuration,
      json: true,
    });

    try {
      const result = await executeCommand(command, { timeout: 30000 });

      if (result.code !== 0) {
        throw new Error(`xcodebuild -showBuildSettings failed: ${result.stderr}`);
      }

      // Parse JSON output
      return parseBuildSettingsJson(result.stdout);
    } catch (error) {
      throw new Error(`Failed to fetch build settings: ${error}`);
    }
  }
}

// Export singleton instance
export const buildSettingsCache = new BuildSettingsCache();
