# PRIORITY-3: Simulator Lifecycle State Management

**Status:** Pending
**Priority:** 3 - Low Impact
**Effort:** Medium
**Impact:** Low - Improves stability in edge cases
**Depends on:** PRIORITY-1-PRE-OPERATION-VALIDATION

## Problem Statement

Multiple concurrent simulator operations can cause race conditions:

1. Multiple calls to `simctl-boot` same simulator → tries to boot simultaneously
2. Multiple calls to `simctl-launch` while simulator is booting → operations time out
3. No tracking of simulator state transitions
4. No ability to wait for simulator to finish booting before next operation

This is especially problematic for AI agents making multiple rapid tool calls.

## Proposed Solution

This ticket has been partially addressed in PRIORITY-1-PRE-OPERATION-VALIDATION with the `SimulatorLifecycle` class. This ticket focuses on expanding it:

1. Persistent state tracking across all tools
2. Better understanding of simulator transitions
3. Recovery mechanisms for stuck states
4. Detailed logging of state changes

### Implementation

Enhance: `src/state/simulator-lifecycle.ts`

```typescript
export enum SimulatorState {
  Unknown = 'Unknown',
  Creating = 'Creating',
  Booting = 'Booting',
  Booted = 'Booted',
  Shutting = 'Shutting',
  Shutdown = 'Shutdown',
  Erasing = 'Erasing',
  Erased = 'Erased',
}

export interface SimulatorStateTransition {
  fromState: SimulatorState;
  toState: SimulatorState;
  operation: string; // "boot", "shutdown", "erase", etc.
  timestamp: number;
  duration?: number;
  success?: boolean;
  error?: string;
}

/**
 * Enhanced simulator lifecycle management
 * Tracks state transitions and prevents race conditions
 */
export class EnhancedSimulatorLifecycle {
  private simulatorStates = new Map<string, SimulatorState>();
  private stateTransitions = new Map<string, SimulatorStateTransition[]>();
  private operationQueues = new Map<string, Array<() => Promise<void>>>();
  private bootingPromises = new Map<string, Promise<void>>();

  /**
   * Track a state transition
   */
  recordTransition(
    udid: string,
    from: SimulatorState,
    to: SimulatorState,
    operation: string,
    success: boolean,
    error?: string
  ): void {
    const transitions = this.stateTransitions.get(udid) || [];

    const lastTransition = transitions[transitions.length - 1];
    const duration = lastTransition ? Date.now() - lastTransition.timestamp : undefined;

    const transition: SimulatorStateTransition = {
      fromState: from,
      toState: to,
      operation,
      timestamp: Date.now(),
      duration,
      success,
      error,
    };

    transitions.push(transition);
    this.stateTransitions.set(udid, transitions.slice(-100)); // Keep last 100 transitions

    this.simulatorStates.set(udid, to);

    console.error(
      `[simulator-lifecycle] ${udid}: ${from} → ${to} (${operation}) [${success ? 'OK' : 'FAIL'}]`
    );
  }

  /**
   * Get current tracked state
   */
  getTrackedState(udid: string): SimulatorState {
    return this.simulatorStates.get(udid) || SimulatorState.Unknown;
  }

  /**
   * Get recent transitions for debugging
   */
  getTransitionHistory(udid: string, count: number = 10): SimulatorStateTransition[] {
    const transitions = this.stateTransitions.get(udid) || [];
    return transitions.slice(-count);
  }

  /**
   * Queue operations to serialize access to simulator
   * Prevents race conditions by ensuring operations execute sequentially
   */
  async queueOperation(
    udid: string,
    operation: () => Promise<void>,
    operationName: string
  ): Promise<void> {
    const queue = this.operationQueues.get(udid) || [];
    const task = async () => {
      console.error(`[simulator-lifecycle] Executing: ${operationName} on ${udid}`);
      try {
        await operation();
        this.recordTransition(udid, SimulatorState.Unknown, SimulatorState.Unknown, operationName, true);
      } catch (error) {
        this.recordTransition(
          udid,
          SimulatorState.Unknown,
          SimulatorState.Unknown,
          operationName,
          false,
          String(error)
        );
        throw error;
      }
    };

    queue.push(task);
    this.operationQueues.set(udid, queue);

    // Process queue if not already processing
    if (queue.length === 1) {
      this.processQueue(udid);
    }
  }

  private async processQueue(udid: string): Promise<void> {
    const queue = this.operationQueues.get(udid);
    if (!queue || queue.length === 0) return;

    const operation = queue.shift();
    if (operation) {
      try {
        await operation();
      } catch (error) {
        console.error(`[simulator-lifecycle] Queue operation failed:`, error);
      }

      // Process next item in queue
      if (queue.length > 0) {
        this.processQueue(udid);
      } else {
        this.operationQueues.delete(udid);
      }
    }
  }

  /**
   * Detect stuck simulators
   * Booting for too long indicates something went wrong
   */
  detectStuckSimulator(udid: string, bootTimeoutMs: number = 120000): boolean {
    const state = this.getTrackedState(udid);

    if (state !== SimulatorState.Booting) {
      return false; // Not booting, not stuck
    }

    const transitions = this.stateTransitions.get(udid) || [];
    const lastBootTransition = transitions.findLast((t) => t.operation === 'boot');

    if (!lastBootTransition) {
      return false;
    }

    const bootDuration = Date.now() - lastBootTransition.timestamp;
    return bootDuration > bootTimeoutMs;
  }

  /**
   * Get diagnostics for simulator
   */
  getDiagnostics(udid: string): {
    currentState: SimulatorState;
    recentHistory: SimulatorStateTransition[];
    queuedOperations: number;
    isStuck: boolean;
  } {
    return {
      currentState: this.getTrackedState(udid),
      recentHistory: this.getTransitionHistory(udid, 5),
      queuedOperations: (this.operationQueues.get(udid) || []).length,
      isStuck: this.detectStuckSimulator(udid),
    };
  }
}

export const simulatorLifecycle = new EnhancedSimulatorLifecycle();
```

