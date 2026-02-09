import { validateProjectPath, validateScheme } from '../../utils/validation.js';
import { executeCommandStreaming, buildXcodebuildCommand } from '../../utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { responseCache, extractBuildSummary } from '../../utils/response-cache.js';
import { projectCache, type BuildConfig } from '../../state/project-cache.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { createConfigManager } from '../../utils/config.js';

interface BuildToolArgs {
  projectPath: string;
  scheme: string;
  configuration?: string;
  destination?: string;
  sdk?: string;
  derivedDataPath?: string;
  // Auto-install options
  autoInstall?: boolean;
  simulatorUdid?: string;
  bootSimulator?: boolean;
}

/**
 * Build Xcode projects with intelligent defaults and performance tracking
 *
 * **What it does:**
 * Builds Xcode projects and workspaces with advanced learning capabilities that remember
 * successful configurations and suggest optimal simulators per project. Uses progressive
 * disclosure to provide concise summaries by default, with full build logs available on demand.
 * Tracks build performance metrics (duration, errors, warnings) and learns from successful
 * builds to improve future build suggestions.
 *
 * **Why you'd use it:**
 * - Automatic smart defaults: remembers which simulator and config worked last time
 * - Progressive disclosure: concise summaries prevent token overflow, full logs on demand
 * - Performance tracking: measures build times and provides optimization insights
 * - Structured errors: clear error messages instead of raw CLI stderr
 *
 * **Parameters:**
 * - projectPath (string, required): Path to .xcodeproj or .xcworkspace file
 * - scheme (string, required): Build scheme name (use xcodebuild-list to discover)
 * - configuration (string, optional): Build configuration (Debug/Release, defaults to cached or "Debug")
 * - destination (string, optional): Build destination (e.g., "platform=iOS Simulator,id=<UDID>")
 * - sdk (string, optional): SDK to build against (e.g., "iphonesimulator", "iphoneos")
 * - derivedDataPath (string, optional): Custom derived data path for build artifacts
 *
 * **Returns:**
 * Structured JSON response with buildId (for progressive disclosure), success status, build
 * summary (errors, warnings, duration), and intelligence metadata showing which smart defaults
 * were applied. Use xcodebuild-get-details with buildId to retrieve full logs.
 *
 * **Example:**
 * ```typescript
 * // Minimal build with smart defaults
 * const result = await xcodebuildBuildTool({
 *   projectPath: "/path/to/MyApp.xcodeproj",
 *   scheme: "MyApp"
 * });
 *
 * // Explicit configuration
 * const release = await xcodebuildBuildTool({
 *   projectPath: "/path/to/MyApp.xcworkspace",
 *   scheme: "MyApp",
 *   configuration: "Release",
 *   destination: "platform=iOS Simulator,id=ABC-123"
 * });
 * ```
 *
 * **Full documentation:** See src/tools/xcodebuild/build.md for detailed parameters
 *
 * @param args Tool arguments containing projectPath, scheme, and optional build configuration
 * @returns Tool result with build summary and buildId for progressive disclosure
 */
