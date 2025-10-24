import { simulatorCache } from '../../state/simulator-cache.js';
import { projectCache } from '../../state/project-cache.js';
import { responseCache } from '../../utils/response-cache.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Get comprehensive statistics across all XC-MCP cache systems
 *
 * **What it does:**
 * Retrieves detailed statistics from the simulator cache, project cache, and response cache
 * systems. Shows hit rates, entry counts, storage usage, and performance metrics across all
 * caching layers. Essential for monitoring cache effectiveness and identifying optimization
 * opportunities.
 *
 * **Why you'd use it:**
 * - Monitor cache performance and effectiveness across simulator, project, and response caches
 * - Understand cache hit rates to optimize build and test workflows
 * - Track memory usage and identify opportunities to tune cache configurations
 * - Debug performance issues by analyzing cache patterns and expiry times
 *
 * **Parameters:**
 * None required - retrieves statistics from all cache systems automatically
 *
 * **Returns:**
 * JSON object containing:
 * - simulator: SimulatorCache statistics (device usage, boot performance, hit rates)
 * - project: ProjectCache statistics (build configurations, successful patterns)
 * - response: ResponseCache statistics (progressive disclosure entries, token savings)
 * - timestamp: ISO timestamp of when statistics were collected
 *
 * **Example:**
 * ```typescript
 * const stats = await getCacheStatsTool({});
 * // Returns:
 * // {
 * //   "simulator": {
 * //     "totalEntries": 15,
 * //     "hitRate": 0.85,
 * //     "averageBootTime": 12000
 * //   },
 * //   "project": {
 * //     "totalProjects": 3,
 * //     "cachedBuilds": 12
 * //   },
 * //   "response": {
 * //     "totalEntries": 8,
 * //     "byTool": {"xcodebuild-test": 5, "xcodebuild-build": 3}
 * //   }
 * // }
 * ```
 *
 * **Full documentation:** See cache/get-stats.md for detailed parameters and examples
 *
 * @param _args Tool arguments (none required)
 * @returns Tool result with comprehensive cache statistics
 */
export async function getCacheStatsTool(_args: any): Promise<ToolResult> {
  try {
    const simulatorStats = simulatorCache.getCacheStats();
    const projectStats = projectCache.getCacheStats();
    const responseStats = responseCache.getStats();

    const stats = {
      simulator: simulatorStats,
      project: projectStats,
      response: responseStats,
      timestamp: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get cache stats: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
