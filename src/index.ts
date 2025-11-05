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
          'Wraps xcodebuild, simctl, and IDB with intelligent caching, for efficient iOS development. The RTFM tool can be called with any of the tool names to return further documentation if required. Tool descriptions are intentionally minimal to reduce MCP context usage.',
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

    this.server.registerTool(
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

    this.server.registerTool(
      'xcodebuild-showsdks',
      {
        description: 'List available SDKs.',
        inputSchema: {
          outputFormat: z.enum(['json', 'text']).default('json'),
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

    this.server.registerTool(
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

    this.server.registerTool(
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

    this.server.registerTool(
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
    this.server.registerTool(
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

    this.server.registerTool(
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

    this.server.registerTool(
      'simctl-boot',
      {
        description: 'Boot simulator.',
        inputSchema: {
          deviceId: z.string(),
          waitForBoot: z.boolean().default(true),
          openGui: z.boolean().default(true),
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
        description: 'Shutdown simulator.',
        inputSchema: {
          deviceId: z.string(),
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
        description: 'Recommend best simulators.',
        inputSchema: {
          projectPath: z.string().optional(),
          deviceType: z.string().optional(),
          maxSuggestions: z.number().default(4),
          autoBootTopSuggestion: z.boolean().default(false),
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
        description: 'Create simulator device.',
        inputSchema: {
          name: z.string(),
          deviceType: z.string(),
          runtime: z.string().optional(),
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
        description: 'Delete simulator device.',
        inputSchema: {
          deviceId: z.string(),
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
        description: 'Reset simulator to factory settings.',
        inputSchema: {
          deviceId: z.string(),
          force: z.boolean().default(false),
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
        description: 'Clone simulator.',
        inputSchema: {
          deviceId: z.string(),
          newName: z.string(),
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
        description: 'Rename simulator.',
        inputSchema: {
          deviceId: z.string(),
          newName: z.string(),
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

    // Phase 3: App Lifecycle & Testing Tools (11 total)
    // App Management Tools
    this.server.registerTool(
      'simctl-install',
      {
        description: 'Install app on simulator.',
        inputSchema: {
          udid: z.string(),
          appPath: z.string(),
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
        description: 'Uninstall app from simulator.',
        inputSchema: {
          udid: z.string(),
          bundleId: z.string(),
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

    // App Control Tools
    this.server.registerTool(
      'simctl-launch',
      {
        description: 'Launch app.',
        inputSchema: {
          udid: z.string(),
          bundleId: z.string(),
          arguments: z.array(z.string()).optional(),
          environment: z.record(z.string()).optional(),
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
        description: 'Terminate running app.',
        inputSchema: {
          udid: z.string(),
          bundleId: z.string(),
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
    this.server.registerTool(
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

    this.server.registerTool(
      'simctl-addmedia',
      {
        description: 'Add media to photo library.',
        inputSchema: {
          udid: z.string(),
          mediaPath: z.string(),
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
        description: 'Manage app permissions.',
        inputSchema: {
          udid: z.string(),
          bundleId: z.string(),
          action: z.enum(['grant', 'revoke', 'reset']),
          service: z.string(),
          scenario: z.string().optional(),
          step: z.number().optional(),
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

    this.server.registerTool(
      'simctl-pbcopy',
      {
        description: 'Copy text to clipboard.',
        inputSchema: {
          udid: z.string(),
          text: z.string(),
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
        description: 'Override status bar.',
        inputSchema: {
          udid: z.string(),
          operation: z.enum(['override', 'clear']),
          time: z.string().optional(),
          dataNetwork: z.string().optional(),
          wifiMode: z.string().optional(),
          batteryState: z.string().optional(),
          batteryLevel: z.number().min(0).max(100).optional(),
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
        description: 'Capture screenshot as base64.',
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

    // IDB Tools (11 total) - iOS Development Bridge for UI Automation & App Management
    this.server.registerTool(
      'idb-targets',
      {
        description: 'Query iOS targets.',
        inputSchema: {
          operation: z.enum(['list', 'describe', 'focus']),
          udid: z.string().optional(),
          state: z.enum(['Booted', 'Shutdown']).optional(),
          type: z.enum(['device', 'simulator']).optional(),
        },
      },
      async args => idbTargetsTool(args)
    );

    this.server.registerTool(
      'idb-connect',
      {
        description: 'Manage IDB connections.',
        inputSchema: {
          udid: z.string().optional(),
          operation: z.enum(['connect', 'disconnect']).default('connect'),
        },
      },
      async args => idbConnectTool(args)
    );

    this.server.registerTool(
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

    this.server.registerTool(
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

    this.server.registerTool(
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
          duration: z.number().default(500),
          buttonType: z
            .enum(['HOME', 'LOCK', 'SIDE_BUTTON', 'APPLE_PAY', 'SIRI', 'SCREENSHOT', 'APP_SWITCH'])
            .optional(),
          actionName: z.string().optional(),
          expectedOutcome: z.string().optional(),
        },
      },
      async args => idbUiGestureTool(args)
    );

    this.server.registerTool(
      'idb-ui-describe',
      {
        description: 'Query UI accessibility tree.',
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

    this.server.registerTool(
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

    this.server.registerTool(
      'idb-install',
      {
        description: 'Install app.',
        inputSchema: {
          udid: z.string().optional(),
          appPath: z.string(),
        },
      },
      async args => idbInstallTool(args)
    );

    this.server.registerTool(
      'idb-launch',
      {
        description: 'Launch app.',
        inputSchema: {
          udid: z.string().optional(),
          bundleId: z.string(),
          streamOutput: z.boolean().optional(),
          arguments: z.array(z.string()).optional(),
          environment: z.record(z.string()).optional(),
        },
      },
      async args => idbLaunchTool(args)
    );

    this.server.registerTool(
      'idb-terminate',
      {
        description: 'Terminate app.',
        inputSchema: {
          udid: z.string().optional(),
          bundleId: z.string(),
        },
      },
      async args => idbTerminateTool(args)
    );

    this.server.registerTool(
      'idb-uninstall',
      {
        description: 'Uninstall app.',
        inputSchema: {
          udid: z.string().optional(),
          bundleId: z.string(),
        },
      },
      async args => idbUninstallTool(args)
    );

    // Cache Management Tools (5 total)
    this.server.registerTool(
      'list-cached-responses',
      {
        description: 'List cached responses.',
        inputSchema: {
          tool: z.string().optional(),
          limit: z.number().default(10),
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
        description: 'Get cache statistics.',
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
        description: 'Get cache configuration.',
        inputSchema: {
          cacheType: z.enum(['simulator', 'project', 'response', 'all']).default('all'),
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
        description: 'Configure cache settings.',
        inputSchema: {
          cacheType: z.enum(['simulator', 'project', 'response', 'all']),
          maxAgeMs: z.number().optional(),
          maxAgeMinutes: z.number().optional(),
          maxAgeHours: z.number().optional(),
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
        description: 'Clear cached data.',
        inputSchema: {
          cacheType: z.enum(['simulator', 'project', 'response', 'all']),
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
        description: 'Enable persistence.',
        inputSchema: {
          cacheDir: z.string().optional(),
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
        description: 'Disable persistence.',
        inputSchema: {
          clearData: z.boolean().default(false),
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
        description: 'Get persistence status.',
        inputSchema: {
          includeStorageInfo: z.boolean().default(true),
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

    // Screenshot save alias (file-based variant)
    this.server.registerTool(
      'screenshot-save',
      {
        description: 'Save screenshot to file.',
        inputSchema: {
          udid: z.string().optional(),
          operation: z.enum(['screenshot', 'video']),
          appName: z.string().optional(),
          screenName: z.string().optional(),
          state: z.string().optional(),
          outputPath: z.string().optional(),
          codec: z.enum(['h264', 'hevc', 'prores']).optional(),
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
