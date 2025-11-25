import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlGetAppContainerToolArgs {
  udid: string;
  bundleId: string;
  containerType?: string;
}

/**
 * Access iOS app file system containers for inspection
 *
 * **What it does:**
 * Retrieves the file system path to an app's container directories on a simulator,
 * enabling direct access to app bundle, data directories, and shared group containers
 * for debugging and testing.
 *
 * **Why you'd use it:**
 * - Debug data access enables inspection of app Documents and Library folders
 * - File inspection allows viewing database files, preferences, and cached data
 * - Testing validation confirms app writes data to correct locations
 * - Container types support bundle (app binary), data (Documents/Library), and group (shared) access
 *
 * **Parameters:**
 * - `udid` (string): Simulator UDID (from simctl-list)
 * - `bundleId` (string): App bundle ID (e.g., com.example.MyApp)
 * - `containerType` (string, optional): Container type - bundle, data, or group (default: data)
 *
 * **Returns:**
 * Container path with type information and guidance for accessing files
 *
 * **Example:**
 * ```typescript
 * // Get app data container path
 * await simctlGetAppContainerTool({
 *   udid: 'ABC-123-DEF',
 *   bundleId: 'com.example.MyApp'
 * })
 *
 * // Get app bundle path
 * await simctlGetAppContainerTool({
 *   udid: 'ABC-123-DEF',
 *   bundleId: 'com.example.MyApp',
 *   containerType: 'bundle'
 * })
 * ```
 *
 * **Full documentation:** See simctl/get-app-container.md for container types and debugging
 *
 * @param args Container query configuration (requires udid and bundleId)
 * @returns Tool result with container path and file access guidance
 * @throws McpError for app not installed or container access failure
 */
export async function simctlGetAppContainerTool(args: any) {
  const { udid, bundleId, containerType } = args as SimctlGetAppContainerToolArgs;

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

    // Build get_app_container command
    let command = `xcrun simctl get_app_container "${udid}" "${bundleId}"`;
    if (containerType) {
      command = `xcrun simctl get_app_container "${udid}" "${bundleId}" "${containerType}"`;
    }

    console.error(`[simctl-get-app-container] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const containerPath = result.code === 0 ? result.stdout.trim() : null;
    const success = !!(result.code === 0 && containerPath && containerPath.length > 0);

    // Extract container type for response
    const displayContainerType = containerType || 'data';

    // Build guidance messages
    const guidanceMessages: string[] = [];

    if (success) {
      guidanceMessages.push(
        `✅ Container path retrieved for "${bundleId}"`,
        `Path: ${containerPath}`,
        `Access files: cd "${containerPath}" && ls -la`,
        `View app documents: open "${containerPath}/Documents"`,
        `Inspect app data: find "${containerPath}" -type f | head -20`,
        `Container type: ${displayContainerType} (bundle/data/group)`
      );
    } else {
      guidanceMessages.push(
        `❌ Failed to get app container: ${result.stderr || 'Unknown error'}`,
        `App may not be installed on this simulator`,
        `Verify bundle ID: ${bundleId}`,
        `Install app first: simctl-install ${udid} /path/to/App.app`,
        `Check app is running: simctl-launch ${udid} ${bundleId}`
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
      bundleId,
      containerType: displayContainerType,
      containerPath: containerPath || undefined,
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
      `simctl-get-app-container failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_GET_APP_CONTAINER_DOCS = `
# simctl-get-app-container

Access iOS app file system containers for inspection and debugging.

## What it does

Retrieves the file system path to an app's container directories on a simulator,
enabling direct access to app bundle, data directories, and shared group containers
for debugging and testing.

## Why you'd use it

- **Debug data access**: Inspect app Documents and Library folders
- **File inspection**: View database files, preferences, and cached data
- **Testing validation**: Confirm app writes data to correct locations
- **Container types**: Access bundle (app binary), data (Documents/Library), and group (shared) containers

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **bundleId** (string, required): App bundle ID (e.g., com.example.MyApp)
- **containerType** (string, optional): Container type - bundle, data, or group (default: data)

## Container Types

- **bundle**: App binary and resources (read-only)
- **data**: App's Documents and Library directories (read-write)
- **group**: Shared containers for app groups (read-write)

## Returns

JSON response with:
- Container path for file system access
- Container type information
- Guidance for accessing and inspecting files
- Simulator state and validation

## Examples

### Get app data container path
\`\`\`typescript
await simctlGetAppContainerTool({
  udid: 'ABC-123-DEF',
  bundleId: 'com.example.MyApp'
})
\`\`\`

### Get app bundle path
\`\`\`typescript
await simctlGetAppContainerTool({
  udid: 'ABC-123-DEF',
  bundleId: 'com.example.MyApp',
  containerType: 'bundle'
})
\`\`\`

## Common Use Cases

1. **Debugging data persistence**: Access app's Documents folder to inspect saved files
2. **Database inspection**: View SQLite database files and validate schema
3. **Preferences debugging**: Check UserDefaults plist files
4. **Cache validation**: Verify cached data is stored correctly
5. **Bundle inspection**: Access app binary and embedded resources

## Error Handling

- **App not installed**: Returns error if app is not installed on simulator
- **Invalid bundle ID**: Validates bundle ID format (must contain '.')
- **Simulator not found**: Validates simulator exists in cache
- **Container access failure**: Reports if container cannot be accessed

## Next Steps After Getting Container Path

1. **View files**: \`cd "<container-path>" && ls -la\`
2. **Open in Finder**: \`open "<container-path>/Documents"\`
3. **Find files**: \`find "<container-path>" -type f | head -20\`
4. **Inspect specific file**: \`cat "<container-path>/Documents/data.json"\`
`;

export const SIMCTL_GET_APP_CONTAINER_DOCS_MINI =
  'Get app container path on simulator. Use rtfm({ toolName: "simctl-get-app-container" }) for docs.';

