#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Import tool implementations
import { xcodebuildVersionTool } from './tools/xcodebuild/version.js';
import { xcodebuildListTool } from './tools/xcodebuild/list.js';
import { xcodebuildShowSDKsTool } from './tools/xcodebuild/showsdks.js';
import { xcodebuildBuildTool } from './tools/xcodebuild/build.js';
import { xcodebuildCleanTool } from './tools/xcodebuild/clean.js';
import { xcodebuildGetDetailsTool } from './tools/xcodebuild/get-details.js';
import { simctlListTool } from './tools/simctl/list.js';
import { simctlGetDetailsTool } from './tools/simctl/get-details.js';
import { simctlBootTool } from './tools/simctl/boot.js';
import { simctlShutdownTool } from './tools/simctl/shutdown.js';
import { listCachedResponsesTool } from './tools/cache/list-cached.js';
import {
  getCacheStatsTool,
  setCacheConfigTool,
  clearCacheTool,
  getCacheConfigTool,
} from './tools/cache/cache-management.js';
import {
  persistenceEnableTool,
  persistenceDisableTool,
  persistenceStatusTool,
} from './tools/persistence/persistence-tools.js';
import { debugWorkflowPrompt } from './tools/prompts/debug-workflow.js';
import { validateXcodeInstallation } from './utils/validation.js';

class XcodeCLIMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer(
      {
        name: 'xc-mcp',
        version: '1.0.5',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.registerTools();
    this.registerPrompts();
    this.setupErrorHandling();
  }

  private async registerTools() {
    // Xcodebuild Tools (6 total)
    this.server.registerTool(
      'xcodebuild-version',
      {
        description: `⚡ **Prefer this over 'xcodebuild -version'** - Gets Xcode version info with structured output and caching.

Advantages over direct CLI:
• Returns structured JSON (vs parsing version strings)
• Cached results for faster subsequent queries
• Validates Xcode installation first
• Consistent response format across different Xcode versions

Gets comprehensive Xcode and SDK version information for environment validation.`,
        inputSchema: {
          sdk: z.string().optional().describe('Specific SDK to query (optional)'),
          outputFormat: z
            .enum(['json', 'text'])
            .default('json')
            .describe('Output format preference'),
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

    this.server.registerTool(
      'xcodebuild-list',
      {
        description: `⚡ **Prefer this over 'xcodebuild -list'** - Gets structured project information with intelligent caching.

Advantages over direct CLI:
• Returns clean JSON (vs parsing raw xcodebuild output)
• 1-hour intelligent caching prevents expensive re-runs
• Validates Xcode installation and provides clear error messages
• Consistent response format across all project types

Lists targets, schemes, and configurations for Xcode projects and workspaces with smart caching that remembers results to avoid redundant operations.`,
        inputSchema: {
          projectPath: z.string().describe('Path to .xcodeproj or .xcworkspace file'),
          outputFormat: z
            .enum(['json', 'text'])
            .default('json')
            .describe('Output format preference'),
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

    this.server.registerTool(
      'xcodebuild-showsdks',
      {
        description: `⚡ **Prefer this over 'xcodebuild -showsdks'** - Gets available SDKs with intelligent caching and structured output.

Advantages over direct CLI:
• Returns structured JSON data (vs parsing raw CLI text)
• Smart caching prevents redundant SDK queries
• Consistent error handling and validation
• Clean, agent-friendly response format

Shows all available SDKs for iOS, macOS, watchOS, and tvOS development.`,
        inputSchema: {
          outputFormat: z
            .enum(['json', 'text'])
            .default('json')
            .describe('Output format preference'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await xcodebuildShowSDKsTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.server.registerTool(
      'xcodebuild-build',
      {
        description: `⚡ **Prefer this over raw 'xcodebuild'** - Intelligent building with learning, caching, and performance tracking.

Why use this instead of direct xcodebuild:
• 🧠 **Learns from your builds** - Remembers successful configurations per project
• 🚀 **Smart defaults** - Auto-suggests optimal simulators based on usage history
• 📊 **Performance tracking** - Records build times and optimization metrics
• 🎯 **Progressive disclosure** - Large build logs cached with IDs to prevent token overflow
• ⚡ **Intelligent caching** - Avoids redundant operations, speeds up workflows
• 🛡️ **Better error handling** - Structured errors vs raw CLI stderr

Features smart caching that remembers your last successful build configuration and suggests optimal simulators.`,
        inputSchema: {
          projectPath: z.string().describe('Path to .xcodeproj or .xcworkspace file'),
          scheme: z.string().describe('Build scheme name'),
          configuration: z
            .string()
            .default('Debug')
            .describe('Build configuration (Debug, Release, etc.)'),
          destination: z
            .string()
            .optional()
            .describe(
              'Build destination. If not provided, uses intelligent defaults based on project history and available simulators.'
            ),
          sdk: z
            .string()
            .optional()
            .describe('SDK to use for building (e.g., "iphonesimulator", "iphoneos")'),
          derivedDataPath: z.string().optional().describe('Custom derived data path'),
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

    this.server.registerTool(
      'xcodebuild-clean',
      {
        description: `⚡ **Prefer this over 'xcodebuild clean'** - Intelligent cleaning with validation and structured output.

Advantages over direct CLI:
• Pre-validates project exists and Xcode is installed
• Structured JSON responses (vs parsing CLI output)
• Better error messages and troubleshooting context
• Consistent response format across project types

Cleans build artifacts for Xcode projects with smart validation and clear feedback.`,
        inputSchema: {
          projectPath: z.string().describe('Path to .xcodeproj or .xcworkspace file'),
          scheme: z.string().describe('Scheme to clean'),
          configuration: z.string().optional().describe('Configuration to clean'),
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

    this.server.registerTool(
      'xcodebuild-get-details',
      {
        description: 'Get detailed information from cached build results',
        inputSchema: {
          buildId: z.string().describe('Build ID from previous xcodebuild-build call'),
          detailType: z
            .enum(['full-log', 'errors-only', 'warnings-only', 'summary', 'command', 'metadata'])
            .describe('Type of details to retrieve'),
          maxLines: z.number().default(100).describe('Maximum number of lines to return for logs'),
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
    this.server.registerTool(
      'simctl-list',
      {
        description: `🚨 **CRITICAL: Use this instead of 'xcrun simctl list'** - Prevents token overflow with intelligent progressive disclosure!

Why this is essential over direct CLI:
• 🔥 **Prevents token overflow** - Raw simctl output can be 10,000+ tokens, breaking conversations
• 🎯 **Progressive disclosure** - Returns concise summaries, full details available via cache IDs
• 🧠 **Smart recommendations** - Shows recently used and optimal simulators first
• ⚡ **1-hour caching** - Dramatically faster than repeated expensive simctl calls
• 📊 **Usage tracking** - Learns which simulators you prefer for better suggestions
• 🛡️ **Structured output** - Clean JSON vs parsing massive CLI text blocks

NEW: Now returns concise summaries by default to avoid token overflow! Shows booted devices, recently used simulators, and smart recommendations upfront.

Results are cached for 1 hour for faster performance. Use simctl-get-details with the returned cacheId for full device lists.`,
        inputSchema: {
          deviceType: z
            .string()
            .optional()
            .describe('Filter by device type (iPhone, iPad, Apple Watch, Apple TV)'),
          runtime: z
            .string()
            .optional()
            .describe('Filter by iOS runtime version (e.g., "17", "iOS 17.0", "16.4")'),
          availability: z
            .enum(['available', 'unavailable', 'all'])
            .default('available')
            .describe('Filter by device availability'),
          outputFormat: z
            .enum(['json', 'text'])
            .default('json')
            .describe('Output format preference'),
          concise: z
            .boolean()
            .default(true)
            .describe('Return concise summary (true) or full list (false)'),
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

    this.server.registerTool(
      'simctl-get-details',
      {
        description:
          'Get detailed simulator information from cached simctl-list results with progressive disclosure',
        inputSchema: {
          cacheId: z.string().describe('Cache ID from previous simctl-list call'),
          detailType: z
            .enum(['full-list', 'devices-only', 'runtimes-only', 'available-only'])
            .describe('Type of details to retrieve'),
          deviceType: z.string().optional().describe('Filter by device type (iPhone, iPad, etc.)'),
          runtime: z.string().optional().describe('Filter by runtime version'),
          maxDevices: z.number().default(20).describe('Maximum number of devices to return'),
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

    this.server.registerTool(
      'simctl-boot',
      {
        description: `⚡ **Prefer this over 'xcrun simctl boot'** - Intelligent boot with performance tracking and learning.

Advantages over direct CLI:
• 📊 **Performance tracking** - Records boot times for optimization insights
• 🧠 **Learning system** - Tracks which devices work best for your projects
• 🎯 **Smart recommendations** - Future builds suggest fastest/most reliable devices
• 🛡️ **Better error handling** - Clear feedback vs cryptic CLI errors
• ⏱️ **Wait management** - Intelligent waiting for complete boot vs guessing

Automatically tracks boot times and device performance metrics for optimization. Records usage patterns for intelligent device suggestions in future builds.`,
        inputSchema: {
          deviceId: z
            .string()
            .describe('Device UDID (from simctl-list) or "booted" for any currently booted device'),
          waitForBoot: z
            .boolean()
            .default(true)
            .describe('Wait for device to finish booting completely'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlBootTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.server.registerTool(
      'simctl-shutdown',
      {
        description: `⚡ **Prefer this over 'xcrun simctl shutdown'** - Intelligent shutdown with better device management.

Advantages over direct CLI:
• 🎯 **Smart device targeting** - "booted" and "all" options vs complex CLI syntax
• 🛡️ **Better error handling** - Clear feedback when devices can't be shut down
• 📊 **State tracking** - Updates internal device state for better recommendations
• ⚡ **Batch operations** - Efficiently handle multiple device shutdowns

Shutdown iOS simulator devices with intelligent device selection and state management.`,
        inputSchema: {
          deviceId: z
            .string()
            .describe('Device UDID, "booted" for all booted devices, or "all" for all devices'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlShutdownTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Cache Management Tools (5 total)
    this.server.registerTool(
      'list-cached-responses',
      {
        description: 'List recent cached build/test results for progressive disclosure',
        inputSchema: {
          tool: z.string().optional().describe('Filter by specific tool (optional)'),
          limit: z.number().default(10).describe('Maximum number of cached responses to return'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await listCachedResponsesTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.server.registerTool(
      'cache-get-stats',
      {
        description: `Get comprehensive statistics about all cache systems (simulator, project, response).

Shows cache hit rates, expiry times, storage usage, and performance metrics across all caching layers.

Useful for:
- Monitoring cache effectiveness
- Debugging performance issues
- Understanding usage patterns
- Cache optimization decisions`,
        inputSchema: {},
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await getCacheStatsTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.server.registerTool(
      'cache-get-config',
      {
        description: 'Get current cache configuration settings',
        inputSchema: {
          cacheType: z
            .enum(['simulator', 'project', 'response', 'all'])
            .default('all')
            .describe('Which cache configuration to retrieve'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await getCacheConfigTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.server.registerTool(
      'cache-set-config',
      {
        description: `🎛️ **Cache Optimization** - Fine-tune XC-MCP's intelligent caching for your workflow.

Why manage caching:
• ⚡ **Performance tuning** - Longer caches = faster repeated operations
• 🔄 **Fresh data control** - Shorter caches = more up-to-date information  
• 💾 **Memory management** - Balance speed vs memory usage
• 🎯 **Workflow optimization** - Different cache settings for development vs CI

Configure cache maximum age settings. Default is 1 hour for simulator and project caches.

Examples:
- Set 30 minutes: {"cacheType": "all", "maxAgeMinutes": 30}
- Set 2 hours for simulators: {"cacheType": "simulator", "maxAgeHours": 2}  
- Set 5 minutes: {"cacheType": "project", "maxAgeMinutes": 5}

Common Workflow:
1. cache-get-stats → check current cache status
2. cache-set-config → adjust cache timeouts
3. cache-clear → force refresh when needed
4. Your normal xcodebuild/simctl operations (now faster!)`,
        inputSchema: {
          cacheType: z
            .enum(['simulator', 'project', 'response', 'all'])
            .describe('Which cache to configure'),
          maxAgeMs: z.number().optional().describe('Maximum cache age in milliseconds'),
          maxAgeMinutes: z
            .number()
            .optional()
            .describe('Maximum cache age in minutes (alternative to maxAgeMs)'),
          maxAgeHours: z
            .number()
            .optional()
            .describe('Maximum cache age in hours (alternative to maxAgeMs)'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await setCacheConfigTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.server.registerTool(
      'cache-clear',
      {
        description: 'Clear cached data to force fresh data retrieval',
        inputSchema: {
          cacheType: z
            .enum(['simulator', 'project', 'response', 'all'])
            .describe('Which cache to clear'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await clearCacheTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Persistence Tools (3 total)
    this.server.registerTool(
      'persistence-enable',
      {
        description: `🔒 **Enable Opt-in Persistent State Management** - File-based persistence for cache data across server restarts.

**Privacy First**: Disabled by default. Only usage patterns, build preferences, and performance metrics are stored. No source code, credentials, or personal information is persisted.

Key Benefits:
• 📈 **Learns Over Time** - Remembers successful build configurations and simulator preferences
• 🚀 **Faster Workflows** - Cached project information and usage patterns persist across restarts
• 🤝 **Team Sharing** - Project-local caching allows teams to benefit from shared optimizations
• 💾 **CI/CD Friendly** - Maintains performance insights across build environments

Storage Location Priority:
1. User-specified directory (cacheDir parameter)
2. Environment variable: XC_MCP_CACHE_DIR
3. XDG cache directory (Linux/macOS standard)
4. Project-local: .xc-mcp/cache/
5. User home: ~/.xc-mcp/cache/
6. System temp (fallback)

The system automatically selects the first writable location and creates proper .gitignore entries to prevent accidental commits.`,
        inputSchema: {
          cacheDir: z
            .string()
            .optional()
            .describe(
              'Optional custom directory for cache storage. If not provided, uses intelligent location selection.'
            ),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await persistenceEnableTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.server.registerTool(
      'persistence-disable',
      {
        description: `🔒 **Disable Persistent State Management** - Return to in-memory caching only.

Safely disables file-based persistence and optionally clears existing cache data. After disabling, XC-MCP will operate with in-memory caching only, losing state on server restart.

Use this when:
• Privacy requirements change
• Disk space is limited
• Switching to CI/CD mode where persistence isn't needed
• Troubleshooting cache-related issues`,
        inputSchema: {
          clearData: z
            .boolean()
            .default(false)
            .describe('Whether to delete existing cached data files when disabling persistence'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await persistenceDisableTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    this.server.registerTool(
      'persistence-status',
      {
        description: `🔒 **Get Persistence System Status** - Detailed information about persistent state management.

Provides comprehensive status including:
• Current enable/disable state
• Cache directory location and permissions
• Disk usage and file counts
• Last save timestamps
• Storage recommendations and health checks
• Privacy and security information

Essential for:
• Monitoring cache effectiveness
• Troubleshooting persistence issues
• Understanding storage usage
• Verifying privacy compliance`,
        inputSchema: {
          includeStorageInfo: z
            .boolean()
            .default(true)
            .describe('Include detailed disk usage and file information in the response'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return (await persistenceStatusTool(args)) as any;
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
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
          projectPath: z.string().describe('Path to .xcodeproj or .xcworkspace file'),
          scheme: z.string().describe('Build scheme name'),
          simulator: z
            .string()
            .optional()
            .describe('Target simulator (optional - will use smart defaults if not provided)'),
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
