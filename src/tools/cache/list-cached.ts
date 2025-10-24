import { responseCache } from '../../utils/response-cache.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface ListCachedArgs {
  tool?: string;
  limit?: number;
}

/**
 * List recent cached build/test results for progressive disclosure retrieval
 *
 * **What it does:**
 * Displays recently cached build and test operation results with summary metadata. Essential for
 * progressive disclosure pattern - shows lightweight identifiers and summaries that can be used to
 * retrieve full details on demand. Prevents token overflow by avoiding large log dumps in initial
 * responses. Can filter by specific tool or show all cached responses.
 *
 * **Why you'd use it:**
 * - Find cached build/test IDs to retrieve full logs via xcodebuild-get-details
 * - Monitor which operations are cached and available for detailed inspection
 * - Track cache usage patterns and understand what's consuming cache storage
 * - Identify recent failed builds/tests for debugging without overwhelming token budgets
 *
 * **Parameters:**
 * - tool (string, optional): Filter by specific tool name (e.g., "xcodebuild-test")
 * - limit (number, optional): Maximum number of entries to return. Defaults to 10
 *
 * **Returns:**
 * JSON object containing:
 * - cacheStats: Overall cache statistics (totalEntries, byTool breakdown)
 * - recentResponses: Array of cached entries with id, tool, timestamp, exitCode, output sizes
 * - usage: Guidance on how to retrieve full details using cached IDs
 *
 * **Example:**
 * ```typescript
 * // List all recent cached responses
 * await listCachedResponsesTool({limit: 10});
 *
 * // List only cached test results
 * await listCachedResponsesTool({tool: "xcodebuild-test", limit: 5});
 *
 * // Returns:
 * // {
 * //   "recentResponses": [
 * //     {
 * //       "id": "test_abc123",
 * //       "tool": "xcodebuild-test",
 * //       "exitCode": 0,
 * //       "outputSize": 125000,
 * //       "summary": {"totalTests": 45, "passed": 42, "failed": 3}
 * //     }
 * //   ],
 * //   "usage": {
 * //     "note": "Use xcodebuild-get-details with any ID to retrieve full details"
 * //   }
 * // }
 * ```
 *
 * **Full documentation:** See cache/list-cached.md for detailed parameters and examples
 *
 * @param args Tool arguments with optional tool filter and limit
 * @returns Tool result with cached response listings
 */
export async function listCachedResponsesTool(args: any) {
  const { tool, limit = 10 } = args as ListCachedArgs;

  try {
    const stats = responseCache.getStats();

    let recentResponses;
    if (tool) {
      recentResponses = responseCache.getRecentByTool(tool, limit);
    } else {
      // Get recent from all tools
      const allTools = Object.keys(stats.byTool);
      recentResponses = allTools
        .flatMap(toolName =>
          responseCache.getRecentByTool(toolName, Math.ceil(limit / allTools.length))
        )
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, limit);
    }

    const responseData = {
      cacheStats: stats,
      recentResponses: recentResponses.map(cached => ({
        id: cached.id,
        tool: cached.tool,
        timestamp: cached.timestamp,
        exitCode: cached.exitCode,
        outputSize: cached.fullOutput.length,
        stderrSize: cached.stderr.length,
        summary: cached.metadata.summary || {},
        projectPath: cached.metadata.projectPath,
        scheme: cached.metadata.scheme,
      })),
      usage: {
        totalCached: stats.totalEntries,
        availableTools: Object.keys(stats.byTool),
        note: 'Use xcodebuild-get-details with any ID to retrieve full details',
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
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `list-cached-responses failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const CACHE_LIST_CACHED_RESPONSES_DOCS = `
# list-cached-responses

📋 **List cached build and test results with progressive disclosure** - View recent operations.

Retrieve recent cached build/test results with ability to drill down into full logs via progressive disclosure pattern.

## Advantages

• Access recent build and test results without re-running operations
• Drill down into full logs using returned cache IDs
• Filter by specific tool to find relevant operations
• Understand cache age and expiry information

## Parameters

### Optional
- \`limit\` (number, default: 10): Maximum number of cached responses to return
- \`tool\` (string): Filter by specific tool (optional)

## Returns

- List of recent cache entries with IDs
- Summary information for each cached operation
- Cache expiry times
- References for accessing full details

## Related Tools

- \`xcodebuild-get-details\` - Retrieve full build logs from cache ID
- \`xcodebuild-test\` - Run tests (generates new cache entries)
- \`cache-get-stats\` - View cache performance statistics
- \`cache-clear\` - Clear specific caches

## Notes

- Returns summaries only to avoid token waste
- Use returned cache IDs with xcodebuild-get-details for full output
- Ordered by recency (most recent first)
- Limited to reduce response token usage
`;
