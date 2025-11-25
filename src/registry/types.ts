import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';

/**
 * Shared type for all tool registration functions
 * Each registration module exports functions that take a McpServer instance
 * and register all tools in that category
 */
export type ToolRegistrationFunction = (server: McpServer) => void;

/**
 * Returns the appropriate description based on CLI config
 * Uses minimal descriptions when --mini flag is passed
 */
export function getDescription(full: string, mini: string): string {
  return config.minimalDescriptions ? mini : full;
}

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
