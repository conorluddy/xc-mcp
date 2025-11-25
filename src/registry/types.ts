import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Shared type for all tool registration functions
 * Each registration module exports functions that take a McpServer instance
 * and register all tools in that category
 */
export type ToolRegistrationFunction = (server: McpServer) => void;

/**
 * Tool handler result type - all tools return this structure
 */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/**
 * Configuration object for deferred loading
 * Applied to all tool registrations to prevent context bloat at startup
 */
export type DeferLoadingConfig = Record<string, unknown>;
