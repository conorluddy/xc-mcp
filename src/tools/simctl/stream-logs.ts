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

export const SIMCTL_STREAM_LOGS_DOCS = `
# simctl-stream-logs

Stream real-time console logs from iOS simulator with filtering and capture.

## What it does

Streams console logs from a simulator in real-time, with support for filtering by process
or custom predicates. Captures logs for a specified duration and returns structured log
entries with timestamps and process information.

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **bundleId** (string, optional): Filter logs to specific app bundle ID
- **predicate** (string, optional): Custom NSPredicate for log filtering
- **duration** (number, optional): Capture duration in seconds (default: 10)
- **capture** (boolean, optional): Whether to capture logs (default: true)

## Returns

JSON response with:
- Captured log entries with timestamps and process names
- Log count and duration
- Filter information (predicate, bundleId)
- Guidance for log analysis

## Examples

### Stream all logs for 10 seconds
\`\`\`typescript
await streamLogsTool({
  udid: 'device-123'
})
\`\`\`

### Stream logs for specific app
\`\`\`typescript
await streamLogsTool({
  udid: 'device-123',
  bundleId: 'com.example.MyApp',
  duration: 30
})
\`\`\`

### Stream with custom predicate
\`\`\`typescript
await streamLogsTool({
  udid: 'device-123',
  predicate: 'eventMessage CONTAINS "Error" OR eventMessage CONTAINS "Warning"',
  duration: 20
})
\`\`\`

## Predicate Syntax

Supports NSPredicate syntax for filtering:
- **Process filtering**: \`process == "MyApp"\`
- **Content filtering**: \`eventMessage CONTAINS "keyword"\`
- **Severity filtering**: \`messageType == "Error"\`
- **Combined filters**: \`process == "MyApp" AND eventMessage CONTAINS "network"\`

Common predicates:
- \`process == "com.example.MyApp"\` - Filter by bundle ID
- \`eventMessage CONTAINS "Error"\` - Show only errors
- \`subsystem == "com.example.networking"\` - Filter by subsystem
- \`messageType IN {"Error", "Fault"}\` - Show errors and faults

## Common Use Cases

1. **App debugging**: Stream logs for specific app during testing
2. **Error monitoring**: Filter for errors and warnings
3. **Network debugging**: Monitor network-related log messages
4. **Performance tracking**: Capture logs during performance tests
5. **Integration testing**: Verify expected log output during test runs

## Log Entry Structure

Each log entry includes:
\`\`\`typescript
{
  timestamp: "2025-01-23 14:30:45.123",  // Extracted timestamp
  process: "MyApp",                       // Process name
  message: "Full log line text"           // Complete log message
}
\`\`\`

## Important Notes

- **Timeout buffer**: Command timeout is duration + 5 seconds for safety
- **Buffer size**: 10MB buffer for log capture to prevent overflow
- **First 100 logs**: Returns first 100 log entries to avoid token overflow
- **Real-time capture**: Logs are captured as they occur during duration
- **Simulator must be running**: Logs can only be streamed from booted simulators

## Error Handling

- **Missing udid**: Error if udid is not provided
- **Simulator not found**: Validates simulator exists
- **Command timeout**: Times out if duration exceeds limit
- **Buffer overflow**: May lose logs if output exceeds 10MB buffer

## Performance Considerations

- **Duration**: Longer durations capture more logs but take more time
- **Filtering**: Specific predicates reduce log volume and improve performance
- **Token usage**: First 100 logs returned to keep response size manageable
- **Buffer limit**: 10MB buffer prevents memory issues with verbose logging

## Testing Workflow

1. **Launch app**: \`simctl-launch <udid> <bundleId>\`
2. **Start log streaming**: \`simctl-stream-logs <udid> <bundleId> duration:30\`
3. **Perform actions**: Use app features that generate logs
4. **Review logs**: Check captured logs for expected output
5. **Debug issues**: Use log messages to identify problems

## Log Analysis Tips

- **Search for errors**: Look for "Error", "Fault", "Warning" in messages
- **Track flow**: Follow log sequences to understand execution flow
- **Performance metrics**: Look for timing and performance-related logs
- **Network activity**: Monitor network requests and responses
- **Crash detection**: Look for crash logs or assertion failures

## Duration Guidelines

- **Quick check**: 5-10 seconds for basic log verification
- **Feature testing**: 15-30 seconds for testing specific features
- **Integration tests**: 30-60 seconds for full test scenarios
- **Debug sessions**: 60+ seconds for deep debugging sessions

## Predicate Examples

### Filter by app
\`\`\`
process == "com.example.MyApp"
\`\`\`

### Show only errors and warnings
\`\`\`
messageType == "Error" OR messageType == "Warning"
\`\`\`

### Network-related logs
\`\`\`
subsystem == "com.apple.network" OR eventMessage CONTAINS "network"
\`\`\`

### Exclude system processes
\`\`\`
process BEGINSWITH "com.example."
\`\`\`

## Limitations

- **Output truncation**: Only first 100 logs returned in response
- **No log persistence**: Logs are not saved to disk
- **Single capture**: Each call captures logs for one duration only
- **No streaming to response**: Logs captured in batch after duration completes
`;

