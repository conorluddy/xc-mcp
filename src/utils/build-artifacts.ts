/**
 * Build Artifacts Discovery
 *
 * Utilities for finding and analyzing Xcode build artifacts (.app bundles, dSYMs, etc.)
 * Uses build settings cache to determine artifact locations without manual path specification.
 */

import { buildSettingsCache } from '../state/build-settings-cache.js';
import { existsSync } from 'fs';
import { join } from 'path';

export interface BuildArtifacts {
  appPath?: string;
  dSYMPath?: string;
  bundleIdentifier?: string;
  buildDirectory?: string;
}

/**
 * Find build artifacts for a given project and scheme
 *
 * Returns paths to .app bundle, dSYM, and other build outputs.
 * Uses build settings cache to determine locations automatically.
 *
 * @param projectPath - Path to .xcodeproj or .xcworkspace
 * @param scheme - Build scheme name
 * @param configuration - Build configuration (Debug, Release, etc.)
 * @returns Object containing paths to build artifacts
 *
 * @example
 * const artifacts = await findBuildArtifacts(
 *   '/path/to/MyApp.xcodeproj',
 *   'MyApp',
 *   'Debug'
 * );
 * // Returns: {
 * //   appPath: '/path/to/DerivedData/.../MyApp.app',
 * //   bundleIdentifier: 'com.example.MyApp',
 * //   ...
 * // }
 */
export async function findBuildArtifacts(
  projectPath: string,
  scheme: string,
  configuration: string = 'Debug'
): Promise<BuildArtifacts> {
  // Get build settings from cache
  const settings = await buildSettingsCache.getBuildSettings(projectPath, scheme, configuration);

  const buildDir = settings.CONFIGURATION_BUILD_DIR;
  const productName = settings.PRODUCT_NAME;

  // Construct artifact paths
  const appPath = join(buildDir, `${productName}.app`);
  const dSYMPath = join(buildDir, `${productName}.app.dSYM`);

  // Verify .app exists (build may not have run yet)
  const appExists = existsSync(appPath);

  return {
    appPath: appExists ? appPath : undefined,
    dSYMPath: existsSync(dSYMPath) ? dSYMPath : undefined,
    bundleIdentifier: settings.PRODUCT_BUNDLE_IDENTIFIER,
    buildDirectory: buildDir,
  };
}

/**
 * Verify build artifacts exist for installation
 *
 * Checks that .app bundle exists and is ready for installation to simulator.
 * Provides helpful error messages if artifacts are missing.
 *
 * @param projectPath - Path to .xcodeproj or .xcworkspace
 * @param scheme - Build scheme name
 * @param configuration - Build configuration
 * @returns Validation result with app path or error guidance
 */
export async function verifyBuildArtifacts(
  projectPath: string,
  scheme: string,
  configuration: string = 'Debug'
): Promise<{ valid: boolean; appPath?: string; error?: string; guidance?: string[] }> {
  try {
    const artifacts = await findBuildArtifacts(projectPath, scheme, configuration);

    if (!artifacts.appPath) {
      return {
        valid: false,
        error: 'App bundle not found',
        guidance: [
          'Build the project first using xcodebuild-build',
          `Expected location: ${artifacts.buildDirectory}`,
          'Verify build succeeded before attempting installation',
        ],
      };
    }

    return {
      valid: true,
      appPath: artifacts.appPath,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Could not determine build artifacts: ${error}`,
      guidance: [
        'Ensure project path and scheme are correct',
        'Check build settings are accessible',
        'Try: xcodebuild-list to see available schemes',
      ],
    };
  }
}
