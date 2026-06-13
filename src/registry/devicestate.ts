import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateXcodeInstallation } from '../utils/validation.js';
import { getDescription } from './types.js';
import {
  simctlAppearanceTool,
  SIMCTL_APPEARANCE_DOCS,
  SIMCTL_APPEARANCE_DOCS_MINI,
} from '../tools/simctl/appearance.js';
import {
  simctlLocationTool,
  SIMCTL_LOCATION_DOCS,
  SIMCTL_LOCATION_DOCS_MINI,
} from '../tools/simctl/location.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

/**
 * Register device-state tools (appearance/locale, location simulation).
 * These mutate simulator environment state for testing different conditions.
 */
export function registerDeviceStateTools(server: McpServer): void {
  // simctl-appearance
  server.registerTool(
    'simctl-appearance',
    {
      title: 'Set Simulator Appearance/Locale',
      description: getDescription(SIMCTL_APPEARANCE_DOCS, SIMCTL_APPEARANCE_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        theme: z.enum(['light', 'dark']).optional(),
        textSize: z
          .enum(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'AX1', 'AX2', 'AX3', 'AX4', 'AX5'])
          .optional(),
        locale: z.string().optional(),
        region: z.string().optional(),
        bundleId: z.string().optional(),
        reset: z.boolean().optional(),
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
        return await simctlAppearanceTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // simctl-location
  server.registerTool(
    'simctl-location',
    {
      title: 'Simulate Location',
      description: getDescription(SIMCTL_LOCATION_DOCS, SIMCTL_LOCATION_DOCS_MINI),
      inputSchema: {
        udid: z.string().optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        city: z.string().optional(),
        gpx: z.string().optional(),
        waypoints: z.string().optional(),
        speed: z.number().optional(),
        clear: z.boolean().optional(),
        listScenarios: z.boolean().optional(),
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
        return await simctlLocationTool(args);
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
