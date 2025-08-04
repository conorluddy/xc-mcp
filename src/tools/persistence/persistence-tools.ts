import { persistenceManager } from '../../utils/persistence.js';
import type { ToolResult } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface PersistenceEnableArgs {
  cacheDir?: string;
}

/**
 * Enable persistent state management with optional custom cache directory
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
 * Disable persistent state management with optional data clearing
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
 * Get detailed persistence system status and storage information
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
