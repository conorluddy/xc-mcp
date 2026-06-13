import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { getDescription } from './types.js';
import {
  localizationAuditTool,
  LOCALIZATION_AUDIT_DOCS,
  LOCALIZATION_AUDIT_DOCS_MINI,
} from '../tools/analysis/localization-audit.js';
import {
  xcodeModelInspectTool,
  XCODE_MODEL_INSPECT_DOCS,
  XCODE_MODEL_INSPECT_DOCS_MINI,
} from '../tools/analysis/model-inspect.js';
import {
  visualDiffTool,
  VISUAL_DIFF_DOCS,
  VISUAL_DIFF_DOCS_MINI,
} from '../tools/io/visual-diff.js';

const ENABLE_DEFER_LOADING = process.env.XC_MCP_DEFER_LOADING !== 'false';
const DEFER_LOADING_CONFIG = ENABLE_DEFER_LOADING
  ? ({ defer_loading: true } as Record<string, unknown>)
  : {};

/**
 * Register static-analysis tools: localization audit, Core Data/SwiftData model
 * inspection, and screenshot visual diffing. These analyze project files and image
 * artifacts — no simulator interaction (except none here require Xcode validation).
 */
export function registerAnalysisTools(server: McpServer): void {
  // localization-audit
  server.registerTool(
    'localization-audit',
    {
      title: 'Audit Localization Catalog',
      description: getDescription(LOCALIZATION_AUDIT_DOCS, LOCALIZATION_AUDIT_DOCS_MINI),
      inputSchema: {
        catalogPath: z.string(),
        sourceDir: z.string().optional(),
        strict: z.boolean().optional(),
        verbose: z.boolean().optional(),
      },
      outputSchema: {
        totalKeys: z.number(),
        localeCount: z.number(),
        gapCount: z.number(),
        placeholderMismatchCount: z.number(),
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
        return await localizationAuditTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // xcode-model-inspect
  server.registerTool(
    'xcode-model-inspect',
    {
      title: 'Inspect Core Data / SwiftData Models',
      description: getDescription(XCODE_MODEL_INSPECT_DOCS, XCODE_MODEL_INSPECT_DOCS_MINI),
      inputSchema: {
        projectPath: z.string().optional(),
        coreDataOnly: z.boolean().optional(),
        swiftDataOnly: z.boolean().optional(),
        showVersions: z.boolean().optional(),
        raw: z.string().optional(),
        verbose: z.boolean().optional(),
      },
      outputSchema: {
        coreDataModels: z.number(),
        swiftDataModels: z.number(),
        totalEntities: z.number(),
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
        return await xcodeModelInspectTool(args);
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // visual-diff
  server.registerTool(
    'visual-diff',
    {
      title: 'Compare Screenshots (Pixel Diff)',
      description: getDescription(VISUAL_DIFF_DOCS, VISUAL_DIFF_DOCS_MINI),
      inputSchema: {
        baselinePath: z.string(),
        currentPath: z.string(),
        outputDir: z.string().optional(),
        threshold: z.number().optional(),
      },
      outputSchema: {
        differentPixels: z.number(),
        differencePercentage: z.number(),
        passed: z.boolean(),
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
        return await visualDiffTool(args);
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
