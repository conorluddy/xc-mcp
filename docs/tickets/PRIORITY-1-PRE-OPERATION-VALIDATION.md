# PRIORITY-1: Pre-Operation Validation System

**Status:** Pending
**Priority:** 1 - High Impact
**Effort:** Medium
**Impact:** High - Prevents runtime failures and improves reliability
**Depends on:** None

## Problem Statement

Many simctl operations require a booted simulator but don't validate state before execution:

- `simctl-install` fails silently if simulator not booted
- `simctl-launch` fails if simulator unavailable
- Multiple boot calls could race to boot same simulator
- No health checks or helpful error messages

Operations fail with cryptic errors instead of helpful guidance, degrading user experience and making AI agent automation unreliable.

## Current Issues

1. **No simulator state validation** (simctl-install.ts line 46):
   ```typescript
   const simulator = await simulatorCache.findSimulatorByUdid(udid);
   if (!simulator) { throw ... }
   // MISSING: Check if simulator is booted
   ```

2. **Race conditions in boot** (simctl-boot.ts):
   ```typescript
   // Multiple concurrent calls could try to boot same simulator
   await executeCommand('xcrun simctl boot ' + udid);
   ```

3. **No operation-specific validation**:
   - install/launch require booted simulator
   - screenshot might work on shut down simulator (verify)
   - Different operations have different requirements

## Proposed Solution

Create a validation system with:

1. Pre-operation validation with auto-fix suggestions
2. Simulator state tracking to prevent race conditions
3. Health check utilities for common operations
4. Helpful error messages with remediation guidance

### Implementation

Create new file: `src/utils/operation-validation.ts`

```typescript
/**
 * Validation results for simulator operations
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string; // Why validation failed
  autoFix?: () => Promise<void>; // Optional: fix the issue automatically
  guidance?: string[]; // Helpful next steps
}

/**
 * Operation types with specific requirements
 */
export type SimulatorOperation = 'install' | 'launch' | 'openurl' | 'screenshot' | 'tap' | 'query-ui';

/**
 * Validate simulator is ready for an operation
 */
export async function validateSimulatorForOperation(
  udid: string,
  operation: SimulatorOperation,
  autoFix: boolean = false
): Promise<ValidationResult> {
  const simulator = await simulatorCache.findSimulatorByUdid(udid);

  // Simulator not found
  if (!simulator) {
    return {
      valid: false,
      reason: `Simulator ${udid} not found in available simulators`,
      guidance: [
        'Run simctl-list to see available simulators',
        'Create new simulator with simctl-create if needed',
      ],
    };
  }

  // Simulator unavailable (API error, invalid, etc.)
  if (!simulator.isAvailable) {
    return {
      valid: false,
      reason: `Simulator is unavailable: ${simulator.availabilityError || 'unknown error'}`,
      guidance: [
        'Try running simctl-health-check for diagnostics',
        'Delete and recreate simulator if persistently unavailable',
      ],
    };
  }

  // Operations that require booted simulator
  const requiresBooted: SimulatorOperation[] = ['install', 'launch', 'openurl', 'tap', 'query-ui'];

  if (requiresBooted.includes(operation)) {
    if (simulator.state !== 'Booted') {
      const fix = async () => {
        await simulatorLifecycle.ensureBooted(udid, true);
      };

      return {
        valid: false,
        reason: `Simulator must be booted for ${operation} (current state: ${simulator.state})`,
        autoFix: autoFix ? fix : undefined,
        guidance: [
          `Boot simulator with: simctl-boot deviceId: "${udid}"`,
          `Or allow auto-boot before operation`,
        ],
      };
    }
  }

  // All checks passed
  return {
    valid: true,
    guidance: [`Simulator ready for ${operation}`, `Current state: ${simulator.state}`],
  };
}

/**
 * Validate app is installed on simulator
 */
export async function validateAppInstalled(
  udid: string,
  bundleId: string
): Promise<ValidationResult> {
  try {
    const apps = await listInstalledApps(udid);
    const appInstalled = apps.some((app) => app.bundleId === bundleId);

    if (!appInstalled) {
      return {
        valid: false,
        reason: `App ${bundleId} is not installed on simulator`,
        guidance: [
          `Install with: simctl-install udid: "${udid}" appPath: "<path to .app>"`,
          `Or build and install with: build-and-run workflow`,
        ],
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason: `Could not verify app installation: ${error}`,
      guidance: ['Try installing app first', 'Run simctl-health-check for diagnostics'],
    };
  }
}

/**
 * Pre-flight check for build operation
 */
export async function validateProjectBuildable(
  projectPath: string,
  scheme: string
): Promise<ValidationResult> {
  try {
    // Check project exists
    if (!fs.existsSync(projectPath)) {
      return {
        valid: false,
        reason: `Project not found at ${projectPath}`,
      };
    }

    // Try to list schemes to verify project is valid
    const schemes = await getProjectSchemes(projectPath);
    if (!schemes.includes(scheme)) {
      return {
        valid: false,
        reason: `Scheme "${scheme}" not found in project`,
        guidance: [
          `Available schemes: ${schemes.join(', ')}`,
          `Verify scheme name is correct`,
        ],
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      reason: `Could not validate project: ${error}`,
    };
  }
}
```

