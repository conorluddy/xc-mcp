# PRIORITY-1: Bundle ID Auto-Discovery

**Status:** Pending
**Priority:** 1 - High Impact
**Effort:** Small
**Impact:** High - Eliminates manual parameter for install/launch
**Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE

## Problem Statement

`simctl-install` and `simctl-launch` currently require users to manually specify bundle ID, but this information is embedded in the `.app` bundle's `Info.plist` file.

Current usage:
```
simctl-install udid: "ABC123" appPath: "/path/to/MyApp.app"
# User must separately find and provide bundle ID for launch

simctl-launch udid: "ABC123" bundleId: "com.example.MyApp"
# User must manually provide bundle ID
```

Better usage:
```
simctl-install udid: "ABC123" appPath: "/path/to/MyApp.app"
# Tool extracts bundle ID from Info.plist and returns it

simctl-launch udid: "ABC123" bundleId: "com.example.MyApp"
# Or discover from installed apps
```

## Proposed Solution

1. Extract bundle ID from `Info.plist` inside `.app` bundle
2. Return bundle ID in install response for immediate use
3. Add optional parameter to launch to discover from installed apps
4. Create utility for reading plist files

### Implementation

Create new file: `src/utils/plist-parser.ts`

```typescript
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

/**
 * Parse Info.plist from app bundle
 * Supports both binary and XML plist formats
 */
export function parseInfoPlist(appPath: string): Record<string, any> {
  const infoPlistPath = `${appPath}/Info.plist`;

  try {
    // Use plutil to convert plist to JSON
    const jsonOutput = execSync(`plutil -convert json -o - "${infoPlistPath}"`, {
      encoding: 'utf-8',
    });

    return JSON.parse(jsonOutput);
  } catch (error) {
    throw new Error(`Could not parse Info.plist at ${infoPlistPath}: ${error}`);
  }
}

/**
 * Extract bundle identifier from app bundle
 */
export function extractBundleIdentifierFromApp(appPath: string): string {
  const plist = parseInfoPlist(appPath);

  const bundleId = plist.CFBundleIdentifier;

  if (!bundleId) {
    throw new Error(`No CFBundleIdentifier found in ${appPath}/Info.plist`);
  }

  return bundleId;
}

/**
 * Extract app name (display name or bundle name)
 */
export function extractAppNameFromApp(appPath: string): string {
  const plist = parseInfoPlist(appPath);

  return plist.CFBundleDisplayName || plist.CFBundleName || 'Unknown';
}

/**
 * Extract app version
 */
export function extractAppVersionFromApp(appPath: string): string {
  const plist = parseInfoPlist(appPath);

  return plist.CFBundleShortVersionString || plist.CFBundleVersion || '1.0';
}

/**
 * Extract minimum iOS version
 */
export function extractMinimumOSVersionFromApp(appPath: string): string {
  const plist = parseInfoPlist(appPath);

  return plist.MinimumOSVersion || '11.0';
}
```

Update: `src/tools/simctl/install.ts`

```typescript
export async function simctlInstallTool(args: any) {
  const { udid, appPath } = args;

  // Validate parameters
  if (!appPath) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'appPath is required (e.g., /path/to/MyApp.app)'
    );
  }

  // Validate simulator
  const validation = await validateSimulatorForOperation(udid, 'install');
  if (!validation.valid) {
    throw new McpError(ErrorCode.InvalidRequest, validation.reason!);
  }

  try {
    // ===== NEW: Extract bundle ID from app =====
    let bundleIdentifier: string;
    let appName: string;
    let appVersion: string;

    try {
      bundleIdentifier = extractBundleIdentifierFromApp(appPath);
      appName = extractAppNameFromApp(appPath);
      appVersion = extractAppVersionFromApp(appPath);
    } catch (extractError) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Could not extract bundle ID from app: ${extractError}`
      );
    }

    // Perform installation
    const command = buildSimctlCommand('install', { udid, appPath });
    const result = await executeCommand(command);

    if (!result.success) {
      return {
        success: false,
        error: result.stderr,
        guidance: [
          'Installation failed. Check error message above.',
          'Verify simulator is booted and available',
          'Try: simctl-health-check',
        ],
      };
    }

    const responseData = {
      success: true,
      simulator: udid,
      bundleIdentifier, // ===== NEW: Extracted from app =====
      appPath,
      appName,
      appVersion,
      guidance: [
        `✓ ${appName} (v${appVersion}) installed successfully`,
        `Bundle ID: ${bundleIdentifier}`,
        `To launch: simctl-launch udid: "${udid}" bundleId: "${bundleIdentifier}"`,
        `To get container: simctl-get-app-container udid: "${udid}" bundleId: "${bundleIdentifier}"`,
      ],
    };

    // ===== NEW: Store in cache for quick reference =====
    installedAppsCache.set(`${udid}:${bundleIdentifier}`, {
      appPath,
      appName,
      appVersion,
      timestamp: Date.now(),
    });

    return responseData;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Installation error: ${error}`
    );
  }
}
```

Create new file: `src/state/installed-apps-cache.ts`

