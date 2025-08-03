import { validateProjectPath, validateScheme } from '../../utils/validation.js';
import { executeCommand, buildXcodebuildCommand } from '../../utils/command.js';
import type { XcodeBuildResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { responseCache, extractBuildSummary } from '../../utils/response-cache.js';
import { projectCache } from '../../state/project-cache.js';
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
    derivedDataPath
  } = args as BuildToolArgs;

  try {
    // Validate inputs
    await validateProjectPath(projectPath);
    validateScheme(scheme);

    // Get smart defaults from cache
    const preferredConfig = await projectCache.getPreferredBuildConfig(projectPath);
    const smartDestination = destination || await getSmartDestination(preferredConfig);
    
    // Build final configuration
    const finalConfig = {
      scheme: scheme || preferredConfig?.scheme || scheme,
      configuration: configuration || preferredConfig?.configuration || 'Debug',
      destination: smartDestination,
      sdk: sdk || preferredConfig?.sdk,
      derivedDataPath: derivedDataPath || preferredConfig?.derivedDataPath,
    };

    // Build command
    const command = buildXcodebuildCommand(projectPath, 'build', finalConfig);

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
        summary,
        smartDefaultsUsed: {
          destination: !destination && smartDestination !== destination,
          configuration: !args.configuration && finalConfig.configuration !== 'Debug',
        },
      },
    });

    // Create concise response
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
      nextSteps: summary.success 
        ? [
            `✅ Build completed successfully in ${duration}ms`,
            `Use 'xcodebuild-get-details' with buildId '${cacheId}' for full logs`,
          ]
        : [
            `❌ Build failed with ${summary.errorCount} errors, ${summary.warningCount} warnings`,
            `First error: ${summary.firstError || 'Unknown error'}`,
            `Use 'xcodebuild-get-details' with buildId '${cacheId}' for full logs and errors`,
          ],
      availableDetails: [
        'full-log', 'errors-only', 'warnings-only', 'summary', 'command'
      ]
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

async function getSmartDestination(preferredConfig: any): Promise<string | undefined> {
  // If preferred config has a destination, use it
  if (preferredConfig?.destination) {
    return preferredConfig.destination;
  }

  // Try to get a smart simulator destination
  try {
    const preferredSim = await simulatorCache.getPreferredSimulator();
    if (preferredSim) {
      return `platform=iOS Simulator,id=${preferredSim.udid}`;
    }
  } catch (error) {
    // Fallback to no destination if simulator cache fails
  }

  // Return undefined to let xcodebuild use its own defaults
  return undefined;
}

function extractErrors(output: string): string[] {
  const errors: string[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.includes('error:') || line.includes('** BUILD FAILED **')) {
      errors.push(line.trim());
    }
  }
  
  return errors;
}

function extractWarnings(output: string): string[] {
  const warnings: string[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (line.includes('warning:')) {
      warnings.push(line.trim());
    }
  }
  
  return warnings;
}