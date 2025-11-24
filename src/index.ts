#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Import tool implementations
import { xcodebuildVersionTool } from './tools/xcodebuild/version.js';
import { xcodebuildListTool } from './tools/xcodebuild/list.js';
// COMMENTED OUT (v2.0.0): xcodebuild-showsdks - static environment info, agents can use defaults
// import { xcodebuildShowSDKsTool } from './tools/xcodebuild/showsdks.js';
import { xcodebuildBuildTool } from './tools/xcodebuild/build.js';
import { xcodebuildCleanTool } from './tools/xcodebuild/clean.js';
import { xcodebuildTestTool } from './tools/xcodebuild/xcodebuild-test.js';
import { xcodebuildGetDetailsTool } from './tools/xcodebuild/get-details.js';
import { simctlListTool } from './tools/simctl/list.js';
import { simctlGetDetailsTool } from './tools/simctl/get-details.js';
import { simctlDeviceTool } from './tools/simctl/device/index.js';
// COMMENTED OUT (v2.0.0): simctl-suggest - agents have explicit requirements, redundant with simctl-list
// import { simctlSuggestTool } from './tools/simctl/suggest.js';
import { simctlAppTool } from './tools/simctl/app/index.js';
import { simctlGetAppContainerTool } from './tools/simctl/get-app-container.js';
import { simctlOpenUrlTool } from './tools/simctl/openurl.js';
import { simctlIoTool } from './tools/simctl/io.js';
// COMMENTED OUT (v2.0.0): simctl-addmedia - niche scenario for photo picker apps
// import { simctlAddmediaTool } from './tools/simctl/addmedia.js';
// COMMENTED OUT (v2.0.0): simctl-privacy - permission testing rarely needed in CI/automated testing
// import { simctlPrivacyTool } from './tools/simctl/privacy.js';
import { simctlPushTool } from './tools/simctl/push.js';
// COMMENTED OUT (v2.0.0): simctl-pbcopy - can type text instead via idb-ui-input, extremely niche
// import { simctlPbcopyTool } from './tools/simctl/pbcopy.js';
// COMMENTED OUT (v2.0.0): simctl-status-bar - cosmetic screenshot enhancement, not needed for app development
// import { simctlStatusBarTool } from './tools/simctl/status-bar.js';
import { simctlScreenshotInlineTool } from './tools/simctl/screenshot-inline.js';
import { simctlHealthCheckTool } from './tools/simctl/health-check.js';
import { idbTargetsRouter } from './tools/idb/targets/index.js';
import { idbUiTapTool } from './tools/idb/ui-tap.js';
import { idbUiInputTool } from './tools/idb/ui-input.js';
import { idbUiGestureTool } from './tools/idb/ui-gesture.js';
import { idbUiDescribeTool } from './tools/idb/ui-describe.js';
import { idbUiFindElementTool } from './tools/idb/ui-find-element.js';
import { accessibilityQualityCheckTool } from './tools/idb/accessibility-quality-check.js';
import { idbListAppsTool } from './tools/idb/list-apps.js';
import { idbAppTool } from './tools/idb/app/index.js';
// COMMENTED OUT (v2.0.0): list-cached-responses - meta tool for debugging cache, not needed by agents
// import { listCachedResponsesTool } from './tools/cache/list-cached.js';
import { cacheTool } from './tools/cache/index.js';
import { persistenceTool } from './tools/persistence/index.js';
import { getToolDocsTool } from './tools/get-tool-docs.js';
import { toolSearchTool } from './tools/tool-search.js';
import { workflowTapElementTool } from './tools/workflows/tap-element.js';
import { workflowFreshInstallTool } from './tools/workflows/fresh-install.js';
import { debugWorkflowPrompt } from './tools/prompts/debug-workflow.js';
import { validateXcodeInstallation } from './utils/validation.js';

// Type for registered tool from MCP SDK
type RegisteredTool = {
  enabled: boolean;
  enable(): void;
  disable(): void;
};

// Core tools that are always enabled (discovery tools only)
const CORE_TOOLS = ['tool-search', 'rtfm'];

// Environment variable to disable deferred loading (loads all tools like v2.x)
const DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';