```typescript
/**
 * Cache of installed apps per simulator
 * Helps with bundle ID discovery for launch, uninstall, etc.
 */
export interface InstalledApp {
  bundleId: string;
  appName: string;
  appVersion: string;
  installedAt: number;
}

export class InstalledAppsCache {
  private cache = new Map<string, InstalledApp>();

  /**
   * Get cached installed apps for a simulator
   * Format: "udid:bundleId" -> app info
   */
  getInstalledApps(udid: string): InstalledApp[] {
    const apps = [];

    for (const [key, app] of this.cache) {
      if (key.startsWith(`${udid}:`)) {
        apps.push(app);
      }
    }

    return apps;
  }

  /**
   * Get specific app from cache
   */
  getInstalledApp(udid: string, bundleId: string): InstalledApp | undefined {
    return this.cache.get(`${udid}:${bundleId}`);
  }

  /**
   * Add app to cache (called after install)
   */
  addInstalledApp(udid: string, bundleId: string, app: InstalledApp): void {
    this.cache.set(`${udid}:${bundleId}`, {
      ...app,
      installedAt: Date.now(),
    });
  }

  /**
   * Remove app from cache (called after uninstall)
   */
  removeInstalledApp(udid: string, bundleId: string): void {
    this.cache.delete(`${udid}:${bundleId}`);
  }

  /**
   * Clear all cached apps for simulator (called when simulator erased)
   */
  clearSimulatorApps(udid: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${udid}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * List apps on simulator (attempts cache first, then queries)
   */
  async getOrFetchInstalledApps(udid: string): Promise<InstalledApp[]> {
    const cached = this.getInstalledApps(udid);

    if (cached.length > 0) {
      return cached;
    }

    // TODO: Query simctl to get actual installed apps
    // This is a more advanced feature for future implementation
    return [];
  }
}

export const installedAppsCache = new InstalledAppsCache();
```

Update: `src/tools/simctl/launch.ts`

```typescript
interface SimctlLaunchArgs {
  udid: string;
  bundleId?: string; // Optional if discovering from cache
  arguments?: string[];
  environment?: Record<string, string>;
}

export async function simctlLaunchTool(args: any) {
  let { udid, bundleId, arguments: launchArgs, environment: envVars } = args;

  // ===== NEW: Try to discover bundleId from cache if not provided =====
  if (!bundleId) {
    const cachedApps = installedAppsCache.getInstalledApps(udid);

    if (cachedApps.length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'bundleId required (install app first or provide bundleId)'
      );
    }

    if (cachedApps.length === 1) {
      bundleId = cachedApps[0].bundleId;
      console.error(`[simctl-launch] Discovered bundle ID: ${bundleId}`);
    } else {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Multiple apps installed. Specify bundleId. Available: ${cachedApps.map((a) => a.bundleId).join(', ')}`
      );
    }
  }

  // Validate simulator
  const validation = await validateSimulatorForOperation(udid, 'launch');
  if (!validation.valid) {
    throw new McpError(ErrorCode.InvalidRequest, validation.reason!);
  }

  // Validate app is installed
  const appValidation = await validateAppInstalled(udid, bundleId);
  if (!appValidation.valid) {
    throw new McpError(ErrorCode.InvalidRequest, appValidation.reason!);
  }

  try {
    // Build and execute launch command
    const command = buildSimctlCommand('launch', {
      udid,
      bundleId,
      arguments: launchArgs,
      environment: envVars,
    });

    const result = await executeCommand(command);

    return {
      success: result.success,
      processId: parseProcessId(result.stdout),
      bundleId,
      guidance: [
        `✓ App launched (PID: ${parseProcessId(result.stdout)})`,
        `Monitor logs: xcrun simctl spawn ${udid} log stream --predicate 'process == "${bundleId}"'`,
        `Take screenshot: simctl-io udid: "${udid}" operation: "screenshot"`,
      ],
    };
  } catch (error) {
    throw new McpError(ErrorCode.InternalError, `Launch failed: ${error}`);
  }
}
```

## Implementation Checklist

- [ ] Create `src/utils/plist-parser.ts` with plist reading functions
- [ ] Add `extractBundleIdentifierFromApp()` function
- [ ] Add `extractAppNameFromApp()` function
- [ ] Add `extractAppVersionFromApp()` function
- [ ] Create `src/state/installed-apps-cache.ts` for app tracking
- [ ] Update `simctl-install.ts` to extract and return bundle ID
- [ ] Update tool response to include bundle ID
- [ ] Update guidance to show bundle ID for next commands
- [ ] Create `InstalledAppsCache` class
- [ ] Update `simctl-launch.ts` to discover bundle ID from cache
- [ ] Update `simctl-launch.ts` to work without bundleId when app cached
- [ ] Add tests for plist parsing
- [ ] Add tests for app extraction
- [ ] Add integration tests with real app bundles
- [ ] Update tool descriptions
- [ ] Update README with examples

## Testing Requirements

### Unit Tests

- [ ] Parse Info.plist correctly
- [ ] Extract bundle identifier from plist
- [ ] Extract app name from plist
- [ ] Extract app version from plist
- [ ] Handle missing CFBundleIdentifier gracefully
- [ ] Cache stores and retrieves installed apps
- [ ] Cache clears when simulator erased

### Integration Tests

- [ ] Works with real iOS app bundle
- [ ] Extracts correct bundle ID
- [ ] Launch works with discovered bundle ID
- [ ] Multiple apps distinguished correctly

### Manual Testing

- [ ] Build and install app
- [ ] Verify bundle ID returned in response
- [ ] Launch using returned bundle ID
- [ ] Check app actually launches

## Related Tickets

- **Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE
- **Enables:**
  - PRIORITY-2-BUILD-AND-RUN-WORKFLOW
  - PRIORITY-1-AUTO-INSTALL-AFTER-BUILD
- **Works with:**
  - PRIORITY-1-PRE-OPERATION-VALIDATION
  - PRIORITY-2-BUILD-AND-RUN-WORKFLOW

## Notes

### Plist Format

Info.plist can be binary or XML format. Use `plutil` (built-in on macOS) to convert and read:

```bash
plutil -convert json -o - /path/to/MyApp.app/Info.plist
```

### Future Enhancements

- Query simctl for actual installed apps (more reliable than cache)
- Parse entitlements file for capabilities
- Extract app icon from app bundle
- Support for app extensions and frameworks
