# PRIORITY-1: Auto-Install After Successful Build

**Status:** Pending
**Priority:** 1 - High Impact
**Effort:** Small
**Impact:** High - Reduces manual steps in common workflow
**Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE

## Problem Statement

Current workflow requires separate calls:

1. `xcodebuild-build` → get buildId
2. Manually determine `.app` path
3. `simctl-install` with appPath and udid
4. `simctl-launch` with bundleId and udid

This is error-prone and tedious. Users want to build and immediately test on a simulator with minimal parameters.

## Proposed Solution

Add optional `autoInstall` parameter to `xcodebuild-build` that automatically:

1. After successful build, discovers app path from build settings
2. Determines best simulator (or uses specified one)
3. Boots simulator if needed
4. Installs app to simulator
5. Returns install status and next steps

### Implementation

Update: `src/tools/xcodebuild/build.ts`

```typescript
interface XcodebuildBuildArgs {
  projectPath: string;
  scheme: string;
  configuration?: string;
  derivedDataPath?: string;
  destination?: string;

  // NEW: Auto-install options
  autoInstall?: boolean;
  simulatorUdid?: string; // Optional: specific simulator, else auto-suggest
  bootSimulator?: boolean; // Default: true
}

export async function xcodebuildBuildTool(args: any) {
  const {
    projectPath,
    scheme,
    configuration = 'Debug',
    destination,
    autoInstall = false,
    simulatorUdid,
    bootSimulator = true,
  } = args;

  const responseData: any = {
    success: false,
    buildId: undefined,
    installation: undefined,
  };

  try {
    // ... existing build logic ...

    responseData.success = buildResult.success;
    responseData.buildId = buildCacheId;

    // ===== NEW: Auto-install after successful build =====
    if (autoInstall && buildResult.success) {
      try {
        console.error('[xcodebuild-build] Starting auto-install...');

        // Step 1: Get build artifacts
        const artifacts = await findBuildArtifacts(projectPath, scheme, configuration);

        if (!artifacts.appPath || !artifacts.bundleIdentifier) {
          throw new Error(
            'Could not determine app path or bundle identifier from build artifacts'
          );
        }

        // Step 2: Determine simulator
        let udid = simulatorUdid;

        if (!udid) {
          // Try to auto-suggest based on project
          const suggestion = await simulatorCache.getBestSimulatorForProject(projectPath);

          if (!suggestion) {
            throw new Error(
              'No suitable simulator found. Specify simulatorUdid or create a simulator.'
            );
          }

          udid = suggestion.simulator.udid;
          console.error(`[xcodebuild-build] Auto-selected simulator: ${suggestion.simulator.name}`);
        }

        // Step 3: Boot simulator if needed
        if (bootSimulator) {
          const simulator = await simulatorCache.findSimulatorByUdid(udid);

          if (simulator && simulator.state !== 'Booted') {
            console.error(`[xcodebuild-build] Booting simulator ${udid}...`);
            await simulatorLifecycle.ensureBooted(udid, true);
          }
        }

        // Step 4: Install app
        console.error(`[xcodebuild-build] Installing ${artifacts.bundleIdentifier}...`);
        const installResult = await simctlInstallTool({
          udid,
          appPath: artifacts.appPath,
        });

        responseData.installation = {
          success: true,
          simulator: udid,
          bundleIdentifier: artifacts.bundleIdentifier,
          appPath: artifacts.appPath,
          guidance: [
            `✓ App installed to ${installResult.simulatorName || 'simulator'}`,
            `Launch: simctl-launch udid: "${udid}" bundleId: "${artifacts.bundleIdentifier}"`,
            `Or use build-and-run workflow for one-command build+install+launch`,
          ],
        };
      } catch (installError) {
        responseData.installation = {
          success: false,
          error: String(installError),
          guidance: [
            'Build succeeded but auto-install failed',
            `Manual install: simctl-install udid: "<udid>" appPath: "${artifacts?.appPath || '<path>'}"`,
            'Check simulator is available and booted',
          ],
        };
      }
    }

    return {
      ...responseData,
      guidance: [
        responseData.success ? '✓ Build succeeded' : '✗ Build failed',
        responseData.installation
          ? responseData.installation.success
            ? '✓ App installed to simulator'
            : '⚠ Install failed (see details)'
          : autoInstall
            ? 'Auto-install not enabled'
            : 'Use autoInstall: true to install to simulator',
      ],
    };
  } catch (error) {
    // ... error handling ...
  }
}
```