Create new file: `src/state/simulator-lifecycle.ts`

```typescript
/**
 * Manages simulator lifecycle to prevent race conditions
 * and track simulator state changes
 */
export class SimulatorLifecycle {
  private bootingSimulators = new Set<string>();
  private bootPromises = new Map<string, Promise<void>>();

  /**
   * Ensure simulator is booted, preventing race conditions
   * Multiple calls to same UDID will wait for first boot to complete
   */
  async ensureBooted(udid: string, waitForBoot: boolean = true): Promise<void> {
    // Already booting - wait for existing boot to complete
    if (this.bootingSimulators.has(udid)) {
      const promise = this.bootPromises.get(udid);
      if (promise) {
        await promise;
      }
      return;
    }

    // Check current state
    const simulator = await simulatorCache.findSimulatorByUdid(udid);
    if (!simulator) {
      throw new Error(`Simulator ${udid} not found`);
    }

    if (simulator.state === 'Booted') {
      return; // Already booted
    }

    // Start boot process
    this.bootingSimulators.add(udid);

    const bootPromise = this.performBoot(udid, waitForBoot).finally(() => {
      this.bootingSimulators.delete(udid);
      this.bootPromises.delete(udid);
    });

    this.bootPromises.set(udid, bootPromise);

    await bootPromise;
  }

  /**
   * Shutdown simulator, allowing others to boot
   */
  async shutdown(udid: string): Promise<void> {
    // If simulator is currently booting, wait for it to complete first
    if (this.bootingSimulators.has(udid)) {
      const promise = this.bootPromises.get(udid);
      if (promise) {
        await promise;
      }
    }

    await simctlShutdown({ deviceId: udid });
    simulatorCache.invalidateSimulatorState(udid);
  }

  /**
   * Get simulators that are currently in process of booting
   */
  getBootingSimulators(): string[] {
    return Array.from(this.bootingSimulators);
  }

  private async performBoot(udid: string, waitForBoot: boolean): Promise<void> {
    // Call actual boot tool
    await simctlBootTool({ deviceId: udid, waitForBoot });

    // Refresh simulator state in cache
    simulatorCache.invalidateSimulatorState(udid);
  }
}

export const simulatorLifecycle = new SimulatorLifecycle();
```

### Integration in Tools

Update tools to use validation before operations:

