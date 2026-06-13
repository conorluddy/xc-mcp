import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { validateXcodeInstallation } from '../utils/validation.js';
import { getDescription } from './types.js';
import {
  workflowTapElementTool,
  WORKFLOW_TAP_ELEMENT_DOCS,
  WORKFLOW_TAP_ELEMENT_DOCS_MINI,
} from '../tools/workflows/tap-element.js';
import {
  workflowFreshInstallTool,
  WORKFLOW_FRESH_INSTALL_DOCS,
  WORKFLOW_FRESH_INSTALL_DOCS_MINI,
} from '../tools/workflows/fresh-install.js';
import {
  buildAndRunTool,
  BUILD_AND_RUN_DOCS,
  BUILD_AND_RUN_DOCS_MINI,
} from '../tools/workflows/build-and-run.js';
import {
  testRecordStepTool,
  TEST_RECORD_STEP_DOCS,
  TEST_RECORD_STEP_DOCS_MINI,
} from '../tools/workflows/test-record-step.js';
import {
  testRecordReportTool,
  TEST_RECORD_REPORT_DOCS,
  TEST_RECORD_REPORT_DOCS_MINI,
} from '../tools/workflows/test-record-report.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

export function registerWorkflowTools(server: McpServer): void {
  // workflow-tap-element
  server.registerTool(
    'workflow-tap-element',
    {
      title: 'Tap Element (Workflow)',
      description: getDescription(WORKFLOW_TAP_ELEMENT_DOCS, WORKFLOW_TAP_ELEMENT_DOCS_MINI),
      inputSchema: {
        elementQuery: z.string().describe('Search term for element (e.g., "Login", "Submit")'),
        inputText: z.string().optional().describe('Text to type after tapping'),
        verifyResult: z.boolean().default(false).describe('Take screenshot after action'),
        udid: z.string().optional().describe('Target device'),
        screenContext: z.string().optional().describe('Screen name for tracking'),
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
        return await workflowTapElementTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // workflow-fresh-install
  server.registerTool(
    'workflow-fresh-install',
    {
      title: 'Fresh Install (Workflow)',
      description: getDescription(WORKFLOW_FRESH_INSTALL_DOCS, WORKFLOW_FRESH_INSTALL_DOCS_MINI),
      inputSchema: {
        projectPath: z.string().describe('Path to .xcodeproj or .xcworkspace'),
        scheme: z.string().describe('Build scheme name'),
        simulatorUdid: z.string().optional().describe('Target simulator'),
        eraseSimulator: z.boolean().default(false).describe('Wipe simulator data'),
        configuration: z.enum(['Debug', 'Release']).default('Debug'),
        launchArguments: z.array(z.string()).optional(),
        environmentVariables: z.record(z.string(), z.string()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      ...DEFER_LOADING_CONFIG,
    },
    async args => {
      try {
        await validateXcodeInstallation();
        return await workflowFreshInstallTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // workflow-build-and-run
  server.registerTool(
    'workflow-build-and-run',
    {
      title: 'Build & Run (Workflow)',
      description: getDescription(BUILD_AND_RUN_DOCS, BUILD_AND_RUN_DOCS_MINI),
      inputSchema: {
        projectPath: z.string().describe('Path to .xcodeproj or .xcworkspace'),
        scheme: z.string().describe('Build scheme name'),
        configuration: z.string().optional().describe('Build configuration (default: "Debug")'),
        simulatorUdid: z
          .string()
          .optional()
          .describe('Target simulator UDID - auto-detected if omitted'),
        launchArguments: z.array(z.string()).optional().describe('App launch arguments'),
        environmentVariables: z
          .record(z.string(), z.string())
          .optional()
          .describe('App environment variables'),
        takeScreenshot: z.boolean().optional().describe('Capture screenshot after launch'),
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
        return await buildAndRunTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // test-record-step
  server.registerTool(
    'test-record-step',
    {
      title: 'Record Test Step',
      description: getDescription(TEST_RECORD_STEP_DOCS, TEST_RECORD_STEP_DOCS_MINI),
      inputSchema: {
        sessionName: z.string().describe('Recording session name'),
        label: z.string().describe('Human description of this step'),
        udid: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        assertion: z.string().optional(),
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
        return await testRecordStepTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // test-record-report
  server.registerTool(
    'test-record-report',
    {
      title: 'Generate Test Recording Report',
      description: getDescription(TEST_RECORD_REPORT_DOCS, TEST_RECORD_REPORT_DOCS_MINI),
      inputSchema: {
        sessionName: z.string().describe('Recording session name'),
        testName: z.string().optional().describe('Report title (defaults to sessionName)'),
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
        return await testRecordReportTool(args);
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
