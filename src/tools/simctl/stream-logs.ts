import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';

// === SEVERITY CLASSIFICATION ===

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bfault\b/i,
  /\bfailed\b/i,
  /\bexception\b/i,
  /\bcrash\b/i,
  /❌/,
];
const WARNING_PATTERNS = [/\bwarning\b/i, /\bwarn\b/i, /\bdeprecated\b/i, /⚠️/];
const INFO_PATTERNS = [/\binfo\b/i, /\bnotice\b/i, /ℹ️/];

type Severity = 'error' | 'warning' | 'info' | 'debug';

function classifyLogLine(line: string): Severity {
  if (ERROR_PATTERNS.some(p => p.test(line))) return 'error';
  if (WARNING_PATTERNS.some(p => p.test(line))) return 'warning';
  if (INFO_PATTERNS.some(p => p.test(line))) return 'info';
  return 'debug';
}

/** Strip timestamps + PIDs, collapse whitespace — used for dedup signature. */
function deduplicationSignature(line: string): string {
  return line
    .replace(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/g, '')
    .replace(/\[\d+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface DedupedEntry {
  message: string;
  count: number;
}

/** Collapse duplicate error/warning lines, preserving the first occurrence with a count. */
function deduplicateLines(lines: string[]): DedupedEntry[] {
  const seen = new Map<string, DedupedEntry>();
  for (const line of lines) {
    const sig = deduplicationSignature(line);
    const existing = seen.get(sig);
    if (existing) {
      existing.count += 1;
    } else {
      seen.set(sig, { message: line.trim(), count: 1 });
    }
  }
  return Array.from(seen.values());
}

function parseSeverityParam(raw: string | string[] | undefined): Severity[] {
  const all: Severity[] = ['error', 'warning', 'info', 'debug'];
  if (!raw) return all;
  const list = Array.isArray(raw) ? raw : raw.split(',');
  const valid = list
    .map(s => s.trim().toLowerCase())
    .filter((s): s is Severity => all.includes(s as Severity));
  return valid.length > 0 ? valid : all;
}

// === MAIN TOOL ===

/**
 * Stream Console Logs from Simulator
 *
 * Real-time log streaming with filtering, severity classification, deduplication, and statistics.
 *
 * @param args Tool arguments
 * @returns Log streaming result with per-severity counts, top errors/warnings, and tail sample
 */
export async function streamLogsTool(args: any) {
  const {
    udid,
    bundleId,
    predicate,
    duration = 10,
    capture: _capture = true,
    severity,
  } = args as any;

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

    // Parse severity filter
    const severityFilter = parseSeverityParam(severity);

    // Build command
    const command = `xcrun simctl spawn "${udid}" log stream --predicate '${finalPredicate}' --timeout=${duration}s 2>/dev/null || true`;

    console.error('[stream-logs] Executing:', command);

    // Execute with specified duration
    const result = await executeCommand(command, {
      timeout: (duration + 5) * 1000, // Add 5s buffer
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Parse and classify all raw lines
    const rawLines = result.stdout.split('\n').filter((line: string) => line.trim().length > 0);

    const errors: string[] = [];
    const warnings: string[] = [];
    const infoLines: string[] = [];
    let debugCount = 0;

    for (const line of rawLines) {
      const sev = classifyLogLine(line);
      if (sev === 'error') errors.push(line);
      else if (sev === 'warning') warnings.push(line);
      else if (sev === 'info') infoLines.push(line);
      else debugCount += 1;
    }

    // Dedup errors and warnings
    const dedupedErrors = deduplicateLines(errors);
    const dedupedWarnings = deduplicateLines(warnings);

    // Build structured log items (filtered by severity, capped at 100)
    const logs = rawLines
      .filter((line: string) => severityFilter.includes(classifyLogLine(line)))
      .map((line: string) => ({
        timestamp: extractTimestamp(line),
        process: extractProcess(line),
        severity: classifyLogLine(line),
        message: line.trim(),
      }));

    const statistics = {
      totalLines: rawLines.length,
      errors: errors.length,
      warnings: warnings.length,
      info: infoLines.length,
      debug: debugCount,
    };

    const responseData = {
      success: true,
      logs: {
        count: logs.length,
        predicate: finalPredicate,
        bundleId: bundleId || undefined,
        duration,
        severityFilter,
        items: logs.slice(0, 100), // Return first 100 filtered logs
      },
      statistics,
      topErrors: dedupedErrors.slice(0, 15),
      topWarnings: dedupedWarnings.slice(0, 15),
      sampleTail: rawLines.slice(-20).map((line: string) => line.trim()),
      guidance: [
        `Captured ${rawLines.length} log lines in ${duration}s`,
        `Severity: ${statistics.errors} errors, ${statistics.warnings} warnings, ${statistics.info} info, ${statistics.debug} debug`,
        ...(logs.length > 100
          ? [
              `Note: Showing first 100 of ${logs.length} severity-filtered logs`,
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

Stream real-time console logs from iOS simulator with filtering, severity classification,
deduplication, and statistics summary.

## What it does

Streams console logs from a simulator in real-time, with support for filtering by process
or custom predicates. Captures logs for a specified duration and returns:
- Structured log entries with timestamps, process names, and per-line severity
- Statistics summary (totalLines, errors, warnings, info, debug)
- Top errors and warnings (deduplicated, capped at 15 each)
- Sample tail of raw log output

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **bundleId** (string, optional): Filter logs to specific app bundle ID
- **predicate** (string, optional): Custom NSPredicate for log filtering
- **duration** (number, optional): Capture duration in seconds (default: 10)
- **capture** (boolean, optional): Whether to capture logs (default: true)
- **severity** (string | string[], optional): Comma-separated or array of severity levels to include
  in the returned items. Allowed values: \`error\`, \`warning\`, \`info\`, \`debug\`. Default: all four.
  Statistics always count all severities regardless of this filter.

## Severity Classification

Each log line is classified by case-insensitive pattern matching:

| Severity | Patterns |
|----------|----------|
| error    | \\berror\\b, \\bfault\\b, \\bfailed\\b, \\bexception\\b, \\bcrash\\b, ❌ |
| warning  | \\bwarning\\b, \\bwarn\\b, \\bdeprecated\\b, ⚠️ |
| info     | \\binfo\\b, \\bnotice\\b, ℹ️ |
| debug    | anything that does not match the above |

## Deduplication

Error and warning lines are deduplicated before appearing in \`topErrors\` / \`topWarnings\`.
The deduplication signature is computed by stripping timestamps (\`YYYY-MM-DD HH:MM:SS\`)
and process IDs (\`[1234]\`) then collapsing whitespace. Duplicate occurrences are collapsed
into a single entry with a \`count\` field.

## Returns

JSON response with:
- **logs**: Filtered log entries (severity-filtered, first 100 items)
  - count, predicate, bundleId, duration, severityFilter, items[]
- **statistics**: \`{ totalLines, errors, warnings, info, debug }\`
- **topErrors**: Deduplicated error lines, up to 15, each with \`message\` and \`count\`
- **topWarnings**: Deduplicated warning lines, up to 15, each with \`message\` and \`count\`
- **sampleTail**: Last 20 raw log lines
- **guidance**: Human-readable summary strings

## Examples

### Stream all logs for 10 seconds
\`\`\`typescript
await streamLogsTool({ udid: 'device-123' })
\`\`\`

### Stream errors and warnings only for specific app
\`\`\`typescript
await streamLogsTool({
  udid: 'device-123',
  bundleId: 'com.example.MyApp',
  duration: 30,
  severity: 'error,warning',
})
\`\`\`

### Stream with custom predicate
\`\`\`typescript
await streamLogsTool({
  udid: 'device-123',
  predicate: 'eventMessage CONTAINS "Error" OR eventMessage CONTAINS "Warning"',
  duration: 20,
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
2. **Error monitoring**: Filter for errors and warnings via severity param
3. **Network debugging**: Monitor network-related log messages
4. **Performance tracking**: Capture logs during performance tests
5. **Integration testing**: Verify expected log output during test runs

## Important Notes

- **Timeout buffer**: Command timeout is duration + 5 seconds for safety
- **Buffer size**: 10MB buffer for log capture to prevent overflow
- **First 100 logs**: Returns first 100 severity-filtered log entries to avoid token overflow
- **Statistics always complete**: Counts cover all lines regardless of severity filter
- **Dedup on errors/warnings**: topErrors and topWarnings collapse repeated messages

## Error Handling

- **Missing udid**: Error if udid is not provided
- **Simulator not found**: Validates simulator exists
- **Command timeout**: Times out if duration exceeds limit
- **Buffer overflow**: May lose logs if output exceeds 10MB buffer

## Duration Guidelines

- **Quick check**: 5-10 seconds for basic log verification
- **Feature testing**: 15-30 seconds for testing specific features
- **Integration tests**: 30-60 seconds for full test scenarios
- **Debug sessions**: 60+ seconds for deep debugging sessions
`;