export async function xcodebuildBuildTool(args: any) {
  const {
    projectPath,
    scheme,
    configuration = 'Debug',
    destination,
    sdk,
    derivedDataPath,
    autoInstall = false,
    simulatorUdid,
    bootSimulator = true,
  } = args as BuildToolArgs;

  try {
    // Validate inputs
    await validateProjectPath(projectPath);
    validateScheme(scheme);

    // Get smart defaults from cache
    const preferredConfig = await projectCache.getPreferredBuildConfig(projectPath);
    const smartDestination =
      destination || (await getSmartDestination(preferredConfig, projectPath));

    // Build final configuration
    const finalConfig: BuildConfig = {
      scheme,
      configuration: configuration || preferredConfig?.configuration || 'Debug',
      destination: smartDestination,
      sdk: sdk || preferredConfig?.sdk,
      derivedDataPath: derivedDataPath || preferredConfig?.derivedDataPath,
    };

    // Build command
    const command = buildXcodebuildCommand('build', projectPath, finalConfig as any);

    console.error(`[xcodebuild-build] Executing: ${command}`);

    // Execute command with early-fatal detection to avoid long retries on bad destinations
    const fatalPatterns = [
      /Failed to start remote service "com\.apple\.mobile\.notification_proxy"/i,
      /The device is passcode protected/i,
      /Unable to find a device matching the provided destination specifier/i,
    ];
    const timeoutMs = 55_000; // Stay under MCP transport limits
    const startTime = Date.now();
    const result = await executeCommandStreaming(command, {
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for build logs
      fatalPatterns,
      onFatalMatch: line => {
        console.error(`[xcodebuild-build] Detected fatal xcodebuild output: ${line}`);
      },
    });
    const duration = Date.now() - startTime;

    // Extract build summary
    const summary = extractBuildSummary(result.stdout, result.stderr, result.code);
    const buildSuccess = summary.success && !result.timedOut;
    const augmentedErrors = [...summary.errors];
    if (result.fatalMatch) {
      augmentedErrors.unshift(`Detected fatal xcodebuild output: ${result.fatalMatch}`);
    }
    if (result.timedOut) {
      augmentedErrors.unshift(`Build aborted after ${timeoutMs}ms (timeout)`);
    }
    const adjustedSummary = {
      ...summary,
      success: buildSuccess,
      firstError:
        summary.firstError ||
        result.fatalMatch ||
        (result.timedOut ? `Build timed out after ${timeoutMs}ms` : undefined),
    };

    // Record build result in project cache
    projectCache.recordBuildResult(projectPath, finalConfig, {
      timestamp: new Date(),
      success: buildSuccess,
      duration,
      errorCount: summary.errorCount,
      warningCount: summary.warningCount,
      buildSizeBytes: summary.buildSizeBytes,
    });

    // Record simulator usage if destination was used
    if (finalConfig.destination && finalConfig.destination.includes('Simulator')) {
      const udidMatch = finalConfig.destination.match(/id=([A-F0-9-]+)/);
      if (udidMatch) {
        simulatorCache.recordSimulatorUsage(udidMatch[1], projectPath);

        // Save simulator preference to project config if build succeeded
        if (buildSuccess) {
          try {
            const configManager = createConfigManager(projectPath);
            const simulator = await simulatorCache.findSimulatorByUdid(udidMatch[1]);
            await configManager.recordSuccessfulBuild(projectPath, udidMatch[1], simulator?.name);
          } catch (configError) {
            console.warn('Failed to save simulator preference:', configError);
            // Continue - config is optional
          }
        }
      }
    }

    // Store full output in cache
    const cacheId = responseCache.store({
      tool: 'xcodebuild-build',
      fullOutput: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      command,
      metadata: {
        projectPath,
        scheme: finalConfig.scheme,
        configuration: finalConfig.configuration,
        destination: finalConfig.destination,
        sdk: finalConfig.sdk,
        duration,
        success: buildSuccess,
        errorCount: summary.errorCount,
        warningCount: summary.warningCount,
        smartDestinationUsed: !destination && smartDestination !== destination,
        smartConfigurationUsed: !args.configuration && finalConfig.configuration !== 'Debug',
        timedOut: result.timedOut,
        fatalMatch: result.fatalMatch,
      },
    });

    // Create concise response with smart defaults transparency
    const usedSmartDestination = !destination && smartDestination;
    const usedSmartConfiguration = !configuration && finalConfig.configuration !== 'Debug';
    const hasPreferredConfig = !!preferredConfig;

    // Handle auto-install if enabled and build succeeded
    let autoInstallResult = undefined;
    if (autoInstall && buildSuccess) {
      try {
        console.error('[xcodebuild-build] Starting auto-install...');
        autoInstallResult = await performAutoInstall({
          projectPath,
          scheme,
          configuration: finalConfig.configuration,
          simulatorUdid,
          bootSimulator,
        });
      } catch (installError) {
        console.error('[xcodebuild-build] Auto-install failed:', installError);
        autoInstallResult = {
          success: false,
          error: installError instanceof Error ? installError.message : String(installError),
        };
      }
    }

    // Destructure errors/warnings from summary for top-level placement
    const { errors: _ignoredErrors, warnings, ...summaryRest } = adjustedSummary;

    const responseData = {
      buildId: cacheId,
      success: buildSuccess,
      // Errors and warnings at top level for immediate visibility
      errors: augmentedErrors.length > 0 ? augmentedErrors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      summary: {
        ...summaryRest,
        scheme: finalConfig.scheme,
        configuration: finalConfig.configuration,
        destination: finalConfig.destination,
        duration,
      },
      autoInstall: autoInstallResult,
      intelligence: {
        usedSmartDestination,
        usedSmartConfiguration,
        hasPreferredConfig,
        simulatorUsageRecorded: !!(
          finalConfig.destination && finalConfig.destination.includes('Simulator')
        ),
        configurationLearned: buildSuccess, // Successful builds get remembered
        autoInstallAttempted: autoInstall && buildSuccess,
      },
      guidance: buildSuccess
        ? [
            `Build completed successfully in ${duration}ms`,
            ...(summary.warningCount > 0 ? [`⚠️ ${summary.warningCount} warning(s) detected`] : []),
            ...(usedSmartDestination ? [`Used smart simulator: ${finalConfig.destination}`] : []),
            ...(hasPreferredConfig ? [`Applied cached project preferences`] : []),
            `Use 'xcodebuild-get-details' with buildId '${cacheId}' for full logs`,
            `Successful configuration cached for future builds`,
            ...(autoInstall
              ? [
                  autoInstallResult?.success
                    ? `✅ Auto-install succeeded. App ready to launch with: simctl-launch udid="${autoInstallResult.udid}" bundleId="${autoInstallResult.bundleId}"`
                    : `❌ Auto-install failed: ${autoInstallResult?.error}. Try manual install with simctl-install.`,
                ]
              : []),
          ]
        : [
            `Build failed with ${summary.errorCount} errors, ${summary.warningCount} warnings`,
            `First error: ${adjustedSummary.firstError || 'Unknown error'}`,
            `Use 'xcodebuild-get-details' with buildId '${cacheId}' for full logs and errors`,
            ...(usedSmartDestination ? [`Try simctl-list to see other available simulators`] : []),
            ...(result.timedOut ? [`Build aborted after ${timeoutMs}ms (timeout)`] : []),
            ...(result.fatalMatch ? [`Detected fatal log output: ${result.fatalMatch}`] : []),
          ],
      cacheDetails: {
        note: 'Use xcodebuild-get-details with buildId for full logs',
        availableTypes: ['full-log', 'errors-only', 'warnings-only', 'summary', 'command'],
      },
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: !summary.success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `xcodebuild-build failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function getSmartDestination(
  preferredConfig: BuildConfig | null,
  projectPath: string
): Promise<string | undefined> {
  // If preferred config has a destination, use it
  if (preferredConfig?.destination) {
    return preferredConfig.destination;
  }

  // Try to get a smart simulator destination with project-specific preference
  try {
    const preferredSim = await simulatorCache.getPreferredSimulator(projectPath);
    if (preferredSim) {
      return `platform=iOS Simulator,id=${preferredSim.udid}`;
    }
  } catch {
    // Fallback to no destination if simulator cache fails
  }

  // Return undefined to let xcodebuild use its own defaults
  return undefined;
}

interface AutoInstallArgs {
  projectPath: string;
  scheme: string;
  configuration: string;
  simulatorUdid?: string;
  bootSimulator: boolean;
}

async function performAutoInstall(args: AutoInstallArgs): Promise<any> {
  const { projectPath, scheme, configuration, simulatorUdid, bootSimulator } = args;

  // Dynamic imports to avoid circular dependencies
  const { findBuildArtifacts } = await import('../../utils/build-artifacts.js');
  const { simctlBootTool } = await import('../simctl/boot.js');
  const { simctlInstallTool } = await import('../simctl/install.js');

  // Step 1: Find build artifacts
  console.error('[auto-install] Finding build artifacts...');
  const artifacts = await findBuildArtifacts(projectPath, scheme, configuration);

  if (!artifacts.appPath) {
    throw new Error(`Could not find .app bundle for scheme "${scheme}"`);
  }

  // Step 2: Determine simulator to install to
  let targetUdid = simulatorUdid;
  let targetName = '';

  if (!targetUdid) {
    // Try to suggest best simulator
    const suggestion = await simulatorCache.getBestSimulator(projectPath);
    if (suggestion) {
      targetUdid = suggestion.simulator.udid;
      targetName = suggestion.simulator.name;
      console.error(`[auto-install] Auto-selected simulator: ${targetName}`);
    } else {
      throw new Error('No suitable simulator found. Create a simulator or specify simulatorUdid.');
    }
  } else {
    // Get name of specified simulator
    const sim = await simulatorCache.findSimulatorByUdid(targetUdid);
    targetName = sim?.name || targetUdid;
  }

  // Step 3: Boot simulator if needed
  if (bootSimulator) {
    console.error(`[auto-install] Booting simulator: ${targetName}`);
    try {
      await simctlBootTool({ udid: targetUdid });
    } catch (bootError) {
      // Don't fail completely if boot fails, simulator might already be booted
      console.warn('[auto-install] Boot failed (may already be booted):', bootError);
    }
  }

  // Step 4: Install app
  console.error(`[auto-install] Installing app to ${targetName}...`);
  const installResult = await simctlInstallTool({
    udid: targetUdid,
    appPath: artifacts.appPath,
  });

  if (!installResult.isError && installResult.content?.[0]?.text) {
    const installText = installResult.content[0].text;
    const parsedInstall = typeof installText === 'string' ? JSON.parse(installText) : installText;

    return {
      success: true,
      udid: targetUdid,
      simulatorName: targetName,
      appPath: artifacts.appPath,
      bundleId: artifacts.bundleIdentifier || parsedInstall.bundleId,
      duration: Date.now(),
    };
  }

  throw new Error(`Installation failed: ${installResult.content?.[0]?.text || 'Unknown error'}`);
}

export const XCODEBUILD_BUILD_DOCS = `
# xcodebuild-build

⚡ **Build Xcode projects** with intelligent defaults and performance tracking

## What it does

Builds Xcode projects and workspaces with advanced learning capabilities that remember successful configurations and suggest optimal simulators per project. Uses progressive disclosure to provide concise summaries by default, with full build logs available on demand. Tracks build performance metrics (duration, errors, warnings) and learns from successful builds to improve future build suggestions.

## Why you'd use it

- Automatic smart defaults: remembers which simulator and config worked last time
- Progressive disclosure: concise summaries prevent token overflow, full logs on demand
- Performance tracking: measures build times and provides optimization insights
- Structured errors: clear error messages instead of raw CLI stderr

## Parameters

### Required
- **projectPath** (string): Path to .xcodeproj or .xcworkspace file
- **scheme** (string): Build scheme name (use xcodebuild-list to discover)

### Optional
- **configuration** (string, default: 'Debug'): Build configuration (Debug/Release, defaults to cached or "Debug")
- **destination** (string): Build destination (e.g., "platform=iOS Simulator,id=<UDID>")
- **sdk** (string): SDK to build against (e.g., "iphonesimulator", "iphoneos")
- **derivedDataPath** (string): Custom derived data path for build artifacts

## Returns

Structured JSON response with buildId (for progressive disclosure), success status, build summary (errors, warnings, duration), and intelligence metadata showing which smart defaults were applied. Use xcodebuild-get-details with buildId to retrieve full logs.

## Examples

### Minimal build with smart defaults
\`\`\`typescript
const result = await xcodebuildBuildTool({
  projectPath: "/path/to/MyApp.xcodeproj",
  scheme: "MyApp"
});
\`\`\`

### Explicit configuration
\`\`\`typescript
const release = await xcodebuildBuildTool({
  projectPath: "/path/to/MyApp.xcworkspace",
  scheme: "MyApp",
  configuration: "Release",
  destination: "platform=iOS Simulator,id=ABC-123"
});
\`\`\`

## Related Tools

- xcodebuild-test: Run tests after building
- xcodebuild-clean: Clean build artifacts
- xcodebuild-get-details: Get full build logs (use with buildId)
`;

export const XCODEBUILD_BUILD_DOCS_MINI =
  'Build Xcode projects with smart defaults. Use rtfm({ toolName: "xcodebuild-build" }) for docs.';
