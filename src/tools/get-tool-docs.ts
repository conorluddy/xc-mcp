import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_DOCS } from './docs-registry.js';

export interface GetToolDocsArgs {
  toolName: string;
}

/**
 * MCP tool that returns full documentation for any registered tool.
 * Enables progressive disclosure - concise descriptions in tool list,
 * full documentation only when explicitly requested.
 */
export async function getToolDocsTool(args: GetToolDocsArgs) {
  const { toolName } = args;

  if (!toolName) {
    throw new McpError(ErrorCode.InvalidParams, 'toolName parameter is required');
  }

  const docs = TOOL_DOCS[toolName];

  if (!docs) {
    const availableTools = Object.keys(TOOL_DOCS).sort();
    const suggestions = availableTools
      .filter(t => t.includes(toolName) || toolName.includes(t.split('-')[0]))
      .slice(0, 5);

    return {
      content: [
        {
          type: 'text' as const,
          text: `No documentation found for tool: "${toolName}"

${suggestions.length > 0 ? `Did you mean one of these?\n${suggestions.map(s => `  - ${s}`).join('\n')}\n\n` : ''}Available tools (${availableTools.length} total):
${availableTools.map(t => `  - ${t}`).join('\n')}`,
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: docs,
      },
    ],
  };
}

// NOTE: SCREENSHOT_SAVE_DOCS and RTFM_DOCS have been moved to docs-registry.ts
// to avoid circular dependency (this file imports TOOL_DOCS from docs-registry.ts)
