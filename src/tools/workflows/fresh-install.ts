import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Workflow: Fresh Install - Clean slate app installation
 *
 * Orchestrates a complete clean installation cycle:
 * 1. simctl-device shutdown → Ensure simulator is stopped
 * 2. (optional) simctl-device erase → Wipe simulator data
 * 3. simctl-device boot → Start fresh simulator
 * 4. xcodebuild-build → Build the project
 * 5. simctl-app install → Install the app
 * 6. simctl-app launch → Start the app
 *
 * This workflow keeps intermediate results internal, returning only the final outcome.
 * Reduces agent context usage by ~70% compared to calling each tool manually.
 *
 * Part of the Programmatic Tool Calling pattern from Anthropic:
 * https://www.anthropic.com/engineering/advanced-tool-use
 */

export interface FreshInstallArgs {
  projectPath: string; // Path to .xcodeproj or .xcworkspace
  scheme: string; // Build scheme name
  simulatorUdid?: string; // Target simulator (auto-detected if omitted)
  eraseSimulator?: boolean; // Wipe simulator before install (default: false)
  configuration?: 'Debug' | 'Release'; // Build configuration (default: Debug)
  launchArguments?: string[]; // App launch arguments
  environmentVariables?: Record<string, string>; // App environment variables
}

interface WorkflowStep {
  name: string;
  success: boolean;
  result?: any;
  duration?: number;
  skipped?: boolean;
  skipReason?: string;
}

