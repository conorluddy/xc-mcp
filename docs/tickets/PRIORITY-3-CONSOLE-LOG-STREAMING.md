# PRIORITY-3: Console Log Streaming

**Status:** Pending
**Priority:** 3 - Low Impact
**Effort:** Medium
**Impact:** Low - Nice to have, improves debugging experience
**Depends on:** None

## Problem Statement

When debugging apps on simulators, developers need to monitor console output. Current approach:

1. Run command manually in terminal:
   ```bash
   xcrun simctl spawn <udid> log stream --predicate 'process == "com.example.MyApp"'
   ```

2. Can't integrate into automated workflows
3. No way to capture logs for analysis
4. No filtering or formatting

Would be valuable to:
- Stream logs programmatically
- Filter by bundle ID or process name
- Capture logs with metadata
- Include in automated test workflows

## Proposed Solution

Create a `stream-logs` tool that:

1. Uses `xcrun simctl spawn ... log stream` to get real-time logs
2. Filters by bundle ID or custom predicate
3. Returns stream ID for progressive retrieval
4. Provides mechanism to stop stream
5. Caches logs with metadata

### Implementation

Create new file: `src/tools/simctl/stream-logs.ts`

```typescript
import { spawn } from 'child_process';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { responseCache } from '../../state/response-cache.js';

export interface LogStreamConfig {
  udid: string;
  bundleId?: string;
  predicate?: string; // Custom log predicate
  duration?: number; // Seconds to stream (optional)
  capture?: boolean; // Store logs (default: true)
}

export interface LogStreamResult {
  streamId: string;
  streaming: boolean;
  bundleId?: string;
  predicate: string;
  guidance: string[];
}

// Active streams mapping
const activeStreams = new Map<string, { process: any; logs: any[] }>();

export async function streamLogsTool(args: any) {
  const { udid, bundleId, predicate, duration, capture = true } = args;

  // Validate simulator
  const simulator = await simulatorCache.findSimulatorByUdid(udid);
  if (!simulator) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Simulator ${udid} not found`
    );
  }

  if (simulator.state !== 'Booted') {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Simulator must be booted (current: ${simulator.state})`
    );
  }

  // Determine predicate
  let logPredicate = predicate;
  if (bundleId && !predicate) {
    logPredicate = `process == "${bundleId}"`;
  } else if (!predicate) {
    logPredicate = 'level >= 0'; // All logs
  }

  try {
    // Start log stream
    const logProcess = spawn('xcrun', [
      'simctl',
      'spawn',
      udid,
      'log',
      'stream',
      '--predicate',
      logPredicate,
    ]);

    const logs: any[] = [];
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Capture output
    logProcess.stdout?.on('data', (data) => {
      const logLine = data.toString();
      logs.push({
        timestamp: new Date().toISOString(),
        message: logLine,
      });
    });

    logProcess.stderr?.on('data', (data) => {
      console.error('[stream-logs]', data.toString());
    });

    // Store stream
    activeStreams.set(streamId, { process: logProcess, logs });

    // Cache logs
    if (capture) {
      responseCache.store({
        tool: 'stream-logs',
        streamId,
        streamActive: true,
        logs,
        bundleId,
        predicate: logPredicate,
        startTime: Date.now(),
      });
    }

    // Optional: Auto-stop after duration
    if (duration) {
      setTimeout(() => {
        stopLogStream(streamId);
      }, duration * 1000);
    }

    return {
      streamId,
      streaming: true,
      bundleId,
      predicate: logPredicate,
      guidance: [
        `Log stream started (Stream ID: ${streamId})`,
        `Capturing logs for ${bundleId || 'all processes'}`,
        '',
        'Next steps:',
        `  • Get logs: simctl-get-log-stream streamId: "${streamId}"`,
        `  • Stop stream: simctl-stop-log-stream streamId: "${streamId}"`,
        `  • Interact with app to trigger logs`,
        `  • Then retrieve and analyze logs`,
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to start log stream: ${error}`
    );
  }
}

/**
 * Get captured logs from active stream
 */
export async function getLogStreamTool(args: any) {
  const { streamId, maxLines = 100 } = args;

  const stream = activeStreams.get(streamId);

  if (!stream) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Stream ${streamId} not found. Check streamId is correct.`
    );
  }

  const logs = stream.logs.slice(-maxLines);

  return {
    streamId,
    streaming: true,
    logCount: logs.length,
    logs: logs.map((log) => ({
      timestamp: log.timestamp,
      message: log.message.trim(),
    })),
    guidance: [
      `Retrieved ${logs.length} log lines`,
      `Stream is still active`,
      `Run again to get newer logs`,
      `Or stop stream when done: simctl-stop-log-stream streamId: "${streamId}"`,
    ],
  };
}

/**
 * Stop an active log stream
 */
export async function stopLogStreamTool(args: any) {
  const { streamId } = args;

  const stream = activeStreams.get(streamId);

  if (!stream) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Stream ${streamId} not found`
    );
  }

  // Kill process
  stream.process.kill();
  activeStreams.delete(streamId);

  return {
    streamId,
    streaming: false,
    logCount: stream.logs.length,
    guidance: [
      `Stream stopped`,
      `Captured ${stream.logs.length} log lines`,
      `Logs available until server restart`,
      `To re-analyze: simctl-get-log-stream streamId: "${streamId}"`,
    ],
  };
}

