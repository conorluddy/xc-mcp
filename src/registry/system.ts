import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getDescription } from './types.js';
import { getToolDocsTool } from '../tools/get-tool-docs.js';
import { RTFM_DOCS, RTFM_DOCS_MINI } from '../tools/docs-registry.js';

export function registerSystemTools(server: McpServer): void {
  // rtfm - Documentation tool
  server.registerTool(
    'rtfm',
    {
      title: 'Read The Manual (Tool Docs)',
      description: getDescription(RTFM_DOCS, RTFM_DOCS_MINI),
      inputSchema: {
        toolName: z.string().optional(),
        categoryName: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
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
