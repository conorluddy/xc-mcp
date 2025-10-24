import { simulatorCache } from '../../state/simulator-cache.js';
import { projectCache } from '../../state/project-cache.js';
import { responseCache } from '../../utils/response-cache.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface CacheStatsArgs {
  // No arguments needed
}

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
 * @param args Tool arguments (none required)
 * @returns Tool result with comprehensive cache statistics
 */
export async function getCacheStatsTool(args: any): Promise<ToolResult> {
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

interface SetCacheConfigArgs {
  cacheType: 'simulator' | 'project' | 'response' | 'all';
  maxAgeMs?: number;
  maxAgeMinutes?: number;
  maxAgeHours?: number;
}

/**
 * Configure cache retention times to optimize for your workflow
 *
 * **What it does:**
 * Fine-tune cache retention policies for simulator, project, and response caches. Allows you to
 * balance performance (longer cache retention) against freshness (shorter retention). Default is
 * 1 hour for most caches. Supports specifying duration in milliseconds, minutes, or hours for
 * convenience.
 *
 * **Why you'd use it:**
 * - Optimize for development workflows (longer cache = faster repeated operations)
 * - Optimize for CI/CD environments (shorter cache = fresher data, less stale state)
 * - Reduce memory usage by lowering retention times for infrequently-accessed caches
 * - Extend retention for slow-changing projects to maximize performance gains
 *
 * **Parameters:**
 * - cacheType (string): Which cache to configure - "simulator", "project", "response", or "all"
 * - maxAgeMs (number, optional): Cache retention in milliseconds
 * - maxAgeMinutes (number, optional): Cache retention in minutes (alternative to maxAgeMs)
 * - maxAgeHours (number, optional): Cache retention in hours (alternative to maxAgeMs)
 *
 * Note: Specify exactly one of maxAgeMs, maxAgeMinutes, or maxAgeHours. Minimum 1000ms (1 second).
 *
 * **Returns:**
 * JSON object containing configuration update results per cache type and human-readable durations
 *
 * **Example:**
 * ```typescript
 * // Set all caches to 2 hours for long development session
 * await setCacheConfigTool({cacheType: "all", maxAgeHours: 2});
 *
 * // Set simulator cache to 30 minutes for CI/CD
 * await setCacheConfigTool({cacheType: "simulator", maxAgeMinutes: 30});
 *
 * // Returns:
 * // {
 * //   "message": "Cache configuration updated",
 * //   "results": {
 * //     "simulator": "Set to 30m 0s",
 * //     "project": "Set to 30m 0s"
 * //   }
 * // }
 * ```
 *
 * @param args Tool arguments with cacheType and duration
 * @returns Tool result with configuration update confirmation
 */
export async function setCacheConfigTool(args: any): Promise<ToolResult> {
  try {
    const { cacheType, maxAgeMs, maxAgeMinutes, maxAgeHours } = args as SetCacheConfigArgs;

    if (!['simulator', 'project', 'response', 'all'].includes(cacheType)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'cacheType must be one of: simulator, project, response, all'
      );
    }

    // Calculate max age in milliseconds
    let maxAge: number;
    if (maxAgeMs !== undefined) {
      maxAge = maxAgeMs;
    } else if (maxAgeMinutes !== undefined) {
      maxAge = maxAgeMinutes * 60 * 1000;
    } else if (maxAgeHours !== undefined) {
      maxAge = maxAgeHours * 60 * 60 * 1000;
    } else {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Must specify one of: maxAgeMs, maxAgeMinutes, or maxAgeHours'
      );
    }

    if (maxAge < 1000) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Cache max age must be at least 1000ms (1 second)'
      );
    }

    const results: Record<string, string> = {};

    if (cacheType === 'simulator' || cacheType === 'all') {
      simulatorCache.setCacheMaxAge(maxAge);
      results.simulator = `Set to ${formatDuration(maxAge)}`;
    }

    if (cacheType === 'project' || cacheType === 'all') {
      projectCache.setCacheMaxAge(maxAge);
      results.project = `Set to ${formatDuration(maxAge)}`;
    }

    if (cacheType === 'response' || cacheType === 'all') {
      // Note: responseCache doesn't have setCacheMaxAge yet, we'd need to implement it
      results.response = 'Response cache config is fixed at 30 minutes';
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              message: 'Cache configuration updated',
              results,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to set cache config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

interface ClearCacheArgs {
  cacheType: 'simulator' | 'project' | 'response' | 'all';
}

/**
 * Clear cached data to force fresh retrieval and resolve stale state
 *
 * **What it does:**
 * Removes all entries from the specified cache system(s). Forces fresh data retrieval on the
 * next operation. Useful for troubleshooting stale cache issues, resetting learned patterns, or
 * clearing memory after major project changes. Can target individual caches or clear all at once.
 *
 * **Why you'd use it:**
 * - Force fresh data after major Xcode project changes (new targets, schemes, build settings)
 * - Resolve issues caused by stale cached simulator or project data
 * - Clear memory before performance testing to establish baseline
 * - Reset learned patterns when switching between different project configurations
 *
 * **Parameters:**
 * - cacheType (string): Which cache to clear - "simulator", "project", "response", or "all"
 *
 * **Returns:**
 * JSON object with clear operation results per cache type and confirmation timestamp
 *
 * **Example:**
 * ```typescript
 * // Clear all caches after major project refactoring
 * await clearCacheTool({cacheType: "all"});
 *
 * // Clear only simulator cache after adding new device
 * await clearCacheTool({cacheType: "simulator"});
 *
 * // Returns:
 * // {
 * //   "message": "Cache cleared successfully",
 * //   "results": {
 * //     "simulator": "Cleared successfully",
 * //     "project": "Cleared successfully",
 * //     "response": "Cleared successfully"
 * //   },
 * //   "timestamp": "2025-01-23T10:30:00.000Z"
 * // }
 * ```
 *
 * @param args Tool arguments with cacheType to clear
 * @returns Tool result with clear operation confirmation
 */
export async function clearCacheTool(args: any): Promise<ToolResult> {
  try {
    const { cacheType } = args as ClearCacheArgs;

    if (!['simulator', 'project', 'response', 'all'].includes(cacheType)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'cacheType must be one of: simulator, project, response, all'
      );
    }

    const results: Record<string, string> = {};

    if (cacheType === 'simulator' || cacheType === 'all') {
      simulatorCache.clearCache();
      results.simulator = 'Cleared successfully';
    }

    if (cacheType === 'project' || cacheType === 'all') {
      projectCache.clearCache();
      results.project = 'Cleared successfully';
    }

    if (cacheType === 'response' || cacheType === 'all') {
      responseCache.clear();
      results.response = 'Cleared successfully';
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              message: 'Cache cleared successfully',
              results,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to clear cache: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

interface GetCacheConfigArgs {
  cacheType?: 'simulator' | 'project' | 'response' | 'all';
}

/**
 * Get current cache retention configuration settings
 *
 * **What it does:**
 * Retrieves the current cache retention policies for simulator, project, and response caches.
 * Shows both millisecond values and human-readable durations. Essential for understanding your
 * current cache configuration before making adjustments or troubleshooting performance.
 *
 * **Why you'd use it:**
 * - Verify cache retention settings before tuning for specific workflows
 * - Understand current configuration when troubleshooting stale data issues
 * - Document cache settings for team collaboration or CI/CD configuration
 * - Compare settings across different environments (development vs production)
 *
 * **Parameters:**
 * - cacheType (string, optional): Which cache config to retrieve - "simulator", "project",
 *   "response", or "all". Defaults to "all"
 *
 * **Returns:**
 * JSON object containing cache retention settings with both raw milliseconds and human-readable
 * durations (e.g., "1h 30m")
 *
 * **Example:**
 * ```typescript
 * // Get all cache configurations
 * await getCacheConfigTool({});
 *
 * // Get only simulator cache config
 * await getCacheConfigTool({cacheType: "simulator"});
 *
 * // Returns:
 * // {
 * //   "cacheConfiguration": {
 * //     "simulator": {
 * //       "maxAgeMs": 3600000,
 * //       "maxAgeHuman": "1h 0m"
 * //     },
 * //     "project": {
 * //       "maxAgeMs": 3600000,
 * //       "maxAgeHuman": "1h 0m"
 * //     },
 * //     "response": {
 * //       "maxAgeMs": 1800000,
 * //       "maxAgeHuman": "30m",
 * //       "note": "Response cache duration is currently fixed"
 * //     }
 * //   }
 * // }
 * ```
 *
 * @param args Tool arguments with optional cacheType filter
 * @returns Tool result with cache configuration details
 */
export async function getCacheConfigTool(args: any): Promise<ToolResult> {
  try {
    const { cacheType = 'all' } = args as GetCacheConfigArgs;

    if (!['simulator', 'project', 'response', 'all'].includes(cacheType)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'cacheType must be one of: simulator, project, response, all'
      );
    }

    const config: Record<string, any> = {};

    if (cacheType === 'simulator' || cacheType === 'all') {
      const maxAge = simulatorCache.getCacheMaxAge();
      config.simulator = {
        maxAgeMs: maxAge,
        maxAgeHuman: formatDuration(maxAge),
      };
    }

    if (cacheType === 'project' || cacheType === 'all') {
      const maxAge = projectCache.getCacheMaxAge();
      config.project = {
        maxAgeMs: maxAge,
        maxAgeHuman: formatDuration(maxAge),
      };
    }

    if (cacheType === 'response' || cacheType === 'all') {
      config.response = {
        maxAgeMs: 30 * 60 * 1000, // Fixed 30 minutes
        maxAgeHuman: '30m',
        note: 'Response cache duration is currently fixed',
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              cacheConfiguration: config,
              timestamp: new Date().toISOString(),
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get cache config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
