import { persistenceManager } from '../../utils/persistence.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

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
 * **Full documentation:** See persistence/status.md for detailed parameters and examples
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
