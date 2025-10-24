import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlStatusBarToolArgs {
  udid: string;
  operation: 'override' | 'clear';
  time?: string;
  dataNetwork?: string;
  wifiMode?: string;
  batteryState?: string;
  batteryLevel?: number;
}

/**
 * Manage simulator status bar appearance for testing
 *
 * Examples:
 * - Override appearance: udid: "device-123", operation: "override", time: "9:41", batteryLevel: 100
 * - Clear overrides: udid: "device-123", operation: "clear"
 * - Set poor signal: udid: "device-123", operation: "override", dataNetwork: "none", wifiMode: "failed"
 *
 * Parameters (for override):
 * - time: 24-hour format (e.g., "9:41", "23:59")
 * - dataNetwork: none, 1x, 3g, 4g, 5g, lte, lte-a
 * - wifiMode: active, searching, failed
 * - batteryState: charging, charged, discharging
 * - batteryLevel: 0-100
 *
 * **Full documentation:** See simctl/status-bar.md for detailed parameters and examples
 */
export async function simctlStatusBarTool(args: any) {
  const { udid, operation, time, dataNetwork, wifiMode, batteryState, batteryLevel } =
    args as SimctlStatusBarToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (!operation || !['override', 'clear'].includes(operation)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Operation must be either "override" or "clear"'
      );
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(udid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${udid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // For override operation, validate parameters
    if (operation === 'override') {
      // Validate time format if provided
      if (time) {
        const timeRegex = /^\d{1,2}:\d{2}$/;
        if (!timeRegex.test(time)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            'Time must be in 24-hour format (e.g., "9:41", "23:59")'
          );
        }
      }

      // Validate dataNetwork if provided
      if (dataNetwork) {
        const validDataNetworks = ['none', '1x', '3g', '4g', '5g', 'lte', 'lte-a'];
        if (!validDataNetworks.includes(dataNetwork)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Data network must be one of: ${validDataNetworks.join(', ')}. Received: "${dataNetwork}"`
          );
        }
      }

      // Validate wifiMode if provided
      if (wifiMode) {
        const validWifiModes = ['active', 'searching', 'failed'];
        if (!validWifiModes.includes(wifiMode)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `WiFi mode must be one of: ${validWifiModes.join(', ')}. Received: "${wifiMode}"`
          );
        }
      }

      // Validate batteryState if provided
      if (batteryState) {
        const validBatteryStates = ['charging', 'charged', 'discharging'];
        if (!validBatteryStates.includes(batteryState)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Battery state must be one of: ${validBatteryStates.join(', ')}. Received: "${batteryState}"`
          );
        }
      }

      // Validate battery level if provided
      if (batteryLevel !== undefined) {
        if (batteryLevel < 0 || batteryLevel > 100) {
          throw new McpError(ErrorCode.InvalidRequest, 'Battery level must be between 0 and 100');
        }
      }
    }

    // Build command
    let command = `xcrun simctl status_bar "${udid}" ${operation}`;

    // Add parameters for override
    if (operation === 'override') {
      const options = [];

      if (time) {
        options.push(`--time "${time}"`);
      }
      if (dataNetwork) {
        options.push(`--dataNetwork "${dataNetwork}"`);
      }
      if (wifiMode) {
        options.push(`--wifiMode "${wifiMode}"`);
      }
      if (batteryState) {
        options.push(`--batteryState "${batteryState}"`);
      }
      if (batteryLevel !== undefined) {
        options.push(`--batteryLevel "${batteryLevel}"`);
      }

      if (options.length > 0) {
        command += ' ' + options.join(' ');
      }
    }

    console.error(`[simctl-status-bar] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const success = result.code === 0;

    // Build guidance messages
    const guidanceMessages: string[] = [];

    if (success) {
      if (operation === 'override') {
        guidanceMessages.push(
          `✅ Status bar ${operation}d on "${simulator.name}"`,
          `Time: ${time || 'default'}`,
          `Network: ${dataNetwork || 'unchanged'}`,
          `WiFi: ${wifiMode || 'unchanged'}`,
          `Battery: ${batteryLevel !== undefined ? `${batteryLevel}%` : 'unchanged'} (${batteryState || 'unchanged'})`,
          `Take screenshot to verify: simctl-io ${udid} screenshot`
        );
      } else {
        guidanceMessages.push(
          `✅ Status bar overrides cleared on "${simulator.name}"`,
          `Status bar will show actual device state`
        );
      }
    } else {
      guidanceMessages.push(
        `❌ Failed to ${operation} status bar: ${result.stderr || 'Unknown error'}`,
        `Check simulator version compatibility`,
        `Verify simulator is available: simctl-health-check`
      );
    }

    // Add warnings for simulator state regardless of success
    if (simulator.state !== 'Booted') {
      guidanceMessages.push(
        `⚠️ Warning: Simulator is in ${simulator.state} state. Boot the simulator for optimal functionality: simctl-boot ${udid}`
      );
    }
    if (simulator.isAvailable === false) {
      guidanceMessages.push(
        `⚠️ Warning: Simulator is marked as unavailable. This may cause issues with operations.`
      );
    }

    const responseData = {
      success,
      udid,
      operation,
      parameters:
        operation === 'override'
          ? {
              time,
              dataNetwork,
              wifiMode,
              batteryState,
              batteryLevel,
            }
          : undefined,
      simulatorInfo: {
        name: simulator.name,
        udid: simulator.udid,
        state: simulator.state,
        isAvailable: simulator.isAvailable,
      },
      command,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.code,
      guidance: guidanceMessages,
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: !success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-status-bar failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_STATUS_BAR_DOCS = `
# simctl-status-bar

Override or clear simulator status bar appearance for consistent screenshots and UI testing.

## What it does

Controls the simulator's status bar appearance, allowing you to set specific time, network
status, battery level, and WiFi state. Useful for creating consistent screenshots and
testing app behavior under different device conditions.

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **operation** (string, required): "override" or "clear"
- **time** (string, optional): Time in 24-hour format (e.g., "9:41", "23:59")
- **dataNetwork** (string, optional): Network type - none, 1x, 3g, 4g, 5g, lte, lte-a
- **wifiMode** (string, optional): WiFi state - active, searching, failed
- **batteryState** (string, optional): Battery state - charging, charged, discharging
- **batteryLevel** (number, optional): Battery percentage 0-100

## Returns

JSON response with:
- Status bar modification status
- Applied parameters (for override operation)
- Guidance for verification and testing

## Examples

### Override with classic Apple time
\`\`\`typescript
await simctlStatusBarTool({
  udid: 'device-123',
  operation: 'override',
  time: '9:41',
  batteryLevel: 100
})
\`\`\`

### Simulate poor network conditions
\`\`\`typescript
await simctlStatusBarTool({
  udid: 'device-123',
  operation: 'override',
  dataNetwork: 'none',
  wifiMode: 'failed'
})
\`\`\`

### Simulate low battery
\`\`\`typescript
await simctlStatusBarTool({
  udid: 'device-123',
  operation: 'override',
  batteryState: 'discharging',
  batteryLevel: 15
})
\`\`\`

### Clear all overrides
\`\`\`typescript
await simctlStatusBarTool({
  udid: 'device-123',
  operation: 'clear'
})
\`\`\`

## Common Use Cases

1. **Consistent screenshots**: Set time to 9:41 and battery to 100% for app store screenshots
2. **Network condition testing**: Test app behavior with different network types
3. **Low battery testing**: Verify app handles low battery warnings correctly
4. **UI testing**: Ensure status bar doesn't interfere with visual regression tests
5. **Demo mode**: Clean status bar for presentations and demos

## Status Bar Parameters

### Time
- Format: 24-hour "HH:MM" (e.g., "9:41", "14:30", "23:59")
- Apple default: "9:41" (time of original iPhone announcement)

### Data Network
- **none**: No cellular data
- **1x**: 2G network
- **3g**: 3G network
- **4g**: 4G network
- **5g**: 5G network
- **lte**: LTE network
- **lte-a**: LTE Advanced

### WiFi Mode
- **active**: Connected and active
- **searching**: Searching for network
- **failed**: Connection failed

### Battery State
- **charging**: Device is charging
- **charged**: Fully charged
- **discharging**: Running on battery

### Battery Level
- Range: 0-100
- Shows percentage in status bar

## Important Notes

- **Screenshot consistency**: Apply overrides before taking screenshots for consistent results
- **Demo mode**: Apple often uses 9:41 time and 100% battery for marketing materials
- **Simulator only**: Status bar overrides only work on simulators, not real devices
- **Persistent**: Overrides persist until cleared or simulator is reset
- **Version compatibility**: Some parameters may not work on older iOS versions

## Error Handling

- **Invalid time format**: Error if time is not in HH:MM format
- **Invalid network type**: Error if dataNetwork is not in allowed list
- **Invalid battery level**: Error if batteryLevel is not 0-100
- **Simulator not found**: Validates simulator exists in cache

## App Store Screenshot Best Practices

For app store screenshots, Apple recommends:
1. Time: "9:41" (Apple's standard)
2. Battery: 100% (shows full battery icon)
3. Signal: Full bars (use "lte" or "5g")
4. WiFi: Active (shows connected)
5. No notifications or indicators

\`\`\`typescript
await simctlStatusBarTool({
  udid: 'device-123',
  operation: 'override',
  time: '9:41',
  dataNetwork: '5g',
  wifiMode: 'active',
  batteryState: 'charged',
  batteryLevel: 100
})
\`\`\`

## Testing Workflow

1. **Apply overrides**: Set desired status bar state
2. **Take screenshot**: \`simctl-io <udid> screenshot\` to verify
3. **Test app**: Launch app and verify it handles the conditions
4. **Clear overrides**: Reset to normal state when done

## Visual Verification

After applying overrides, always take a screenshot to verify the status bar appears correctly:
\`\`\`
simctl-io <udid> screenshot
\`\`\`

The status bar changes are visible immediately and affect all screenshots taken while
overrides are active.

## When to Clear Overrides

- After taking app store screenshots
- Before testing features that depend on actual device state
- When switching between different test scenarios
- At the end of automated test runs
`;

