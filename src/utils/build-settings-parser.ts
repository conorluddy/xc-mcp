/**
 * Build Settings Parser
 *
 * Parses JSON output from `xcodebuild -showBuildSettings -json`
 */

import { BuildSettings } from '../state/build-settings-cache.js';

/**
 * Parse xcodebuild -showBuildSettings JSON output
 *
 * Expected format:
 * [
 *   {
 *     "action": "build",
 *     "target": "MyApp",
 *     "buildSettings": {
 *       "PRODUCT_BUNDLE_IDENTIFIER": "com.example.MyApp",
 *       "IPHONEOS_DEPLOYMENT_TARGET": "15.0",
 *       ...
 *     }
 *   }
 * ]
 */
export function parseBuildSettingsJson(jsonOutput: string): BuildSettings {
  let data: any;

  try {
    data = JSON.parse(jsonOutput);
  } catch (error) {
    throw new Error(`Invalid JSON from xcodebuild: ${error}`);
  }

  if (!Array.isArray(data)) {
    throw new Error('Invalid xcodebuild -showBuildSettings JSON format: expected array');
  }

  if (data.length === 0) {
    throw new Error('Empty build settings array from xcodebuild');
  }

  // Get first entry's build settings
  const settingsEntry = data[0];

  if (!settingsEntry.buildSettings) {
    throw new Error('No buildSettings found in xcodebuild output');
  }

  const settings = settingsEntry.buildSettings;

  // Extract required settings with fallbacks
  return {
    PRODUCT_BUNDLE_IDENTIFIER: settings.PRODUCT_BUNDLE_IDENTIFIER || '',
    DEPLOYMENT_TARGET:
      settings.IPHONEOS_DEPLOYMENT_TARGET ||
      settings.MACOSX_DEPLOYMENT_TARGET ||
      settings.TVOS_DEPLOYMENT_TARGET ||
      settings.WATCHOS_DEPLOYMENT_TARGET ||
      '14.0',
    TARGETED_DEVICE_FAMILY: settings.TARGETED_DEVICE_FAMILY || '1,2',
    INFOPLIST_FILE: settings.INFOPLIST_FILE || '',
    CONFIGURATION_BUILD_DIR: settings.CONFIGURATION_BUILD_DIR || '',
    PRODUCT_NAME: settings.PRODUCT_NAME || '',
    PRODUCT_MODULE_NAME: settings.PRODUCT_MODULE_NAME || settings.PRODUCT_NAME || '',

    // Capabilities from Info.plist (optional)
    NSCameraUsageDescription: settings.NSCameraUsageDescription,
    NSLocationWhenInUseUsageDescription: settings.NSLocationWhenInUseUsageDescription,
    NSLocationAlwaysAndWhenInUseUsageDescription:
      settings.NSLocationAlwaysAndWhenInUseUsageDescription,
    NSMicrophoneUsageDescription: settings.NSMicrophoneUsageDescription,
    NSContactsUsageDescription: settings.NSContactsUsageDescription,
    NSCalendarsUsageDescription: settings.NSCalendarsUsageDescription,
    NSRemindersUsageDescription: settings.NSRemindersUsageDescription,
    NSPhotosUsageDescription: settings.NSPhotosUsageDescription,
    NSHealthShareUsageDescription: settings.NSHealthShareUsageDescription,
    NSHealthUpdateUsageDescription: settings.NSHealthUpdateUsageDescription,
    NSBluetoothAlwaysUsageDescription: settings.NSBluetoothAlwaysUsageDescription,
    NSUserTrackingUsageDescription: settings.NSUserTrackingUsageDescription,
    NSSiriUsageDescription: settings.NSSiriUsageDescription,
  };
}

/**
 * Extract deployment target as major version number
 */
export function extractDeploymentTargetVersion(deploymentTarget: string): number {
  const match = deploymentTarget.match(/(\d+)/);
  return match ? parseInt(match[1]) : 14;
}

/**
 * Parse device families from string
 */
export function parseDeviceFamilies(deviceFamilyString: string): {
  supportsIPhone: boolean;
  supportsIPad: boolean;
} {
  const families = deviceFamilyString.split(',').map(f => f.trim());

  return {
    supportsIPhone: families.includes('1'),
    supportsIPad: families.includes('2'),
  };
}
