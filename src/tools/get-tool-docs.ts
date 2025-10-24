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

export const SCREENSHOT_SAVE_DOCS = `
# screenshot-save

📸 **File-Based Screenshot Alias** - Save screenshots/videos to files via simctl-io.

## Overview

\`screenshot-save\` is a convenience alias for the file-based variant of \`simctl-io\`. Use this when you want to save screenshots or videos to disk files. For inline base64 screenshots optimized for vision models, use the \`screenshot\` tool instead.

## Relationship to Other Tools

- **screenshot-save** → Saves to file (uses \`simctl-io\`)
- **screenshot** → Returns inline base64 with coordinate metadata (uses \`simctl-screenshot-inline\`)
- **simctl-io** → Direct access to I/O operations (screenshots, videos, both file-based)

## When to Use

**Use screenshot-save when:**
- You need to save screenshots to specific file paths
- Recording videos for later playback
- Building test artifacts for CI/CD pipelines
- Creating screenshot archives

**Use screenshot instead when:**
- Working with AI vision models (Claude, GPT-4V)
- Need coordinate transformation metadata for UI automation
- Want immediate inline image analysis
- Token efficiency is important (half-size default)

## Parameters

All parameters are passed directly to \`simctl-io\`:

- **udid** (optional): Simulator UDID (auto-detects if not provided)
- **operation**: "screenshot" or "video"
- **appName** (optional): App name for semantic naming (e.g., "MyApp")
- **screenName** (optional): Screen/view name (e.g., "LoginScreen")
- **state** (optional): UI state (e.g., "Empty", "Filled", "Loading")
- **outputPath** (optional): Custom output file path
- **codec** (optional): Video codec for recordings (h264, hevc, prores)

## Examples

### Basic Screenshot
\`\`\`typescript
{
  "tool": "screenshot-save",
  "arguments": {
    "operation": "screenshot"
  }
}
\`\`\`

### Semantic Screenshot Naming
\`\`\`typescript
{
  "tool": "screenshot-save",
  "arguments": {
    "operation": "screenshot",
    "appName": "MyApp",
    "screenName": "LoginScreen",
    "state": "Empty"
  }
}
// Saves to: MyApp_LoginScreen_Empty_2025-01-24.png
\`\`\`

### Custom Output Path
\`\`\`typescript
{
  "tool": "screenshot-save",
  "arguments": {
    "operation": "screenshot",
    "outputPath": "/tmp/my-screenshot.png"
  }
}
\`\`\`

### Video Recording
\`\`\`typescript
{
  "tool": "screenshot-save",
  "arguments": {
    "operation": "video",
    "codec": "h264"
  }
}
\`\`\`

## Returns

File path to saved screenshot/video with success confirmation.

Example response:
\`\`\`json
{
  "success": true,
  "filePath": "/path/to/MyApp_LoginScreen_Empty_2025-01-24.png",
  "operation": "screenshot",
  "guidance": [
    "Screenshot saved successfully",
    "File: /path/to/MyApp_LoginScreen_Empty_2025-01-24.png",
    "Use 'screenshot' tool for inline base64 variant with coordinate metadata"
  ]
}
\`\`\`

## Related Tools

- **screenshot**: Inline base64 screenshots with vision model optimization
- **simctl-io**: Direct I/O operations (supports both screenshot and video)
- **simctl-addmedia**: Add images/videos to simulator photo library

## Implementation Note

This tool is registered as an alias in \`src/index.ts\` and delegates directly to the \`simctl-io\` tool implementation. It exists for clarity and convenience - the name makes the file-based behavior explicit.

## Notes

- Auto-detects booted simulator if udid not provided
- Semantic naming helps organize test artifacts
- Video recording runs until stopped (Ctrl+C)
- Screenshots saved as PNG by default
- File paths are absolute and returned in response
`;

