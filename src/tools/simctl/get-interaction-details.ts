import { responseCache } from '../../utils/response-cache.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface GetInteractionDetailsArgs {
  interactionId: string;
  detailType: 'full-log' | 'summary' | 'command' | 'metadata';
  maxLines?: number;
}

/**
 * Retrieve detailed interaction results from cache
 *
 * Use this tool to fetch full output from Phase 4 UI automation tools:
 * - simctl-query-ui
 * - simctl-tap
 * - simctl-type-text
 * - simctl-scroll
 * - simctl-gesture
 *
 * Progressive disclosure: The initial tool responses return a cacheId and summary.
 * Use this tool to access the full command output, errors, or metadata.
 *
 * Examples:
 * - Get full element list: detailType: "full-log", interactionId: "[cacheId from query-ui]"
 * - Get summary: detailType: "summary", interactionId: "[cacheId]"
 * - Get executed command: detailType: "command", interactionId: "[cacheId]"
 * - Get metadata: detailType: "metadata", interactionId: "[cacheId]"
 */
export async function simctlGetInteractionDetailsTool(args: any) {
  const { interactionId, detailType, maxLines = 100 } = args as GetInteractionDetailsArgs;

  try {
    if (!interactionId) {
      throw new McpError(ErrorCode.InvalidParams, 'interactionId is required');
    }

    const cached = responseCache.get(interactionId);
    if (!cached) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Interaction ID '${interactionId}' not found or expired. Use a recent interaction ID from UI automation tools.`
      );
    }

    let responseText: string;

    switch (detailType) {
      case 'full-log': {
        const fullLog =
          cached.fullOutput + (cached.stderr ? '\n--- STDERR ---\n' + cached.stderr : '');
        const lines = fullLog.split('\n');
        if (lines.length > maxLines) {
          responseText = JSON.stringify(
            {
              interactionId,
              detailType,
              tool: cached.tool,
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
              interactionId,
              detailType,
              tool: cached.tool,
              totalLines: lines.length,
              content: fullLog,
            },
            null,
            2
          );
        }
        break;
      }

      case 'summary': {
        responseText = JSON.stringify(
          {
            interactionId,
            detailType,
            tool: cached.tool,
            executedAt: cached.timestamp,
            success: cached.exitCode === 0,
            exitCode: cached.exitCode,
            command: cached.command,
            outputSize: cached.fullOutput.length,
            stderrSize: cached.stderr.length,
            metadata: cached.metadata,
          },
          null,
          2
        );
        break;
      }

      case 'command': {
        responseText = JSON.stringify(
          {
            interactionId,
            detailType,
            tool: cached.tool,
            command: cached.command,
            exitCode: cached.exitCode,
            executedAt: cached.timestamp,
          },
          null,
          2
        );
        break;
      }

      case 'metadata': {
        responseText = JSON.stringify(
          {
            interactionId,
            detailType,
            tool: cached.tool,
            metadata: cached.metadata,
            cacheInfo: {
              timestamp: cached.timestamp,
              outputSize: cached.fullOutput.length,
              stderrSize: cached.stderr.length,
            },
          },
          null,
          2
        );
        break;
      }

      default:
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid detailType: ${detailType}. Must be one of: full-log, summary, command, metadata`
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
      `simctl-get-interaction-details failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
