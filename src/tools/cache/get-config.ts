import { simulatorCache } from '../../state/simulator-cache.js';
import { projectCache } from '../../state/project-cache.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

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
 * **Full documentation:** See cache/get-config.md for detailed parameters and examples
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
