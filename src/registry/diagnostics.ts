import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateXcodeInstallation } from '../utils/validation.js';
import { getDescription } from './types.js';
import {
  hangStartTool,
  hangStopTool,
  hangGetDetailsTool,
  hangListTool,
  HANG_START_DOCS,
  HANG_START_DOCS_MINI,
  HANG_STOP_DOCS,
  HANG_STOP_DOCS_MINI,
  HANG_GET_DETAILS_DOCS,
  HANG_GET_DETAILS_DOCS_MINI,
  HANG_LIST_DOCS,
  HANG_LIST_DOCS_MINI,
} from '../tools/diagnostics/hang/tools.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

/**
 * Register HangBuster diagnostics tools: capture and analyze main-thread hangs
 * via os_log streaming + a clustering pipeline.
 */
export function registerDiagnosticsTools(server: McpServer): void {
  // hang-start
  server.registerTool(
    'hang-start',
    {
      title: 'Start Hang Capture',
      description: getDescription(HANG_START_DOCS, HANG_START_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        predicate: z.string().optional(),
        minHangMs: z.number().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        return await hangStartTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // hang-stop
  server.registerTool(
    'hang-stop',
    {
      title: 'Stop & Analyze Hang Capture',
      description: getDescription(HANG_STOP_DOCS, HANG_STOP_DOCS_MINI),
      inputSchema: {
        sessionId: z.string(),
        topN: z.number().optional(),
        budgetTokens: z.number().optional(),
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
        return await hangStopTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // hang-get-details
  server.registerTool(
    'hang-get-details',
    {
      title: 'Get Hang Capture Details',
      description: getDescription(HANG_GET_DETAILS_DOCS, HANG_GET_DETAILS_DOCS_MINI),
      inputSchema: {
        sessionId: z.string(),
        cluster: z.number().optional(),
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
        return await hangGetDetailsTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // hang-list
  server.registerTool(
    'hang-list',
    {
      title: 'List Hang Capture Sessions',
      description: getDescription(HANG_LIST_DOCS, HANG_LIST_DOCS_MINI),
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async () => {
      try {
        return await hangListTool();
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
