#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { registerAllTools } from './registry/index.js';
import { debugWorkflowPrompt } from './tools/prompts/debug-workflow.js';
import { config } from './config.js';

class XcodeCLIMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer(
      {
        name: 'xc-mcp',
        version: '3.2.1',
        description:
          'Wraps xcodebuild, simctl, and IDB with intelligent caching, for efficient iOS development. The RTFM tool can be called with any of the tool names to return further documentation if required. Tool descriptions are intentionally minimal to reduce MCP context usage.',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
        instructions: `# XC-MCP: Accessibility-First Automation Workflow

## Core Strategy: Always Query Accessibility Tree First

XC-MCP is optimized for **accessibility-driven automation** - querying the UI accessibility tree is 3-4x faster and cheaper than screenshots.

### Recommended Workflow

1. **Query Accessibility Tree** (ALWAYS START HERE)
   - Use: \`idb-ui-describe\` with operation \`all\` to get full element tree
   - Get: Tap-ready coordinates (centerX, centerY), element labels, types
   - Cost: ~50 tokens, 120ms response time
   - When to use: 95% of automation tasks

2. **Check Accessibility Quality** (Optional Quick Assessment)
   - Use: \`accessibility-quality-check\` for rapid richness assessment
   - Get: Quality score + recommendation (accessibility-ready or screenshot-needed)
   - Cost: ~30 tokens, 80ms response time
   - When: If unsure whether accessibility data is sufficient

3. **Semantic Element Search** (Alternative Discovery)
   - Use: \`idb-ui-find-element\` to search by label or identifier
   - Get: Matching elements filtered from accessibility tree
   - Cost: ~40 tokens, 100ms response time
   - When: Looking for specific element in complex UI

4. **Only Use Screenshots as Fallback** (10% of cases)
   - Use: \`screenshot\` (simctl-screenshot-inline) when accessibility data is minimal
   - Get: Visual context for complex layouts or custom UI
   - Cost: ~170 tokens, 2000ms response time
   - When: Accessibility tree insufficient, visual analysis required

### Why This Matters

- **3-4x faster**: Accessibility queries (100-120ms) vs screenshots (2000ms)
- **80% cheaper**: ~50 tokens vs ~170 tokens per query
- **More reliable**: Accessibility tree survives app theme/layout changes
- **Works offline**: No visual processing needed, pure data queries

### Key Tools Reference

**Accessibility Tree (USE FIRST):**
- \`idb-ui-describe\` - Query full tree or specific point
- \`idb-ui-find-element\` - Semantic element search
- \`accessibility-quality-check\` - Quick richness assessment

**Interaction:**
- \`idb-ui-tap\` - Tap at coordinates from accessibility tree
- \`idb-ui-input\` - Type in text fields by identifier
- \`idb-ui-gesture\` - Swipe, button presses, complex gestures

**Screenshots (Fallback Only):**
- \`screenshot\` - Base64 screenshot with optional accessibility data
- Use only when accessibility tree says data is minimal

### Progressive Disclosure

Large outputs use cache IDs (returned in response) - use \`xcodebuild-get-details\`, \`simctl-get-details\`, or \`idb-get-details\` to drill into full results.

### Documentation Discovery

Call \`rtfm\` with tool name for full documentation. Example: \`rtfm({ toolName: "idb-ui-describe" })\``,
      }
    );

    this.registerTools();
    this.registerPrompts();
    this.setupErrorHandling();
  }

  private async registerTools() {
    // Register all tools via modular registry
    registerAllTools(this.server);

    console.error(
      `XC-MCP v3.2.0: descriptions=${config.minimalDescriptions ? 'mini' : 'full'}, defer_loading=${config.deferLoading ? 'enabled' : 'disabled'}, build_only=${config.buildOnly ? 'enabled' : 'disabled'}`
    );
  }

  private async registerPrompts() {
    // Debug workflow prompt
    this.server.registerPrompt(
      'debug-workflow',
      {
        description:
          'Complete iOS debug workflow: build → install → test cycle with validation to prevent testing stale app versions',
        argsSchema: {
          projectPath: z.string(),
          scheme: z.string(),
          simulator: z.string().optional(),
        },
      },
      async args => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (await debugWorkflowPrompt(args)) as any;
      }
    );
  }

  private setupErrorHandling() {
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Xcode CLI MCP server running on stdio');
  }
}

const server = new XcodeCLIMCPServer();
server.run().catch(console.error);
