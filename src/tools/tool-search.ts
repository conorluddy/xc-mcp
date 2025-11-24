/**
 * Tool Search - Dynamic tool discovery for deferred loading
 *
 * This tool enables agents to discover xc-mcp tools on-demand,
 * reducing baseline token usage from ~18.7k to ~1k tokens.
 *
 * Part of the Advanced Tool Use pattern from Anthropic:
 * https://www.anthropic.com/engineering/advanced-tool-use
 */

import {
  TOOL_REGISTRY,
  searchTools,
  getToolsByCategory,
  getAllCategories,
  type ToolMetadata,
} from './tool-registry.js';

export interface ToolSearchArgs {
  query?: string; // Search term (searches name, description, keywords, operations)
  category?: string; // Filter by category: build, simulator, app, idb, io, cache, system
  limit?: number; // Max results (default: 10)
  showAll?: boolean; // Show all tools (ignores query/category)
}

export interface ToolSearchResult {
  found: number;
  tools: Array<{
    name: string;
    description: string;
    category: string;
    operations?: string[];
  }>;
  categories?: string[];
  guidance: string[];
}

/**
 * Search for tools by keyword, category, or list all tools
 */
export async function toolSearchTool(args: ToolSearchArgs): Promise<{
  content: Array<{ type: 'text'; text: string }>;
}> {
  const { query, category, limit = 10, showAll = false } = args;

  let results: ToolMetadata[];
  const guidance: string[] = [];

  if (showAll) {
    // Show all tools
    results = TOOL_REGISTRY;
    guidance.push('Showing all available tools.');
    guidance.push('Use tool-search with a query to find specific tools.');
  } else if (category) {
    // Filter by category
    results = getToolsByCategory(category);
    if (results.length === 0) {
      const allCategories = getAllCategories();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                error: `Unknown category: "${category}"`,
                availableCategories: allCategories,
                guidance: [
                  `Valid categories: ${allCategories.join(', ')}`,
                  'Use tool-search with showAll: true to see all tools',
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    }
    guidance.push(`Found ${results.length} tools in category "${category}".`);
  } else if (query) {
    // Search by query
    results = searchTools(query);
    if (results.length === 0) {
      // No results - suggest alternatives
      const allCategories = getAllCategories();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                found: 0,
                query,
                suggestions: [
                  'Try broader search terms (e.g., "build", "simulator", "tap", "screenshot")',
                  'Search by category: build, simulator, app, idb, io, cache, system',
                  'Use showAll: true to see all available tools',
                ],
                categories: allCategories,
              },
              null,
              2
            ),
          },
        ],
      };
    }
    guidance.push(`Found ${results.length} tools matching "${query}".`);
  } else {
    // No query or category - show categories overview
    const allCategories = getAllCategories();
    const categoryOverview = allCategories.map(cat => ({
      category: cat,
      toolCount: getToolsByCategory(cat).length,
    }));

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              message: 'Tool Search - Discover xc-mcp tools',
              totalTools: TOOL_REGISTRY.length,
              categories: categoryOverview,
              usage: {
                searchByKeyword: '{ "query": "build" }',
                filterByCategory: '{ "category": "simulator" }',
                showAll: '{ "showAll": true }',
              },
              guidance: [
                'Search by keyword to find tools (e.g., "boot", "tap", "screenshot")',
                'Filter by category to see related tools',
                'Use rtfm with toolName for detailed documentation',
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Apply limit
  const limitedResults = results.slice(0, limit);

  // Format results
  const formattedTools = limitedResults.map(tool => ({
    name: tool.name,
    description: tool.description,
    category: tool.category,
    ...(tool.operations && { operations: tool.operations }),
  }));

  // Add guidance
  if (limitedResults.length < results.length) {
    guidance.push(
      `Showing ${limitedResults.length} of ${results.length} results. Increase limit to see more.`
    );
  }
  guidance.push('Use rtfm({ toolName: "tool-name" }) for detailed documentation.');
  guidance.push('Tools with operations are routers - specify operation when calling.');

  const response: ToolSearchResult = {
    found: results.length,
    tools: formattedTools,
    guidance,
  };

  // Include categories in response if showing all
  if (showAll) {
    response.categories = getAllCategories();
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

/**
 * Tool Search documentation for RTFM
 */
export const TOOL_SEARCH_DOCS = `
# tool-search

Dynamic tool discovery for efficient MCP context management.

## Overview

The tool-search tool enables agents to discover xc-mcp tools on-demand, implementing the "Tool Search Tool" pattern from Anthropic's advanced tool use guidelines. This reduces baseline token usage by ~95% (from ~18.7k to ~1k tokens).

## Why Tool Search?

With 28 tools in xc-mcp, loading all tool definitions upfront consumes significant context. Tool search enables:
- **Deferred Loading**: Only load tool definitions when needed
- **Semantic Discovery**: Find tools by keyword, not just name
- **Category Browsing**: Explore tools by functional area
- **Token Efficiency**: Start with minimal context, expand as needed

## Parameters

- **query** (optional): Search term to find tools
  - Searches: tool names, descriptions, keywords, operations
  - Examples: "build", "simulator", "tap", "screenshot", "boot"

- **category** (optional): Filter by tool category
  - Valid categories: build, simulator, app, idb, io, cache, system

- **limit** (optional): Maximum results to return (default: 10)

- **showAll** (optional): Show all tools regardless of query/category

## Examples

### Search by Keyword
\`\`\`json
{"query": "boot"}
\`\`\`
Returns tools related to booting simulators.

### Filter by Category
\`\`\`json
{"category": "idb"}
\`\`\`
Returns all IDB UI automation tools.

### Show All Tools
\`\`\`json
{"showAll": true}
\`\`\`
Returns complete tool inventory.

### Get Category Overview
\`\`\`json
{}
\`\`\`
Returns categories with tool counts (no search performed).

## Response Format

\`\`\`json
{
  "found": 3,
  "tools": [
    {
      "name": "simctl-device",
      "description": "Manage simulator device lifecycle...",
      "category": "simulator",
      "operations": ["boot", "shutdown", "create", "delete", "erase", "clone", "rename"]
    }
  ],
  "guidance": [
    "Use rtfm({ toolName: 'simctl-device' }) for detailed documentation."
  ]
}
\`\`\`

## Workflow Pattern

1. **Start**: Use tool-search to discover relevant tools
2. **Learn**: Use rtfm to get detailed tool documentation
3. **Execute**: Call the discovered tool with proper parameters
4. **Iterate**: Search for more tools as workflow evolves

## Tool Categories

| Category | Description | Example Tools |
|----------|-------------|---------------|
| build | Xcode build & test | xcodebuild-build, xcodebuild-test |
| simulator | Simulator lifecycle | simctl-device, simctl-list |
| app | App management | simctl-app, simctl-openurl |
| idb | UI automation | idb-ui-tap, idb-ui-describe |
| io | Screenshots/video | screenshot, simctl-io |
| cache | Cache management | cache, persistence |
| system | Documentation | rtfm |

## Related Tools

- **rtfm**: Get detailed documentation for any discovered tool
- All tools returned by tool-search can be called directly

## Notes

- Router tools (with operations array) require an operation parameter
- Keywords include common synonyms and related terms
- Search is case-insensitive and matches partial terms
`;
