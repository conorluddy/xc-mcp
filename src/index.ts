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
        version: '1.3.1',
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
        description: 'Get Xcode version with caching.\n\nUse rtfm for details.',
        inputSchema: {
          sdk: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-version" }) for details'),
          outputFormat: z.enum(['json', 'text']).default('json').describe('Use rtfm({ toolName: "xcodebuild-version" }) for details'),
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
        description: 'List project targets and schemes with caching.\n\nUse rtfm for details.',
        inputSchema: {
          projectPath: z.string().describe('Use rtfm({ toolName: "xcodebuild-list" }) for details'),
          outputFormat: z.enum(['json', 'text']).default('json').describe('Use rtfm({ toolName: "xcodebuild-list" }) for details'),
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
        description: 'Show available SDKs with caching.\n\nUse rtfm for details.',
        inputSchema: {
          outputFormat: z.enum(['json', 'text']).default('json').describe('Use rtfm({ toolName: "xcodebuild-showsdks" }) for details'),
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
        description: 'Build Xcode projects with caching.\n\nUse rtfm for details.',
        inputSchema: {
          projectPath: z.string().describe('Use rtfm({ toolName: "xcodebuild-build" }) for details'),
          scheme: z.string().describe('Use rtfm({ toolName: "xcodebuild-build" }) for details'),
          configuration: z.string().default('Debug').describe('Use rtfm({ toolName: "xcodebuild-build" }) for details'),
          destination: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-build" }) for details'),
          sdk: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-build" }) for details'),
          derivedDataPath: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-build" }) for details'),
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
        description: 'Clean build artifacts with validation.\n\nUse rtfm for details.',
        inputSchema: {
          projectPath: z.string().describe('Use rtfm({ toolName: "xcodebuild-clean" }) for details'),
          scheme: z.string().describe('Use rtfm({ toolName: "xcodebuild-clean" }) for details'),
          configuration: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-clean" }) for details'),
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
        description: 'Run tests with caching.\n\nUse rtfm for details.',
        inputSchema: {
          projectPath: z.string().describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          scheme: z.string().describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          configuration: z.string().default('Debug').describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          destination: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          sdk: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          derivedDataPath: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          testPlan: z.string().optional().describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          onlyTesting: z.array(z.string()).optional().describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          skipTesting: z.array(z.string()).optional().describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
          testWithoutBuilding: z.boolean().default(false).describe('Use rtfm({ toolName: "xcodebuild-test" }) for details'),
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
        description: 'Get cached build or test details.\n\nUse rtfm for details.',
        inputSchema: {
          buildId: z.string().describe('Use rtfm({ toolName: "xcodebuild-get-details" }) for details'),
          detailType: z.enum([
            'full-log',
            'errors-only',
            'warnings-only',
            'summary',
            'command',
            'metadata',
          ]).describe('Use rtfm({ toolName: "xcodebuild-get-details" }) for details'),
          maxLines: z.number().default(100).describe('Use rtfm({ toolName: "xcodebuild-get-details" }) for details'),
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
        description: 'List simulators with progressive disclosure.\n\nUse rtfm for details.',
        inputSchema: {
          deviceType: z.string().optional().describe('Use rtfm({ toolName: "simctl-list" }) for details'),
          runtime: z.string().optional().describe('Use rtfm({ toolName: "simctl-list" }) for details'),
          availability: z.enum(['available', 'unavailable', 'all']).default('available').describe('Use rtfm({ toolName: "simctl-list" }) for details'),
          outputFormat: z.enum(['json', 'text']).default('json').describe('Use rtfm({ toolName: "simctl-list" }) for details'),
          concise: z.boolean().default(true).describe('Use rtfm({ toolName: "simctl-list" }) for details'),
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
        description: 'Get cached simctl-list details.\n\nUse rtfm for details.',
        inputSchema: {
          cacheId: z.string().describe('Use rtfm({ toolName: "simctl-get-details" }) for details'),
          detailType: z.enum(['full-list', 'devices-only', 'runtimes-only', 'available-only']).describe('Use rtfm({ toolName: "simctl-get-details" }) for details'),
          deviceType: z.string().optional().describe('Use rtfm({ toolName: "simctl-get-details" }) for details'),
          runtime: z.string().optional().describe('Use rtfm({ toolName: "simctl-get-details" }) for details'),
          maxDevices: z.number().default(20).describe('Use rtfm({ toolName: "simctl-get-details" }) for details'),
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
        description: 'Boot simulator with performance tracking.\n\nUse rtfm for details.',
        inputSchema: {
          deviceId: z.string().describe('Use rtfm({ toolName: "simctl-boot" }) for details'),
          waitForBoot: z.boolean().default(true).describe('Use rtfm({ toolName: "simctl-boot" }) for details'),
          openGui: z.boolean().default(true).describe('Use rtfm({ toolName: "simctl-boot" }) for details'),
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
        description: 'Shutdown simulator with device selection.\n\nUse rtfm for details.',
        inputSchema: {
          deviceId: z.string().describe('Use rtfm({ toolName: "simctl-shutdown" }) for details'),
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
        description: 'Recommend best simulators based on history.\n\nUse rtfm for details.',
        inputSchema: {
          projectPath: z.string().optional().describe('Use rtfm({ toolName: "simctl-suggest" }) for details'),
          deviceType: z.string().optional().describe('Use rtfm({ toolName: "simctl-suggest" }) for details'),
          maxSuggestions: z.number().default(4).describe('Use rtfm({ toolName: "simctl-suggest" }) for details'),
          autoBootTopSuggestion: z.boolean().default(false).describe('Use rtfm({ toolName: "simctl-suggest" }) for details'),
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
        description: 'Create new simulator devices dynamically.\n\nUse rtfm for details.',
        inputSchema: {
          name: z.string().describe('Use rtfm({ toolName: "simctl-create" }) for details'),
          deviceType: z.string().describe('Use rtfm({ toolName: "simctl-create" }) for details'),
          runtime: z.string().optional().describe('Use rtfm({ toolName: "simctl-create" }) for details'),
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
        description: 'Permanently delete a simulator device.\n\nUse rtfm for details.',
        inputSchema: {
          deviceId: z.string().describe('Use rtfm({ toolName: "simctl-delete" }) for details'),
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
        description: 'Reset simulator to factory settings.\n\nUse rtfm for details.',
        inputSchema: {
          deviceId: z.string().describe('Use rtfm({ toolName: "simctl-erase" }) for details'),
          force: z.boolean().default(false).describe('Use rtfm({ toolName: "simctl-erase" }) for details'),
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
        description: 'Clone an existing simulator.\n\nUse rtfm for details.',
        inputSchema: {
          deviceId: z.string().describe('Use rtfm({ toolName: "simctl-clone" }) for details'),
          newName: z.string().describe('Use rtfm({ toolName: "simctl-clone" }) for details'),
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
        description: 'Change simulator display name.\n\nUse rtfm for details.',
        inputSchema: {
          deviceId: z.string().describe('Use rtfm({ toolName: "simctl-rename" }) for details'),
          newName: z.string().describe('Use rtfm({ toolName: "simctl-rename" }) for details'),
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
        description: 'Comprehensive environment validation for iOS.\n\nUse rtfm for details.',
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
        description: 'Install app to simulator for testing.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-install" }) for details'),
          appPath: z.string().describe('Use rtfm({ toolName: "simctl-install" }) for details'),
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
        description: 'Uninstall app from simulator.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-uninstall" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "simctl-uninstall" }) for details'),
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
        description: 'Get app filesystem container path.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-get-app-container" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "simctl-get-app-container" }) for details'),
          containerType: z.enum(['bundle', 'data', 'group']).optional().describe('Use rtfm({ toolName: "simctl-get-app-container" }) for details'),
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
        description: 'Launch app with arguments and environment.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-launch" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "simctl-launch" }) for details'),
          arguments: z.array(z.string()).optional().describe('Use rtfm({ toolName: "simctl-launch" }) for details'),
          environment: z.record(z.string()).optional().describe('Use rtfm({ toolName: "simctl-launch" }) for details'),
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
        description: 'Terminate running app on simulator.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-terminate" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "simctl-terminate" }) for details'),
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
        description: 'Open URL in simulator for testing.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-openurl" }) for details'),
          url: z.string().describe('Use rtfm({ toolName: "simctl-openurl" }) for details'),
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
        description: 'Capture screenshots and record videos.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-io" }) for details'),
          operation: z.enum(['screenshot', 'video']).describe('Use rtfm({ toolName: "simctl-io" }) for details'),
          outputPath: z.string().optional().describe('Use rtfm({ toolName: "simctl-io" }) for details'),
          size: z.enum(['full', 'half', 'quarter', 'thumb']).optional().describe('Use rtfm({ toolName: "simctl-io" }) for details'),
          codec: z.enum(['h264', 'hevc', 'prores']).optional().describe('Use rtfm({ toolName: "simctl-io" }) for details'),
          appName: z.string().optional().describe('Use rtfm({ toolName: "simctl-io" }) for details'),
          screenName: z.string().optional().describe('Use rtfm({ toolName: "simctl-io" }) for details'),
          state: z.string().optional().describe('Use rtfm({ toolName: "simctl-io" }) for details'),
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
        description: 'Add media to simulator photo library.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-addmedia" }) for details'),
          mediaPath: z.string().describe('Use rtfm({ toolName: "simctl-addmedia" }) for details'),
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
        description: 'Manage app privacy permissions.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-privacy" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "simctl-privacy" }) for details'),
          action: z.enum(['grant', 'revoke', 'reset']).describe('Use rtfm({ toolName: "simctl-privacy" }) for details'),
          service: z.string().describe('Use rtfm({ toolName: "simctl-privacy" }) for details'),
          scenario: z.string().optional().describe('Use rtfm({ toolName: "simctl-privacy" }) for details'),
          step: z.number().optional().describe('Use rtfm({ toolName: "simctl-privacy" }) for details'),
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
        description: 'Simulate push notifications with payloads.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-push" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "simctl-push" }) for details'),
          payload: z.string().describe('Use rtfm({ toolName: "simctl-push" }) for details'),
          testName: z.string().optional().describe('Use rtfm({ toolName: "simctl-push" }) for details'),
          expectedBehavior: z.string().optional().describe('Use rtfm({ toolName: "simctl-push" }) for details'),
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
        description: 'Copy text to simulator clipboard.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-pbcopy" }) for details'),
          text: z.string().describe('Use rtfm({ toolName: "simctl-pbcopy" }) for details'),
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
        description: 'Override status bar for testing.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().describe('Use rtfm({ toolName: "simctl-status-bar" }) for details'),
          operation: z.enum(['override', 'clear']).describe('Use rtfm({ toolName: "simctl-status-bar" }) for details'),
          time: z.string().optional().describe('Use rtfm({ toolName: "simctl-status-bar" }) for details'),
          dataNetwork: z.string().optional().describe('Use rtfm({ toolName: "simctl-status-bar" }) for details'),
          wifiMode: z.string().optional().describe('Use rtfm({ toolName: "simctl-status-bar" }) for details'),
          batteryState: z.string().optional().describe('Use rtfm({ toolName: "simctl-status-bar" }) for details'),
          batteryLevel: z.number().min(0).max(100).optional().describe('Use rtfm({ toolName: "simctl-status-bar" }) for details'),
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
        description: 'Capture optimized screenshot as base64.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "screenshot" }) for details'),
          size: z.enum(['full', 'half', 'quarter', 'thumb']).optional().describe('Use rtfm({ toolName: "screenshot" }) for details'),
          appName: z.string().optional().describe('Use rtfm({ toolName: "screenshot" }) for details'),
          screenName: z.string().optional().describe('Use rtfm({ toolName: "screenshot" }) for details'),
          state: z.string().optional().describe('Use rtfm({ toolName: "screenshot" }) for details'),
          enableCoordinateCaching: z.boolean().optional().describe('Use rtfm({ toolName: "screenshot" }) for details'),
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
        description: 'Query and manage iOS targets.\n\nUse rtfm for details.',
        inputSchema: {
          operation: z.enum(['list', 'describe', 'focus']).describe('Use rtfm({ toolName: "idb-targets" }) for details'),
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-targets" }) for details'),
          state: z.enum(['Booted', 'Shutdown']).optional().describe('Use rtfm({ toolName: "idb-targets" }) for details'),
          type: z.enum(['device', 'simulator']).optional().describe('Use rtfm({ toolName: "idb-targets" }) for details'),
        },
      },
      async args => idbTargetsTool(args)
    );

    this.server.registerTool(
      'idb-connect',
      {
        description: 'Manage IDB companion connections.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-connect" }) for details'),
          operation: z.enum(['connect', 'disconnect']).default('connect').describe('Use rtfm({ toolName: "idb-connect" }) for details'),
        },
      },
      async args => idbConnectTool(args)
    );

    this.server.registerTool(
      'idb-ui-tap',
      {
        description: 'Tap coordinates on iOS device.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          x: z.number().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          y: z.number().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          numberOfTaps: z.number().default(1).describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          duration: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          applyScreenshotScale: z.boolean().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          screenshotScaleX: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          screenshotScaleY: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          actionName: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          screenContext: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          expectedOutcome: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          testScenario: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
          step: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-tap" }) for details'),
        },
      },
      async args => idbUiTapTool(args)
    );

    this.server.registerTool(
      'idb-ui-input',
      {
        description: 'Input text and keyboard commands.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
          operation: z.enum(['text', 'key', 'key-sequence']).describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
          text: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
          key: z.enum(['home', 'lock', 'siri', 'delete', 'return', 'space', 'escape', 'tab', 'up', 'down', 'left', 'right']).optional().describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
          keySequence: z.array(z.string()).optional().describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
          actionName: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
          fieldContext: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
          expectedOutcome: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
          isSensitive: z.boolean().optional().describe('Use rtfm({ toolName: "idb-ui-input" }) for details'),
        },
      },
      async args => idbUiInputTool(args)
    );

    this.server.registerTool(
      'idb-ui-gesture',
      {
        description: 'Perform gestures and button presses.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          operation: z.enum(['swipe', 'button']).describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          startX: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          startY: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          endX: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          endY: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          duration: z.number().default(500).describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          buttonType: z.enum(['HOME', 'LOCK', 'SIDE_BUTTON', 'APPLE_PAY', 'SIRI', 'SCREENSHOT', 'APP_SWITCH']).optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          actionName: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
          expectedOutcome: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-gesture" }) for details'),
        },
      },
      async args => idbUiGestureTool(args)
    );

    this.server.registerTool(
      'idb-ui-describe',
      {
        description: 'Query UI accessibility tree.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-describe" }) for details'),
          operation: z.enum(['all', 'point']).describe('Use rtfm({ toolName: "idb-ui-describe" }) for details'),
          x: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-describe" }) for details'),
          y: z.number().optional().describe('Use rtfm({ toolName: "idb-ui-describe" }) for details'),
          screenContext: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-describe" }) for details'),
          purposeDescription: z.string().optional().describe('Use rtfm({ toolName: "idb-ui-describe" }) for details'),
        },
      },
      async args => idbUiDescribeTool(args)
    );

    this.server.registerTool(
      'idb-list-apps',
      {
        description: 'List installed iOS applications.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-list-apps" }) for details'),
          filterType: z.enum(['system', 'user', 'internal']).optional().describe('Use rtfm({ toolName: "idb-list-apps" }) for details'),
          runningOnly: z.boolean().optional().describe('Use rtfm({ toolName: "idb-list-apps" }) for details'),
        },
      },
      async args => idbListAppsTool(args)
    );

    this.server.registerTool(
      'idb-install',
      {
        description: 'Install application to iOS target.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-install" }) for details'),
          appPath: z.string().describe('Use rtfm({ toolName: "idb-install" }) for details'),
        },
      },
      async args => idbInstallTool(args)
    );

    this.server.registerTool(
      'idb-launch',
      {
        description: 'Launch application on iOS target.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-launch" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "idb-launch" }) for details'),
          streamOutput: z.boolean().optional().describe('Use rtfm({ toolName: "idb-launch" }) for details'),
          arguments: z.array(z.string()).optional().describe('Use rtfm({ toolName: "idb-launch" }) for details'),
          environment: z.record(z.string()).optional().describe('Use rtfm({ toolName: "idb-launch" }) for details'),
        },
      },
      async args => idbLaunchTool(args)
    );

    this.server.registerTool(
      'idb-terminate',
      {
        description: 'Terminate running iOS application.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-terminate" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "idb-terminate" }) for details'),
        },
      },
      async args => idbTerminateTool(args)
    );

    this.server.registerTool(
      'idb-uninstall',
      {
        description: 'Uninstall application from iOS target.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "idb-uninstall" }) for details'),
          bundleId: z.string().describe('Use rtfm({ toolName: "idb-uninstall" }) for details'),
        },
      },
      async args => idbUninstallTool(args)
    );

    // Cache Management Tools (5 total)
    this.server.registerTool(
      'list-cached-responses',
      {
        description: 'List recent cached results.\n\nUse rtfm for details.',
        inputSchema: {
          tool: z.string().optional().describe('Use rtfm({ toolName: "list-cached-responses" }) for details'),
          limit: z.number().default(10).describe('Use rtfm({ toolName: "list-cached-responses" }) for details'),
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
        description: 'Get cache statistics across layers.\n\nUse rtfm for details.',
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
        description: 'Get current cache configuration.\n\nUse rtfm for details.',
        inputSchema: {
          cacheType: z.enum(['simulator', 'project', 'response', 'all']).default('all').describe('Use rtfm({ toolName: "cache-get-config" }) for details'),
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
        description: 'Fine-tune cache settings for workflow.\n\nUse rtfm for details.',
        inputSchema: {
          cacheType: z.enum(['simulator', 'project', 'response', 'all']).describe('Use rtfm({ toolName: "cache-set-config" }) for details'),
          maxAgeMs: z.number().optional().describe('Use rtfm({ toolName: "cache-set-config" }) for details'),
          maxAgeMinutes: z.number().optional().describe('Use rtfm({ toolName: "cache-set-config" }) for details'),
          maxAgeHours: z.number().optional().describe('Use rtfm({ toolName: "cache-set-config" }) for details'),
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
        description: 'Clear cached data for fresh retrieval.\n\nUse rtfm for details.',
        inputSchema: {
          cacheType: z.enum(['simulator', 'project', 'response', 'all']).describe('Use rtfm({ toolName: "cache-clear" }) for details'),
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
        description: 'Enable file-based persistence across restarts.\n\nUse rtfm for details.',
        inputSchema: {
          cacheDir: z.string().optional().describe('Use rtfm({ toolName: "persistence-enable" }) for details'),
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
        description: 'Disable persistence and return to memory.\n\nUse rtfm for details.',
        inputSchema: {
          clearData: z.boolean().default(false).describe('Use rtfm({ toolName: "persistence-disable" }) for details'),
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
        description: 'Get detailed persistence system status.\n\nUse rtfm for details.',
        inputSchema: {
          includeStorageInfo: z.boolean().default(true).describe('Use rtfm({ toolName: "persistence-status" }) for details'),
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
        description: 'Get full documentation for any tool.\n\nUse rtfm for details.',
        inputSchema: {
          toolName: z.string().optional().describe('Use rtfm({ toolName: "rtfm" }) for details'),
          categoryName: z.string().optional().describe('Use rtfm({ toolName: "rtfm" }) for details'),
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
        description: 'Save screenshot to file via simctl-io.\n\nUse rtfm for details.',
        inputSchema: {
          udid: z.string().optional().describe('Use rtfm({ toolName: "screenshot-save" }) for details'),
          operation: z.enum(['screenshot', 'video']).describe('Use rtfm({ toolName: "screenshot-save" }) for details'),
          appName: z.string().optional().describe('Use rtfm({ toolName: "screenshot-save" }) for details'),
          screenName: z.string().optional().describe('Use rtfm({ toolName: "screenshot-save" }) for details'),
          state: z.string().optional().describe('Use rtfm({ toolName: "screenshot-save" }) for details'),
          outputPath: z.string().optional().describe('Use rtfm({ toolName: "screenshot-save" }) for details'),
          codec: z.enum(['h264', 'hevc', 'prores']).optional().describe('Use rtfm({ toolName: "screenshot-save" }) for details'),
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
