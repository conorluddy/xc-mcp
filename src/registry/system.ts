import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getDescription } from './types.js';
import { getToolDocsTool } from '../tools/get-tool-docs.js';
import { RTFM_DOCS, RTFM_DOCS_MINI } from '../tools/docs-registry.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

export function registerSystemTools(server: McpServer): void {
  // rtfm - Documentation tool
  server.registerTool(
    'rtfm',
    {
      description: getDescription(RTFM_DOCS, RTFM_DOCS_MINI),
      inputSchema: {
        toolName: z.string().optional(),
        categoryName: z.string().optional(),
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await getToolDocsTool(args)) as any;
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
