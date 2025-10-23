# PRIORITY-2: Build-and-Run Workflow Tool

**Status:** Pending
**Priority:** 2 - Medium Impact
**Effort:** Medium
**Impact:** Medium - Reduces workflow from 5 tools to 1
**Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE, PRIORITY-1-SMART-SIMULATOR-SELECTION, PRIORITY-1-AUTO-INSTALL-AFTER-BUILD, PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY

## Problem Statement

Common iOS development workflow requires multiple sequential operations:

```
1. xcodebuild-build projectPath: "..." scheme: "..."
2. Wait for success, note buildId
3. simctl-suggest projectPath: "..."
4. Select simulator, note udid
5. Manual: Check if simulator booted
6. Manual: Determine .app path
7. simctl-install udid: "..." appPath: "..."
8. Note: bundleId from response
9. simctl-launch udid: "..." bundleId: "..."
10. Optional: simctl-io operation: "screenshot"
```

This is error-prone and tedious for both humans and AI agents. A single orchestration tool would dramatically improve developer experience.

## Proposed Solution

Create a `build-and-run` workflow tool that:

1. Builds project (with proper configuration discovery)
2. Auto-suggests best simulator (considering deployment target)
3. Boots simulator if needed
4. Installs app to simulator
5. Launches app
6. Optionally: takes initial screenshot
7. Returns complete result with next steps

### Implementation

Create new file: `src/tools/workflows/build-and-run.ts`

