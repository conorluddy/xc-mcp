import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateXcodeInstallation } from '../utils/validation.js';
import { getDescription } from './types.js';
import { cacheTool, CACHE_DOCS, CACHE_DOCS_MINI } from '../tools/cache/index.js';
import {
  persistenceTool,
  PERSISTENCE_DOCS,
  PERSISTENCE_DOCS_MINI,
} from '../tools/persistence/index.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

export function registerCacheTools(server: McpServer): void {
  // cache
  server.registerTool(
    'cache',
    {
      description: getDescription(CACHE_DOCS, CACHE_DOCS_MINI),
      inputSchema: {
        operation: z.enum(['get-stats', 'get-config', 'set-config', 'clear']),
        cacheType: z.enum(['simulator', 'project', 'response', 'all']).optional(),
        maxAgeMs: z.number().optional(),
        maxAgeMinutes: z.number().optional(),
        maxAgeHours: z.number().optional(),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await cacheTool(args)) as any;
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // persistence
  server.registerTool(
    'persistence',
    {
      description: getDescription(PERSISTENCE_DOCS, PERSISTENCE_DOCS_MINI),
      inputSchema: {
        operation: z.enum(['enable', 'disable', 'status']),
        cacheDir: z.string().optional(),
        clearData: z.boolean().default(false),
        includeStorageInfo: z.boolean().default(true),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await persistenceTool(args)) as any;
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
