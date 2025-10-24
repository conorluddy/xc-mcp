import { persistenceManager } from '../../utils/persistence.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface PersistenceDisableArgs {
  clearData?: boolean;
}

/**
 * Disable persistent state management and return to in-memory-only caching
 *
 * **What it does:**
 * Safely deactivates file-based persistence and optionally deletes existing cache data files.
 * After disabling, XC-MCP operates with in-memory caching only, losing all learned state on server
 * restart. Useful for privacy requirements, disk space constraints, or troubleshooting cache-related
 * issues.
 *
 * **Why you'd use it:**
 * - Meet privacy requirements that prohibit persistent storage
 * - Free up disk space when storage is limited
 * - Switch to CI/CD mode where persistence isn't beneficial
 * - Troubleshoot issues potentially caused by stale cached data
 *
 * **Parameters:**
 * - clearData (boolean, optional): Whether to delete existing cache files when disabling.
 *   Defaults to false (keeps files but stops writing new data)
 *
 * **Returns:**
 * JSON object containing:
 * - success: Whether persistence was disabled
 * - message: Confirmation message
 * - clearedData: Whether cache files were deleted
 * - previousStorageInfo: Disk usage stats before disabling (if clearData was true)
 * - effect: Description of the operational change
 *
 * **Example:**
 * ```typescript
 * // Disable persistence but keep cache files
 * await persistenceDisableTool({clearData: false});
 *
 * // Disable and delete all cache files
 * await persistenceDisableTool({clearData: true});
 *
 * // Returns:
 * // {
 * //   "success": true,
 * //   "message": "Persistence disabled successfully",
 * //   "clearedData": true,
 * //   "previousStorageInfo": {
 * //     "diskUsage": "2.4 MB",
 * //     "fileCount": 12
 * //   },
 * //   "effect": "XC-MCP will now operate with in-memory caching only"
 * // }
 * ```
 *
 * **Full documentation:** See persistence/disable.md for detailed parameters and examples
 *
 * @param args Tool arguments with optional clearData flag
 * @returns Tool result with persistence deactivation confirmation
 */
export async function persistenceDisableTool(args: any): Promise<ToolResult> {
  try {
    const { clearData = false } = args as PersistenceDisableArgs;

    if (!persistenceManager.isEnabled()) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: false,
                message: 'Persistence is already disabled',
                clearData: false,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Get storage info before disabling (if data is being cleared)
    const storageInfo = clearData ? await persistenceManager.getStatus(true) : null;

    const result = await persistenceManager.disable(clearData);

    if (result.success) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                message: result.message,
                clearedData: clearData,
                previousStorageInfo: storageInfo?.storageInfo || null,
                effect: 'XC-MCP will now operate with in-memory caching only',
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
        `Failed to disable persistence: ${result.message}`
      );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to disable persistence: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