### Tool Description Update

Update tool registration in `src/index.ts`:

```typescript
{
  name: 'xcodebuild-build',
  description: `⚡ **Prefer this over 'xcodebuild'** - Intelligent building with learning and auto-install.

Common workflows:
1. Build and install: xcodebuild-build projectPath: "..." autoInstall: true
2. Build and launch: Use build-and-run workflow tool
3. CI/CD: xcodebuild-build projectPath: "..." (no simulator interactions)

NEW: Optional autoInstall parameter automatically installs built app to simulator!

Why use this:
• Learns from your builds - remembers successful configurations
• Smart defaults - auto-suggests optimal simulators based on project
• Performance tracking - records build times for optimization
• Progressive disclosure - large logs cached with IDs to prevent token overflow
• Better error handling - structured errors vs raw CLI stderr`,

  inputSchema: {
    // ... existing params ...
    properties: {
      // ... existing ...
      autoInstall: {
        type: 'boolean',
        description: 'Optional: Auto-install app to simulator after successful build',
      },
      simulatorUdid: {
        type: 'string',
        description: 'Optional: Specific simulator UDID. If not provided, auto-suggests based on project',
      },
      bootSimulator: {
        type: 'boolean',
        description: 'Optional: Boot simulator if needed before install (default: true)',
      },
    },
  },
}
```

## Implementation Checklist

- [ ] Add `autoInstall`, `simulatorUdid`, `bootSimulator` parameters to xcodebuild-build
- [ ] Import `findBuildArtifacts()` utility
- [ ] Add auto-install logic after successful build
- [ ] Handle case where simulator not found (helpful error)
- [ ] Handle case where app path can't be determined
- [ ] Integrate with simulator lifecycle for race-condition-free boot
- [ ] Format response with installation status
- [ ] Update tool description with workflow examples
- [ ] Add guidance for next steps (launch, testing, etc.)
- [ ] Unit tests for auto-install logic
- [ ] Integration tests with real project
- [ ] Update tool description in CLAUDE.md
- [ ] Add example to README

## Testing Requirements

### Unit Tests

- [ ] Build succeeds, auto-install enabled → app installed
- [ ] Build fails → no install attempt
- [ ] Auto-install disabled → no install even if build succeeds
- [ ] Simulator UDID not found → helpful error
- [ ] Build artifacts not found → helpful error
- [ ] Auto-boot works with unbooted simulator

### Integration Tests

- [ ] Works with real iOS project
- [ ] Discovers correct bundle ID
- [ ] Installs to correct simulator
- [ ] Auto-boots simulator when needed
- [ ] Handles simulator already booted correctly

### Manual Testing

- [ ] Build with autoInstall: true
- [ ] Verify app installed to simulator
- [ ] Check guidance for next steps (launch)
- [ ] Try with unbooted simulator (verify auto-boot)
- [ ] Try with non-existent simulator (verify error message)

## Related Tickets

- **Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE
- **Enables:** PRIORITY-2-BUILD-AND-RUN-WORKFLOW
- **Works with:**
  - PRIORITY-1-SMART-SIMULATOR-SELECTION
  - PRIORITY-1-PRE-OPERATION-VALIDATION
  - PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY

## Notes

### Behavior

**With autoInstall: true**
```
1. Build project
2. On success: Get build artifacts (app path, bundle ID)
3. Get best simulator or use specified one
4. Boot simulator if needed
5. Install app
6. Return success with guidance for launch
```

**If installation fails**
```
1. Build succeeds
2. Installation fails with clear reason
3. Return build success but installation failure
4. Provide manual install command for user
```

### Backward Compatibility

Default `autoInstall: false` maintains existing behavior. Users must explicitly enable auto-install.

### Performance

- Add ~1-2 seconds for simulator auto-suggestion
- Add ~5-10 seconds for simulator boot (if needed)
- Install is fast (~1-2 seconds)
- Total workflow now ~1-2 minutes instead of requiring manual steps

### Future Enhancements

- Add `autoLaunch` parameter to launch app after install
- Add `autoScreenshot` to capture initial screen
- Support for running first test after install