class XcodeCLIMCPServer {
  private server: McpServer;
  private toolRegistry: Map<string, RegisteredTool> = new Map();

  /**
   * Helper to register a tool and store its reference for deferred loading
   */
  private registerAndStore(name: string, config: any, handler: (args: any) => Promise<any>): void {
    const tool = this.server.registerTool(name, config, handler);
    this.toolRegistry.set(name, tool as unknown as RegisteredTool);
  }

  constructor() {
    this.server = new McpServer(
      {
        name: 'xc-mcp',
        version: '3.0.0',
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
    // Xcodebuild Tools (7 total)
    this.registerAndStore(
      'xcodebuild-version',
      {
        description: 'Get Xcode version.',
        inputSchema: {
          sdk: z.string().optional(),
          outputFormat: z.enum(['json', 'text']).default('json'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await xcodebuildVersionTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'xcodebuild-list',
      {
        description: 'List project targets and schemes.',
        inputSchema: {
          projectPath: z.string(),
          outputFormat: z.enum(['json', 'text']).default('json'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await xcodebuildListTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // COMMENTED OUT (v2.0.0): xcodebuild-showsdks
    // this.server.registerTool(
    //   'xcodebuild-showsdks',
    //   {
    //     description: 'List available SDKs.',
    //     inputSchema: {
    //       outputFormat: z.enum(['json', 'text']).default('json'),
    //     },
    //   },
    //   async args => {
    //     try {
    //       await validateXcodeInstallation();
    //       return await xcodebuildShowSDKsTool(args);
    //     } catch (error) {
    //       if (error instanceof McpError) throw error;
    //       throw new McpError(
    //         ErrorCode.InternalError,
    //         `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    //       );
    //     }
    //   }
    // );

    this.registerAndStore(
      'xcodebuild-build',
      {
        description: 'Build Xcode projects.',
        inputSchema: {
          projectPath: z.string(),
          scheme: z.string(),
          configuration: z.string().default('Debug'),
          destination: z.string().optional(),
          sdk: z.string().optional(),
          derivedDataPath: z.string().optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await xcodebuildBuildTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'xcodebuild-clean',
      {
        description: 'Clean build artifacts.',
        inputSchema: {
          projectPath: z.string(),
          scheme: z.string(),
          configuration: z.string().optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await xcodebuildCleanTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'xcodebuild-test',
      {
        description: 'Run tests.',
        inputSchema: {
          projectPath: z.string(),
          scheme: z.string(),
          configuration: z.string().default('Debug'),
          destination: z.string().optional(),
          sdk: z.string().optional(),
          derivedDataPath: z.string().optional(),
          testPlan: z.string().optional(),
          onlyTesting: z.array(z.string()).optional(),
          skipTesting: z.array(z.string()).optional(),
          testWithoutBuilding: z.boolean().default(false),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await xcodebuildTestTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'xcodebuild-get-details',
      {
        description: 'Get cached build/test details.',
        inputSchema: {
          buildId: z.string(),
          detailType: z.enum([
            'full-log',
            'errors-only',
            'warnings-only',
            'summary',
            'command',
            'metadata',
          ]),
          maxLines: z.number().default(100),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await xcodebuildGetDetailsTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Simctl Tools (4 total) - Critical for progressive disclosure
    this.registerAndStore(
      'simctl-list',
      {
        description: 'List simulators.',
        inputSchema: {
          deviceType: z.string().optional(),
          runtime: z.string().optional(),
          availability: z.enum(['available', 'unavailable', 'all']).default('available'),
          outputFormat: z.enum(['json', 'text']).default('json'),
          concise: z.boolean().default(true),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlListTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'simctl-get-details',
      {
        description: 'Get cached simulator list details.',
        inputSchema: {
          cacheId: z.string(),
          detailType: z.enum(['full-list', 'devices-only', 'runtimes-only', 'available-only']),
          deviceType: z.string().optional(),
          runtime: z.string().optional(),
          maxDevices: z.number().default(20),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlGetDetailsTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'simctl-device',
      {
        description: 'Manage simulator devices.',
        inputSchema: {
          operation: z.enum(['boot', 'shutdown', 'create', 'delete', 'erase', 'clone', 'rename']),
          deviceId: z.string().optional(),
          waitForBoot: z.boolean().default(true),
          openGui: z.boolean().default(true),
          name: z.string().optional(),
          deviceType: z.string().optional(),
          runtime: z.string().optional(),
          force: z.boolean().default(false),
          newName: z.string().optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlDeviceTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // COMMENTED OUT (v2.0.0): simctl-suggest
    // this.server.registerTool(
    //   'simctl-suggest',
    //   {
    //     description: 'Recommend best simulators.',
    //     inputSchema: {
    //       projectPath: z.string().optional(),
    //       deviceType: z.string().optional(),
    //       maxSuggestions: z.number().default(4),
    //       autoBootTopSuggestion: z.boolean().default(false),
    //     },
    //   },
    //   async args => {
    //     try {
    //       await validateXcodeInstallation();
    //       return await simctlSuggestTool(args);
    //     } catch (error) {
    //       if (error instanceof McpError) throw error;
    //       throw new McpError(
    //         ErrorCode.InternalError,
    //         `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    //       );
    //     }
    //   }
    // );

    this.registerAndStore(
      'simctl-health-check',
      {
        description: 'Validate iOS development environment.',
        inputSchema: {},
      },
      async _args => {
        try {
          await validateXcodeInstallation();
          return await simctlHealthCheckTool();
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Phase 3: App Lifecycle & Testing Tools
    // Consolidated App Management Tool
    this.registerAndStore(
      'simctl-app',
      {
        description: 'Manage apps on simulators.',
        inputSchema: {
          operation: z.enum(['install', 'uninstall', 'launch', 'terminate']),
          udid: z.string().optional(),
          bundleId: z.string().optional(),
          appPath: z.string().optional(),
          arguments: z.array(z.string()).optional(),
          environment: z.record(z.string()).optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlAppTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'simctl-get-app-container',
      {
        description: 'Get app container filesystem path.',
        inputSchema: {
          udid: z.string(),
          bundleId: z.string(),
          containerType: z.enum(['bundle', 'data', 'group']).optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlGetAppContainerTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'simctl-openurl',
      {
        description: 'Open URL in simulator.',
        inputSchema: {
          udid: z.string(),
          url: z.string(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlOpenUrlTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // I/O Tools
    this.registerAndStore(
      'simctl-io',
      {
        description: 'Capture screenshots/videos.',
        inputSchema: {
          udid: z.string(),
          operation: z.enum(['screenshot', 'video']),
          outputPath: z.string().optional(),
          size: z.enum(['full', 'half', 'quarter', 'thumb']).optional(),
          codec: z.enum(['h264', 'hevc', 'prores']).optional(),
          appName: z.string().optional(),
          screenName: z.string().optional(),
          state: z.string().optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlIoTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // COMMENTED OUT (v2.0.0): simctl-addmedia
    // this.server.registerTool(
    //   'simctl-addmedia',
    //   {
    //     description: 'Add media to photo library.',
    //     inputSchema: {
    //       udid: z.string(),
    //       mediaPath: z.string(),
    //     },
    //   },
    //   async args => {
    //     try {
    //       await validateXcodeInstallation();
    //       return await simctlAddmediaTool(args);
    //     } catch (error) {
    //       if (error instanceof McpError) throw error;
    //       throw new McpError(
    //         ErrorCode.InternalError,
    //         `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    //       );
    //     }
    //   }
    // );

    // Advanced Testing Tools
    // COMMENTED OUT (v2.0.0): simctl-privacy
    // this.server.registerTool(
    //   'simctl-privacy',
    //   {
    //     description: 'Manage app permissions.',
    //     inputSchema: {
    //       udid: z.string(),
    //       bundleId: z.string(),
    //       action: z.enum(['grant', 'revoke', 'reset']),
    //       service: z.string(),
    //       scenario: z.string().optional(),
    //       step: z.number().optional(),
    //     },
    //   },
    //   async args => {
    //     try {
    //       await validateXcodeInstallation();
    //       return await simctlPrivacyTool(args);
    //     } catch (error) {
    //       if (error instanceof McpError) throw error;
    //       throw new McpError(
    //         ErrorCode.InternalError,
    //         `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    //       );
    //     }
    //   }
    // );

    this.registerAndStore(
      'simctl-push',
      {
        description: 'Simulate push notifications.',
        inputSchema: {
          udid: z.string(),
          bundleId: z.string(),
          payload: z.string(),
          testName: z.string().optional(),
          expectedBehavior: z.string().optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlPushTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // COMMENTED OUT (v2.0.0): simctl-pbcopy
    // this.server.registerTool(
    //   'simctl-pbcopy',
    //   {
    //     description: 'Copy text to clipboard.',
    //     inputSchema: {
    //       udid: z.string(),
    //       text: z.string(),
    //     },
    //   },
    //   async args => {
    //     try {
    //       await validateXcodeInstallation();
    //       return await simctlPbcopyTool(args);
    //     } catch (error) {
    //       if (error instanceof McpError) throw error;
    //       throw new McpError(
    //         ErrorCode.InternalError,
    //         `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    //       );
    //     }
    //   }
    // );

    // COMMENTED OUT (v2.0.0): simctl-status-bar
    // this.server.registerTool(
    //   'simctl-status-bar',
    //   {
    //     description: 'Override status bar.',
    //     inputSchema: {
    //       udid: z.string(),
    //       operation: z.enum(['override', 'clear']),
    //       time: z.string().optional(),
    //       dataNetwork: z.string().optional(),
    //       wifiMode: z.string().optional(),
    //       batteryState: z.string().optional(),
    //       batteryLevel: z.number().min(0).max(100).optional(),
    //     },
    //   },
    //   async args => {
    //     try {
    //       await validateXcodeInstallation();
    //       return await simctlStatusBarTool(args);
    //     } catch (error) {
    //       if (error instanceof McpError) throw error;
    //       throw new McpError(
    //         ErrorCode.InternalError,
    //         `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    //       );
    //     }
    //   }
    // );
    this.registerAndStore(
      'screenshot',
      {
        description:
          'Capture screenshot as base64 (use only when accessibility tree is insufficient - see idb-ui-describe first for faster queries).',
        inputSchema: {
          udid: z.string().optional(),
          size: z.enum(['full', 'half', 'quarter', 'thumb']).optional(),
          appName: z.string().optional(),
          screenName: z.string().optional(),
          state: z.string().optional(),
          enableCoordinateCaching: z.boolean().optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlScreenshotInlineTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // IDB Tools - iOS Development Bridge for UI Automation & App Management
    this.registerAndStore(
      'idb-targets',
      {
        description: 'Query and manage IDB targets.',
        inputSchema: {
          operation: z.enum(['list', 'describe', 'focus', 'connect', 'disconnect']),
          udid: z.string().optional(),
          state: z.enum(['Booted', 'Shutdown']).optional(),
          type: z.enum(['device', 'simulator']).optional(),
        },
      },
      async args => idbTargetsRouter(args)
    );

    this.registerAndStore(
      'idb-ui-tap',
      {
        description: 'Tap coordinates.',
        inputSchema: {
          udid: z.string().optional(),
          x: z.number(),
          y: z.number(),
          numberOfTaps: z.number().default(1),
          duration: z.number().optional(),
          applyScreenshotScale: z.boolean().optional(),
          screenshotScaleX: z.number().optional(),
          screenshotScaleY: z.number().optional(),
          actionName: z.string().optional(),
          screenContext: z.string().optional(),
          expectedOutcome: z.string().optional(),
          testScenario: z.string().optional(),
          step: z.number().optional(),
        },
      },
      async args => idbUiTapTool(args)
    );

    this.registerAndStore(
      'idb-ui-input',
      {
        description: 'Input text/keyboard.',
        inputSchema: {
          udid: z.string().optional(),
          operation: z.enum(['text', 'key', 'key-sequence']),
          text: z.string().optional(),
          key: z
            .enum([
              'home',
              'lock',
              'siri',
              'delete',
              'return',
              'space',
              'escape',
              'tab',
              'up',
              'down',
              'left',
              'right',
            ])
            .optional(),
          keySequence: z.array(z.string()).optional(),
          actionName: z.string().optional(),
          fieldContext: z.string().optional(),
          expectedOutcome: z.string().optional(),
          isSensitive: z.boolean().optional(),
        },
      },
      async args => idbUiInputTool(args)
    );

    this.registerAndStore(
      'idb-ui-gesture',
      {
        description: 'Perform gestures/buttons.',
        inputSchema: {
          udid: z.string().optional(),
          operation: z.enum(['swipe', 'button']),
          direction: z.enum(['up', 'down', 'left', 'right']).optional(),
          startX: z.number().optional(),
          startY: z.number().optional(),
          endX: z.number().optional(),
          endY: z.number().optional(),
          duration: z
            .number()
            .default(200)
            .describe('Swipe duration in milliseconds (e.g., 200 for 200ms, default: 200ms)'),
          buttonType: z
            .enum(['HOME', 'LOCK', 'SIDE_BUTTON', 'APPLE_PAY', 'SIRI', 'SCREENSHOT', 'APP_SWITCH'])
            .optional(),
          actionName: z.string().optional(),
          expectedOutcome: z.string().optional(),
        },
      },
      async args => idbUiGestureTool(args)
    );

    this.registerAndStore(
      'idb-ui-describe',
      {
        description:
          'Query UI accessibility tree for tap coordinates (ACCESSIBILITY-FIRST: 3-4x faster and cheaper than screenshots).',
        inputSchema: {
          udid: z.string().optional(),
          operation: z.enum(['all', 'point']),
          x: z.number().optional(),
          y: z.number().optional(),
          screenContext: z.string().optional(),
          purposeDescription: z.string().optional(),
        },
      },
      async args => idbUiDescribeTool(args)
    );

    this.registerAndStore(
      'idb-ui-find-element',
      {
        description:
          'Find UI element by label/identifier - semantic search in accessibility tree without screenshots.',
        inputSchema: {
          udid: z.string().optional(),
          query: z.string(),
        },
      },
      async args => idbUiFindElementTool(args)
    );

    this.registerAndStore(
      'accessibility-quality-check',
      {
        description:
          'Quick check if accessibility data is sufficient - avoid expensive screenshots (~80ms, costs 5x less than screenshot).',
        inputSchema: {
          udid: z.string().optional(),
          screenContext: z.string().optional(),
        },
      },
      async args => accessibilityQualityCheckTool(args)
    );

    this.registerAndStore(
      'idb-list-apps',
      {
        description: 'List installed apps.',
        inputSchema: {
          udid: z.string().optional(),
          filterType: z.enum(['system', 'user', 'internal']).optional(),
          runningOnly: z.boolean().optional(),
        },
      },
      async args => idbListAppsTool(args)
    );

    this.registerAndStore(
      'idb-app',
      {
        description: 'Manage apps via IDB.',
        inputSchema: {
          operation: z.enum(['install', 'uninstall', 'launch', 'terminate']),
          udid: z.string().optional(),
          bundleId: z.string().optional(),
          appPath: z.string().optional(),
          streamOutput: z.boolean().optional(),
          arguments: z.array(z.string()).optional(),
          environment: z.record(z.string()).optional(),
        },
      },
      async args => idbAppTool(args)
    );

    // Cache Management Tools
    // COMMENTED OUT (v2.0.0): list-cached-responses
    // this.registerAndStore(
    //   'list-cached-responses',
    //   {
    //     description: 'List cached responses.',
    //     inputSchema: {
    //       tool: z.string().optional(),
    //       limit: z.number().default(10),
    //     },
    //   },
    //   async args => {
    //     try {
    //       await validateXcodeInstallation();
    //       return (await listCachedResponsesTool(args)) as any;
    //     } catch (error) {
    //       if (error instanceof McpError) throw error;
    //       throw new McpError(
    //         ErrorCode.InternalError,
    //         `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    //       );
    //     }
    //   }
    // );

    this.registerAndStore(
      'cache',
      {
        description: 'Manage cache configuration.',
        inputSchema: {
          operation: z.enum(['get-stats', 'get-config', 'set-config', 'clear']),
          cacheType: z.enum(['simulator', 'project', 'response', 'all']).optional(),
          maxAgeMs: z.number().optional(),
          maxAgeMinutes: z.number().optional(),
          maxAgeHours: z.number().optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await cacheTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Persistence Tools
    this.registerAndStore(
      'persistence',
      {
        description: 'Manage cache persistence.',
        inputSchema: {
          operation: z.enum(['enable', 'disable', 'status']),
          cacheDir: z.string().optional(),
          clearData: z.boolean().default(false),
          includeStorageInfo: z.boolean().default(true),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await persistenceTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Tool Search - Dynamic tool discovery (v3.0.0)
    this.registerAndStore(
      'tool-search',
      {
        description:
          'Search and discover xc-mcp tools by keyword, category, or list all. Use this to find the right tool for your task.',
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe('Search term (searches name, description, keywords)'),
          category: z
            .enum(['build', 'simulator', 'app', 'idb', 'io', 'cache', 'system', 'workflow'])
            .optional()
            .describe('Filter by category'),
          limit: z.number().default(10).describe('Max results'),
          showAll: z.boolean().default(false).describe('Show all tools'),
        },
      },
      async args => {
        try {
          const result = await toolSearchTool(args);

          // Auto-enable matched tools if deferred loading is active
          if (DEFER_LOADING && !args.showAll) {
            const response = JSON.parse(result.content[0].text);
            if (response.tools) {
              for (const tool of response.tools) {
                const registeredTool = this.toolRegistry.get(tool.name);
                if (registeredTool && !registeredTool.enabled) {
                  registeredTool.enable();
                }
              }
              // Notify client that tool list changed
              if (response.tools.length > 0) {
                this.server.sendToolListChanged();
              }
            }
          }

          return result as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Documentation Tool
    this.registerAndStore(
      'rtfm',
      {
        description:
          'Important!! Use this tool to fetch the documentation about any of the other tools. When called with the name of any other tool, it will return the full documentation for that tool. ',
        inputSchema: {
          toolName: z.string().optional(),
          categoryName: z.string().optional(),
        },
      },
      async args => {
        try {
          return (await getToolDocsTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Workflow Tools (v3.0.0) - Multi-step orchestration
    this.registerAndStore(
      'workflow-tap-element',
      {
        description:
          'High-level semantic UI tap - find element by name and tap it. Orchestrates accessibility check, element search, and tap in one call.',
        inputSchema: {
          elementQuery: z.string().describe('Search term for element (e.g., "Login", "Submit")'),
          inputText: z.string().optional().describe('Text to type after tapping'),
          verifyResult: z.boolean().default(false).describe('Take screenshot after action'),
          udid: z.string().optional().describe('Target device'),
          screenContext: z.string().optional().describe('Screen name for tracking'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await workflowTapElementTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.registerAndStore(
      'workflow-fresh-install',
      {
        description:
          'Clean slate app installation - shutdown, (erase), boot, build, install, launch in one call.',
        inputSchema: {
          projectPath: z.string().describe('Path to .xcodeproj or .xcworkspace'),
          scheme: z.string().describe('Build scheme name'),
          simulatorUdid: z.string().optional().describe('Target simulator'),
          eraseSimulator: z.boolean().default(false).describe('Wipe simulator data'),
          configuration: z.enum(['Debug', 'Release']).default('Debug'),
          launchArguments: z.array(z.string()).optional(),
          environmentVariables: z.record(z.string()).optional(),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await workflowFreshInstallTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Apply deferred loading: disable non-core tools (v3.0.0)
    if (DEFER_LOADING) {
      for (const [name, tool] of this.toolRegistry) {
        if (!CORE_TOOLS.includes(name)) {
          tool.disable();
        }
      }
      console.error(
        `XC-MCP v3.0.0: Deferred loading active. ${CORE_TOOLS.length} core tools enabled, ${this.toolRegistry.size - CORE_TOOLS.length} tools available via tool-search.`
      );
    } else {
      console.error(
        `XC-MCP v3.0.0: Full loading active (XC_MCP_DEFER_LOADING=false). All ${this.toolRegistry.size} tools enabled.`
      );
    }
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