export async function workflowFreshInstallTool(args: FreshInstallArgs) {
  const {
    projectPath,
    scheme,
    simulatorUdid,
    eraseSimulator = false,
    configuration = 'Debug',
    launchArguments,
    environmentVariables,
  } = args;

  if (!projectPath || !scheme) {
    throw new McpError(ErrorCode.InvalidRequest, 'projectPath and scheme are required');
  }

  const workflow: {
    steps: WorkflowStep[];
    success: boolean;
    totalDuration: number;
    errors: string[];
  } = {
    steps: [],
    success: false,
    totalDuration: 0,
    errors: [],
  };

  const startTime = Date.now();

  let targetUdid = simulatorUdid;
  let targetName = 'Unknown';
  let bundleId = '';

  try {
    // Dynamic imports to avoid circular dependencies
    const { simctlDeviceTool } = await import('../simctl/device/index.js');
    const { simctlSuggestTool } = await import('../simctl/suggest.js');
    const { xcodebuildBuildTool } = await import('../xcodebuild/build.js');
    const { simctlInstallTool } = await import('../simctl/install.js');
    const { simctlLaunchTool } = await import('../simctl/launch.js');

    // ===== STEP 1: Select Simulator =====
    console.error(`[workflow-fresh-install] Step 1/6: Selecting simulator...`);

    if (!targetUdid) {
      try {
        const suggestResult = await simctlSuggestTool({
          projectPath,
          maxSuggestions: 1,
          autoBootTopSuggestion: false,
        });

        const suggestText = suggestResult.content?.[0]?.text || JSON.stringify(suggestResult);
        const suggestData = typeof suggestText === 'string' ? JSON.parse(suggestText) : suggestText;

        if (suggestData.suggestions && suggestData.suggestions.length > 0) {
          targetUdid = suggestData.suggestions[0].simulator.udid;
          targetName = suggestData.suggestions[0].simulator.name;

          workflow.steps.push({
            name: 'select-simulator',
            success: true,
            result: { udid: targetUdid, name: targetName, source: 'auto-suggested' },
          });

          console.error(`[workflow-fresh-install] ✅ Selected: ${targetName}`);
        } else {
          throw new Error('No suitable simulator found');
        }
      } catch (suggestError) {
        workflow.errors.push(`Simulator selection failed: ${suggestError}`);
        throw suggestError;
      }
    } else {
      targetName = `${simulatorUdid} (specified)`;
      workflow.steps.push({
        name: 'select-simulator',
        success: true,
        result: { udid: targetUdid, name: targetName, source: 'user-specified' },
      });
    }

    // ===== STEP 2: Shutdown Simulator =====
    console.error(`[workflow-fresh-install] Step 2/6: Shutting down ${targetName}...`);

    try {
      const shutdownResult = await simctlDeviceTool({
        operation: 'shutdown',
        deviceId: targetUdid,
      });

      const shutdownText = shutdownResult.content?.[0]?.text || JSON.stringify(shutdownResult);
      const shutdownData =
        typeof shutdownText === 'string' ? JSON.parse(shutdownText) : shutdownText;

      workflow.steps.push({
        name: 'shutdown',
        success: true,
        result: { wasRunning: !shutdownData.alreadyShutdown },
      });

      console.error(`[workflow-fresh-install] ✅ Simulator shut down`);
    } catch (shutdownError) {
      // Non-fatal - simulator may already be shutdown
      console.error(`[workflow-fresh-install] ⚠️ Shutdown failed (may already be off)`);
      workflow.steps.push({
        name: 'shutdown',
        success: true, // Treat as success - we just need it to be shut down
        result: { note: 'Already shutdown or failed', error: String(shutdownError) },
      });
    }

    // ===== STEP 3: Erase Simulator (Optional) =====
    if (eraseSimulator) {
      console.error(`[workflow-fresh-install] Step 3/6: Erasing simulator data...`);

      try {
        const eraseResult = await simctlDeviceTool({
          operation: 'erase',
          deviceId: targetUdid,
        });

        const eraseText = eraseResult.content?.[0]?.text || JSON.stringify(eraseResult);
        const eraseData = typeof eraseText === 'string' ? JSON.parse(eraseText) : eraseText;

        workflow.steps.push({
          name: 'erase',
          success: eraseData.success !== false,
          result: { erased: true },
        });

        console.error(`[workflow-fresh-install] ✅ Simulator erased`);
      } catch (eraseError) {
        workflow.errors.push(`Erase failed: ${eraseError}`);
        throw eraseError;
      }
    } else {
      workflow.steps.push({
        name: 'erase',
        success: true,
        skipped: true,
        skipReason: 'eraseSimulator not requested',
      });
    }

    // ===== STEP 4: Boot Simulator =====
    console.error(`[workflow-fresh-install] Step 4/6: Booting ${targetName}...`);

    try {
      const bootResult = await simctlDeviceTool({
        operation: 'boot',
        deviceId: targetUdid,
        waitForBoot: true,
        openGui: true,
      });

      const bootText = bootResult.content?.[0]?.text || JSON.stringify(bootResult);
      const bootData = typeof bootText === 'string' ? JSON.parse(bootText) : bootText;

      workflow.steps.push({
        name: 'boot',
        success: bootData.success !== false,
        result: {
          bootTime: bootData.bootTime,
          state: bootData.state || 'Booted',
        },
      });

      console.error(`[workflow-fresh-install] ✅ Simulator booted`);
    } catch (bootError) {
      workflow.errors.push(`Boot failed: ${bootError}`);
      throw bootError;
    }

    // ===== STEP 5: Build Project =====
    console.error(`[workflow-fresh-install] Step 5/6: Building ${scheme}...`);

    let appPath = '';

    try {
      const buildResult = await xcodebuildBuildTool({
        projectPath,
        scheme,
        configuration,
        destination: `platform=iOS Simulator,id=${targetUdid}`,
        autoInstall: false, // We handle install manually
      });

      const buildText = buildResult.content?.[0]?.text || JSON.stringify(buildResult);
      const buildData = typeof buildText === 'string' ? JSON.parse(buildText) : buildText;

      if (!buildData.success) {
        throw new Error(buildData.summary?.firstError || 'Build failed');
      }

      // Get app path from build artifacts
      const { findBuildArtifacts } = await import('../../utils/build-artifacts.js');
      const artifacts = await findBuildArtifacts(projectPath, scheme, configuration);

      if (!artifacts.appPath) {
        throw new Error('Could not find .app bundle after build');
      }

      appPath = artifacts.appPath;
      bundleId = artifacts.bundleIdentifier || '';

      workflow.steps.push({
        name: 'build',
        success: true,
        result: {
          duration: buildData.summary?.duration,
          appPath: appPath,
          bundleId: bundleId || 'unknown',
        },
      });

      console.error(`[workflow-fresh-install] ✅ Build succeeded`);
    } catch (buildError) {
      workflow.errors.push(`Build failed: ${buildError}`);
      throw buildError;
    }

    // ===== STEP 6: Install App =====
    console.error(`[workflow-fresh-install] Step 6/6: Installing app...`);

    try {
      const installResult = await simctlInstallTool({
        udid: targetUdid,
        appPath: appPath,
      });

      const installText = installResult.content?.[0]?.text || JSON.stringify(installResult);
      const installData = typeof installText === 'string' ? JSON.parse(installText) : installText;

      // Update bundle ID from install result if available
      if (installData.bundleId) {
        bundleId = installData.bundleId;
      }

      workflow.steps.push({
        name: 'install',
        success: installData.success !== false,
        result: {
          bundleId: bundleId,
          appPath: appPath,
        },
      });

      console.error(`[workflow-fresh-install] ✅ App installed`);
    } catch (installError) {
      workflow.errors.push(`Install failed: ${installError}`);
      throw installError;
    }

    // ===== STEP 7: Launch App =====
    console.error(`[workflow-fresh-install] Launching app...`);

    try {
      if (!bundleId) {
        throw new Error('Could not determine bundle ID - cannot launch');
      }

      const launchResult = await simctlLaunchTool({
        udid: targetUdid,
        bundleId,
        arguments: launchArguments,
        environment: environmentVariables,
      });

      const launchText = launchResult.content?.[0]?.text || JSON.stringify(launchResult);
      const launchData = typeof launchText === 'string' ? JSON.parse(launchText) : launchText;

      workflow.steps.push({
        name: 'launch',
        success: launchData.success !== false,
        result: {
          bundleId: bundleId,
          pid: launchData.pid,
        },
      });

      console.error(`[workflow-fresh-install] ✅ App launched`);
    } catch (launchError) {
      workflow.errors.push(`Launch failed: ${launchError}`);
      throw launchError;
    }

    // ===== SUCCESS =====
    workflow.success = true;
    workflow.totalDuration = Date.now() - startTime;

    const responseData = {
      success: true,
      project: {
        path: projectPath,
        scheme,
        configuration,
      },
      simulator: {
        udid: targetUdid,
        name: targetName,
        erased: eraseSimulator,
      },
      app: {
        bundleId,
        appPath,
        launched: true,
      },
      totalDuration: workflow.totalDuration,
      stepsCompleted: workflow.steps.filter(s => s.success && !s.skipped).length,
      guidance: [
        `✅ Fresh install completed successfully in ${workflow.totalDuration}ms`,
        ``,
        `App is now running on ${targetName}`,
        `Bundle ID: ${bundleId}`,
        eraseSimulator ? `Simulator was erased before install` : undefined,
        ``,
        `Next steps:`,
        `• Interact with UI: workflow-tap-element --elementQuery "button name"`,
        `• Take screenshot: screenshot`,
        `• Check accessibility: idb-ui-describe --operation all`,
        `• Find elements: idb-ui-find-element --query "search term"`,
      ].filter(Boolean),
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
      isError: false,
    };
  } catch (error) {
    workflow.success = false;
    workflow.totalDuration = Date.now() - startTime;

    const errorMessage = error instanceof Error ? error.message : String(error);

    const responseData = {
      success: false,
      project: {
        path: projectPath,
        scheme,
        configuration,
      },
      simulator: targetUdid
        ? {
            udid: targetUdid,
            name: targetName,
          }
        : undefined,
      workflow,
      error: errorMessage,
      guidance: [
        `❌ Fresh install failed: ${errorMessage}`,
        ``,
        `Steps completed:`,
        ...workflow.steps.map(
          step => `  ${step.success ? '✅' : step.skipped ? '⏭️' : '❌'} ${step.name}`
        ),
        ``,
        `To debug:`,
        `• Check build errors: xcodebuild-build --projectPath "${projectPath}" --scheme "${scheme}"`,
        `• Check available simulators: simctl-list`,
        `• Check simulator health: simctl-health-check`,
        targetUdid
          ? `• Check simulator state: simctl-device --operation boot --deviceId ${targetUdid}`
          : undefined,
      ].filter(Boolean),
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
      isError: true,
    };
  }
}

