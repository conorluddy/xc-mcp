import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlSuggestToolArgs {
  projectPath?: string;
  deviceType?: string;
  maxSuggestions?: number;
  autoBootTopSuggestion?: boolean;
}

/**
 * Intelligent simulator suggestion tool
 *
 * Suggests the best simulators for your project based on:
 * - Project preferences (remembered from previous successful builds)
 * - Recently used simulators
 * - Device popularity (iPhone 16 > iPhone 15, etc.)
 * - Boot performance metrics
 *
 * Scoring Algorithm (100 point scale):
 * - Project preference: 40 points
 * - Recent usage: 40 points
 * - iOS version: 30 points (newer = higher)
 * - Popular model: 20 points (iPhone 16 Pro > iPhone 16, etc.)
 * - Boot performance: 10 points (faster = higher)
 */
export async function simctlSuggestTool(args: any) {
  const {
    projectPath,
    deviceType,
    maxSuggestions = 4,
    autoBootTopSuggestion = false,
  } = args as SimctlSuggestToolArgs;

  try {
    // Get suggested simulators ranked by score
    const suggestions = await simulatorCache.getSuggestedSimulators(
      projectPath,
      deviceType,
      maxSuggestions
    );

    if (suggestions.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              message: 'No available simulators found',
              criteria: {
                projectPath: projectPath || 'not specified',
                deviceType: deviceType || 'any',
              },
              guidance: [
                'Create a new simulator using: simctl-create',
                'Check simulator health using: simctl-health-check',
                'List all simulators using: simctl-list',
              ],
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    // Boot top suggestion if requested
    if (autoBootTopSuggestion && suggestions.length > 0) {
      try {
        const topSuggestion = suggestions[0].simulator;
        const { executeCommand, buildSimctlCommand } = await import(
          '../../utils/command.js'
        );

        const bootCommand = buildSimctlCommand('boot', {
          deviceId: topSuggestion.udid,
        });

        await executeCommand(bootCommand, { timeout: 120000 });
        simulatorCache.recordBootEvent(topSuggestion.udid, true);
        simulatorCache.recordSimulatorUsage(topSuggestion.udid, projectPath);
      } catch (error) {
        console.warn('Failed to auto-boot top suggestion:', error);
        // Continue - suggestions are still valid even if boot failed
      }
    }

    // Format suggestions with scores and reasoning
    const formattedSuggestions = suggestions.map((suggestion, index) => ({
      rank: index + 1,
      name: suggestion.simulator.name,
      udid: suggestion.simulator.udid,
      state: suggestion.simulator.state,
      isAvailable: suggestion.simulator.isAvailable,
      availability: suggestion.simulator.availability,
      score: Math.round(suggestion.score),
      maxScore: 130, // 40 + 40 + 30 + 20 + 10 = 140 theoretical max with overlaps
      reasons: suggestion.reasons,
      bootHistory: {
        count: suggestion.simulator.bootHistory.length,
        avgBootTime: suggestion.simulator.performanceMetrics?.avgBootTime
          ? `${Math.round(suggestion.simulator.performanceMetrics.avgBootTime)}ms`
          : 'N/A',
        reliability:
          suggestion.simulator.performanceMetrics?.reliability !== undefined
            ? `${Math.round(suggestion.simulator.performanceMetrics.reliability * 100)}%`
            : 'N/A',
      },
    }));

    const responseData = {
      success: true,
      suggestions: formattedSuggestions,
      summary: {
        totalSuggestions: suggestions.length,
        topSuggestion: suggestions[0].simulator.name,
        scoringCriteria: {
          projectPreference: '40 points',
          recentUsage: '40 points',
          iOSVersion: '30 points',
          popularModel: '20 points',
          bootPerformance: '10 points',
        },
      },
      guidance: [
        ...(suggestions.length > 0
          ? [
              `Top suggestion: ${suggestions[0].simulator.name} (Score: ${Math.round(suggestions[0].score)}/130)`,
              `Reason: ${suggestions[0].reasons[0]}`,
            ]
          : []),
        `Use 'simctl-boot' with UDID to boot your chosen simulator`,
        `Use 'simctl-list' for complete device information`,
      ],
      projectContext: projectPath
        ? {
            projectPath,
            message: 'Suggestions ranked for your specific project',
          }
        : {
            message: 'Global suggestions (provide projectPath for project-specific ranking)',
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
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-suggest failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
