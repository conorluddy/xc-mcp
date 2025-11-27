import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateXcodeInstallation } from '../utils/validation.js';
import { getDescription } from './types.js';
import { simctlListTool, SIMCTL_LIST_DOCS, SIMCTL_LIST_DOCS_MINI } from '../tools/simctl/list.js';
import {
  simctlGetDetailsTool,
  SIMCTL_GET_DETAILS_DOCS,
  SIMCTL_GET_DETAILS_DOCS_MINI,
} from '../tools/simctl/get-details.js';
import {
  simctlDeviceTool,
  SIMCTL_DEVICE_DOCS,
  SIMCTL_DEVICE_DOCS_MINI,
} from '../tools/simctl/device/index.js';
import {
  simctlHealthCheckTool,
  SIMCTL_HEALTH_CHECK_DOCS,
  SIMCTL_HEALTH_CHECK_DOCS_MINI,
} from '../tools/simctl/health-check.js';
import { simctlAppTool, SIMCTL_APP_DOCS, SIMCTL_APP_DOCS_MINI } from '../tools/simctl/app/index.js';
import {
  simctlGetAppContainerTool,
  SIMCTL_GET_APP_CONTAINER_DOCS,
  SIMCTL_GET_APP_CONTAINER_DOCS_MINI,
} from '../tools/simctl/get-app-container.js';
import {
  simctlOpenUrlTool,
  SIMCTL_OPENURL_DOCS,
  SIMCTL_OPENURL_DOCS_MINI,
} from '../tools/simctl/openurl.js';
import { simctlIoTool, SIMCTL_IO_DOCS, SIMCTL_IO_DOCS_MINI } from '../tools/simctl/io.js';
import { simctlPushTool, SIMCTL_PUSH_DOCS, SIMCTL_PUSH_DOCS_MINI } from '../tools/simctl/push.js';
import {
  simctlScreenshotInlineTool,
  SIMCTL_SCREENSHOT_INLINE_DOCS,
  SIMCTL_SCREENSHOT_INLINE_DOCS_MINI,
} from '../tools/simctl/screenshot-inline.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

/**
 * Register only simctl-list tool (used in build-only mode for simulator discovery)
 */
export function registerSimctlListTool(server: McpServer): void {
  server.registerTool(
    'simctl-list',
    {
      description: getDescription(SIMCTL_LIST_DOCS, SIMCTL_LIST_DOCS_MINI),
      inputSchema: {
        deviceType: z.string().optional(),
        runtime: z.string().optional(),
        availability: z.enum(['available', 'unavailable', 'all']).default('available'),
        outputFormat: z.enum(['json', 'text']).default('json'),
        concise: z.boolean().default(true),
        max: z.number().default(5),
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
}

/**
 * Register all simctl tools except simctl-list (which is registered separately)
 */
export function registerSimctlTools(server: McpServer): void {
  // simctl-get-details
  server.registerTool(
    'simctl-get-details',
    {
      description: getDescription(SIMCTL_GET_DETAILS_DOCS, SIMCTL_GET_DETAILS_DOCS_MINI),
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
      description: getDescription(SIMCTL_DEVICE_DOCS, SIMCTL_DEVICE_DOCS_MINI),
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
      description: getDescription(SIMCTL_HEALTH_CHECK_DOCS, SIMCTL_HEALTH_CHECK_DOCS_MINI),
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
      description: getDescription(SIMCTL_APP_DOCS, SIMCTL_APP_DOCS_MINI),
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
      description: getDescription(
        SIMCTL_GET_APP_CONTAINER_DOCS,
        SIMCTL_GET_APP_CONTAINER_DOCS_MINI
      ),
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
      description: getDescription(SIMCTL_OPENURL_DOCS, SIMCTL_OPENURL_DOCS_MINI),
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
      description: getDescription(SIMCTL_IO_DOCS, SIMCTL_IO_DOCS_MINI),
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
      description: getDescription(SIMCTL_PUSH_DOCS, SIMCTL_PUSH_DOCS_MINI),
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
      description: getDescription(
        SIMCTL_SCREENSHOT_INLINE_DOCS,
        SIMCTL_SCREENSHOT_INLINE_DOCS_MINI
      ),
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
