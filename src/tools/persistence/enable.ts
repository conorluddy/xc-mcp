import { persistenceManager } from '../../utils/persistence.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface PersistenceEnableArgs {
  cacheDir?: string;
}

/**
 * Enable opt-in persistent state management for learning across server restarts
 *
 * **What it does:**
 * Activates file-based persistence for XC-MCP's intelligent caching systems. Stores usage patterns,
 * build preferences, simulator performance metrics, and cached responses to disk. Enables the system
 * to learn and improve over time, remembering successful configurations across server restarts.
 * Privacy-first design: NO source code, credentials, or personal information is persisted.
 *
 * **Why you'd use it:**
 * - Retain learned build configurations and simulator preferences across restarts
 * - Accelerate repeated workflows by persisting successful operation patterns
 * - Enable team collaboration with shared project-local cache optimizations
 * - Maintain performance insights across CI/CD pipeline runs
 *
 * **Parameters:**
 * - cacheDir (string, optional): Custom directory for cache storage. If omitted, uses intelligent
 *   location selection (XC_MCP_CACHE_DIR env var, XDG cache dir, project-local, user home, or temp)
 *
 * **Returns:**
 * JSON object containing:
 * - success: Whether persistence was enabled
 * - message: Confirmation message
 * - cacheDirectory: Resolved storage location
 * - status: Detailed storage information (disk usage, file count, writability)
 * - privacyNotice: Privacy guarantee about what data is stored
 * - nextSteps: Suggested next actions
 *
 * **Example:**
 * ```typescript
 * // Enable with automatic location selection
 * await persistenceEnableTool({});
 *
 * // Enable with custom cache directory
 * await persistenceEnableTool({cacheDir: "/path/to/cache"});
 *
 * // Returns:
 * // {
 * //   "success": true,
 * //   "cacheDirectory": "/Users/dev/.xc-mcp/cache",
 * //   "privacyNotice": "Only usage patterns, build preferences, and performance metrics...",
 * //   "nextSteps": [
 * //     "State will now persist across server restarts",
 * //     "Use persistence-status to monitor storage usage"
 * //   ]
 * // }
 * ```
 *
 * **Full documentation:** See persistence/enable.md for detailed parameters and examples
 *
 * @param args Tool arguments with optional custom cacheDir
 * @returns Tool result with persistence activation confirmation
 */
export async function persistenceEnableTool(args: any): Promise<ToolResult> {
  try {
    const { cacheDir } = args as PersistenceEnableArgs;

    if (persistenceManager.isEnabled()) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: false,
                message: 'Persistence is already enabled',
                currentStatus: await persistenceManager.getStatus(),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const result = await persistenceManager.enable(cacheDir);

    if (result.success) {
      const status = await persistenceManager.getStatus(true);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                message: result.message,
                cacheDirectory: result.cacheDir,
                status,
                privacyNotice:
                  'Only usage patterns, build preferences, and performance metrics are stored. No source code, credentials, or personal information is persisted.',
                nextSteps: [
                  'State will now persist across server restarts',
                  'Use "persistence-status" to monitor storage usage',
                  'Use "persistence-disable" to turn off persistence',
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    } else {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to enable persistence: ${result.message}`
      );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to enable persistence: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
