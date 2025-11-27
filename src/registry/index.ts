import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from '../config.js';
import { registerXcodebuildTools } from './xcodebuild.js';
import { registerSimctlListTool, registerSimctlTools } from './simctl.js';
import { registerIdbTools } from './idb.js';
import { registerCacheTools } from './cache.js';
import { registerWorkflowTools } from './workflows.js';
import { registerSystemTools } from './system.js';

/**
 * Register all XC-MCP tools with the MCP server
 * Organizes tool registration into modular files by category
 *
 * When --build-only flag is set, only registers:
 * - xcodebuild tools (build, test, clean, list, version, get-details)
 * - simctl-list (for simulator discovery during builds)
 * - cache tools (cache, persistence)
 * - system tools (rtfm, tool-search)
 */
export function registerAllTools(server: McpServer): void {
  // Always register build-related tools
  registerXcodebuildTools(server);
  registerSimctlListTool(server);
  registerCacheTools(server);
  registerSystemTools(server);

  // Only register full toolset when NOT in build-only mode
  if (!config.buildOnly) {
    registerSimctlTools(server);
    registerIdbTools(server);
    registerWorkflowTools(server);
  }
}