function stopLogStream(streamId: string): void {
  const stream = activeStreams.get(streamId);
  if (stream) {
    stream.process.kill();
    activeStreams.delete(streamId);
  }
}
```

Register tools in `src/index.ts`:

```typescript
{
  name: 'stream-logs',
  description: `📱 **Monitor app console output in real-time**

Starts a live log stream from a simulator for a specific app or process.

Use cases:
• Debug app behavior with live logging
• Capture logs during test execution
• Monitor performance issues
• Track app crashes and errors

Returns a stream ID for retrieving logs and stopping the stream.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      udid: {
        type: 'string',
        description: 'Simulator UDID',
      },
      bundleId: {
        type: 'string',
        description: 'Optional: Filter logs to specific app (e.g., com.example.MyApp)',
      },
      predicate: {
        type: 'string',
        description: 'Optional: Custom log predicate (overrides bundleId)',
      },
      duration: {
        type: 'number',
        description: 'Optional: Auto-stop after N seconds',
      },
      capture: {
        type: 'boolean',
        description: 'Optional: Capture logs for retrieval (default: true)',
      },
    },
    required: ['udid'],
  },
},
{
  name: 'get-log-stream',
  description: `📝 **Retrieve captured logs from active stream**

Gets recent log lines from an active log stream.

Use repeatedly to get updated logs as they arrive.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      streamId: {
        type: 'string',
        description: 'Stream ID from stream-logs tool',
      },
      maxLines: {
        type: 'number',
        description: 'Optional: Max lines to return (default: 100)',
      },
    },
    required: ['streamId'],
  },
},
{
  name: 'stop-log-stream',
  description: `⏹️ **Stop an active log stream**

Stops capturing logs and closes the stream.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      streamId: {
        type: 'string',
        description: 'Stream ID from stream-logs tool',
      },
    },
    required: ['streamId'],
  },
},
```

## Implementation Checklist

- [ ] Create `src/tools/simctl/stream-logs.ts`
- [ ] Implement `streamLogsTool()` to start log capture
- [ ] Implement `getLogStreamTool()` to retrieve logs
- [ ] Implement `stopLogStreamTool()` to stop streaming
- [ ] Add stream management with Map
- [ ] Integrate with response cache for log storage
- [ ] Handle stream process lifecycle
- [ ] Format log output with timestamps
- [ ] Add error handling for stopped simulators
- [ ] Register all 3 tools in main server
- [ ] Unit tests for stream management
- [ ] Integration tests with real simulator
- [ ] Test retrieving logs multiple times
- [ ] Test auto-stop after duration
- [ ] Update CLAUDE.md
- [ ] Add examples to README

## Testing Requirements

### Unit Tests

- [ ] Stream created and can be retrieved
- [ ] Logs captured correctly
- [ ] Stream stopped successfully
- [ ] Multiple concurrent streams work
- [ ] Invalid stream ID returns error

### Integration Tests

- [ ] Works with real simulator
- [ ] Captures app logs correctly
- [ ] Filtering by bundle ID works
- [ ] Auto-stop works

### Manual Testing

- [ ] Start stream, launch app
- [ ] Retrieve logs multiple times
- [ ] Verify logs are captured
- [ ] Stop stream and verify it stops

## Related Tickets

- **Depends on:** None
- **Works with:** PRIORITY-2-BUILD-AND-RUN-WORKFLOW
- **Future companion:** Test result logging, performance profiling

## Notes

### Log Predicates

Common predicates:
```
process == "com.example.MyApp"          # Specific app
eventType == "logEvent"                 # Log events only
level >= 3                              # Error and above
level == 0                              # Debug
```

### Stream Lifecycle

```
1. streamLogsTool() → Start streaming, return streamId
2. getLogStreamTool() → Retrieve recent logs (repeatable)
3. Optional: stopLogStreamTool() → Stop and finalize
```

Streams persist until explicitly stopped or server restarts.

### Future Enhancements

- Persist logs to file
- Filter/search logs
- Parse and structure log messages
- Track performance metrics from logs
- Integration with profiler data
