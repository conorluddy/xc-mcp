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
import { xcodebuildTestTool } from './tools/xcodebuild/xcodebuild-test.js';
import { xcodebuildGetDetailsTool } from './tools/xcodebuild/get-details.js';
import { simctlListTool } from './tools/simctl/list.js';
import { simctlGetDetailsTool } from './tools/simctl/get-details.js';
import { simctlBootTool } from './tools/simctl/boot.js';
import { simctlShutdownTool } from './tools/simctl/shutdown.js';
import { simctlSuggestTool } from './tools/simctl/suggest.js';
import { simctlCreateTool } from './tools/simctl/create.js';
import { simctlDeleteTool } from './tools/simctl/delete.js';
import { simctlEraseTool } from './tools/simctl/erase.js';
import { simctlCloneTool } from './tools/simctl/clone.js';
import { simctlRenameTool } from './tools/simctl/rename.js';
import { simctlHealthCheckTool } from './tools/simctl/health-check.js';
import { simctlInstallTool } from './tools/simctl/install.js';
import { simctlUninstallTool } from './tools/simctl/uninstall.js';
import { simctlGetAppContainerTool } from './tools/simctl/get-app-container.js';
import { simctlLaunchTool } from './tools/simctl/launch.js';
import { simctlTerminateTool } from './tools/simctl/terminate.js';
import { simctlOpenUrlTool } from './tools/simctl/openurl.js';
import { simctlIoTool } from './tools/simctl/io.js';
import { simctlAddmediaTool } from './tools/simctl/addmedia.js';
import { simctlPrivacyTool } from './tools/simctl/privacy.js';
import { simctlPushTool } from './tools/simctl/push.js';
import { simctlPbcopyTool } from './tools/simctl/pbcopy.js';
import { simctlStatusBarTool } from './tools/simctl/status-bar.js';
// Phase 4: UI Automation Tools
import { simctlQueryUiTool } from './tools/simctl/query-ui.js';
import { simctlTapTool } from './tools/simctl/tap.js';
import { simctlTypeTextTool } from './tools/simctl/type-text.js';
import { simctlScrollTool } from './tools/simctl/scroll.js';
import { simctlGestureTool } from './tools/simctl/gesture.js';
import { simctlGetInteractionDetailsTool } from './tools/simctl/get-interaction-details.js';
import { simctlScreenshotInlineTool } from './tools/simctl/screenshot-inline.js';
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
        description:
          'Intelligent iOS development MCP server providing advanced Xcode and simulator control. ' +
          'Features 44 focused tools across 7 categories: build management, testing, simulator lifecycle, ' +
          'device discovery, app management, and Phase 4 UI automation with progressive disclosure caching. ' +
          'Optimized for agent workflows with auto-UDID detection, semantic naming, and vision-friendly inline screenshots.',
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
    // Xcodebuild Tools (7 total)
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
        description: `⚡ **Prefer this over raw 'xcodebuild'** - Intelligent building with learning and performance tracking.

Advantages:
• 🧠 Learns successful configs & suggests optimal simulators per project
• 📊 Tracks build performance & provides progressive disclosure for large logs
• ⚡ Caches intelligently & provides structured errors vs raw CLI stderr`,
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
      'xcodebuild-test',
      {
        description: `⚡ **Prefer this over 'xcodebuild test'** - Intelligent testing with learning and progressive disclosure.

Advantages:
• 🧠 Learns successful test configs & suggests optimal simulators per project
• 📊 Detailed test metrics with progressive disclosure for large logs (prevents token overflow)
• ⚡ Caches intelligently & provides structured test failures vs raw CLI stderr
• 🔍 Supports -only-testing and -skip-testing patterns`,
        inputSchema: {
          projectPath: z.string().describe('Path to .xcodeproj or .xcworkspace file'),
          scheme: z.string().describe('Test scheme name'),
          configuration: z
            .string()
            .default('Debug')
            .describe('Build configuration (Debug, Release, etc.)'),
          destination: z
            .string()
            .optional()
            .describe(
              'Test destination. If not provided, uses intelligent defaults based on project history and available simulators.'
            ),
          sdk: z
            .string()
            .optional()
            .describe('SDK to use for testing (e.g., "iphonesimulator", "iphoneos")'),
          derivedDataPath: z.string().optional().describe('Custom derived data path'),
          testPlan: z.string().optional().describe('Test plan to execute'),
          onlyTesting: z
            .array(z.string())
            .optional()
            .describe('Run only these tests (e.g., ["MyAppTests/testExample"])'),
          skipTesting: z
            .array(z.string())
            .optional()
            .describe('Skip these tests (e.g., ["MyAppTests/testSlow"])'),
          testWithoutBuilding: z
            .boolean()
            .default(false)
            .describe('Run test-without-building (requires prior build)'),
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

    this.server.registerTool(
      'xcodebuild-get-details',
      {
        description:
          'Get detailed information from cached build/test results with progressive disclosure',
        inputSchema: {
          buildId: z
            .string()
            .describe('Build/Test ID from previous xcodebuild-build or xcodebuild-test call'),
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
        description: `⚡ **Essential: Use this instead of 'xcrun simctl list'** - Prevents token overflow with progressive disclosure.

Advantages:
• 🔥 Prevents token overflow (raw output = 10k+ tokens) via concise summaries & cache IDs
• 🧠 Shows booted devices, recently used simulators & smart recommendations first
• ⚡ 1-hour caching + usage tracking for faster workflows & better suggestions

Returns summaries by default. Use simctl-get-details with cacheId for full device lists.`,
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
          openGui: z
            .boolean()
            .default(true)
            .describe('Open Simulator.app GUI window after booting (default: true)'),
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

    this.server.registerTool(
      'simctl-suggest',
      {
        description: `🧠 **Intelligent Simulator Suggestion** - Recommends best simulators based on project history, performance, and popularity.

Advantages:
• 🎯 **Project-aware** - Remembers your preferred simulator per project
• 📊 **Performance metrics** - Learns boot times and reliability
• 🏆 **Popularity ranking** - Suggests popular models (iPhone 16 Pro > iPhone 15, etc.)
• 💡 **Transparent scoring** - Shows reasoning for each recommendation
• ⚡ **Auto-boot option** - Optionally boots top suggestion immediately

Scoring algorithm considers: project preference (40%), recent usage (40%), iOS version (30%), popular model (20%), boot performance (10%).`,
        inputSchema: {
          projectPath: z
            .string()
            .optional()
            .describe('Project path for project-specific suggestions'),
          deviceType: z
            .string()
            .optional()
            .describe('Filter suggestions by device type (e.g., iPhone, iPad)'),
          maxSuggestions: z.number().default(4).describe('Maximum number of suggestions to return'),
          autoBootTopSuggestion: z
            .boolean()
            .default(false)
            .describe('Automatically boot the top suggestion'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlSuggestTool(args);
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
      'simctl-create',
      {
        description: `⚙️ **Create New Simulator** - Create iOS simulator devices dynamically.

Advantages:
• 🎯 **Dynamic provisioning** - Create simulators on-the-fly for testing
• 📱 **Device flexibility** - Support all device types (iPhone, iPad, Apple Watch, Apple TV)
• 🔧 **Runtime control** - Specify iOS version or use latest
• 💾 **Automated testing** - Useful for CI/CD pipelines

Creates a new simulator device that persists until deleted.`,
        inputSchema: {
          name: z.string().describe('Display name for the new simulator (e.g., "MyTestDevice")'),
          deviceType: z
            .string()
            .describe('Device type (e.g., "iPhone 16 Pro", "iPad Pro", "Apple Watch Series 9")'),
          runtime: z
            .string()
            .optional()
            .describe('iOS/runtime version (e.g., "17.0") - defaults to latest'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlCreateTool(args);
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
      'simctl-delete',
      {
        description: `🗑️ **Delete Simulator** - Permanently remove a simulator device.

Advantages:
• 🧹 **Clean up** - Remove unused simulators to save disk space
• ⚡ **Quick operation** - Fast permanent deletion
• 💡 **Safety checks** - Prevents accidental deletion of booted devices

⚠️ This action cannot be undone.`,
        inputSchema: {
          deviceId: z.string().describe('Device UDID (from simctl-list)'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlDeleteTool(args);
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
      'simctl-erase',
      {
        description: `🔄 **Erase Simulator** - Reset simulator to factory settings.

Advantages:
• 🔄 **Clean state** - Reset device without deleting it
• 📦 **Data removal** - Removes all apps and user data
• 🎯 **Testing** - Perfect for fresh app installation testing
• 💾 **Device preserved** - Simulator persists for reuse

Resets device to clean state while keeping it available.`,
        inputSchema: {
          deviceId: z.string().describe('Device UDID (from simctl-list)'),
          force: z.boolean().default(false).describe('Force erase even if device is booted'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlEraseTool(args);
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
      'simctl-clone',
      {
        description: `📋 **Clone Simulator** - Create a duplicate of an existing simulator.

Advantages:
• 📸 **Snapshots** - Create backups of configured simulators
• 🧪 **Testing variants** - Have multiple versions for different test scenarios
• 💾 **State preservation** - Cloned device includes all apps and data
• ⚡ **Quick setup** - Duplicate existing configuration instead of recreating

Creates a new simulator with same configuration and data as source.`,
        inputSchema: {
          deviceId: z.string().describe('Source device UDID (from simctl-list)'),
          newName: z.string().describe('Display name for the cloned simulator'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlCloneTool(args);
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
      'simctl-rename',
      {
        description: `✏️ **Rename Simulator** - Change a simulator's display name.

Advantages:
• 🏷️ **Organization** - Better organize and identify your simulators
• 🔍 **Easy identification** - Use descriptive names for test devices
• 💾 **Data preserved** - Rename without affecting UDID or data

Renames device while preserving all configuration and data.`,
        inputSchema: {
          deviceId: z.string().describe('Device UDID (from simctl-list)'),
          newName: z.string().describe('New display name for the simulator'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlRenameTool(args);
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
      'simctl-health-check',
      {
        description: `🏥 **Health Check** - Comprehensive environment validation for iOS simulator development.

Validates:
• ✅ Xcode Command Line Tools installation
• ✅ simctl availability and functionality
• ✅ Available simulators and device types
• ✅ Booted simulators status
• ✅ Available iOS/simulator runtimes
• ✅ Disk space for simulator data

Returns detailed diagnostics and actionable guidance for any issues found.`,
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

    // Phase 3: App Lifecycle & Testing Tools (11 total)
    // App Management Tools
    this.server.registerTool(
      'simctl-install',
      {
        description: `📦 **Install App to Simulator** - Deploy built apps to simulators for testing.

Installs an iOS app (.app bundle) to a specified simulator.

Returns: Installation status, app name, and guidance for next steps.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          appPath: z.string().describe('Path to .app bundle (e.g., /path/to/MyApp.app)'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlInstallTool(args);
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
      'simctl-uninstall',
      {
        description: `🗑️ **Uninstall App from Simulator** - Remove apps from simulators.

Uninstalls an app identified by bundle ID from the specified simulator.

Returns: Uninstall status and guidance for reinstalling or managing apps.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          bundleId: z.string().describe('App bundle ID (e.g., com.example.MyApp)'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlUninstallTool(args);
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
      'simctl-get-app-container',
      {
        description: `📂 **Get App Container Path** - Access app file system containers for inspection and debugging.

Retrieves the file system path to an app's container (Documents, Library, etc.).

Supports container types: bundle, data, group

Returns: Container path for file access and inspection.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          bundleId: z.string().describe('App bundle ID (e.g., com.example.MyApp)'),
          containerType: z
            .enum(['bundle', 'data', 'group'])
            .optional()
            .describe('Type of container (default: data)'),
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

    // App Control Tools
    this.server.registerTool(
      'simctl-launch',
      {
        description: `▶️ **Launch App on Simulator** - Start apps with arguments and environment variables.

Launches an app on a simulator and returns the process ID.

Supports passing command-line arguments and environment variables.

Returns: Process ID, launch status, and guidance for app control.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          bundleId: z.string().describe('App bundle ID (e.g., com.example.MyApp)'),
          arguments: z
            .array(z.string())
            .optional()
            .describe('Command-line arguments to pass to the app'),
          environment: z.record(z.string()).optional().describe('Environment variables to set'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlLaunchTool(args);
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
      'simctl-terminate',
      {
        description: `⏹️ **Terminate App on Simulator** - Stop running apps.

Terminates a running app identified by bundle ID on the specified simulator.

Returns: Termination status and guidance for relaunching or debugging.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          bundleId: z.string().describe('App bundle ID (e.g., com.example.MyApp)'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlTerminateTool(args);
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
      'simctl-openurl',
      {
        description: `🔗 **Open URL in Simulator** - Test deep linking and URL handling.

Opens a URL in the simulator, supporting:
• HTTP/HTTPS web URLs
• Custom scheme deep links (myapp://)
• Special URLs (mailto:, tel:, sms:)

Returns: URL open status and guidance for testing URL handling.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          url: z
            .string()
            .describe('URL to open (e.g., https://example.com or myapp://deeplink?id=123)'),
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
    this.server.registerTool(
      'simctl-io',
      {
        description: `📸 **Capture Screenshots and Videos** - Record simulator screen for testing and documentation.

Operations:
• screenshot: Capture current screen as PNG
• video: Record simulator screen (stop with Ctrl+C)

Supports custom output paths and video codecs (h264, hevc, prores).

**LLM Optimization**: Use appName, screenName, and state for semantic naming (e.g., MyApp_LoginScreen_Empty_2025-01-23.png) to enable agents to reason about captured screens.

Returns: File path and guidance for viewing captured media.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          operation: z.enum(['screenshot', 'video']).describe('Operation: screenshot or video'),
          outputPath: z.string().optional().describe('Custom output file path'),
          codec: z
            .enum(['h264', 'hevc', 'prores'])
            .optional()
            .describe('Video codec (for video operation)'),
          appName: z.string().optional().describe('App name for semantic naming (e.g., "MyApp")'),
          screenName: z
            .string()
            .optional()
            .describe('Screen/view name for semantic naming (e.g., "LoginScreen")'),
          state: z
            .string()
            .optional()
            .describe('UI state for semantic naming (e.g., "Empty", "Filled", "Loading")'),
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

    this.server.registerTool(
      'simctl-addmedia',
      {
        description: `🖼️ **Add Media to Simulator** - Populate photo library with test images and videos.

Adds images and videos to the simulator's photo library for app testing.

Supported formats:
• Images: jpg, jpeg, png, heic, gif, bmp
• Videos: mp4, mov, avi, mkv

Returns: Media addition status and guidance for accessing in Photos app.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          mediaPath: z.string().describe('Path to image or video file (e.g., /path/to/photo.jpg)'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlAddmediaTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Advanced Testing Tools
    this.server.registerTool(
      'simctl-privacy',
      {
        description: `🔐 **Manage Privacy Permissions** - Control app access to sensitive device features.

Grant, revoke, or reset privacy permissions for apps.

Supported services:
camera, microphone, location, contacts, photos, calendar, health, reminders,
motion, keyboard, mediaLibrary, calls, siri

**LLM Optimization**: Include scenario and step for structured permission audit trail tracking. Enables agents to track permission changes across test scenarios.

Returns: Permission modification status and verification guidance.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          bundleId: z.string().describe('App bundle ID (e.g., com.example.MyApp)'),
          action: z.enum(['grant', 'revoke', 'reset']).describe('Action: grant, revoke, or reset'),
          service: z
            .string()
            .describe('Service name (camera, microphone, location, contacts, photos, etc.)'),
          scenario: z
            .string()
            .optional()
            .describe(
              'Test scenario name for audit trail (e.g., "LocationTest", "CameraOnboarding")'
            ),
          step: z.number().optional().describe('Step number in scenario for audit trail tracking'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlPrivacyTool(args);
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
      'simctl-push',
      {
        description: `📲 **Send Push Notifications** - Simulate remote push notifications for testing.

Sends simulated push notifications with custom JSON payloads.

Payload format: Valid JSON with APS dictionary for notification properties.

**LLM Optimization**: Include testName and expectedBehavior to enable structured test tracking and assertion verification. Enables agents to validate push delivery and app behavior.

Returns: Push delivery status and guidance for notification testing.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          bundleId: z.string().describe('App bundle ID (e.g., com.example.MyApp)'),
          payload: z
            .string()
            .describe(
              'JSON payload with APS dictionary (e.g., \'{"aps":{"alert":"Test notification"}}\''
            ),
          testName: z
            .string()
            .optional()
            .describe('Test name for tracking (e.g., "PushNotification_DeepLinkTest")'),
          expectedBehavior: z
            .string()
            .optional()
            .describe('Expected app behavior (e.g., "App navigates to ProductDetail view")'),
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

    this.server.registerTool(
      'simctl-pbcopy',
      {
        description: `📋 **Copy Text to Clipboard** - Simulate pasteboard operations for clipboard-dependent features.

Copies text to the simulator's pasteboard (UIPasteboard).

Apps can access via: UIPasteboard.general.string

Returns: Copy status and verification guidance.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          text: z.string().describe('Text to copy to clipboard'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlPbcopyTool(args);
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
      'simctl-status-bar',
      {
        description: `⏱️ **Control Status Bar Appearance** - Override status bar for consistent testing.

Override or clear status bar appearance for testing UI layouts and handling.

Supports: Time, network status, WiFi state, battery state and level

Returns: Status bar modification status and guidance for verification.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          operation: z.enum(['override', 'clear']).describe('Operation: override or clear'),
          time: z.string().optional().describe('Time in 24-hour format (e.g., "9:41")'),
          dataNetwork: z
            .string()
            .optional()
            .describe('Data network: none, 1x, 3g, 4g, 5g, lte, lte-a'),
          wifiMode: z.string().optional().describe('WiFi state: active, searching, failed'),
          batteryState: z
            .string()
            .optional()
            .describe('Battery state: charging, charged, discharging'),
          batteryLevel: z.number().min(0).max(100).optional().describe('Battery level: 0-100'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlStatusBarTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Phase 4: UI Automation Tools (6 total)
    this.server.registerTool(
      'simctl-query-ui',
      {
        description: `🔍 **Query UI Elements** - Find elements on app screen using XCUITest predicates.

Query UI elements with powerful predicate syntax for element discovery.

Predicates enable:
• Element type matching: Button, TextField, Switch, Table, Cell, etc.
• Accessibility queries: identifier, label, placeholderValue
• State queries: enabled, visible, hittable
• Compound predicates: AND, OR, NOT operators

Returns: Elements found and their properties for interaction.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          bundleId: z.string().describe('App bundle ID (e.g., com.example.MyApp)'),
          predicate: z
            .string()
            .describe(
              'XCUITest predicate (e.g., \'type == "XCUIElementTypeButton" AND label == "Login"\')'
            ),
          captureLocation: z
            .boolean()
            .optional()
            .describe('Capture element locations for interaction'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlQueryUiTool(args);
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
      'simctl-tap',
      {
        description: `👆 **Tap Screen** - Simulate tap interactions on simulator screen.

Perform single tap, double tap, or long press at specified coordinates.

Returns: Tap status and guidance for verification.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          x: z.number().describe('X coordinate in pixels'),
          y: z.number().describe('Y coordinate in pixels'),
          numberOfTaps: z.number().optional().describe('Number of taps (default: 1)'),
          duration: z.number().optional().describe('Duration in seconds for long press'),
          actionName: z
            .string()
            .optional()
            .describe('Action description for tracking (e.g., "Login Button Tap")'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlTapTool(args);
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
      'simctl-type-text',
      {
        description: `⌨️ **Type Text** - Enter text into focused text field.

Type text, passwords, or multi-line input. Supports keyboard actions like return, tab, backspace.

Returns: Text entry status and guidance for verification.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          text: z.string().describe('Text to type'),
          isSensitive: z
            .boolean()
            .optional()
            .describe('Mark as sensitive (output will be redacted)'),
          keyboardActions: z
            .array(z.string())
            .optional()
            .describe('Keyboard actions after text (e.g., ["return", "tab"])'),
          actionName: z
            .string()
            .optional()
            .describe('Action description for tracking (e.g., "Enter email address")'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlTypeTextTool(args);
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
      'simctl-scroll',
      {
        description: `📜 **Scroll Content** - Scroll in direction on simulator screen.

Scroll views, tables, and lists in any direction with configurable velocity.

Returns: Scroll status and guidance for verification.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction'),
          x: z.number().optional().describe('X coordinate (default: screen center)'),
          y: z.number().optional().describe('Y coordinate (default: screen center)'),
          velocity: z.number().optional().describe('Scroll velocity 1-10 (default: 3)'),
          actionName: z
            .string()
            .optional()
            .describe('Action description for tracking (e.g., "Scroll to bottom")'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlScrollTool(args);
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
      'simctl-gesture',
      {
        description: `✋ **Perform Gestures** - Execute complex gestures (swipe, pinch, rotate, multi-touch).

Advanced gesture support for swipes, pinch zoom, rotation, and multi-touch interactions.

Gestures: swipe, pinch, rotate, multitouch

Returns: Gesture status and guidance for verification.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          type: z.enum(['swipe', 'pinch', 'rotate', 'multitouch']).describe('Gesture type'),
          direction: z
            .enum(['up', 'down', 'left', 'right'])
            .optional()
            .describe('Direction (for swipe)'),
          scale: z.number().optional().describe('Scale factor (for pinch)'),
          angle: z.number().optional().describe('Rotation angle in degrees (for rotate)'),
          startX: z.number().optional().describe('Starting X coordinate (for swipe)'),
          startY: z.number().optional().describe('Starting Y coordinate (for swipe)'),
          centerX: z.number().optional().describe('Center X coordinate (for pinch/rotate)'),
          centerY: z.number().optional().describe('Center Y coordinate (for pinch/rotate)'),
          fingers: z.number().optional().describe('Number of fingers (for multitouch)'),
          action: z.string().optional().describe('Action type (for multitouch, e.g., "tap")'),
          actionName: z.string().optional().describe('Action description for tracking'),
        },
      },
      async args => {
        try {
          await validateXcodeInstallation();
          return await simctlGestureTool(args);
        } catch (error) {
          if (error instanceof McpError) throw error;
          throw new McpError(
            ErrorCode.InternalError,
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );

    // Phase 4: Progressive Disclosure for UI Interactions
    this.server.registerTool(
      'simctl-get-interaction-details',
      {
        description: `🔍 **Get Interaction Details** - Retrieve full output from cached UI automation operations.

Supports progressive disclosure for Phase 4 UI automation tools:
• simctl-query-ui - Element querying results
• simctl-tap - Tap operation logs
• simctl-type-text - Text input results
• simctl-scroll - Scroll operation logs
• simctl-gesture - Gesture operation logs

Use interactionId from tool responses to fetch full command output, errors, or metadata.

Returns: Detailed operation results with optional log limiting.`,
        inputSchema: {
          interactionId: z.string().describe('Interaction ID from UI automation tool response'),
          detailType: z
            .enum(['full-log', 'summary', 'command', 'metadata'])
            .describe('Type of details to retrieve'),
          maxLines: z
            .number()
            .optional()
            .default(100)
            .describe('Maximum number of lines to return for logs'),
        },
      },
      async args => {
        try {
          return await simctlGetInteractionDetailsTool(args);
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
      'screenshot',
      {
        description: `📸 **Capture Screenshot** - Take an optimized screenshot and return as base64 image data (inline).

Automatically optimizes screenshots for token efficiency:
• Converts to WebP format (60% quality) - ~30-50% smaller than JPEG
• 1:1 pixel dimensions (no resizing artifacts)
• Falls back to JPEG if WebP unavailable
• Returns image inline with metadata

With semantic naming, generates filenames like: MyApp_LoginScreen_Empty_2025-01-23.png`,
        inputSchema: {
          udid: z
            .string()
            .optional()
            .describe('Simulator UDID (optional - auto-detects booted simulator if not provided)'),
          appName: z.string().optional().describe('App name for semantic naming (e.g., "MyApp")'),
          screenName: z
            .string()
            .optional()
            .describe('Screen/view name for semantic naming (e.g., "LoginScreen")'),
          state: z
            .string()
            .optional()
            .describe('UI state for semantic naming (e.g., "Empty", "Filled", "Loading")'),
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
        description: `🎛️ **Cache Optimization** - Fine-tune caching for your workflow (default: 1 hour).

Why manage:
• ⚡ Balance performance (longer cache) vs freshness (shorter cache)
• 🎯 Optimize for development (longer) vs CI/CD (shorter) workflows

Use maxAgeMinutes, maxAgeHours, or maxAgeMs parameters. Workflow: cache-get-stats → cache-set-config → cache-clear → profit!`,
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
