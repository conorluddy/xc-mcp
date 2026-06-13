import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateXcodeInstallation } from '../utils/validation.js';
import { getDescription } from './types.js';
import { getCacheStatsTool, CACHE_GET_STATS_DOCS } from '../tools/cache/get-stats.js';
import { getCacheConfigTool, CACHE_GET_CONFIG_DOCS } from '../tools/cache/get-config.js';
import { setCacheConfigTool, CACHE_SET_CONFIG_DOCS } from '../tools/cache/set-config.js';
import { clearCacheTool, CACHE_CLEAR_DOCS } from '../tools/cache/clear.js';
import { persistenceEnableTool, PERSISTENCE_ENABLE_DOCS } from '../tools/persistence/enable.js';
import { persistenceDisableTool, PERSISTENCE_DISABLE_DOCS } from '../tools/persistence/disable.js';
import { persistenceStatusTool, PERSISTENCE_STATUS_DOCS } from '../tools/persistence/status.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

export function registerCacheTools(server: McpServer): void {
  // cache-get-stats
  server.registerTool(
    'cache-get-stats',
    {
      title: 'Get Cache Statistics',
      description: getDescription(CACHE_GET_STATS_DOCS, CACHE_GET_STATS_DOCS),
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await getCacheStatsTool(args)) as any;
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // cache-get-config
  server.registerTool(
    'cache-get-config',
    {
      title: 'Get Cache Configuration',
      description: getDescription(CACHE_GET_CONFIG_DOCS, CACHE_GET_CONFIG_DOCS),
      inputSchema: {
        cacheType: z.enum(['simulator', 'project', 'response', 'all']).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await getCacheConfigTool(args)) as any;
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // cache-set-config
  server.registerTool(
    'cache-set-config',
    {
      title: 'Set Cache Configuration',
      description: getDescription(CACHE_SET_CONFIG_DOCS, CACHE_SET_CONFIG_DOCS),
      inputSchema: {
        cacheType: z.enum(['simulator', 'project', 'response', 'all']),
        maxAgeMs: z.number().optional(),
        maxAgeMinutes: z.number().optional(),
        maxAgeHours: z.number().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await setCacheConfigTool(args)) as any;
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // cache-clear
  server.registerTool(
    'cache-clear',
    {
      title: 'Clear Cache',
      description: getDescription(CACHE_CLEAR_DOCS, CACHE_CLEAR_DOCS),
      inputSchema: {
        cacheType: z.enum(['simulator', 'project', 'response', 'all']).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await clearCacheTool(args)) as any;
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // persistence-enable
  server.registerTool(
    'persistence-enable',
    {
      title: 'Enable Disk Persistence',
      description: getDescription(PERSISTENCE_ENABLE_DOCS, PERSISTENCE_ENABLE_DOCS),
      inputSchema: {
        cacheDir: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await persistenceEnableTool(args)) as any;
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // persistence-disable
  server.registerTool(
    'persistence-disable',
    {
      title: 'Disable Disk Persistence',
      description: getDescription(PERSISTENCE_DISABLE_DOCS, PERSISTENCE_DISABLE_DOCS),
      inputSchema: {
        clearData: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await persistenceDisableTool(args)) as any;
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // persistence-status
  server.registerTool(
    'persistence-status',
    {
      title: 'Persistence Status',
      description: getDescription(PERSISTENCE_STATUS_DOCS, PERSISTENCE_STATUS_DOCS),
      inputSchema: {
        includeStorageInfo: z.boolean().default(true),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await persistenceStatusTool(args)) as any;
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
