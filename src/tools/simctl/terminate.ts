import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlTerminateToolArgs {
  udid: string;
  bundleId: string;
}

/**
 * Terminate a running iOS app on a simulator
 *
 * Examples:
 * - Terminate app: udid: "device-123", bundleId: "com.example.MyApp"
 *
 * Gracefully terminates the specified app. If the app is not running,
 * returns an error but can be safely ignored.
 *
 * **Full documentation:** See simctl/terminate.md for detailed parameters and examples
 */
export async function simctlTerminateTool(args: any) {
  const { udid, bundleId } = args as SimctlTerminateToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (!bundleId || bundleId.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Bundle ID is required and cannot be empty');
    }

    // Validate bundle ID format
    if (!bundleId.includes('.')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Bundle ID should follow the format: com.company.appname'
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

    // Execute terminate command
    const command = `xcrun simctl terminate "${udid}" "${bundleId}"`;
    console.error(`[simctl-terminate] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const success = result.code === 0;

    const responseData = {
      success,
      udid,
      bundleId,
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
      guidance: success
        ? [
            `✅ App "${bundleId}" terminated successfully`,
            `Launch app again: simctl-launch ${udid} ${bundleId}`,
            `Uninstall app: simctl-uninstall ${udid} ${bundleId}`,
            `Check app container: simctl-get-app-container ${udid} ${bundleId}`,
          ]
        : [
            `⚠️ Failed to terminate app: ${result.stderr || 'Unknown error'}`,
            `App may not be running`,
            simulator.state !== 'Booted'
              ? `Simulator is not booted`
              : `Verify app is installed and running`,
            `Check simulator health: simctl-health-check`,
          ],
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
      `simctl-terminate failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_TERMINATE_DOCS = `
# simctl-terminate

Gracefully terminate a running iOS app on a simulator.

## What it does

Stops a running app by sending a termination signal. The app's lifecycle methods
(applicationWillTerminate:) will be called, allowing clean shutdown.

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **bundleId** (string, required): App bundle ID (e.g., com.example.MyApp)

## Returns

JSON response with:
- Termination status
- Command executed
- Guidance for next steps (relaunching, uninstalling, checking container)

## Examples

### Terminate running app
\`\`\`typescript
await simctlTerminateTool({
  udid: 'device-123',
  bundleId: 'com.example.MyApp'
})
\`\`\`

## Common Use Cases

1. **Clean app restart**: Terminate then relaunch to reset app state
2. **Test lifecycle**: Verify app handles termination correctly
3. **Memory cleanup**: Stop app before running memory-intensive tests
4. **State reset**: Terminate app to clear runtime state between test runs
5. **Background testing**: Stop foreground app to test background behavior

## Important Notes

- **Graceful termination**: App lifecycle methods are called for clean shutdown
- **Not running OK**: Returns error if app is not running, but can be safely ignored
- **Simulator state**: Works on both booted and shutdown simulators
- **No force kill**: This is a graceful termination, not a force kill

## Error Handling

- **App not running**: Error returned but operation is safe to ignore
- **App not installed**: Indicates app must be installed first
- **Simulator not booted**: Warning shown but termination may still succeed
- **Invalid bundle ID**: Validates bundle ID format (must contain '.')

## Next Steps After Termination

1. **Launch app again**: \`simctl-launch <udid> <bundleId>\`
2. **Uninstall app**: \`simctl-uninstall <udid> <bundleId>\`
3. **Check app container**: \`simctl-get-app-container <udid> <bundleId>\`
4. **Install new build**: \`simctl-install <udid> /path/to/App.app\`

## Difference from Force Kill

- **Terminate (this tool)**: Graceful shutdown with lifecycle callbacks
- **Force kill**: Immediate termination without cleanup (use system kill command)
`;