```typescript
// Example: src/tools/simctl/install.ts

export async function simctlInstallTool(args: any) {
  const { udid, appPath } = args;

  // NEW: Validate simulator is ready
  const validation = await validateSimulatorForOperation(udid, 'install');

  if (!validation.valid) {
    if (validation.autoFix) {
      console.error(`[simctl-install] Fixing: ${validation.reason}`);
      await validation.autoFix();
    } else {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `${validation.reason}\n${validation.guidance?.join('\n') || ''}`
      );
    }
  }

  // Proceed with install...
  const command = buildSimctlCommand('install', { udid, appPath });
  const result = await executeCommand(command);

  return {
    success: result.success,
    bundleIdentifier: ...,
    guidance: [
      'App installed successfully',
      `Launch: simctl-launch udid: "${udid}" bundleId: "..."`,
    ],
  };
}

// Example: src/tools/simctl/launch.ts

export async function simctlLaunchTool(args: any) {
  const { udid, bundleId } = args;

  // NEW: Validate simulator is ready
  const simValidation = await validateSimulatorForOperation(udid, 'launch');
  if (!simValidation.valid) {
    // Try auto-fix
    if (simValidation.autoFix) {
      await simValidation.autoFix();
    } else {
      throw new McpError(ErrorCode.InvalidRequest, simValidation.reason!);
    }
  }

  // NEW: Validate app is installed
  const appValidation = await validateAppInstalled(udid, bundleId);
  if (!appValidation.valid) {
    throw new McpError(ErrorCode.InvalidRequest, appValidation.reason!);
  }

  // Proceed with launch...
}
```

## Implementation Checklist

- [ ] Create `src/utils/operation-validation.ts` with validation functions
- [ ] Create `src/state/simulator-lifecycle.ts` with race condition prevention
- [ ] Add `ValidationResult` interface
- [ ] Implement `validateSimulatorForOperation()`
- [ ] Implement `validateAppInstalled()`
- [ ] Implement `validateProjectBuildable()`
- [ ] Add `SimulatorLifecycle` class with race condition handling
- [ ] Integrate validation into existing tools:
  - [ ] simctl-install
  - [ ] simctl-launch
  - [ ] simctl-openurl
  - [ ] simctl-tap
  - [ ] simctl-query-ui
  - [ ] xcodebuild-build
- [ ] Add unit tests for validation functions
- [ ] Add integration tests for race condition prevention
- [ ] Update error messages to be helpful with guidance
- [ ] Document validation behavior in CLAUDE.md

## Testing Requirements

### Unit Tests

- [ ] Detects unbooted simulator correctly
- [ ] Detects missing app correctly
- [ ] Detects missing project correctly
- [ ] Validation result includes helpful guidance
- [ ] Auto-fix suggestions are reasonable

### Integration Tests

- [ ] Multiple concurrent boot calls result in single boot operation
- [ ] Waiting for boot completes when simulator boots
- [ ] Race condition prevention works with real simulators
- [ ] Shutdown clears booting state

### Manual Testing

- [ ] Try to install on unbooted simulator (should auto-fix or guide)
- [ ] Try to launch uninstalled app (should guide to install)
- [ ] Try to build non-existent project (should guide correctly)
- [ ] Multiple concurrent operations work without interference

## Related Tickets

- **Depends on:** None
- **Enables:** PRIORITY-3-SIMULATOR-LIFECYCLE-STATE
- **Works well with:**
  - PRIORITY-1-AUTO-INSTALL-AFTER-BUILD
  - PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY
  - PRIORITY-2-BUILD-AND-RUN-WORKFLOW

## Notes

### Error Message Philosophy

Instead of:
```
Error: Device not booted
```

Provide:
```
Error: Simulator must be booted for install (current state: Shutdown)

To fix this, you can:
1. Boot simulator with: simctl-boot deviceId: "ABC123"
2. Or allow auto-boot before operation (recommended)

Then retry the install operation.
```

### Performance Implications

- Validation adds ~100ms per operation (quick health check)
- Race condition prevention uses in-memory tracking (negligible overhead)
- Cache invalidation kept minimal to avoid redundant refreshes

### Future Enhancements

- Health check before major operations
- Persistent operation history for diagnostics
- Automatic recovery strategies for common failures
- Better error categorization (transient vs permanent)
