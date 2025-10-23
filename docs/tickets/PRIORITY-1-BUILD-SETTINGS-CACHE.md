# PRIORITY-1: Build Settings Integration

**Status:** Pending
**Priority:** 1 - High Impact
**Effort:** Medium
**Impact:** High - Foundation for 4 other tickets

## Problem Statement

The xc-mcp system lacks integration with Xcode's build settings, preventing automatic discovery of critical project metadata:

- No bundle identifier discovery (required for `simctl-install`, `simctl-launch`)
- No deployment target awareness (prevents smart simulator selection)
- No app path resolution (users must manually specify `.app` locations)
- No capabilities inspection (can't validate required permissions)

This forces users to manually provide information that already exists in their project files, reducing usability and making automation difficult.

## Current Issues

1. **simctl-install** (line 65): Tries to infer app name from path instead of extracting bundle ID from Info.plist
2. **simctl-launch**: Requires manual bundle ID specification when it could be auto-discovered
3. **Simulator selection**: Doesn't consider deployment target compatibility
4. **No build artifact tracking**: Can't find `.app` location after successful build

## Proposed Solution

Create a `BuildSettingsCache` that:

1. Executes `xcodebuild -showBuildSettings` with JSON output
2. Caches results with 1-hour TTL (invalidate on project file changes)
3. Exposes high-level methods for common queries
4. Supports multiple configurations (Debug/Release)

### Implementation Details

Create new file: `src/state/build-settings-cache.ts`

```typescript
export interface BuildSettings {
  PRODUCT_BUNDLE_IDENTIFIER: string;
  DEPLOYMENT_TARGET: string;
  TARGETED_DEVICE_FAMILY: string; // "1" (iPhone), "2" (iPad), "1,2" (Universal)
  INFOPLIST_FILE: string;
  CONFIGURATION_BUILD_DIR: string;
  PRODUCT_NAME: string;
  PRODUCT_MODULE_NAME: string;
  // Capabilities
  NSCameraUsageDescription?: string;
  NSLocationWhenInUseUsageDescription?: string;
  NSMicrophoneUsageDescription?: string;
  NSHealthShareUsageDescription?: string;
  NSHealthUpdateUsageDescription?: string;
  // Additional info plist properties...
}

export class BuildSettingsCache {
  private cache = new Map<string, { settings: BuildSettings; timestamp: number }>();
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
    return `${settings.CONFIGURATION_BUILD_DIR}/${settings.PRODUCT_NAME}.app`;
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
  async getDeviceFamilies(projectPath: string, scheme: string): Promise<{
    supportsIPhone: boolean;
    supportsIPad: boolean;
  }> {
    const settings = await this.getBuildSettings(projectPath, scheme);
    const families = settings.TARGETED_DEVICE_FAMILY.split(',');

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
    if (settings.NSLocationWhenInUseUsageDescription) capabilities.push('location');
    if (settings.NSMicrophoneUsageDescription) capabilities.push('microphone');
    if (settings.NSHealthShareUsageDescription || settings.NSHealthUpdateUsageDescription) {
      capabilities.push('health');
    }

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

  private async fetchBuildSettings(
    projectPath: string,
    scheme: string,
    configuration: string
  ): Promise<BuildSettings> {
    // Execute: xcodebuild -showBuildSettings -json -project/workspace -scheme -configuration
    // Parse JSON output and extract settings
    // See implementation in related ticket
  }
}

// Export singleton instance
export const buildSettingsCache = new BuildSettingsCache();
```

Create new file: `src/utils/build-settings-parser.ts`

```typescript
/**
 * Parse xcodebuild -showBuildSettings output
 */
export async function parseBuildSettingsJson(jsonOutput: string): Promise<BuildSettings> {
  const data = JSON.parse(jsonOutput);

  if (!Array.isArray(data)) {
    throw new Error('Invalid xcodebuild -showBuildSettings JSON format');
  }

  const settings = data[0]?.buildSettings || {};

  return {
    PRODUCT_BUNDLE_IDENTIFIER: settings.PRODUCT_BUNDLE_IDENTIFIER || '',
    DEPLOYMENT_TARGET: settings.IPHONEOS_DEPLOYMENT_TARGET || settings.MACOSX_DEPLOYMENT_TARGET || '14.0',
    TARGETED_DEVICE_FAMILY: settings.TARGETED_DEVICE_FAMILY || '1,2',
    INFOPLIST_FILE: settings.INFOPLIST_FILE || '',
    CONFIGURATION_BUILD_DIR: settings.CONFIGURATION_BUILD_DIR || '',
    PRODUCT_NAME: settings.PRODUCT_NAME || '',
    PRODUCT_MODULE_NAME: settings.PRODUCT_MODULE_NAME || '',
    NSCameraUsageDescription: settings.NSCameraUsageDescription,
    NSLocationWhenInUseUsageDescription: settings.NSLocationWhenInUseUsageDescription,
    NSMicrophoneUsageDescription: settings.NSMicrophoneUsageDescription,
    NSHealthShareUsageDescription: settings.NSHealthShareUsageDescription,
    NSHealthUpdateUsageDescription: settings.NSHealthUpdateUsageDescription,
  };
}
```

### Integration Points

This cache should be used in:

- `src/tools/simctl/install.ts` - Auto-discover bundle ID and app path
- `src/tools/simctl/launch.ts` - Auto-discover bundle ID
- `src/state/simulator-cache.ts` - Smart simulator selection with deployment target
- `src/tools/xcodebuild/build.ts` - Provide app path in build response
- Future: Capabilities validator, scheme inspector

## Implementation Checklist

- [ ] Create `src/state/build-settings-cache.ts` with `BuildSettingsCache` class
- [ ] Create `src/utils/build-settings-parser.ts` for JSON parsing
- [ ] Add xcodebuild command builder for `-showBuildSettings`
- [ ] Implement JSON output parsing with proper error handling
- [ ] Add cache invalidation logic for project file changes
- [ ] Export singleton instance
- [ ] Create unit tests for cache and parser
- [ ] Test with multiple project types (single target, multi-target, workspaces)
- [ ] Document caching behavior in CLAUDE.md
- [ ] Add integration tests with real Xcode projects

## Testing Requirements

### Unit Tests

- [ ] Parse valid JSON output from xcodebuild
- [ ] Handle missing deployment target gracefully
- [ ] Parse device families correctly (1, 2, 1,2)
- [ ] Extract capabilities from settings
- [ ] Cache TTL expiration works
- [ ] Cache invalidation works correctly
- [ ] Multiple configurations cached separately

### Integration Tests

- [ ] Works with real Xcode project
- [ ] Works with workspace projects
- [ ] Works with multi-target projects
- [ ] Handles missing Info.plist keys gracefully
- [ ] Performance: subsequent calls use cache

### Manual Testing

- [ ] Test with your own iOS project
- [ ] Verify bundle ID extraction accuracy
- [ ] Verify deployment target parsing
- [ ] Test cache invalidation after project changes

## Related Tickets

- **Depends on:** None
- **Enables:**
  - PRIORITY-1-SMART-SIMULATOR-SELECTION
  - PRIORITY-1-AUTO-INSTALL-AFTER-BUILD
  - PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY
  - PRIORITY-2-BUILD-AND-RUN-WORKFLOW
  - PRIORITY-3-CAPABILITIES-VALIDATOR

## Notes

### Command Example

```bash
xcodebuild -showBuildSettings -json \
  -project MyApp.xcodeproj \
  -scheme MyApp \
  -configuration Debug
```

Output is JSON array with buildSettings object containing all variables.

### Performance Considerations

- 1-hour cache TTL balances freshness with performance
- Consider invalidating cache on `.pbxproj` file modification
- Could expand to watch for Info.plist changes
- Lazy loading: only fetch when requested

### Future Enhancements

- Watch for `.pbxproj` changes and auto-invalidate
- Parse `Info.plist` directly for InfoDictionary keys
- Extract capabilities from Xcode project entitlements
- Support for xcconfig files
