import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateXcodeInstallation } from '../utils/validation.js';
import { simctlListTool } from '../tools/simctl/list.js';
import { SIMCTL_LIST_DOCS } from '../tools/simctl/list.js';
import { simctlGetDetailsTool } from '../tools/simctl/get-details.js';
import { SIMCTL_GET_DETAILS_DOCS } from '../tools/simctl/get-details.js';
import { simctlDeviceTool } from '../tools/simctl/device/index.js';
import { SIMCTL_DEVICE_DOCS } from '../tools/simctl/device/index.js';
import { simctlHealthCheckTool } from '../tools/simctl/health-check.js';
import { SIMCTL_HEALTH_CHECK_DOCS } from '../tools/simctl/health-check.js';
import { simctlAppTool } from '../tools/simctl/app/index.js';
import { SIMCTL_APP_DOCS } from '../tools/simctl/app/index.js';
import { simctlGetAppContainerTool } from '../tools/simctl/get-app-container.js';
import { SIMCTL_GET_APP_CONTAINER_DOCS } from '../tools/simctl/get-app-container.js';
import { simctlOpenUrlTool } from '../tools/simctl/openurl.js';
import { SIMCTL_OPENURL_DOCS } from '../tools/simctl/openurl.js';
import { simctlIoTool } from '../tools/simctl/io.js';
import { SIMCTL_IO_DOCS } from '../tools/simctl/io.js';
import { simctlPushTool } from '../tools/simctl/push.js';
import { SIMCTL_PUSH_DOCS } from '../tools/simctl/push.js';
import { simctlScreenshotInlineTool } from '../tools/simctl/screenshot-inline.js';
import { SIMCTL_SCREENSHOT_INLINE_DOCS } from '../tools/simctl/screenshot-inline.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

export function registerSimctlTools(server: McpServer): void {
  // simctl-list
  server.registerTool(
    'simctl-list',
    {
      description: SIMCTL_LIST_DOCS,
      inputSchema: {
        deviceType: z.string().optional(),
        runtime: z.string().optional(),
        availability: z.enum(['available', 'unavailable', 'all']).default('available'),
        outputFormat: z.enum(['json', 'text']).default('json'),
        concise: z.boolean().default(true),
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-get-details
  server.registerTool(
    'simctl-get-details',
    {
      description: SIMCTL_GET_DETAILS_DOCS,
      inputSchema: {
        cacheId: z.string(),
        detailType: z.enum(['full-list', 'devices-only', 'runtimes-only', 'available-only']),
        deviceType: z.string().optional(),
        runtime: z.string().optional(),
        maxDevices: z.number().default(20),
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-device
  server.registerTool(
    'simctl-device',
    {
      description: SIMCTL_DEVICE_DOCS,
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
      ...DEFER_LOADING_CONFIG,
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

  // simctl-health-check
  server.registerTool(
    'simctl-health-check',
    {
      description: SIMCTL_HEALTH_CHECK_DOCS,
      inputSchema: {},
      ...DEFER_LOADING_CONFIG,
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

  // simctl-app
  server.registerTool(
    'simctl-app',
    {
      description: SIMCTL_APP_DOCS,
      inputSchema: {
        operation: z.enum(['install', 'uninstall', 'launch', 'terminate']),
        udid: z.string().optional(),
        bundleId: z.string().optional(),
        appPath: z.string().optional(),
        arguments: z.array(z.string()).optional(),
        environment: z.record(z.string()).optional(),
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-get-app-container
  server.registerTool(
    'simctl-get-app-container',
    {
      description: SIMCTL_GET_APP_CONTAINER_DOCS,
      inputSchema: {
        udid: z.string(),
        bundleId: z.string(),
        containerType: z.enum(['bundle', 'data', 'group']).optional(),
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-openurl
  server.registerTool(
    'simctl-openurl',
    {
      description: SIMCTL_OPENURL_DOCS,
      inputSchema: {
        udid: z.string(),
        url: z.string(),
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-io
  server.registerTool(
    'simctl-io',
    {
      description: SIMCTL_IO_DOCS,
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
      ...DEFER_LOADING_CONFIG,
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

  // simctl-push
  server.registerTool(
    'simctl-push',
    {
      description: SIMCTL_PUSH_DOCS,
      inputSchema: {
        udid: z.string(),
        bundleId: z.string(),
        payload: z.string(),
        testName: z.string().optional(),
        expectedBehavior: z.string().optional(),
      },
      ...DEFER_LOADING_CONFIG,
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

  // screenshot (simctl-screenshot-inline)
  server.registerTool(
    'screenshot',
    {
      description: SIMCTL_SCREENSHOT_INLINE_DOCS,
      inputSchema: {
        udid: z.string().optional(),
        size: z.enum(['full', 'half', 'quarter', 'thumb']).optional(),
        appName: z.string().optional(),
        screenName: z.string().optional(),
        state: z.string().optional(),
        enableCoordinateCaching: z.boolean().optional(),
      },
      ...DEFER_LOADING_CONFIG,
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
}