export const RTFM_DOCS = `
# rtfm

📖 **Read The Manual** - Progressive disclosure documentation system for all XC-MCP tools.

## Overview

The rtfm tool provides access to comprehensive documentation for any of the 51 tools in this MCP server. This implements progressive disclosure: tool descriptions in the main list stay concise (300-400 tokens), while full documentation with examples, parameters, and usage guidance is available on demand.

## Why rtfm?

**Problem Solved**: Tool documentation was originally stored in .md files within the src/ directory, which wouldn't be available in the published npm package (only dist/ is included in package.json "files" field).

**Solution**: Documentation is now embedded as TypeScript constants in each tool file, bundled into the compiled JavaScript, and accessible via this rtfm tool. This ensures documentation is always available, whether in development or in the published npm package.

## Parameters

- **toolName** (required): Name of the tool to get documentation for
  - Examples: "xcodebuild-build", "simctl-boot", "idb-ui-tap", "rtfm"
  - Case-sensitive, must match exact tool registration name

## Examples

\`\`\`typescript
// Get documentation for xcodebuild-build
rtfm({ toolName: "xcodebuild-build" })

// Get documentation for simctl-boot
rtfm({ toolName: "simctl-boot" })

// Get documentation for this tool (meta!)
rtfm({ toolName: "rtfm" })
\`\`\`

## Response Format

### Success Response
Returns full markdown documentation including:
- Tool description and purpose
- Advantages over direct CLI usage
- Parameter specifications with types and descriptions
- Usage examples
- Related tools
- Common patterns and best practices

### Tool Not Found Response
If toolName doesn't match any registered tool:
- Error message with the attempted tool name
- Suggestions based on partial matches (up to 5)
- Complete list of all available tools

Example:
\`\`\`
No documentation found for tool: "simctl-boo"

Did you mean one of these?
  - simctl-boot
  - simctl-shutdown

Available tools (51 total):
  - cache-clear
  - cache-get-config
  ...
\`\`\`

## Available Tool Categories

**Xcodebuild Tools (7)**
- xcodebuild-version, xcodebuild-list, xcodebuild-showsdks
- xcodebuild-build, xcodebuild-clean, xcodebuild-test
- xcodebuild-get-details

**Simctl Lifecycle Tools (11)**
- simctl-list, simctl-get-details, simctl-boot, simctl-shutdown
- simctl-suggest, simctl-create, simctl-delete, simctl-erase
- simctl-clone, simctl-rename, simctl-health-check

**Simctl App Management Tools (6)**
- simctl-install, simctl-uninstall, simctl-get-app-container
- simctl-launch, simctl-terminate, simctl-openurl

**Simctl I/O & Testing Tools (7)**
- simctl-io, simctl-addmedia, simctl-privacy, simctl-push
- simctl-pbcopy, simctl-status-bar, screenshot

**IDB Tools (11)**
- idb-targets, idb-connect
- idb-ui-tap, idb-ui-input, idb-ui-gesture, idb-ui-describe
- idb-list-apps, idb-install, idb-launch, idb-terminate, idb-uninstall

**Cache Management Tools (5)**
- list-cached-responses, cache-get-stats, cache-get-config
- cache-set-config, cache-clear

**Persistence Tools (3)**
- persistence-enable, persistence-disable, persistence-status

**Documentation Tool (1)**
- rtfm (this tool!)

## Implementation Details

### Documentation Storage
Each tool file exports a \`TOOL_NAME_DOCS\` constant containing its full documentation in markdown format:

\`\`\`typescript
// Example from src/tools/simctl/boot.ts
export const SIMCTL_BOOT_DOCS = \`
# simctl-boot
...
\`;
\`\`\`

### Central Registry
All documentation constants are imported and mapped in \`src/tools/docs-registry.ts\`:

\`\`\`typescript
export const TOOL_DOCS: Record<string, string> = {
  'simctl-boot': SIMCTL_BOOT_DOCS,
  'xcodebuild-build': XCODEBUILD_BUILD_DOCS,
  // ... 49 more tools
};
\`\`\`

### Progressive Disclosure Pattern
1. Tool list shows concise descriptions (~300-400 tokens)
2. Each description ends with: "📖 Use rtfm with toolName: '{name}' for full documentation."
3. Full documentation accessed only when explicitly requested via rtfm
4. Prevents token overflow while maintaining comprehensive documentation access

## Benefits

✅ **Self-contained**: No external file dependencies
✅ **NPM package ready**: Documentation bundled in compiled JavaScript
✅ **Token efficient**: Progressive disclosure keeps default views concise
✅ **Always available**: Works in development and production
✅ **Type-safe**: TypeScript constants with proper typing
✅ **Searchable**: Fuzzy matching with suggestions for typos
✅ **Comprehensive**: Full documentation including examples and parameters

## Common Use Cases

**Explore available tools**:
\`\`\`typescript
// Intentionally use invalid tool name to see full list
rtfm({ toolName: "help" })
\`\`\`

**Learn specific tool usage**:
\`\`\`typescript
rtfm({ toolName: "simctl-boot" })
\`\`\`

**Understand tool parameters**:
\`\`\`typescript
rtfm({ toolName: "xcodebuild-build" })
\`\`\`

**Find related tools**:
\`\`\`typescript
// Search by category prefix
rtfm({ toolName: "simctl" })  // Shows simctl-* suggestions
\`\`\`

## Related Tools

- **list-cached-responses**: View cached progressive disclosure responses
- **cache-get-stats**: Monitor cache performance and usage

## Notes

- Tool names are case-sensitive and must match exact registration names
- Fuzzy matching provides suggestions for close matches
- Documentation format is consistent markdown across all tools
- Each tool's documentation is independently maintained in its source file
- The TOOL_DOCS registry is automatically updated when tools are added/removed
`;

