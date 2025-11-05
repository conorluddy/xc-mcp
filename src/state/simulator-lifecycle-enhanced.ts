/**
 * Enhanced Simulator Lifecycle State Management
 *
 * Tracks state transitions and prevents race conditions in concurrent operations
 */

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
  operation: string;
  timestamp: number;
  duration?: number;
  success?: boolean;
  error?: string;
}

export interface PendingOperation {
  operationId: string;
  operation: string;
  startTime: number;
  simulator: string;
}

export class EnhancedSimulatorLifecycle {
  private simulatorStates = new Map<string, SimulatorState>();
  private stateTransitions = new Map<string, SimulatorStateTransition[]>();
  private operationQueues = new Map<string, PendingOperation[]>();
  private bootingPromises = new Map<string, Promise<void>>();
  private transitionLocks = new Map<string, boolean>();

  /**
   * Get current simulator state
   */
  getState(udid: string): SimulatorState {
    return this.simulatorStates.get(udid) || SimulatorState.Unknown;
  }

  /**
   * Record a state transition
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
    this.stateTransitions.set(udid, transitions);
    this.simulatorStates.set(udid, to);
  }

  /**
   * Get state transition history
   */
  getTransitionHistory(udid: string): SimulatorStateTransition[] {
    return this.stateTransitions.get(udid) || [];
  }

  /**
   * Queue an operation for a simulator
   */
  queueOperation(udid: string, operationId: string, operation: string): void {
    const queue = this.operationQueues.get(udid) || [];
    queue.push({
      operationId,
      operation,
      startTime: Date.now(),
      simulator: udid,
    });
    this.operationQueues.set(udid, queue);
  }

  /**
   * Get pending operations for simulator
   */
  getPendingOperations(udid: string): PendingOperation[] {
    return this.operationQueues.get(udid) || [];
  }

  /**
   * Clear pending operations
   */
  clearPendingOperations(udid: string): void {
    this.operationQueues.delete(udid);
  }

  /**
   * Wait for boot to complete
   */
  async waitForBoot(udid: string): Promise<void> {
    const existing = this.bootingPromises.get(udid);
    if (existing) {
      return existing;
    }

    // Create new promise
    const bootPromise = new Promise<void>(resolve => {
      // Resolve immediately if already booted
      if (this.simulatorStates.get(udid) === SimulatorState.Booted) {
        resolve();
      }

      // Poll for boot completion (max 5 minutes)
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (this.simulatorStates.get(udid) === SimulatorState.Booted) {
          clearInterval(checkInterval);
          resolve();
        }

        if (Date.now() - startTime > 5 * 60 * 1000) {
          clearInterval(checkInterval);
          resolve(); // Timeout - assume booted
        }
      }, 500);
    });

    this.bootingPromises.set(udid, bootPromise);
    return bootPromise;
  }

  /**
   * Prevent concurrent operations of same type on same simulator
   */
  acquireLock(udid: string): boolean {
    if (this.transitionLocks.get(udid)) {
      return false; // Already locked
    }
    this.transitionLocks.set(udid, true);
    return true;
  }

  /**
   * Release lock
   */
  releaseLock(udid: string): void {
    this.transitionLocks.delete(udid);
  }

  /**
   * Get lifecycle summary
   */
  getSummary(udid: string): {
    udid: string;
    currentState: SimulatorState | undefined;
    transitionCount: number;
    lastTransition: SimulatorStateTransition | undefined;
    pendingOperations: number;
    operations: PendingOperation[];
    isLocked: boolean;
  } {
    const state = this.simulatorStates.get(udid);
    const transitions = this.stateTransitions.get(udid) || [];
    const pendingOps = this.operationQueues.get(udid) || [];

    return {
      udid,
      currentState: state,
      transitionCount: transitions.length,
      lastTransition: transitions[transitions.length - 1],
      pendingOperations: pendingOps.length,
      operations: pendingOps,
      isLocked: this.transitionLocks.has(udid),
    };
  }
}

// Singleton instance
export const enhancedSimulatorLifecycle = new EnhancedSimulatorLifecycle();
