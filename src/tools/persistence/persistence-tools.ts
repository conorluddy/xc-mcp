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

interface PersistenceStatusArgs {
  includeStorageInfo?: boolean;
}

/**
 * Get comprehensive persistence system status with storage metrics and recommendations
 *
 * **What it does:**
 * Provides detailed information about the persistence system's current state. Shows whether
 * persistence is enabled, cache directory location, disk usage statistics, file counts, last save
 * timestamps, and intelligent recommendations based on storage health. Essential for monitoring
 * and troubleshooting persistent storage.
 *
 * **Why you'd use it:**
 * - Monitor disk space usage and cache file growth over time
 * - Verify persistence is working correctly (check last save timestamps)
 * - Troubleshoot persistence issues (check writability, file counts)
 * - Get actionable recommendations for cache maintenance and optimization
 *
 * **Parameters:**
 * - includeStorageInfo (boolean, optional): Whether to include detailed disk usage and file
 *   information. Defaults to true. Set to false for lightweight status check.
 *
 * **Returns:**
 * JSON object containing:
 * - enabled: Whether persistence is currently active
 * - schemaVersion: Cache data format version
 * - cacheDirectory: Storage location (if enabled)
 * - storage: Disk usage, file count, last save time, writability (if includeStorageInfo is true)
 * - recommendations: Actionable suggestions based on storage state
 * - features: Available persistence features (if disabled)
 *
 * **Example:**
 * ```typescript
 * // Get full status with storage details
 * await persistenceStatusTool({includeStorageInfo: true});
 *
 * // Get lightweight status without disk scanning
 * await persistenceStatusTool({includeStorageInfo: false});
 *
 * // Returns (when enabled):
 * // {
 * //   "enabled": true,
 * //   "cacheDirectory": "/Users/dev/.xc-mcp/cache",
 * //   "storage": {
 * //     "diskUsage": "2.4 MB",
 * //     "fileCount": 12,
 * //     "lastSave": "2025-01-23T10:15:30.000Z",
 * //     "isWritable": true
 * //   },
 * //   "recommendations": [
 * //     "📝 Cache is healthy and actively used"
 * //   ]
 * // }
 * ```
 *
 * @param args Tool arguments with optional includeStorageInfo flag
 * @returns Tool result with comprehensive persistence status
 */
export async function persistenceStatusTool(args: any): Promise<ToolResult> {
  try {
    const { includeStorageInfo = true } = args as PersistenceStatusArgs;

    const status = await persistenceManager.getStatus(includeStorageInfo);

    // Format disk usage for human readability
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const response: any = {
      enabled: status.enabled,
      schemaVersion: status.schemaVersion,
      timestamp: new Date().toISOString(),
    };

    if (status.enabled && status.cacheDir) {
      response.cacheDirectory = status.cacheDir;

      if (status.storageInfo) {
        response.storage = {
          diskUsage: formatBytes(status.storageInfo.diskUsage),
          diskUsageBytes: status.storageInfo.diskUsage,
          fileCount: status.storageInfo.fileCount,
          lastSave: status.storageInfo.lastSave?.toISOString() || null,
          isWritable: status.storageInfo.isWritable,
        };

        // Add recommendations based on storage state
        const recommendations: string[] = [];

        if (!status.storageInfo.isWritable) {
          recommendations.push('⚠️  Cache directory is not writable - persistence may fail');
        }

        if (status.storageInfo.diskUsage > 50 * 1024 * 1024) {
          // > 50MB
          recommendations.push(
            '💾 Cache directory is using significant disk space - consider periodic cleanup'
          );
        }

        if (status.storageInfo.fileCount === 0) {
          recommendations.push(
            '📝 No cache files found - new usage patterns will be learned and saved'
          );
        }

        if (
          status.storageInfo.lastSave &&
          Date.now() - status.storageInfo.lastSave.getTime() > 24 * 60 * 60 * 1000
        ) {
          recommendations.push(
            '🕐 No recent cache updates - persistence is working but not actively used'
          );
        }

        if (recommendations.length > 0) {
          response.recommendations = recommendations;
        }
      }
    } else {
      response.message =
        'Persistence is disabled. Use "persistence-enable" to activate file-based caching.';
      response.features = [
        'Remembers successful build configurations',
        'Tracks simulator usage patterns and performance',
        'Preserves cached project information across restarts',
        'Maintains response cache for progressive disclosure',
      ];
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to get persistence status: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
