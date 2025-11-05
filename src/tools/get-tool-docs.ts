import {
  TOOL_DOCS,
  TOOL_CATEGORIES,
  CATEGORY_DESCRIPTIONS,
  getCategoryForTool,
} from './docs-registry.js';

export interface GetToolDocsArgs {
  toolName?: string;
  categoryName?: string;
}

/**
 * MCP tool that returns full documentation for any registered tool or category.
 * Enables progressive disclosure - concise descriptions in tool list,
 * full documentation only when explicitly requested.
 *
 * Supports:
 * - Tool queries: rtfm({ toolName: "xcodebuild-build" })
 * - Category queries: rtfm({ categoryName: "simulator" })
 * - Category overview: rtfm({}) - shows all categories
 */
export async function getToolDocsTool(args: GetToolDocsArgs) {
  const { toolName, categoryName } = args;

  // Handle category query
  if (categoryName) {
    return handleCategoryQuery(categoryName);
  }

  // Handle tool query
  if (toolName) {
    return handleToolQuery(toolName);
  }

  // No parameters provided - show category overview
  return handleCategoryOverview();
}

/**
 * Handle category browsing query
 */
function handleCategoryQuery(categoryKey: string) {
  const category = TOOL_CATEGORIES[categoryKey];
  const description = CATEGORY_DESCRIPTIONS[categoryKey];

  if (!category || !description) {
    const availableCategories = Object.keys(TOOL_CATEGORIES);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Category "${categoryKey}" not found.

Available categories:
${availableCategories.map(key => `  • ${key}: ${CATEGORY_DESCRIPTIONS[key].name} (${TOOL_CATEGORIES[key].length} tools)`).join('\n')}

Use rtfm({ categoryName: "build" }) to browse a specific category.`,
        },
      ],
    };
  }

  // Build category documentation
  const toolList = category
    .map(toolName => {
      return `### ${toolName}\n${TOOL_DOCS[toolName]?.split('\n')[2] || 'No description available'}\nUse: rtfm({ toolName: "${toolName}" })`;
    })
    .join('\n\n');

  const relatedCategories = Object.keys(TOOL_CATEGORIES)
    .filter(key => key !== categoryKey)
    .map(
      key => `  • ${key}: ${CATEGORY_DESCRIPTIONS[key].name} (${TOOL_CATEGORIES[key].length} tools)`
    )
    .join('\n');

  return {
    content: [
      {
        type: 'text' as const,
        text: `# ${description.name} (${category.length} tools)

${description.description}

## Tools in this category:

${toolList}

## Related Categories:
${relatedCategories}`,
      },
    ],
  };
}

/**
 * Handle tool documentation query
 */
function handleToolQuery(toolName: string) {
  const docs = TOOL_DOCS[toolName];

  if (!docs) {
    // Tool not found - provide helpful suggestions
    const availableTools = Object.keys(TOOL_DOCS).sort();
    const suggestions = availableTools
      .filter(t => t.includes(toolName) || toolName.includes(t.split('-')[0]))
      .slice(0, 5);

    // Add category information to suggestions
    const suggestionsWithCategories = suggestions
      .map(tool => {
        const category = getCategoryForTool(tool);
        const categoryName = category ? CATEGORY_DESCRIPTIONS[category]?.name : 'Unknown';
        return `  - ${tool} (${categoryName})`;
      })
      .join('\n');

    const categoryList = Object.keys(TOOL_CATEGORIES)
      .map(
        key =>
          `  • ${key}: ${CATEGORY_DESCRIPTIONS[key].name} (${TOOL_CATEGORIES[key].length} tools)`
      )
      .join('\n');

    return {
      content: [
        {
          type: 'text' as const,
          text: `No documentation found for tool: "${toolName}"

${suggestions.length > 0 ? `Did you mean one of these?\n${suggestionsWithCategories}\n\n` : ''}Available categories:
${categoryList}

Browse by category: rtfm({ categoryName: "simulator" })
Get specific tool docs: rtfm({ toolName: "simctl-boot" })`,
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

/**
 * Handle category overview (no parameters)
 */
function handleCategoryOverview() {
  const categoryList = Object.keys(TOOL_CATEGORIES)
    .map(key => {
      const category = CATEGORY_DESCRIPTIONS[key];
      return `### ${category.name} (${TOOL_CATEGORIES[key].length} tools)
**Key:** \`${key}\`
**Description:** ${category.description}
**Browse:** rtfm({ categoryName: "${key}" })`;
    })
    .join('\n\n');

  return {
    content: [
      {
        type: 'text' as const,
        text: `# XC-MCP Tool Categories

Progressive disclosure documentation for 51 iOS development tools across 8 categories.

## Available Categories

${categoryList}

## Quick Start

**Browse a category:**
\`\`\`typescript
rtfm({ categoryName: "simulator" })
\`\`\`

**Get specific tool docs:**
\`\`\`typescript
rtfm({ toolName: "xcodebuild-build" })
\`\`\`

**Note:** Tool descriptions in the main list are intentionally concise (~60 tokens each) to minimize context overhead. Use rtfm for comprehensive documentation with parameters, examples, and usage patterns.`,
      },
    ],
  };
}

// NOTE: SCREENSHOT_SAVE_DOCS and RTFM_DOCS have been moved to docs-registry.ts
// to avoid circular dependency (this file imports TOOL_DOCS from docs-registry.ts)