/**
 * Workflow Fresh Install documentation for RTFM
 */
export const WORKFLOW_FRESH_INSTALL_DOCS = `
# workflow-fresh-install

Clean slate app installation - build, install, and launch with fresh simulator state.

## Overview

Orchestrates a complete clean installation cycle in a single call:
1. **Select Simulator** - Auto-detect or use specified device
2. **Shutdown** - Ensure simulator is stopped
3. **Erase** (optional) - Wipe all simulator data
4. **Boot** - Start fresh simulator
5. **Build** - Compile the Xcode project
6. **Install** - Install the built app
7. **Launch** - Start the app

This workflow keeps intermediate results internal, reducing agent context usage by ~70% compared to calling each tool manually.

## Parameters

### Required
- **projectPath** (string): Path to .xcodeproj or .xcworkspace
- **scheme** (string): Build scheme name

### Optional
- **simulatorUdid** (string): Target simulator - auto-detected if omitted
- **eraseSimulator** (boolean): Wipe simulator data before install (default: false)
- **configuration** ("Debug" | "Release"): Build configuration (default: Debug)
- **launchArguments** (string[]): App launch arguments
- **environmentVariables** (Record<string, string>): App environment variables

## Returns

Consolidated result with:
- **success**: Overall workflow success
- **project**: Build configuration details
- **simulator**: Target simulator info
- **app**: Installed app details (bundleId, path, launched)
- **totalDuration**: Total workflow time
- **guidance**: Next steps

## Examples

### Basic Fresh Install
\`\`\`json
{
  "projectPath": "/path/to/MyApp.xcodeproj",
  "scheme": "MyApp"
}
\`\`\`
Auto-selects simulator, builds, installs, and launches.

### Clean Install with Erased Simulator
\`\`\`json
{
  "projectPath": "/path/to/MyApp.xcworkspace",
  "scheme": "MyApp",
  "eraseSimulator": true,
  "configuration": "Debug"
}
\`\`\`
Erases all simulator data for truly fresh state.

### Specific Simulator with Launch Arguments
\`\`\`json
{
  "projectPath": "/path/to/MyApp.xcodeproj",
  "scheme": "MyApp",
  "simulatorUdid": "ABC123-DEF456",
  "launchArguments": ["-UITesting", "-ResetState"],
  "environmentVariables": {"DEBUG_MODE": "1"}
}
\`\`\`
Targets specific simulator with custom launch configuration.

## Why Use This Workflow?

### Token Efficiency
- **Manual approach**: 6-7 tool calls × ~100 tokens each = ~600+ tokens in responses
- **Workflow approach**: 1 call with consolidated response = ~150 tokens

### Reduced Context Pollution
- Build logs not exposed (only success/failure)
- Intermediate states summarized
- Only actionable outcome returned

### Consistent State
- Shutdown ensures clean starting point
- Optional erase for truly fresh state
- Proper boot sequencing

## Related Tools

- **workflow-tap-element**: UI interaction after install
- **xcodebuild-build**: Direct build (used internally)
- **simctl-device**: Direct simulator control (used internally)
- **simctl-app**: Direct app management (used internally)

## Notes

- Shutdown failures are non-fatal (simulator may already be off)
- Auto-suggests best simulator based on project requirements
- Build artifacts are located automatically
- Bundle ID is discovered from build settings
`;

export const WORKFLOW_FRESH_INSTALL_DOCS_MINI =
  'Build, install and launch app on fresh simulator. Use rtfm({ toolName: "workflow-fresh-install" }) for docs.';
