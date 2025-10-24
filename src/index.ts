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
import { simctlScreenshotInlineTool } from './tools/simctl/screenshot-inline.js';
import { idbTargetsTool } from './tools/idb/targets.js';
import { idbConnectTool } from './tools/idb/connect.js';
import { idbUiTapTool } from './tools/idb/ui-tap.js';
import { idbUiInputTool } from './tools/idb/ui-input.js';
import { idbUiGestureTool } from './tools/idb/ui-gesture.js';
import { idbUiDescribeTool } from './tools/idb/ui-describe.js';
import { idbListAppsTool } from './tools/idb/list-apps.js';
import { idbInstallTool } from './tools/idb/install.js';
import { idbLaunchTool } from './tools/idb/launch.js';
import { idbTerminateTool } from './tools/idb/terminate.js';
import { idbUninstallTool } from './tools/idb/uninstall.js';
import { listCachedResponsesTool } from './tools/cache/list-cached.js';
import { getCacheStatsTool } from './tools/cache/get-stats.js';
import { setCacheConfigTool } from './tools/cache/set-config.js';
import { clearCacheTool } from './tools/cache/clear.js';
import { getCacheConfigTool } from './tools/cache/get-config.js';
import { persistenceEnableTool } from './tools/persistence/enable.js';
import { persistenceDisableTool } from './tools/persistence/disable.js';
import { persistenceStatusTool } from './tools/persistence/status.js';
import { getToolDocsTool } from './tools/get-tool-docs.js';
import { debugWorkflowPrompt } from './tools/prompts/debug-workflow.js';
import { validateXcodeInstallation } from './utils/validation.js';

class XcodeCLIMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer(
      {
        name: 'xc-mcp',
        version: '1.2.0',
        description:
          'Intelligent iOS development MCP server providing advanced Xcode and simulator control. ' +
          'Features 51 specialized tools across 8 categories: build management, testing, simulator lifecycle, ' +
          'device discovery, app management, IDB UI automation, workflow orchestration, and progressive disclosure caching. ' +
          'Optimized for agent workflows with auto-UDID detection, coordinate transformation, semantic naming, vision-friendly inline screenshots, ' +
          'and build settings auto-discovery. Use the RTFM tool to progressively disclose additional documentation and examples for any of the tools.',
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
        description: `⚡ Get Xcode version info with structured output and caching.

Advantages: Structured JSON response, intelligent caching, Xcode validation, consistent formatting across versions.

📖 Use rtfm with toolName: "xcodebuild-version" for full documentation.`,
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
        description: `⚡ List project targets, schemes, and configurations with intelligent caching.

Advantages: Clean JSON output, 1-hour caching to avoid re-runs, Xcode validation, consistent formatting.

📖 Use rtfm with toolName: "xcodebuild-list" for full documentation.`,
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
        description: `⚡ Show available SDKs for iOS, macOS, watchOS, and tvOS with caching.

Advantages: Structured JSON output, smart caching for SDK queries, consistent error handling, agent-friendly format.

📖 Use rtfm with toolName: "xcodebuild-showsdks" for full documentation.`,
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
        description: `⚡ Build Xcode projects with intelligent caching and performance tracking.

Advantages: Learns successful configs, tracks build performance, progressive disclosure for large logs, structured error output.

📖 Use rtfm with toolName: "xcodebuild-build" for full documentation.`,
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
        description: `⚡ Clean build artifacts with validation and structured output.

Advantages: Pre-validates project and Xcode, structured JSON responses, better error messages, consistent formatting.

📖 Use rtfm with toolName: "xcodebuild-clean" for full documentation.`,
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
        description: `⚡ Run tests with intelligent caching and progressive disclosure.

Advantages: Learns test configs, detailed metrics with token-safe disclosure, structured failures, supports test filtering patterns.

📖 Use rtfm with toolName: "xcodebuild-test" for full documentation.`,
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
        description: `Get details from cached build/test results with progressive disclosure.

📖 Use rtfm with toolName: "xcodebuild-get-details" for full documentation.`,
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
        description: `⚡ List simulators with progressive disclosure to prevent token overflow.

Advantages: Token-safe summaries with cache IDs, shows booted/recent devices first, 1-hour caching with usage tracking.

📖 Use rtfm with toolName: "simctl-list" for full documentation.`,
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
        description: `Get detailed information from cached simctl-list results.

Advantages: Progressive disclosure for large device lists, filtering by type/runtime, configurable device limits.

📖 Use rtfm with toolName: "simctl-get-details" for full documentation.`,
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
        description: `⚡ Boot simulator with performance tracking and learning.

Advantages: Tracks boot times and device performance, learns which devices work best per project, intelligent wait management, clear error handling.

📖 Use rtfm with toolName: "simctl-boot" for full documentation.`,
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
        description: `⚡ Shutdown simulator with intelligent device selection.

Advantages: Smart targeting ("booted", "all" options), better error handling, state tracking for recommendations, batch operations support.

📖 Use rtfm with toolName: "simctl-shutdown" for full documentation.`,
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
        description: `🧠 Recommend best simulators based on project history, performance, and popularity.

Advantages: Project-aware preferences, performance metrics tracking, popularity ranking, transparent scoring, optional auto-boot.

📖 Use rtfm with toolName: "simctl-suggest" for full documentation.`,
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
        description: `⚙️ Create new simulator devices dynamically.

Advantages: On-the-fly provisioning, support for all device types, runtime version control, CI/CD friendly.

📖 Use rtfm with toolName: "simctl-create" for full documentation.`,
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
        description: `🗑️ Permanently delete a simulator device.

Advantages: Free disk space, fast operation, safety checks prevent deleting booted devices. Warning: Cannot be undone.

📖 Use rtfm with toolName: "simctl-delete" for full documentation.`,
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
        description: `🔄 Reset simulator to factory settings.

Advantages: Clean state without deletion, removes all apps and data, perfect for fresh testing, device preserved for reuse.

📖 Use rtfm with toolName: "simctl-erase" for full documentation.`,
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
        description: `📋 Clone an existing simulator.

Advantages: Create backups/snapshots, testing variants, state preservation with all apps and data, quick setup vs recreating.

📖 Use rtfm with toolName: "simctl-clone" for full documentation.`,
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
        description: `✏️ Change a simulator's display name.

Advantages: Better organization and identification, descriptive names for test devices, preserves UDID and all data.

📖 Use rtfm with toolName: "simctl-rename" for full documentation.`,
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
        description: `🏥 Comprehensive environment validation for iOS simulator development.

Validates: Xcode CLI tools, simctl availability, simulators, runtimes, disk space. Returns diagnostics and actionable guidance.

📖 Use rtfm with toolName: "simctl-health-check" for full documentation.`,
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
        description: `📦 Install app to simulator for testing.

Deploys iOS app (.app bundle) to specified simulator. Returns installation status, app name, and next steps.

📖 Use rtfm with toolName: "simctl-install" for full documentation.`,
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
        description: `🗑️ Uninstall app from simulator.

Removes app by bundle ID from specified simulator. Returns status and guidance for reinstalling or managing apps.

📖 Use rtfm with toolName: "simctl-uninstall" for full documentation.`,
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
        description: `📂 Get app file system container path for inspection.

Returns filesystem path to app's container (Documents, Library, etc.). Supports bundle, data, group container types.

📖 Use rtfm with toolName: "simctl-get-app-container" for full documentation.`,
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
        description: `▶️ Launch app on simulator with arguments and environment variables.

Starts app and returns process ID. Supports command-line arguments and environment variables for app configuration.

📖 Use rtfm with toolName: "simctl-launch" for full documentation.`,
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
        description: `⏹️ Terminate running app on simulator.

Stops app by bundle ID. Returns status and guidance for relaunching or debugging.

📖 Use rtfm with toolName: "simctl-terminate" for full documentation.`,
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
        description: `🔗 Open URL in simulator to test deep linking.

Supports HTTP/HTTPS URLs, custom scheme deep links (myapp://), and special URLs (mailto:, tel:, sms:). Returns status and testing guidance.

📖 Use rtfm with toolName: "simctl-openurl" for full documentation.`,
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
        description: `📸 Capture screenshots and record videos of simulator screen.

Operations: screenshot (PNG with size presets for token optimization), video (h264/hevc/prores). Default 'half' size saves 50% tokens. Semantic naming support (appName, screenName, state).

📖 Use rtfm with toolName: "simctl-io" for full documentation.`,
        inputSchema: {
          udid: z.string().describe('Simulator UDID'),
          operation: z.enum(['screenshot', 'video']).describe('Operation: screenshot or video'),
          outputPath: z.string().optional().describe('Custom output file path'),
          size: z
            .enum(['full', 'half', 'quarter', 'thumb'])
            .optional()
            .describe(
              'Screenshot size preset (default: "half" for 50% token savings). Use "full" for detailed analysis, "half" for general use, "quarter"/"thumb" for thumbnails.'
            ),
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
        description: `🖼️ Add media to simulator photo library for testing.

Supports images (jpg, png, heic, gif, bmp) and videos (mp4, mov, avi, mkv). Returns status and Photos app access guidance.

📖 Use rtfm with toolName: "simctl-addmedia" for full documentation.`,
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
        description: `🔐 Manage app privacy permissions (grant/revoke/reset).

Supported services: camera, microphone, location, contacts, photos, calendar, health, reminders, motion, keyboard, mediaLibrary, calls, siri. Includes audit trail tracking.

📖 Use rtfm with toolName: "simctl-privacy" for full documentation.`,
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
        description: `📲 Simulate push notifications with custom JSON payloads.

Requires valid JSON with APS dictionary. Supports test tracking (testName, expectedBehavior) for structured validation.

📖 Use rtfm with toolName: "simctl-push" for full documentation.`,
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
        description: `📋 Copy text to simulator clipboard (UIPasteboard).

Apps access via UIPasteboard.general.string. Returns copy status and verification guidance.

📖 Use rtfm with toolName: "simctl-pbcopy" for full documentation.`,
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
        description: `⏱️ Override status bar appearance for consistent testing.

Control time, network status, WiFi state, battery state/level. Returns modification status and verification guidance.

📖 Use rtfm with toolName: "simctl-status-bar" for full documentation.`,
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
    this.server.registerTool(
      'screenshot',
      {
        description: `📸 Capture optimized screenshot as base64 image data.

Default 'half' size saves 50% tokens. Returns inline with coordinate transform metadata. Supports semantic naming (appName, screenName, state).

📖 Use rtfm with toolName: "screenshot" for full documentation.`,
        inputSchema: {
          udid: z
            .string()
            .optional()
            .describe('Simulator UDID (optional - auto-detects booted simulator if not provided)'),
          size: z
            .enum(['full', 'half', 'quarter', 'thumb'])
            .optional()
            .describe(
              'Screenshot size preset (default: "half" for 50% token savings). Use "full" for detailed analysis, "half" for general use, "quarter"/"thumb" for thumbnails.'
            ),
          appName: z.string().optional().describe('App name for semantic naming (e.g., "MyApp")'),
          screenName: z
            .string()
            .optional()
            .describe('Screen/view name for semantic naming (e.g., "LoginScreen")'),
          state: z
            .string()
            .optional()
            .describe('UI state for semantic naming (e.g., "Empty", "Filled", "Loading")'),
          enableCoordinateCaching: z
            .boolean()
            .optional()
            .describe(
              'Enable view fingerprint computation for coordinate caching (opt-in Phase 1 feature)'
            ),
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

    // IDB Tools (11 total) - iOS Development Bridge for UI Automation & App Management
    this.server.registerTool(
      'idb-targets',
      {
        description: `Query and manage iOS targets (simulators + devices).

Operations: list (with filters), describe (details), focus (bring to foreground). Supports state and type filtering.

📖 Use rtfm with toolName: "idb-targets" for full documentation.`,
        inputSchema: {
          operation: z.enum(['list', 'describe', 'focus']).describe('Operation to perform'),
          udid: z.string().optional().describe('Target UDID (required for describe/focus)'),
          state: z.enum(['Booted', 'Shutdown']).optional().describe('Filter by state (list only)'),
          type: z.enum(['device', 'simulator']).optional().describe('Filter by type (list only)'),
        },
      },
      async args => idbTargetsTool(args)
    );

    this.server.registerTool(
      'idb-connect',
      {
        description: `Manage IDB companion connections for persistent target access.

Maintains gRPC connections for faster operations. Supports connect/disconnect with auto-detection.

📖 Use rtfm with toolName: "idb-connect" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          operation: z
            .enum(['connect', 'disconnect'])
            .default('connect')
            .describe('Operation to perform'),
        },
      },
      async args => idbConnectTool(args)
    );

    this.server.registerTool(
      'idb-ui-tap',
      {
        description: `🎯 Tap coordinates on iOS simulator or physical device.

Uses absolute device coordinates (0,0 = top-left). Supports screenshot scale transforms, double-tap, long-press. Works on simulators and physical devices.

📖 Use rtfm with toolName: "idb-ui-tap" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          x: z.number().describe('X coordinate'),
          y: z.number().describe('Y coordinate'),
          numberOfTaps: z.number().default(1).describe('Number of taps'),
          duration: z.number().optional().describe('Long press duration in milliseconds'),
          applyScreenshotScale: z
            .boolean()
            .optional()
            .describe('Apply coordinate transform from screenshot'),
          screenshotScaleX: z.number().optional().describe('Scale factor for X axis'),
          screenshotScaleY: z.number().optional().describe('Scale factor for Y axis'),
          actionName: z.string().optional().describe('LLM: Action name (e.g., "Login Button")'),
          screenContext: z
            .string()
            .optional()
            .describe('LLM: Screen context (e.g., "LoginScreen")'),
          expectedOutcome: z
            .string()
            .optional()
            .describe('LLM: Expected outcome (e.g., "Navigate to Home")'),
          testScenario: z.string().optional().describe('LLM: Test scenario name'),
          step: z.number().optional().describe('LLM: Step number in workflow'),
        },
      },
      async args => idbUiTapTool(args)
    );

    this.server.registerTool(
      'idb-ui-input',
      {
        description: `⌨️ Input text and keyboard commands on iOS target.

Operations: text (type string), key (press single key), key-sequence (multiple keys). Supports home, lock, siri, delete, return, space, escape, tab, arrows.

📖 Use rtfm with toolName: "idb-ui-input" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          operation: z.enum(['text', 'key', 'key-sequence']).describe('Input operation type'),
          text: z.string().optional().describe('Text to type (for text operation)'),
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
            .optional()
            .describe('Key to press (for key operation)'),
          keySequence: z.array(z.string()).optional().describe('Keys to press (for key-sequence)'),
          actionName: z.string().optional().describe('LLM: Action name (e.g., "Enter Email")'),
          fieldContext: z
            .string()
            .optional()
            .describe('LLM: Field context (e.g., "Email TextField")'),
          expectedOutcome: z
            .string()
            .optional()
            .describe('LLM: Expected outcome (e.g., "Email populated")'),
          isSensitive: z.boolean().optional().describe('Mark as sensitive (password, etc.)'),
        },
      },
      async args => idbUiInputTool(args)
    );

    this.server.registerTool(
      'idb-ui-gesture',
      {
        description: `👆 Perform gestures and hardware button presses.

Operations: swipe (directional or custom path), button (HOME, LOCK, SIDE_BUTTON, APPLE_PAY, SIRI, SCREENSHOT, APP_SWITCH).

📖 Use rtfm with toolName: "idb-ui-gesture" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          operation: z.enum(['swipe', 'button']).describe('Gesture operation type'),
          direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Swipe direction'),
          startX: z.number().optional().describe('Custom swipe start X'),
          startY: z.number().optional().describe('Custom swipe start Y'),
          endX: z.number().optional().describe('Custom swipe end X'),
          endY: z.number().optional().describe('Custom swipe end Y'),
          duration: z.number().default(500).describe('Swipe duration in milliseconds'),
          buttonType: z
            .enum(['HOME', 'LOCK', 'SIDE_BUTTON', 'APPLE_PAY', 'SIRI', 'SCREENSHOT', 'APP_SWITCH'])
            .optional()
            .describe('Hardware button type'),
          actionName: z.string().optional().describe('LLM: Action name'),
          expectedOutcome: z.string().optional().describe('LLM: Expected outcome'),
        },
      },
      async args => idbUiGestureTool(args)
    );

    this.server.registerTool(
      'idb-ui-describe',
      {
        description: `🔍 Query UI accessibility tree for element discovery.

Operations: all (full tree with progressive disclosure), point (element at coordinates). Returns summary + cache ID to prevent token overflow.

📖 Use rtfm with toolName: "idb-ui-describe" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          operation: z.enum(['all', 'point']).describe('Query operation type'),
          x: z.number().optional().describe('X coordinate (for point operation)'),
          y: z.number().optional().describe('Y coordinate (for point operation)'),
          screenContext: z
            .string()
            .optional()
            .describe('LLM: Screen context (e.g., "LoginScreen")'),
          purposeDescription: z
            .string()
            .optional()
            .describe('LLM: Query purpose (e.g., "Find tappable button")'),
        },
      },
      async args => idbUiDescribeTool(args)
    );

    this.server.registerTool(
      'idb-list-apps',
      {
        description: `📱 List installed applications on iOS target.

Returns bundle ID, name, install type, running status, debuggable status, architecture. Filter by system/user/internal or running-only. Works on simulators and physical devices.

📖 Use rtfm with toolName: "idb-list-apps" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          filterType: z
            .enum(['system', 'user', 'internal'])
            .optional()
            .describe('Filter by install type'),
          runningOnly: z.boolean().optional().describe('Show only running apps'),
        },
      },
      async args => idbListAppsTool(args)
    );

    this.server.registerTool(
      'idb-install',
      {
        description: `📦 Install application to iOS target.

Supports .app bundles and .ipa archives. Validates, transfers, registers app. Returns bundle ID. Works on simulators and physical devices. Can take 10-60 seconds.

📖 Use rtfm with toolName: "idb-install" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          appPath: z.string().describe('Path to .app or .ipa file'),
        },
      },
      async args => idbInstallTool(args)
    );

    this.server.registerTool(
      'idb-launch',
      {
        description: `🚀 Launch application on iOS target.

Supports output streaming, command-line arguments, environment variables. Returns process ID. Works on simulators and physical devices.

📖 Use rtfm with toolName: "idb-launch" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          bundleId: z.string().describe('App bundle identifier'),
          streamOutput: z.boolean().optional().describe('Stream stdout/stderr (enables -w flag)'),
          arguments: z
            .array(z.string())
            .optional()
            .describe('Command-line arguments to pass to app'),
          environment: z.record(z.string()).optional().describe('Environment variables'),
        },
      },
      async args => idbLaunchTool(args)
    );

    this.server.registerTool(
      'idb-terminate',
      {
        description: `⏹️ Terminate running application on iOS target.

Force-quits app immediately (no graceful shutdown). Idempotent. Useful for stopping before reinstall, force-quitting hung apps, resetting state.

📖 Use rtfm with toolName: "idb-terminate" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          bundleId: z.string().describe('App bundle identifier to terminate'),
        },
      },
      async args => idbTerminateTool(args)
    );

    this.server.registerTool(
      'idb-uninstall',
      {
        description: `🗑️ Uninstall application from iOS target.

Removes app and deletes data/preferences. Auto-terminates if running. Cannot uninstall system apps. Works on simulators and physical devices.

📖 Use rtfm with toolName: "idb-uninstall" for full documentation.`,
        inputSchema: {
          udid: z.string().optional().describe('Target UDID (auto-detect if not provided)'),
          bundleId: z.string().describe('App bundle identifier to uninstall'),
        },
      },
      async args => idbUninstallTool(args)
    );

    // Cache Management Tools (5 total)
    this.server.registerTool(
      'list-cached-responses',
      {
        description: `List recent cached build/test results for progressive disclosure.

Shows cached responses with filtering by tool and configurable limits.

📖 Use rtfm with toolName: "list-cached-responses" for full documentation.`,
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
        description: `Get cache statistics across all caching layers.

Shows hit rates, expiry times, storage usage, performance metrics. Useful for monitoring effectiveness and optimization decisions.

📖 Use rtfm with toolName: "cache-get-stats" for full documentation.`,
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
        description: `Get current cache configuration settings.

Returns cache configuration for specified cache type (simulator, project, response, or all).

📖 Use rtfm with toolName: "cache-get-config" for full documentation.`,
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
        description: `🎛️ Fine-tune cache settings for your workflow (default: 1 hour).

Balance performance vs freshness. Use maxAgeMinutes, maxAgeHours, or maxAgeMs. Workflow: get-stats → set-config → clear.

📖 Use rtfm with toolName: "cache-set-config" for full documentation.`,
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
        description: `Clear cached data to force fresh data retrieval.

Clears specified cache type (simulator, project, response, or all) to force fresh retrieval.

📖 Use rtfm with toolName: "cache-clear" for full documentation.`,
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
        description: `🔒 Enable file-based persistence for cache data across server restarts.

Privacy-first (disabled by default). Stores usage patterns, build preferences, performance metrics. No source code or credentials. Intelligent location selection with .gitignore generation.

📖 Use rtfm with toolName: "persistence-enable" for full documentation.`,
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
        description: `🔒 Disable persistent state management and return to in-memory caching.

Safely disables file-based persistence, optionally clearing cached data. Returns to in-memory only (loses state on restart).

📖 Use rtfm with toolName: "persistence-disable" for full documentation.`,
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
        description: `🔒 Get detailed persistence system status information.

Returns state, cache directory, disk usage, timestamps, recommendations, health checks, privacy info. Essential for monitoring and troubleshooting.

📖 Use rtfm with toolName: "persistence-status" for full documentation.`,
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

    // Documentation Tool
    this.server.registerTool(
      'rtfm',
      {
        description: `📖 Read The Fuckin Manual - Get full documentation for any MCP tool.

Returns comprehensive markdown documentation including parameters, examples, and usage guidance. Use this to get detailed information about any of the 51 tools in this MCP server.`,
        inputSchema: {
          toolName: z
            .string()
            .describe(
              'Name of the tool to get documentation for (e.g., "xcodebuild-build", "simctl-boot")'
            ),
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

    // Screenshot save alias (file-based variant)
    this.server.registerTool(
      'screenshot-save',
      {
        description:
          'Save screenshot to file via simctl-io - Use "screenshot" for inline base64 variant',
        inputSchema: {
          udid: z.string().optional().describe('Simulator UDID (auto-detects if not provided)'),
          operation: z.enum(['screenshot', 'video']).describe('Operation: screenshot or video'),
          appName: z.string().optional().describe('App name for semantic naming (e.g., "MyApp")'),
          screenName: z
            .string()
            .optional()
            .describe('Screen/view name for semantic naming (e.g., "LoginScreen")'),
          state: z
            .string()
            .optional()
            .describe('UI state for semantic naming (e.g., "Empty", "Filled", "Loading")'),
          outputPath: z.string().optional().describe('Custom output file path'),
          codec: z
            .enum(['h264', 'hevc', 'prores'])
            .optional()
            .describe('Video codec (for video operation)'),
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
