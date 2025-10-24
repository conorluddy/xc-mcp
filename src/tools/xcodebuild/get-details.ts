import { responseCache } from '../../utils/response-cache.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface GetDetailsArgs {
  buildId: string;
  detailType: 'full-log' | 'errors-only' | 'warnings-only' | 'summary' | 'command' | 'metadata';
  maxLines?: number;
}

/**
 * Retrieve detailed build or test output from cached results (progressive disclosure)
 *
 * **What it does:**
 * Provides on-demand access to full build and test logs that were cached during xcodebuild-build
 * or xcodebuild-test execution. Implements progressive disclosure pattern: initial build/test
 * responses return concise summaries to prevent token overflow, while this tool allows drilling
 * down into full logs, filtered errors, warnings, or metadata when needed for debugging.
 *
 * **Why you'd use it:**
 * - Access full build logs without cluttering initial responses
 * - Filter to just errors or warnings for faster debugging
 * - Retrieve exact command executed and exit code
 * - Inspect build metadata and cache information
 *
 * **Parameters:**
 * - buildId (string, required): Cache ID from xcodebuild-build or xcodebuild-test response
 * - detailType (string, required): Type of details to retrieve
 *   - "full-log": Complete stdout and stderr output
 *   - "errors-only": Lines containing errors or build failures
 *   - "warnings-only": Lines containing warnings
 *   - "summary": Build metadata and configuration used
 *   - "command": Exact xcodebuild command executed
 *   - "metadata": Cache info and output sizes
 * - maxLines (number, optional): Maximum lines to return (default: 100)
 *
 * **Returns:**
 * Structured JSON containing requested details. For logs, includes total line count and
 * truncation status. For errors/warnings, includes count and filtered lines. For summary,
 * includes full metadata about the build or test execution.
 *
 * **Example:**
 * ```typescript
 * // After running a build that returns { buildId: "abc123", ... }
 * const errors = await xcodebuildGetDetailsTool({
 *   buildId: "abc123",
 *   detailType: "errors-only"
 * });
 *
 * // Get full log with custom line limit
 * const fullLog = await xcodebuildGetDetailsTool({
 *   buildId: "abc123",
 *   detailType: "full-log",
 *   maxLines: 500
 * });
 *
 * // Get execution metadata
 * const metadata = await xcodebuildGetDetailsTool({
 *   buildId: "abc123",
 *   detailType: "metadata"
 * });
 * ```
 *
 * @param args Tool arguments containing buildId, detailType, and optional maxLines
 * @returns Tool result with requested build or test details
 */
export async function xcodebuildGetDetailsTool(args: any) {
  const { buildId, detailType, maxLines = 100 } = args as GetDetailsArgs;

  try {
    if (!buildId) {
      throw new McpError(ErrorCode.InvalidParams, 'buildId is required');
    }

    const cached = responseCache.get(buildId);
    if (!cached) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Build ID '${buildId}' not found or expired. Use a recent build ID from xcodebuild-build.`
      );
    }

    let responseText: string;

    switch (detailType) {
      case 'full-log':
        const fullLog =
          cached.fullOutput + (cached.stderr ? '\n--- STDERR ---\n' + cached.stderr : '');
        const lines = fullLog.split('\n');
        if (lines.length > maxLines) {
          responseText = JSON.stringify(
            {
              buildId,
              detailType,
              totalLines: lines.length,
              showing: `Last ${maxLines} lines`,
              content: lines.slice(-maxLines).join('\n'),
              note: `Use maxLines parameter to see more. Total: ${lines.length} lines available.`,
            },
            null,
            2
          );
        } else {
          responseText = JSON.stringify(
            {
              buildId,
              detailType,
              totalLines: lines.length,
              content: fullLog,
            },
            null,
            2
          );
        }
        break;

      case 'errors-only':
        const allOutput = cached.fullOutput + '\n' + cached.stderr;
        const errorLines = allOutput
          .split('\n')
          .filter(
            line =>
              line.includes('error:') ||
              line.includes('** BUILD FAILED **') ||
              line.toLowerCase().includes('fatal error')
          );
        responseText = JSON.stringify(
          {
            buildId,
            detailType,
            errorCount: errorLines.length,
            errors: errorLines.slice(0, maxLines),
            truncated: errorLines.length > maxLines,
          },
          null,
          2
        );
        break;

      case 'warnings-only':
        const warningLines = (cached.fullOutput + '\n' + cached.stderr)
          .split('\n')
          .filter(line => line.includes('warning:'));
        responseText = JSON.stringify(
          {
            buildId,
            detailType,
            warningCount: warningLines.length,
            warnings: warningLines.slice(0, maxLines),
            truncated: warningLines.length > maxLines,
          },
          null,
          2
        );
        break;

      case 'summary':
        responseText = JSON.stringify(
          {
            buildId,
            detailType,
            ...cached.metadata,
            command: cached.command,
            exitCode: cached.exitCode,
            timestamp: cached.timestamp,
            tool: cached.tool,
          },
          null,
          2
        );
        break;

      case 'command':
        responseText = JSON.stringify(
          {
            buildId,
            detailType,
            command: cached.command,
            exitCode: cached.exitCode,
            executedAt: cached.timestamp,
          },
          null,
          2
        );
        break;

      case 'metadata':
        responseText = JSON.stringify(
          {
            buildId,
            detailType,
            metadata: cached.metadata,
            cacheInfo: {
              tool: cached.tool,
              timestamp: cached.timestamp,
              outputSize: cached.fullOutput.length,
              stderrSize: cached.stderr.length,
            },
          },
          null,
          2
        );
        break;

      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid detailType: ${detailType}. Must be one of: full-log, errors-only, warnings-only, summary, command, metadata`
        );
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `xcodebuild-get-details failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
