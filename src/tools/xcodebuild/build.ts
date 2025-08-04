import { validateProjectPath, validateScheme } from '../../utils/validation.js';
import { executeCommand, buildXcodebuildCommand } from '../../utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { responseCache, extractBuildSummary } from '../../utils/response-cache.js';
import { projectCache, type BuildConfig } from '../../state/project-cache.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface BuildToolArgs {
  projectPath: string;
  scheme: string;
  configuration?: string;
  destination?: string;
  sdk?: string;
  derivedDataPath?: string;
}

export async function xcodebuildBuildTool(args: any) {
  const {
    projectPath,
    scheme,
    configuration = 'Debug',
    destination,
    sdk,
    derivedDataPath,
  } = args as BuildToolArgs;

  try {
    // Validate inputs
    await validateProjectPath(projectPath);
    validateScheme(scheme);

    // Get smart defaults from cache
    const preferredConfig = await projectCache.getPreferredBuildConfig(projectPath);
    const smartDestination = destination || (await getSmartDestination(preferredConfig, projectPath));

    // Build final configuration
    const finalConfig = {
      scheme: scheme || preferredConfig?.scheme || scheme,
      configuration: configuration || preferredConfig?.configuration || 'Debug',
      destination: smartDestination,
      sdk: sdk || preferredConfig?.sdk,
      derivedDataPath: derivedDataPath || preferredConfig?.derivedDataPath,
    };

    // Build command
    const command = buildXcodebuildCommand('build', projectPath, finalConfig);

    console.error(`[xcodebuild-build] Executing: ${command}`);

    // Execute command with extended timeout for builds
    const startTime = Date.now();
    const result = await executeCommand(command, {
      timeout: 600000, // 10 minutes for builds
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for build logs
    });
    const duration = Date.now() - startTime;

    // Extract build summary
    const summary = extractBuildSummary(result.stdout, result.stderr, result.code);

    // Record build result in project cache
    projectCache.recordBuildResult(projectPath, finalConfig, {
      timestamp: new Date(),
      success: summary.success,
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
        success: summary.success,
        errorCount: summary.errorCount,
        warningCount: summary.warningCount,
        smartDestinationUsed: !destination && smartDestination !== destination,
        smartConfigurationUsed: !args.configuration && finalConfig.configuration !== 'Debug',
      },
    });

    // Create concise response with smart defaults transparency
    const usedSmartDestination = !destination && smartDestination;
    const usedSmartConfiguration = !configuration && finalConfig.configuration !== 'Debug';
    const hasPreferredConfig = !!preferredConfig;

    const responseData = {
      buildId: cacheId,
      success: summary.success,
      summary: {
        ...summary,
        scheme: finalConfig.scheme,
        configuration: finalConfig.configuration,
        destination: finalConfig.destination,
        duration,
      },
      intelligence: {
        usedSmartDestination,
        usedSmartConfiguration,
        hasPreferredConfig,
        simulatorUsageRecorded: !!(finalConfig.destination && finalConfig.destination.includes('Simulator')),
        configurationLearned: summary.success, // Successful builds get remembered
      },
      nextSteps: summary.success
        ? [
            `✅ Build completed successfully in ${duration}ms`,
            ...(usedSmartDestination ? [`🧠 Used smart simulator: ${finalConfig.destination}`] : []),
            ...(hasPreferredConfig ? [`📊 Applied cached project preferences`] : []),
            `Use 'xcodebuild-get-details' with buildId '${cacheId}' for full logs`,
            `Tip: This successful configuration is now cached for future builds`,
          ]
        : [
            `❌ Build failed with ${summary.errorCount} errors, ${summary.warningCount} warnings`,
            `First error: ${summary.firstError || 'Unknown error'}`,
            `Use 'xcodebuild-get-details' with buildId '${cacheId}' for full logs and errors`,
            ...(usedSmartDestination ? [`💡 Try 'simctl-list' to see other available simulators`] : []),
          ],
      availableDetails: ['full-log', 'errors-only', 'warnings-only', 'summary', 'command'],
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
