import { simulatorCache } from '../../state/simulator-cache.js';
import { projectCache } from '../../state/project-cache.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

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
 * **Full documentation:** See cache/set-config.md for detailed parameters and examples
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

export const CACHE_SET_CONFIG_DOCS = `
# cache-set-config

⚙️ **Configure cache retention times to optimize for your workflow** - Fine-tune cache policies.

Fine-tune cache retention policies for simulator, project, and response caches. Allows you to balance performance (longer cache retention) against freshness (shorter retention). Default is 1 hour for most caches. Supports specifying duration in milliseconds, minutes, or hours for convenience.

## Advantages

• Optimize for development workflows (longer cache = faster repeated operations)
• Optimize for CI/CD environments (shorter cache = fresher data, less stale state)
• Reduce memory usage by lowering retention times for infrequently-accessed caches
• Extend retention for slow-changing projects to maximize performance gains

## Parameters

### Required
- cacheType (string): Which cache to configure - "simulator", "project", "response", or "all"

### Optional
- maxAgeMs (number): Cache retention in milliseconds
- maxAgeMinutes (number): Cache retention in minutes (alternative to maxAgeMs)
- maxAgeHours (number): Cache retention in hours (alternative to maxAgeMs)

Note: Specify exactly one of maxAgeMs, maxAgeMinutes, or maxAgeHours. Minimum 1000ms (1 second).

## Returns

- Tool execution results with configuration update confirmation
- Results per cache type with human-readable durations
- Timestamp of configuration change

## Related Tools

- cache-get-config: Get current cache configuration
- cache-get-stats: Monitor cache performance
- cache-clear: Clear cached data

## Notes

- Tool is auto-registered with MCP server
- Changes apply immediately
- Response cache is currently fixed at 30 minutes
- Use with cache-get-stats to verify effectiveness
`;
