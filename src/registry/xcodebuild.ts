import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateXcodeInstallation } from '../utils/validation.js';
import { xcodebuildVersionTool } from '../tools/xcodebuild/version.js';
import { XCODEBUILD_VERSION_DOCS } from '../tools/xcodebuild/version.js';
import { xcodebuildListTool } from '../tools/xcodebuild/list.js';
import { XCODEBUILD_LIST_DOCS } from '../tools/xcodebuild/list.js';
import { xcodebuildBuildTool } from '../tools/xcodebuild/build.js';
import { XCODEBUILD_BUILD_DOCS } from '../tools/xcodebuild/build.js';
import { xcodebuildCleanTool } from '../tools/xcodebuild/clean.js';
import { XCODEBUILD_CLEAN_DOCS } from '../tools/xcodebuild/clean.js';
import { xcodebuildTestTool } from '../tools/xcodebuild/xcodebuild-test.js';
import { XCODEBUILD_TEST_DOCS } from '../tools/xcodebuild/xcodebuild-test.js';
import { xcodebuildGetDetailsTool } from '../tools/xcodebuild/get-details.js';
import { XCODEBUILD_GET_DETAILS_DOCS } from '../tools/xcodebuild/get-details.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

export function registerXcodebuildTools(server: McpServer): void {
  // xcodebuild-version
  server.registerTool(
    'xcodebuild-version',
    {
      description: XCODEBUILD_VERSION_DOCS,
      inputSchema: {
        sdk: z.string().optional(),
        outputFormat: z.enum(['json', 'text']).default('json'),
      },
      ...DEFER_LOADING_CONFIG,
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

  // xcodebuild-list
  server.registerTool(
    'xcodebuild-list',
    {
      description: XCODEBUILD_LIST_DOCS,
      inputSchema: {
        projectPath: z.string(),
        outputFormat: z.enum(['json', 'text']).default('json'),
      },
      ...DEFER_LOADING_CONFIG,
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

  // xcodebuild-build
  server.registerTool(
    'xcodebuild-build',
    {
      description: XCODEBUILD_BUILD_DOCS,
      inputSchema: {
        projectPath: z.string(),
        scheme: z.string(),
        configuration: z.string().default('Debug'),
        destination: z.string().optional(),
        sdk: z.string().optional(),
        derivedDataPath: z.string().optional(),
      },
      ...DEFER_LOADING_CONFIG,
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

  // xcodebuild-clean
  server.registerTool(
    'xcodebuild-clean',
    {
      description: XCODEBUILD_CLEAN_DOCS,
      inputSchema: {
        projectPath: z.string(),
        scheme: z.string(),
        configuration: z.string().optional(),
      },
      ...DEFER_LOADING_CONFIG,
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

  // xcodebuild-test
  server.registerTool(
    'xcodebuild-test',
    {
      description: XCODEBUILD_TEST_DOCS,
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
      ...DEFER_LOADING_CONFIG,
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

  // xcodebuild-get-details
  server.registerTool(
    'xcodebuild-get-details',
    {
      description: XCODEBUILD_GET_DETAILS_DOCS,
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
      ...DEFER_LOADING_CONFIG,
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
}
