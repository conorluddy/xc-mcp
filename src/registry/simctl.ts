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
  simctlHealthCheckTool,
  SIMCTL_HEALTH_CHECK_DOCS,
  SIMCTL_HEALTH_CHECK_DOCS_MINI,
} from '../tools/simctl/health-check.js';
import { simctlBootTool, SIMCTL_BOOT_DOCS } from '../tools/simctl/boot.js';
import { simctlShutdownTool, SIMCTL_SHUTDOWN_DOCS } from '../tools/simctl/shutdown.js';
import { simctlCreateTool, SIMCTL_CREATE_DOCS } from '../tools/simctl/create.js';
import { simctlDeleteTool, SIMCTL_DELETE_DOCS } from '../tools/simctl/delete.js';
import { simctlEraseTool, SIMCTL_ERASE_DOCS } from '../tools/simctl/erase.js';
import { simctlCloneTool, SIMCTL_CLONE_DOCS } from '../tools/simctl/clone.js';
import { simctlRenameTool, SIMCTL_RENAME_DOCS } from '../tools/simctl/rename.js';
import { simctlInstallTool, SIMCTL_INSTALL_DOCS } from '../tools/simctl/install.js';
import { simctlUninstallTool, SIMCTL_UNINSTALL_DOCS } from '../tools/simctl/uninstall.js';
import { simctlLaunchTool, SIMCTL_LAUNCH_DOCS } from '../tools/simctl/launch.js';
import { simctlTerminateTool, SIMCTL_TERMINATE_DOCS } from '../tools/simctl/terminate.js';
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
import { simctlAddmediaTool, SIMCTL_ADDMEDIA_DOCS } from '../tools/simctl/addmedia.js';
import { simctlPbcopyTool, SIMCTL_PBCOPY_DOCS } from '../tools/simctl/pbcopy.js';
import { simctlPrivacyTool, SIMCTL_PRIVACY_DOCS } from '../tools/simctl/privacy.js';
import { simctlStatusBarTool, SIMCTL_STATUS_BAR_DOCS } from '../tools/simctl/status-bar.js';
import { streamLogsTool, SIMCTL_STREAM_LOGS_DOCS } from '../tools/simctl/stream-logs.js';
import { simctlSuggestTool, SIMCTL_SUGGEST_DOCS } from '../tools/simctl/suggest.js';

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
      title: 'List Simulators',
      description: getDescription(SIMCTL_LIST_DOCS, SIMCTL_LIST_DOCS_MINI),
      inputSchema: {
        deviceType: z.string().optional(),
        runtime: z.string().optional(),
        availability: z.enum(['available', 'unavailable', 'all']).default('available'),
        outputFormat: z.enum(['json', 'text']).default('json'),
        concise: z.boolean().default(true),
        max: z.number().default(5),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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
      title: 'Get Simulator List Details',
      description: getDescription(SIMCTL_GET_DETAILS_DOCS, SIMCTL_GET_DETAILS_DOCS_MINI),
      inputSchema: {
        cacheId: z.string(),
        detailType: z.enum(['full-list', 'devices-only', 'runtimes-only', 'available-only']),
        deviceType: z.string().optional(),
        runtime: z.string().optional(),
        maxDevices: z.number().default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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

  // simctl-boot
  server.registerTool(
    'simctl-boot',
    {
      title: 'Boot Simulator',
      description: getDescription(SIMCTL_BOOT_DOCS, SIMCTL_BOOT_DOCS),
      inputSchema: {
        deviceId: z.string(),
        waitForBoot: z.boolean().default(true),
        openGui: z.boolean().default(true),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-shutdown
  server.registerTool(
    'simctl-shutdown',
    {
      title: 'Shutdown Simulator',
      description: getDescription(SIMCTL_SHUTDOWN_DOCS, SIMCTL_SHUTDOWN_DOCS),
      inputSchema: {
        deviceId: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-create
  server.registerTool(
    'simctl-create',
    {
      title: 'Create Simulator',
      description: getDescription(SIMCTL_CREATE_DOCS, SIMCTL_CREATE_DOCS),
      inputSchema: {
        name: z.string(),
        deviceType: z.string(),
        runtime: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-delete
  server.registerTool(
    'simctl-delete',
    {
      title: 'Delete Simulator',
      description: getDescription(SIMCTL_DELETE_DOCS, SIMCTL_DELETE_DOCS),
      inputSchema: {
        deviceId: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-erase
  server.registerTool(
    'simctl-erase',
    {
      title: 'Erase Simulator (Factory Reset)',
      description: getDescription(SIMCTL_ERASE_DOCS, SIMCTL_ERASE_DOCS),
      inputSchema: {
        deviceId: z.string(),
        force: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-clone
  server.registerTool(
    'simctl-clone',
    {
      title: 'Clone Simulator',
      description: getDescription(SIMCTL_CLONE_DOCS, SIMCTL_CLONE_DOCS),
      inputSchema: {
        deviceId: z.string(),
        newName: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-rename
  server.registerTool(
    'simctl-rename',
    {
      title: 'Rename Simulator',
      description: getDescription(SIMCTL_RENAME_DOCS, SIMCTL_RENAME_DOCS),
      inputSchema: {
        deviceId: z.string(),
        newName: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-health-check
  server.registerTool(
    'simctl-health-check',
    {
      title: 'Simulator Environment Health Check',
      description: getDescription(SIMCTL_HEALTH_CHECK_DOCS, SIMCTL_HEALTH_CHECK_DOCS_MINI),
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
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

  // simctl-install
  server.registerTool(
    'simctl-install',
    {
      title: 'Install App on Simulator',
      description: getDescription(SIMCTL_INSTALL_DOCS, SIMCTL_INSTALL_DOCS),
      inputSchema: {
        udid: z.string(),
        appPath: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-uninstall
  server.registerTool(
    'simctl-uninstall',
    {
      title: 'Uninstall App from Simulator',
      description: getDescription(SIMCTL_UNINSTALL_DOCS, SIMCTL_UNINSTALL_DOCS),
      inputSchema: {
        udid: z.string(),
        bundleId: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-launch
  server.registerTool(
    'simctl-launch',
    {
      title: 'Launch App on Simulator',
      description: getDescription(SIMCTL_LAUNCH_DOCS, SIMCTL_LAUNCH_DOCS),
      inputSchema: {
        udid: z.string(),
        bundleId: z.string(),
        arguments: z.array(z.string()).optional(),
        environment: z.record(z.string(), z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-terminate
  server.registerTool(
    'simctl-terminate',
    {
      title: 'Terminate App on Simulator',
      description: getDescription(SIMCTL_TERMINATE_DOCS, SIMCTL_TERMINATE_DOCS),
      inputSchema: {
        udid: z.string(),
        bundleId: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-get-app-container
  server.registerTool(
    'simctl-get-app-container',
    {
      title: 'Get App Container Path',
      description: getDescription(
        SIMCTL_GET_APP_CONTAINER_DOCS,
        SIMCTL_GET_APP_CONTAINER_DOCS_MINI
      ),
      inputSchema: {
        udid: z.string(),
        bundleId: z.string(),
        containerType: z.enum(['bundle', 'data', 'group']).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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
      title: 'Open URL on Simulator',
      description: getDescription(SIMCTL_OPENURL_DOCS, SIMCTL_OPENURL_DOCS_MINI),
      inputSchema: {
        udid: z.string(),
        url: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
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
      title: 'Simulator Screenshot/Video Capture',
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
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
      title: 'Send Push Notification',
      description: getDescription(SIMCTL_PUSH_DOCS, SIMCTL_PUSH_DOCS_MINI),
      inputSchema: {
        udid: z.string(),
        bundleId: z.string(),
        payload: z.string(),
        testName: z.string().optional(),
        expectedBehavior: z.string().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
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
      title: 'Inline Simulator Screenshot',
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
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
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

  // simctl-addmedia
  server.registerTool(
    'simctl-addmedia',
    {
      title: 'Add Media to Simulator',
      description: getDescription(SIMCTL_ADDMEDIA_DOCS, SIMCTL_ADDMEDIA_DOCS),
      inputSchema: {
        udid: z.string(),
        mediaPath: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-pbcopy
  server.registerTool(
    'simctl-pbcopy',
    {
      title: 'Copy Text to Simulator Clipboard',
      description: getDescription(SIMCTL_PBCOPY_DOCS, SIMCTL_PBCOPY_DOCS),
      inputSchema: {
        udid: z.string(),
        text: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-privacy
  server.registerTool(
    'simctl-privacy',
    {
      title: 'Manage App Privacy Permissions',
      description: getDescription(SIMCTL_PRIVACY_DOCS, SIMCTL_PRIVACY_DOCS),
      inputSchema: {
        udid: z.string(),
        bundleId: z.string(),
        action: z.enum(['grant', 'revoke', 'reset']),
        service: z.string(),
        scenario: z.string().optional(),
        step: z.number().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-status-bar
  server.registerTool(
    'simctl-status-bar',
    {
      title: 'Override Simulator Status Bar',
      description: getDescription(SIMCTL_STATUS_BAR_DOCS, SIMCTL_STATUS_BAR_DOCS),
      inputSchema: {
        udid: z.string(),
        operation: z.enum(['override', 'clear']),
        time: z.string().optional(),
        dataNetwork: z.string().optional(),
        wifiMode: z.string().optional(),
        batteryState: z.string().optional(),
        batteryLevel: z.number().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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

  // simctl-stream-logs
  server.registerTool(
    'simctl-stream-logs',
    {
      title: 'Stream Simulator Logs',
      description: getDescription(SIMCTL_STREAM_LOGS_DOCS, SIMCTL_STREAM_LOGS_DOCS),
      inputSchema: {
        udid: z.string(),
        bundleId: z.string().optional(),
        predicate: z.string().optional(),
        duration: z.number().optional(),
        capture: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        return await streamLogsTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // simctl-suggest
  server.registerTool(
    'simctl-suggest',
    {
      title: 'Suggest Best Simulator',
      description: getDescription(SIMCTL_SUGGEST_DOCS, SIMCTL_SUGGEST_DOCS),
      inputSchema: {
        projectPath: z.string().optional(),
        deviceType: z.string().optional(),
        maxSuggestions: z.number().optional(),
        autoBootTopSuggestion: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
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
}
