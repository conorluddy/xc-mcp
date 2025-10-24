import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';

/**
 * Stream Console Logs from Simulator
 *
 * Real-time log streaming with filtering and capture
 *
 * Full documentation: See src/tools/simctl/stream-logs.md
 *
 * @param args Tool arguments
 * @returns Log streaming result
 */
export async function streamLogsTool(args: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { udid, bundleId, predicate, duration = 10, capture: _capture = true } = args as any;

  if (!udid) {
    throw new McpError(ErrorCode.InvalidRequest, 'udid is required');
  }

  try {
    // Construct predicate
    let finalPredicate = predicate;
    if (bundleId && !predicate) {
      finalPredicate = `process == "${bundleId}"`;
    }
    if (!finalPredicate) {
      finalPredicate = 'true'; // All logs
    }

    // Build command
    const command = `xcrun simctl spawn "${udid}" log stream --predicate '${finalPredicate}' --timeout=${duration}s 2>/dev/null || true`;

    console.error('[stream-logs] Executing:', command);

    // Execute with specified duration
    const result = await executeCommand(command, {
      timeout: (duration + 5) * 1000, // Add 5s buffer
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Parse logs
    const logs = result.stdout
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string) => ({
        timestamp: extractTimestamp(line),
        process: extractProcess(line),
        message: line.trim(),
      }));

    const responseData = {
      success: true,
      logs: {
        count: logs.length,
        predicate: finalPredicate,
        bundleId: bundleId || undefined,
        duration,
        items: logs.slice(0, 100), // Return first 100 logs
      },
      guidance: [
        `Captured ${logs.length} log lines in ${duration}s`,
        ...(logs.length > 100
          ? [
              `Note: Showing first 100 of ${logs.length} logs`,
              'Increase duration parameter to capture more logs',
            ]
          : []),
        ...(bundleId
          ? [`Filtering logs for bundle: ${bundleId}`]
          : [`Showing all logs from simulator`]),
      ],
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [{ type: 'text' as const, text: responseText }],
      isError: false,
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to stream logs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function extractTimestamp(line: string): string | null {
  // Try to extract timestamp from log line (format: YYYY-MM-DD HH:MM:SS.mmm)
  const match = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/);
  return match ? match[1] : null;
}

function extractProcess(line: string): string | null {
  // Try to extract process name (usually in square brackets)
  const match = line.match(/\[([^\]]+)\]/);
  return match ? match[1] : null;
}