```typescript
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { buildSettingsCache } from '../../state/build-settings-cache.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { simulatorLifecycle } from '../../state/simulator-lifecycle.js';
import { xcodebuildBuildTool } from '../xcodebuild/build.js';
import { simctlBootTool } from '../simctl/boot.js';
import { simctlSuggestTool } from '../simctl/suggest.js';
import { simctlInstallTool } from '../simctl/install.js';
import { simctlLaunchTool } from '../simctl/launch.js';
import { simctlIoTool } from '../simctl/io.js';

export interface BuildAndRunArgs {
  projectPath: string;
  scheme: string;
  configuration?: string; // Default: 'Debug'
  simulatorUdid?: string; // Optional: specific simulator, else auto-suggest
  launchArguments?: string[]; // Optional: launch args
  environmentVariables?: Record<string, string>; // Optional: env vars
  takeScreenshot?: boolean; // Optional: capture screen after launch
}

export async function buildAndRunTool(args: any) {
  const {
    projectPath,
    scheme,
    configuration = 'Debug',
    simulatorUdid,
    launchArguments,
    environmentVariables,
    takeScreenshot = false,
  } = args;

  const workflow = {
    build: null as any,
    simulator: null as any,
    install: null as any,
    launch: null as any,
    screenshot: null as any,
  };

  const errors: string[] = [];
  const nextSteps: string[] = [];

  try {
    console.error('[build-and-run] Starting workflow...');

    // ===== STEP 1: Build =====
    console.error('[build-and-run] Step 1/4: Building project...');
    try {
      const buildResult = await xcodebuildBuildTool({
        projectPath,
        scheme,
        configuration,
      });

      workflow.build = buildResult;

      if (!buildResult.success) {
        return {
          success: false,
          workflow: 'build-and-run',
          failedAt: 'build',
          build: buildResult,
          guidance: [
            '✗ Build failed',
            'Fix build errors and try again',
            buildResult.error?.description || 'See build output above',
          ],
        };
      }

      console.error('[build-and-run] ✓ Build succeeded');
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Build failed: ${error}`
      );
    }

    // ===== STEP 2: Determine Simulator =====
    console.error('[build-and-run] Step 2/4: Selecting simulator...');

    let udid = simulatorUdid;

    if (!udid) {
      try {
        // Auto-suggest best simulator for project
        const suggestion = await simulatorCache.getBestSimulatorForProject(projectPath);

        if (!suggestion) {
          throw new Error(
            'No suitable simulator found. Create one with: simctl-create'
          );
        }

        udid = suggestion.simulator.udid;
        workflow.simulator = suggestion.simulator;

        console.error(`[build-and-run] ✓ Selected: ${suggestion.simulator.name}`);
        nextSteps.push(`Selected simulator: ${suggestion.simulator.name}`);
      } catch (error) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Simulator selection failed: ${error}`
        );
      }
    } else {
      // Validate specified simulator
      const simulator = await simulatorCache.findSimulatorByUdid(udid);
      if (!simulator) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Simulator ${udid} not found`
        );
      }
      workflow.simulator = simulator;
    }

    // ===== STEP 3: Boot Simulator =====
    console.error('[build-and-run] Step 3/4: Preparing simulator...');

    try {
      const simulator = workflow.simulator;

      if (simulator.state !== 'Booted') {
        console.error(`[build-and-run] Booting simulator...`);
        await simulatorLifecycle.ensureBooted(udid, true);
        nextSteps.push('Booted simulator');
      } else {
        nextSteps.push('Simulator already booted');
      }

      console.error('[build-and-run] ✓ Simulator ready');
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Simulator boot failed: ${error}`
      );
    }

    // ===== STEP 4: Install App =====
    console.error('[build-and-run] Step 3.5/4: Installing app...');

    try {
      const artifacts = await findBuildArtifacts(projectPath, scheme, configuration);

      if (!artifacts.appPath) {
        throw new Error(
          'Could not determine app path from build. Build artifact missing?'
        );
      }

      const installResult = await simctlInstallTool({
        udid,
        appPath: artifacts.appPath,
      });

      workflow.install = installResult;

      if (!installResult.success) {
        throw new Error(`Installation failed: ${installResult.error}`);
      }

      console.error(`[build-and-run] ✓ App installed (${installResult.bundleIdentifier})`);
      nextSteps.push(`Installed app: ${installResult.appName}`);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Installation failed: ${error}`
      );
    }

    // ===== STEP 5: Launch App =====
    console.error('[build-and-run] Step 4/4: Launching app...');

    try {
      const launchResult = await simctlLaunchTool({
        udid,
        bundleId: workflow.install.bundleIdentifier,
        arguments: launchArguments,
        environment: environmentVariables,
      });

      workflow.launch = launchResult;

      if (!launchResult.success) {
        throw new Error(`Launch failed`);
      }

      console.error(`[build-and-run] ✓ App launched (PID: ${launchResult.processId})`);
      nextSteps.push(`App running (PID: ${launchResult.processId})`);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Launch failed: ${error}`
      );
    }

    // ===== OPTIONAL: Screenshot =====
    if (takeScreenshot) {
      try {
        console.error('[build-and-run] Capturing screenshot...');

        const screenshotResult = await simctlIoTool({
          udid,
          operation: 'screenshot',
          appName: workflow.install.appName,
          screenName: 'Initial',
          state: 'Launched',
        });

        workflow.screenshot = screenshotResult;
        nextSteps.push(`Screenshot: ${screenshotResult.path}`);
      } catch (error) {
        console.error('[build-and-run] Screenshot failed (non-critical):', error);
      }
    }

    // ===== SUCCESS RESPONSE =====
    return {
      success: true,
      workflow: 'build-and-run',
      completed: {
        build: true,
        simulator: true,
        install: true,
        launch: true,
        screenshot: takeScreenshot && workflow.screenshot?.success,
      },
      summary: {
        scheme,
        configuration,
        simulator: {
          name: workflow.simulator.name,
          udid: workflow.simulator.udid,
          runtime: workflow.simulator.runtime,
        },
        app: {
          name: workflow.install.appName,
          bundleId: workflow.install.bundleIdentifier,
          version: workflow.install.appVersion,
        },
        launchDetails: {
          processId: workflow.launch.processId,
          timestamp: new Date().toISOString(),
        },
      },
      guidance: [
        '✓ Build and run workflow completed successfully',
        `App running on ${workflow.simulator.name}`,
        `Next: ${nextSteps.join(' → ')}`,
        '',
        'Useful next commands:',
        `  • View logs: xcrun simctl spawn ${udid} log stream --level debug`,
        `  • Interact: simctl-tap, simctl-type-text, simctl-scroll, simctl-gesture`,
        `  • Debug: simctl-query-ui to find elements`,
        `  • Capture: simctl-io operation: "screenshot"`,
        `  • Permissions: simctl-privacy action: "grant" service: "camera"`,
      ],
    };
  } catch (error) {
    return {
      success: false,
      workflow: 'build-and-run',
      completed: {
        build: workflow.build?.success,
        simulator: !!workflow.simulator,
        install: workflow.install?.success,
        launch: workflow.launch?.success,
      },
      failedAt: Object.keys(workflow).find(
        (key) => !workflow[key as keyof typeof workflow]
      ) || 'unknown',
      error: String(error),
      lastSuccessfulStep: getLastSuccessfulStep(workflow),
      guidance: [
        `✗ Workflow failed`,
        `Error: ${error}`,
        '',
        'To debug:',
        workflow.build?.buildId
          ? `  • Check build: xcodebuild-get-details buildId: "${workflow.build.buildId}"`
          : '  • Build failed - check project configuration',
        workflow.simulator
          ? `  • Run simctl-health-check on ${workflow.simulator.udid}`
          : '  • Run simctl-list to check available simulators',
      ],
    };
  }
}

function getLastSuccessfulStep(workflow: any): string {
  if (workflow.build?.success) return 'build';
  if (workflow.simulator) return 'simulator-selection';
  if (workflow.install?.success) return 'install';
  if (workflow.launch?.success) return 'launch';
  if (workflow.screenshot?.success) return 'screenshot';
  return 'unknown';
}
```

### Tool Registration

Add to `src/index.ts`:

```typescript
{
  name: 'build-and-run',
  description: `🚀 **Complete iOS development workflow in one command!**

Builds your app, selects simulator, installs, and launches - all in one step.

One-command replacement for:
1. xcodebuild-build (project build)
2. simctl-suggest (simulator selection)
3. simctl-boot (prepare simulator)
4. simctl-install (install app)
5. simctl-launch (launch app)
6. simctl-io (optional screenshot)

Perfect for:
• Local development: Fast iteration cycle
• Testing: Build, test, repeat
• CI/CD: Automated app delivery to simulators
• AI workflows: Single MCP tool for complete workflow

Features:
• Auto-selects best simulator (considers deployment target)
• Automatic simulator boot if needed
• Progressive disclosure for large build logs
• Clear guidance for next steps
• Optional screenshot capture
• Detailed error reporting with remediation`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to .xcodeproj or .xcworkspace',
      },
      scheme: {
        type: 'string',
        description: 'Build scheme name (e.g., "MyApp")',
      },
      configuration: {
        type: 'string',
        description: 'Build configuration (default: "Debug")',
      },
      simulatorUdid: {
        type: 'string',
        description: 'Optional: Specific simulator UDID (else auto-select)',
      },
      launchArguments: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: Command-line arguments to pass to app',
      },
      environmentVariables: {
        type: 'object',
        description: 'Optional: Environment variables for app',
      },
      takeScreenshot: {
        type: 'boolean',
        description: 'Optional: Capture screenshot after launch',
      },
    },
    required: ['projectPath', 'scheme'],
  },
},
```

## Implementation Checklist

- [ ] Create `src/tools/workflows/build-and-run.ts`
- [ ] Implement step-by-step orchestration logic
- [ ] Add proper error handling with guidance
- [ ] Track which steps completed for partial recovery
- [ ] Integrate all 5 sub-tools properly
- [ ] Format response with detailed summary
- [ ] Add guidance for next steps (logging, UI testing, etc.)
- [ ] Register tool in main server
- [ ] Unit tests for workflow orchestration
- [ ] Integration tests with real project
- [ ] Test error handling (build fails, simulator not available, etc.)
- [ ] Update CLAUDE.md with workflow documentation
- [ ] Add examples to README

## Testing Requirements

### Unit Tests

- [ ] All steps executed in order
- [ ] Detects build failure and stops
- [ ] Detects simulator unavailable and stops
- [ ] Auto-boot works when needed
- [ ] Optional screenshot works
- [ ] Error handling with helpful guidance

### Integration Tests

- [ ] Works with real iOS project
- [ ] Builds, installs, and launches app correctly
- [ ] Auto-selects appropriate simulator
- [ ] Handles unbooted simulator
- [ ] Partial failure (build success, install fails) reports correctly

### Manual Testing

- [ ] `build-and-run projectPath: "..." scheme: "MyApp"`
- [ ] Verify app launches on simulator
- [ ] Try with optional screenshot
- [ ] Try with invalid project path (check error message)
- [ ] Try with non-existent scheme (check error message)

## Related Tickets

- **Depends on:**
  - PRIORITY-1-BUILD-SETTINGS-CACHE
  - PRIORITY-1-SMART-SIMULATOR-SELECTION
  - PRIORITY-1-AUTO-INSTALL-AFTER-BUILD
  - PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY
- **Works with:**
  - PRIORITY-1-PRE-OPERATION-VALIDATION
  - PRIORITY-2-TEST-PLAN-DISCOVERY

## Notes

### Workflow Steps

```
1. Build (compile app)
2. Select Simulator (auto or specified)
3. Boot Simulator (if needed)
4. Install App (to simulator)
5. Launch App (with optional args/env)
6. Screenshot (optional)
```

### Error Recovery

If any step fails, return partial results showing which steps completed. This helps users understand where the issue occurred and how to proceed manually if needed.

### Future Enhancements

- Add `autoTest` parameter to run test suite after launch
- Add `autoProfile` to start profiling on launch
- Support for multiple configurations in sequence
- Build variants (Debug/Release) selection
