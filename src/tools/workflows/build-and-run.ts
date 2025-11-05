import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Build and Run Workflow Orchestration
 *
 * Combines build, simulator selection, installation, and launch into a single orchestrated workflow.
 * Handles the entire app development cycle: build project → boot simulator → install app → launch app.
 *
 * Full documentation: See src/tools/workflows/build-and-run.md
 *
 * @param args Workflow arguments
 * @returns Complete workflow result with all steps
 */
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

  if (!projectPath || !scheme) {
    throw new McpError(ErrorCode.InvalidRequest, 'projectPath and scheme are required');
  }

  const workflow: any = {
    steps: [],
    success: false,
    totalDuration: 0,
    errors: [],
  };

  const startTime = Date.now();

  try {
    // Dynamic imports to avoid circular dependencies
    const { xcodebuildBuildTool } = await import('../xcodebuild/build.js');
    const { simctlBootTool } = await import('../simctl/boot.js');
    const { simctlSuggestTool } = await import('../simctl/suggest.js');
    const { simctlInstallTool } = await import('../simctl/install.js');
    const { simctlLaunchTool } = await import('../simctl/launch.js');
    const { simctlIoTool } = await import('../simctl/io.js');

    // ===== STEP 1: Build =====
    console.error('[build-and-run] Step 1/5: Building project...');
    try {
      const buildResult = await xcodebuildBuildTool({
        projectPath,
        scheme,
        configuration,
        autoInstall: false, // We'll handle install manually in workflow
      });

      const buildText = buildResult.content?.[0]?.text || JSON.stringify(buildResult);
      const buildData = typeof buildText === 'string' ? JSON.parse(buildText) : buildText;

      workflow.steps.push({
        name: 'build',
        success: buildData.success !== false,
        result: buildData,
        duration: buildData.summary?.duration || 0,
      });

      if (!buildData.success) {
        throw new Error(`Build failed: ${buildData.summary?.firstError || 'Unknown error'}`);
      }

      console.error('[build-and-run] ✅ Build succeeded');
    } catch (buildError) {
      workflow.errors.push(`Build failed: ${buildError}`);
      throw buildError;
    }

    // ===== STEP 2: Suggest Simulator =====
    console.error('[build-and-run] Step 2/5: Selecting simulator...');
    let targetUdid = simulatorUdid;
    let targetName = '';

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
            name: 'suggest',
            success: true,
            result: suggestData,
          });

          console.error(`[build-and-run] ✅ Selected simulator: ${targetName}`);
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
        name: 'suggest',
        success: true,
        result: { simulatorUdid, specified: true },
      });
    }

    // ===== STEP 3: Boot Simulator =====
    console.error(`[build-and-run] Step 3/5: Booting ${targetName}...`);
    try {
      const bootResult = await simctlBootTool({
        udid: targetUdid,
        waitForBoot: true,
      });

      const bootText = bootResult.content?.[0]?.text || JSON.stringify(bootResult);
      const bootData = typeof bootText === 'string' ? JSON.parse(bootText) : bootText;

      workflow.steps.push({
        name: 'boot',
        success: bootData.success !== false,
        result: bootData,
      });

      console.error('[build-and-run] ✅ Simulator booted');
    } catch (bootError) {
      workflow.errors.push(`Boot failed: ${bootError}`);
      // Don't fail completely, simulator might already be booted
      console.warn('[build-and-run] ⚠️  Boot failed (may already be booted)');
    }

    // ===== STEP 4: Install App =====
    console.error('[build-and-run] Step 4/5: Installing app...');
    let bundleId = '';

    try {
      // Find build artifacts
      const { findBuildArtifacts } = await import('../../utils/build-artifacts.js');
      const artifacts = await findBuildArtifacts(projectPath, scheme, configuration);

      if (!artifacts.appPath) {
        throw new Error('Could not find .app bundle after build');
      }

      const installResult = await simctlInstallTool({
        udid: targetUdid,
        appPath: artifacts.appPath,
      });

      const installText = installResult.content?.[0]?.text || JSON.stringify(installResult);
      const installData = typeof installText === 'string' ? JSON.parse(installText) : installText;

      workflow.steps.push({
        name: 'install',
        success: installData.success !== false,
        result: installData,
      });

      bundleId = installData.bundleId || artifacts.bundleIdentifier || '';

      if (!bundleId) {
        throw new Error('Could not determine bundle ID');
      }

      console.error('[build-and-run] ✅ App installed');
    } catch (installError) {
      workflow.errors.push(`Install failed: ${installError}`);
      throw installError;
    }

    // ===== STEP 5: Launch App =====
    console.error('[build-and-run] Step 5/5: Launching app...');
    try {
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
        result: launchData,
      });

      console.error('[build-and-run] ✅ App launched');
    } catch (launchError) {
      workflow.errors.push(`Launch failed: ${launchError}`);
      throw launchError;
    }

    // ===== OPTIONAL: Take Screenshot =====
    if (takeScreenshot) {
      console.error('[build-and-run] Taking initial screenshot...');
      try {
        const screenshotResult = await simctlIoTool({
          udid: targetUdid,
          operation: 'screenshot',
          appName: scheme,
          screenName: 'Launch',
          state: 'Initial',
        });

        const screenshotText =
          screenshotResult.content?.[0]?.text || JSON.stringify(screenshotResult);
        const screenshotData =
          typeof screenshotText === 'string' ? JSON.parse(screenshotText) : screenshotText;

        workflow.steps.push({
          name: 'screenshot',
          success: screenshotData.success !== false,
          result: screenshotData,
        });

        console.error('[build-and-run] ✅ Screenshot captured');
      } catch (screenshotError) {
        console.warn('[build-and-run] Screenshot failed:', screenshotError);
        // Don't fail workflow for screenshot
      }
    }

    workflow.success = true;
    workflow.totalDuration = Date.now() - startTime;

    const responseData = {
      success: true,
      workflow,
      summary: {
        scheme,
        configuration,
        simulator: { udid: targetUdid, name: targetName },
        bundleId,
        totalDuration: workflow.totalDuration,
        stepsCompleted: workflow.steps.length,
      },
      guidance: [
        `✅ Build-and-run workflow completed successfully in ${workflow.totalDuration}ms`,
        `App is now running on ${targetName}`,
        `Bundle ID: ${bundleId}`,
        'You can now interact with the app using other tools:',
        `  - simctl-tap for tapping UI elements`,
        `  - simctl-type for text input`,
        `  - simctl-scroll for scrolling`,
        `  - simctl-io for screenshots/videos`,
      ],
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [{ type: 'text' as const, text: responseText }],
      isError: false,
    };
  } catch (error) {
    workflow.success = false;
    workflow.totalDuration = Date.now() - startTime;

    const errorMessage = error instanceof Error ? error.message : String(error);

    const responseData = {
      success: false,
      workflow,
      error: errorMessage,
      guidance: [
        `❌ Workflow failed: ${errorMessage}`,
        'Steps completed:',
        ...workflow.steps.map((step: any) => `  ${step.success ? '✅' : '❌'} ${step.name}`),
        '',
        'To debug:',
        '1. Check build errors: xcodebuild-build projectPath: "..." scheme: "..."',
        '2. Check available simulators: simctl-list',
        '3. Check simulator health: simctl-health-check',
      ],
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [{ type: 'text' as const, text: responseText }],
      isError: true,
    };
  }
}
