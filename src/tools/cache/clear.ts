import { simulatorCache } from '../../state/simulator-cache.js';
import { projectCache } from '../../state/project-cache.js';
import { responseCache } from '../../utils/response-cache.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

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
 * **Full documentation:** See cache/clear.md for detailed parameters and examples
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

export const CACHE_CLEAR_DOCS = `
# cache-clear

🗑️ **Clear cached data to force fresh retrieval and resolve stale state** - Purge cache systems.

Removes all entries from the specified cache system(s). Forces fresh data retrieval on the next operation. Useful for troubleshooting stale cache issues, resetting learned patterns, or clearing memory after major project changes. Can target individual caches or clear all at once.

## Advantages

• Force fresh data after major Xcode project changes (new targets, schemes, build settings)
• Resolve issues caused by stale cached simulator or project data
• Clear memory before performance testing to establish baseline
• Reset learned patterns when switching between project configurations

## Parameters

### Required
- cacheType (string): Which cache to clear - "simulator", "project", "response", or "all"

### Optional
- (None)

## Returns

- Tool execution results with clear operation confirmation
- Results per cache type showing successful clearing
- Timestamp of cache clearing

## Related Tools

- cache-get-stats: Monitor cache before clearing
- cache-set-config: Configure cache retention
- cache-get-config: View cache configuration

## Notes

- Tool is auto-registered with MCP server
- Operation is immediate and irreversible
- Clearing all caches forces fresh retrieval on all tools
- Use before performance benchmarking
`;