Create new file: `src/tools/simctl/simulator-diagnostics.ts`

```typescript
/**
 * Get detailed diagnostics for simulator state and operations
 */
export async function simulatorDiagnosticsTool(args: any) {
  const { udid } = args;

  if (!udid) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'udid is required'
    );
  }

  const simulator = await simulatorCache.findSimulatorByUdid(udid);

  if (!simulator) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Simulator ${udid} not found`
    );
  }

  const diagnostics = simulatorLifecycle.getDiagnostics(udid);

  return {
    simulator: {
      udid,
      name: simulator.name,
      runtime: simulator.runtime,
      actualState: simulator.state,
      trackedState: diagnostics.currentState,
      statesMatch: simulator.state === diagnostics.currentState,
    },
    operations: {
      queuedCount: diagnostics.queuedOperations,
      guidance: diagnostics.queuedOperations > 0
        ? `${diagnostics.queuedOperations} operations queued and will execute sequentially`
        : 'No queued operations',
    },
    recentHistory: diagnostics.recentHistory.map((t) => ({
      operation: t.operation,
      fromState: t.fromState,
      toState: t.toState,
      timestamp: new Date(t.timestamp).toISOString(),
      duration: t.duration ? `${t.duration}ms` : undefined,
      success: t.success,
      error: t.error,
    })),
    healthStatus: {
      stuck: diagnostics.isStuck,
      guidance: diagnostics.isStuck
        ? 'Simulator appears stuck. Try: simctl-shutdown then simctl-boot'
        : 'Simulator state looks healthy',
    },
    recommendations: [
      !diagnostics.currentState ? 'State unknown - run simctl-list to refresh' : undefined,
      diagnostics.isStuck ? 'Simulator booting for >2 minutes - consider shutdown and reboot' : undefined,
      !simulator.isAvailable ? 'Simulator is unavailable - may need to be recreated' : undefined,
    ].filter(Boolean),
  };
}
```

Register diagnostic tool in `src/index.ts`:

```typescript
{
  name: 'simulator-diagnostics',
  description: `🔧 **Diagnose simulator state and health**

Shows detailed information about simulator state, recent operations, and health status.

Useful for:
• Debugging simulator issues
• Understanding state transitions
• Detecting stuck simulators
• Monitoring queued operations`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      udid: {
        type: 'string',
        description: 'Simulator UDID',
      },
    },
    required: ['udid'],
  },
},
```

## Implementation Checklist

- [ ] Create enhanced `SimulatorLifecycle` class with state tracking
- [ ] Add `SimulatorState` enum with all possible states
- [ ] Implement `recordTransition()` for state tracking
- [ ] Implement operation queue system
- [ ] Add stuck simulator detection
- [ ] Create `simulator-diagnostics.ts` tool
- [ ] Register diagnostic tool
- [ ] Integrate state tracking into all simulator tools
- [ ] Update boot/shutdown/erase tools to record transitions
- [ ] Unit tests for state tracking
- [ ] Unit tests for operation queue
- [ ] Unit tests for stuck detection
- [ ] Integration tests with real simulators
- [ ] Test concurrent operations don't interfere
- [ ] Update CLAUDE.md
- [ ] Add diagnostics to troubleshooting guide

## Testing Requirements

### Unit Tests

- [ ] State transitions recorded correctly
- [ ] Operation queue serializes operations
- [ ] Stuck simulator detected after timeout
- [ ] Multiple concurrent operations handled correctly
- [ ] Transition history maintained (last 100)

### Integration Tests

- [ ] Multiple concurrent boot calls execute sequentially
- [ ] Queue processes all operations
- [ ] Diagnostics report accurate state
- [ ] Stuck detection works with real simulators

### Manual Testing

- [ ] Boot simulator normally, check diagnostics
- [ ] Multiple concurrent operations, verify they serialize
- [ ] Check transition history makes sense
- [ ] Trigger stuck state (prevent boot), verify detection

## Related Tickets

- **Depends on:** PRIORITY-1-PRE-OPERATION-VALIDATION
- **Works with:**
  - PRIORITY-3-CONSOLE-LOG-STREAMING
  - simctl-health-check tool
- **Future companion:** Automated recovery mechanisms

## Notes

### State Transitions

```
Creating → Booting → Booted → Shutting → Shutdown
                       ↓
                    Erasing → Erased
```

### Queue Processing

Operations on same simulator execute sequentially:
```
1. Boot simulator A
2. While booting: Install app (queued)
3. While installing: Launch app (queued)
4. Boot completes → Install starts
5. Install completes → Launch starts
```

### Future Enhancements

- Automatic recovery for stuck simulators
- Predict operation duration based on history
- Alert when state transitions take unusually long
- Performance metrics per operation type
- Correlate failures with system state (disk space, memory, etc.)
