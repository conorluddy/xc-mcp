#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// ============================================================================
// MINI VARIANT: CORE BUILD/TEST TOOLS ONLY
// ============================================================================
//
// This is the minimal xc-mcp-mini variant providing only 3 core tools:
// - xcodebuild-build: Build projects with smart defaults
// - xcodebuild-test: Run tests with intelligent caching
// - xcodebuild-get-details: Progressive disclosure for build/test logs
//
// Why these 3 tools cover 95% of workflows:
// 1. build tool auto-invokes simulator selection and boot internally
// 2. test tool shares cached configs from build (no manual setup needed)
// 3. get-details provides full logs only when errors need investigation
//
// This optimizes agent context budgets: 3 tools vs 51 in full xc-mcp.
// For advanced features (UI automation, simulator management, etc), use xc-mcp.

import { xcodebuildBuildTool } from './tools/xcodebuild/build.js';
import { xcodebuildTestTool } from './tools/xcodebuild/xcodebuild-test.js';
import { xcodebuildGetDetailsTool } from './tools/xcodebuild/get-details.js';
import { validateXcodeInstallation } from './utils/validation.js';

class XcodeMiniMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer(
      {
        name: 'xc-mcp-mini',
        version: '1.0.0',
        description:
          'Minimal iOS build/test MCP server with 3 core tools. ' +
          'Optimized for AI agent workflows: build projects, run tests, and investigate failures. ' +
          'Build and test tools auto-invoke simulator management internally (no manual setup required). ' +
          'For advanced features like UI automation and simulator lifecycle management, use xc-mcp (51 tools).',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerTools();
    this.setupErrorHandling();
  }

  // ============================================================================
  // TOOL REGISTRATION - MINI VARIANT (3 TOOLS)
  // ============================================================================
  //
  // Only registers core build/test workflow tools.
  // These tools internally handle:
  // - Simulator discovery via simulatorCache.getPreferredSimulator()
  // - Simulator boot via internal checks
  // - Configuration learning via projectCache
  // - Progressive disclosure via buildId/testId
  //
  // No manual simulator management, caching, or IDB tools exposed to agents.

  private async registerTools() {
    // ============================================================================
    // TOOL 1: xcodebuild-build
    // ============================================================================
    // Primary build execution with intelligent defaults
    // - Auto-selects simulator via internal cache queries
    // - Auto-boots simulator if needed
    // - Returns buildId for progressive disclosure
    // - Records successful configs for future builds

    this.server.registerTool(
      'xcodebuild-build',
      {
        description: `⚡ Build Xcode projects with intelligent caching and performance tracking.

Advantages: Learns successful configs, tracks build performance, progressive disclosure for large logs, structured error output.

📖 Use xcodebuild-get-details with buildId for full logs when needed.`,
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

    // ============================================================================
    // TOOL 2: xcodebuild-test
    // ============================================================================
    // Test execution with same smart defaults as build
    // - Reuses learned configs from build tool
    // - Auto-selects simulators via shared cache
    // - Returns testId for progressive disclosure
    // - Supports test filtering and test-without-building

    this.server.registerTool(
      'xcodebuild-test',
      {
        description: `⚡ Run tests with intelligent caching and progressive disclosure.

Advantages: Learns test configs, detailed metrics with token-safe disclosure, structured failures, supports test filtering patterns.

📖 Use xcodebuild-get-details with testId for full logs when needed.`,
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

    // ============================================================================
    // TOOL 3: xcodebuild-get-details
    // ============================================================================
    // Progressive disclosure for build/test logs
    // - Retrieves full logs from cached buildId/testId
    // - Supports filtering (errors-only, warnings-only, etc)
    // - Only called when agent needs detailed investigation
    // - Prevents token overflow by keeping logs out of initial responses

    this.server.registerTool(
      'xcodebuild-get-details',
      {
        description: `Get details from cached build/test results with progressive disclosure.

📖 Retrieves full logs, errors, warnings, or summaries for previous build/test operations.`,
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
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  private setupErrorHandling() {
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  // ============================================================================
  // SERVER LIFECYCLE
  // ============================================================================

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('xc-mcp-mini MCP server running on stdio');
    console.error('Mini variant with 3 core build/test tools');
    console.error('For full feature set (51 tools), use xc-mcp package');
  }
}

const server = new XcodeMiniMCPServer();
server.run().catch(console.error);
