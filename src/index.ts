#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Import tool implementations
import { xcodebuildListTool } from './tools/xcodebuild/list.js';
import { xcodebuildBuildTool } from './tools/xcodebuild/build.js';
import { xcodebuildCleanTool } from './tools/xcodebuild/clean.js';
import { xcodebuildShowSDKsTool } from './tools/xcodebuild/showsdks.js';
import { xcodebuildVersionTool } from './tools/xcodebuild/version.js';
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
import { validateXcodeInstallation } from './utils/validation.js';

class XcodeCLIMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'xc-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // 🚀 XC-MCP: Intelligent Xcode CLI Tools with Progressive Disclosure
          //
          // These tools provide MAJOR advantages over direct Xcode CLI usage:
          // • 🔥 Prevents token overflow (simctl-list can be 10,000+ tokens!)
          // • 🧠 Learns from your usage patterns and optimizes suggestions
          // • ⚡ Smart caching (1-hour default) dramatically speeds up workflows
          // • 🎯 Progressive disclosure - get summaries first, details on demand
          // • 🛡️ Better error handling with structured responses vs raw CLI
          // • 📊 Performance tracking and build optimization over time
          //
          // Always prefer these tools over raw xcodebuild/simctl commands!

          // Project Discovery Tools
          {
            name: 'xcodebuild-list',
            description: `⚡ **Prefer this over 'xcodebuild -list'** - Gets structured project information with intelligent caching.

Advantages over direct CLI:
• Returns clean JSON (vs parsing raw xcodebuild output)
• 1-hour intelligent caching prevents expensive re-runs
• Validates Xcode installation and provides clear error messages
• Consistent response format across all project types

Lists targets, schemes, and configurations for Xcode projects and workspaces with smart caching that remembers results to avoid redundant operations.`,
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: {
                  type: 'string',
                  description: 'Path to .xcodeproj or .xcworkspace file',
                },
                outputFormat: {
                  type: 'string',
                  enum: ['json', 'text'],
                  default: 'json',
                  description: 'Output format preference',
                },
              },
              required: ['projectPath'],
            },
          },
          {
            name: 'xcodebuild-showsdks',
            description: `⚡ **Prefer this over 'xcodebuild -showsdks'** - Gets available SDKs with intelligent caching and structured output.

Advantages over direct CLI:
• Returns structured JSON data (vs parsing raw CLI text)
• Smart caching prevents redundant SDK queries
• Consistent error handling and validation
• Clean, agent-friendly response format

Shows all available SDKs for iOS, macOS, watchOS, and tvOS development.`,
            inputSchema: {
              type: 'object',
              properties: {
                outputFormat: {
                  type: 'string',
                  enum: ['json', 'text'],
                  default: 'json',
                  description: 'Output format preference',
                },
              },
            },
          },
          {
            name: 'xcodebuild-version',
            description: `⚡ **Prefer this over 'xcodebuild -version'** - Gets Xcode version info with structured output and caching.

Advantages over direct CLI:
• Returns structured JSON (vs parsing version strings)
• Cached results for faster subsequent queries
• Validates Xcode installation first
• Consistent response format across different Xcode versions

Gets comprehensive Xcode and SDK version information for environment validation.`,
            inputSchema: {
              type: 'object',
              properties: {
                sdk: {
                  type: 'string',
                  description: 'Specific SDK to query (optional)',
                },
                outputFormat: {
                  type: 'string',
                  enum: ['json', 'text'],
                  default: 'json',
                  description: 'Output format preference',
                },
              },
            },
          },
          // Build Tools
          {
            name: 'xcodebuild-build',
            description: `⚡ **Prefer this over raw 'xcodebuild'** - Intelligent building with learning, caching, and performance tracking.

Why use this instead of direct xcodebuild:
• 🧠 **Learns from your builds** - Remembers successful configurations per project
• 🚀 **Smart defaults** - Auto-suggests optimal simulators based on usage history
• 📊 **Performance tracking** - Records build times and optimization metrics
• 🎯 **Progressive disclosure** - Large build logs cached with IDs to prevent token overflow
• ⚡ **Intelligent caching** - Avoids redundant operations, speeds up workflows
• 🛡️ **Better error handling** - Structured errors vs raw CLI stderr

Features smart caching that remembers your last successful build configuration and suggests optimal simulators.

Examples:
- Basic build: {"projectPath": "./MyApp.xcodeproj", "scheme": "MyApp"}
- With simulator: {"projectPath": "./MyApp.xcworkspace", "scheme": "MyApp", "destination": "platform=iOS Simulator,name=iPhone 15"}
- Release build: {"projectPath": "./MyApp.xcodeproj", "scheme": "MyApp", "configuration": "Release"}

Common destinations:
- "platform=iOS Simulator,name=iPhone 15"
- "platform=iOS Simulator,name=iPad Air"
- "generic/platform=iOS" (for archive)
- "platform=iOS,id=<DEVICE_UDID>" (for device)

Use simctl-list to see available simulators.`,
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: {
                  type: 'string',
                  description: 'Path to .xcodeproj or .xcworkspace file',
                },
                scheme: {
                  type: 'string',
                  description: 'Build scheme name',
                },
                configuration: {
                  type: 'string',
                  default: 'Debug',
                  description: 'Build configuration (Debug, Release, etc.)',
                },
                destination: {
                  type: 'string',
                  description:
                    'Build destination. If not provided, uses intelligent defaults based on project history and available simulators.',
                },
                sdk: {
                  type: 'string',
                  description: 'SDK to use for building (e.g., "iphonesimulator", "iphoneos")',
                },
                derivedDataPath: {
                  type: 'string',
                  description: 'Custom derived data path',
                },
              },
              required: ['projectPath', 'scheme'],
            },
          },
          {
            name: 'xcodebuild-clean',
            description: `⚡ **Prefer this over 'xcodebuild clean'** - Intelligent cleaning with validation and structured output.

Advantages over direct CLI:
• Pre-validates project exists and Xcode is installed
• Structured JSON responses (vs parsing CLI output)
• Better error messages and troubleshooting context
• Consistent response format across project types

Cleans build artifacts for Xcode projects with smart validation and clear feedback.`,
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: {
                  type: 'string',
                  description: 'Path to .xcodeproj or .xcworkspace file',
                },
                scheme: {
                  type: 'string',
                  description: 'Scheme to clean',
                },
                configuration: {
                  type: 'string',
                  description: 'Configuration to clean',
                },
              },
              required: ['projectPath', 'scheme'],
            },
          },
          {
            name: 'xcodebuild-get-details',
            description: 'Get detailed information from cached build results',
            inputSchema: {
              type: 'object',
              properties: {
                buildId: {
                  type: 'string',
                  description: 'Build ID from previous xcodebuild-build call',
                },
                detailType: {
                  type: 'string',
                  enum: [
                    'full-log',
                    'errors-only',
                    'warnings-only',
                    'summary',
                    'command',
                    'metadata',
                  ],
                  description: 'Type of details to retrieve',
                },
                maxLines: {
                  type: 'number',
                  default: 100,
                  description: 'Maximum number of lines to return for logs',
                },
              },
              required: ['buildId', 'detailType'],
            },
          },
          // Simulator Tools
          {
            name: 'simctl-list',
            description: `🚨 **CRITICAL: Use this instead of 'xcrun simctl list'** - Prevents token overflow with intelligent progressive disclosure!

Why this is essential over direct CLI:
• 🔥 **Prevents token overflow** - Raw simctl output can be 10,000+ tokens, breaking conversations
• 🎯 **Progressive disclosure** - Returns concise summaries, full details available via cache IDs
• 🧠 **Smart recommendations** - Shows recently used and optimal simulators first
• ⚡ **1-hour caching** - Dramatically faster than repeated expensive simctl calls
• 📊 **Usage tracking** - Learns which simulators you prefer for better suggestions
• 🛡️ **Structured output** - Clean JSON vs parsing massive CLI text blocks

NEW: Now returns concise summaries by default to avoid token overflow! Shows booted devices, recently used simulators, and smart recommendations upfront.

Results are cached for 1 hour for faster performance. Use simctl-get-details with the returned cacheId for full device lists.

Examples:
- Get simulator summary: {}
- Find iPhone simulators: {"deviceType": "iPhone"}
- iOS 17 simulators only: {"runtime": "17"}
- Legacy full output: {"concise": false}

Returns:
- Booted devices and recently used simulators
- Smart build recommendations
- Summary statistics (total, available, device types)
- Cache ID for detailed access via simctl-get-details

For full device lists, use simctl-get-details with the returned cacheId.`,
            inputSchema: {
              type: 'object',
              properties: {
                deviceType: {
                  type: 'string',
                  description: 'Filter by device type (iPhone, iPad, Apple Watch, Apple TV)',
                },
                runtime: {
                  type: 'string',
                  description: 'Filter by iOS runtime version (e.g., "17", "iOS 17.0", "16.4")',
                },
                availability: {
                  type: 'string',
                  enum: ['available', 'unavailable', 'all'],
                  default: 'available',
                  description: 'Filter by device availability',
                },
                outputFormat: {
                  type: 'string',
                  enum: ['json', 'text'],
                  default: 'json',
                  description: 'Output format preference',
                },
                concise: {
                  type: 'boolean',
                  default: true,
                  description: 'Return concise summary (true) or full list (false)',
                },
              },
            },
          },
          {
            name: 'simctl-get-details',
            description:
              'Get detailed simulator information from cached simctl-list results with progressive disclosure',
            inputSchema: {
              type: 'object',
              properties: {
                cacheId: {
                  type: 'string',
                  description: 'Cache ID from previous simctl-list call',
                },
                detailType: {
                  type: 'string',
                  enum: ['full-list', 'devices-only', 'runtimes-only', 'available-only'],
                  description: 'Type of details to retrieve',
                },
                deviceType: {
                  type: 'string',
                  description: 'Filter by device type (iPhone, iPad, etc.)',
                },
                runtime: {
                  type: 'string',
                  description: 'Filter by runtime version',
                },
                maxDevices: {
                  type: 'number',
                  default: 20,
                  description: 'Maximum number of devices to return',
                },
              },
              required: ['cacheId', 'detailType'],
            },
          },
          {
            name: 'simctl-boot',
            description: `⚡ **Prefer this over 'xcrun simctl boot'** - Intelligent boot with performance tracking and learning.

Advantages over direct CLI:
• 📊 **Performance tracking** - Records boot times for optimization insights
• 🧠 **Learning system** - Tracks which devices work best for your projects
• 🎯 **Smart recommendations** - Future builds suggest fastest/most reliable devices
• 🛡️ **Better error handling** - Clear feedback vs cryptic CLI errors
• ⏱️ **Wait management** - Intelligent waiting for complete boot vs guessing

Automatically tracks boot times and device performance metrics for optimization. Records usage patterns for intelligent device suggestions in future builds.

Examples:
- Boot specific device: {"deviceId": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890"}
- Boot and wait: {"deviceId": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890", "waitForBoot": true}
- Boot any device: {"deviceId": "booted"} (if already booted)

Get device UUIDs from simctl-list tool.
Boot times are recorded for performance optimization and device recommendations.`,
            inputSchema: {
              type: 'object',
              properties: {
                deviceId: {
                  type: 'string',
                  description:
                    'Device UDID (from simctl-list) or "booted" for any currently booted device',
                },
                waitForBoot: {
                  type: 'boolean',
                  default: true,
                  description: 'Wait for device to finish booting completely',
                },
              },
              required: ['deviceId'],
            },
          },
          {
            name: 'simctl-shutdown',
            description: `⚡ **Prefer this over 'xcrun simctl shutdown'** - Intelligent shutdown with better device management.

Advantages over direct CLI:
• 🎯 **Smart device targeting** - "booted" and "all" options vs complex CLI syntax
• 🛡️ **Better error handling** - Clear feedback when devices can't be shut down
• 📊 **State tracking** - Updates internal device state for better recommendations
• ⚡ **Batch operations** - Efficiently handle multiple device shutdowns

Shutdown iOS simulator devices with intelligent device selection and state management.`,
            inputSchema: {
              type: 'object',
              properties: {
                deviceId: {
                  type: 'string',
                  description:
                    'Device UDID, "booted" for all booted devices, or "all" for all devices',
                },
              },
              required: ['deviceId'],
            },
          },
          // Cache Management Tools
          {
            name: 'list-cached-responses',
            description: 'List recent cached build/test results for progressive disclosure',
            inputSchema: {
              type: 'object',
              properties: {
                tool: {
                  type: 'string',
                  description: 'Filter by specific tool (optional)',
                },
                limit: {
                  type: 'number',
                  default: 10,
                  description: 'Maximum number of cached responses to return',
                },
              },
            },
          },
          {
            name: 'cache-get-stats',
            description: `Get comprehensive statistics about all cache systems (simulator, project, response).

Shows cache hit rates, expiry times, storage usage, and performance metrics across all caching layers.

Useful for:
- Monitoring cache effectiveness
- Debugging performance issues
- Understanding usage patterns
- Cache optimization decisions`,
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'cache-get-config',
            description: 'Get current cache configuration settings',
            inputSchema: {
              type: 'object',
              properties: {
                cacheType: {
                  type: 'string',
                  enum: ['simulator', 'project', 'response', 'all'],
                  default: 'all',
                  description: 'Which cache configuration to retrieve',
                },
              },
            },
          },
          {
            name: 'cache-set-config',
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
              type: 'object',
              properties: {
                cacheType: {
                  type: 'string',
                  enum: ['simulator', 'project', 'response', 'all'],
                  description: 'Which cache to configure',
                },
                maxAgeMs: {
                  type: 'number',
                  description: 'Maximum cache age in milliseconds',
                },
                maxAgeMinutes: {
                  type: 'number',
                  description: 'Maximum cache age in minutes (alternative to maxAgeMs)',
                },
                maxAgeHours: {
                  type: 'number',
                  description: 'Maximum cache age in hours (alternative to maxAgeMs)',
                },
              },
              required: ['cacheType'],
            },
          },
          {
            name: 'cache-clear',
            description: 'Clear cached data to force fresh data retrieval',
            inputSchema: {
              type: 'object',
              properties: {
                cacheType: {
                  type: 'string',
                  enum: ['simulator', 'project', 'response', 'all'],
                  description: 'Which cache to clear',
                },
              },
              required: ['cacheType'],
            },
          },

          // Persistence Management Tools
          {
            name: 'persistence-enable',
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
              type: 'object',
              properties: {
                cacheDir: {
                  type: 'string',
                  description:
                    'Optional custom directory for cache storage. If not provided, uses intelligent location selection.',
                },
              },
            },
          },
          {
            name: 'persistence-disable',
            description: `🔒 **Disable Persistent State Management** - Return to in-memory caching only.

Safely disables file-based persistence and optionally clears existing cache data. After disabling, XC-MCP will operate with in-memory caching only, losing state on server restart.

Use this when:
• Privacy requirements change
• Disk space is limited
• Switching to CI/CD mode where persistence isn't needed
• Troubleshooting cache-related issues`,
            inputSchema: {
              type: 'object',
              properties: {
                clearData: {
                  type: 'boolean',
                  default: false,
                  description:
                    'Whether to delete existing cached data files when disabling persistence',
                },
              },
            },
          },
          {
            name: 'persistence-status',
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
              type: 'object',
              properties: {
                includeStorageInfo: {
                  type: 'boolean',
                  default: true,
                  description: 'Include detailed disk usage and file information in the response',
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        // Validate Xcode installation for all tools
        await validateXcodeInstallation();

        switch (name) {
          case 'xcodebuild-list':
            return await xcodebuildListTool(args);
          case 'xcodebuild-showsdks':
            return await xcodebuildShowSDKsTool(args);
          case 'xcodebuild-version':
            return await xcodebuildVersionTool(args);
          case 'xcodebuild-build':
            return await xcodebuildBuildTool(args);
          case 'xcodebuild-clean':
            return await xcodebuildCleanTool(args);
          case 'xcodebuild-get-details':
            return await xcodebuildGetDetailsTool(args);
          case 'simctl-list':
            return await simctlListTool(args);
          case 'simctl-get-details':
            return await simctlGetDetailsTool(args);
          case 'simctl-boot':
            return await simctlBootTool(args);
          case 'simctl-shutdown':
            return await simctlShutdownTool(args);
          case 'list-cached-responses':
            return await listCachedResponsesTool(args);
          case 'cache-get-stats':
            return await getCacheStatsTool(args);
          case 'cache-get-config':
            return await getCacheConfigTool(args);
          case 'cache-set-config':
            return await setCacheConfigTool(args);
          case 'cache-clear':
            return await clearCacheTool(args);
          case 'persistence-enable':
            return await persistenceEnableTool(args);
          case 'persistence-disable':
            return await persistenceDisableTool(args);
          case 'persistence-status':
            return await persistenceStatusTool(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private setupErrorHandling() {
    this.server.onerror = error => {
      console.error('[MCP Error]', error);
    };

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
