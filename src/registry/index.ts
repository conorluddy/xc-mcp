import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerXcodebuildTools } from './xcodebuild.js';
import { registerSimctlTools } from './simctl.js';
import { registerIdbTools } from './idb.js';
import { registerCacheTools } from './cache.js';
import { registerWorkflowTools } from './workflows.js';
import { registerSystemTools } from './system.js';

/**
 * Register all XC-MCP tools with the MCP server
 * Organizes tool registration into modular files by category
 */
export function registerAllTools(server: McpServer): void {
  registerXcodebuildTools(server);
  registerSimctlTools(server);
  registerIdbTools(server);
  registerCacheTools(server);
  registerWorkflowTools(server);
  registerSystemTools(server);
}
