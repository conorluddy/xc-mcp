import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlUninstallToolArgs {
  udid: string;
  bundleId: string;
}

/**
 * Uninstall iOS apps from simulators
 *
 * **What it does:**
 * Removes an installed app from a simulator by its bundle ID. This cleans up all app
 * data, preferences, and the app bundle itself from the simulator.
 *
 * **Why you'd use it:**
 * - Clean testing enables fresh installation testing after uninstall
 * - Data removal clears all app data and preferences completely
 * - Space management frees simulator disk space by removing unused apps
 * - Workflow automation supports test cycles requiring clean app installs
 *
 * **Parameters:**
 * - `udid` (string): Simulator UDID (from simctl-list)
 * - `bundleId` (string): App bundle ID (e.g., com.example.MyApp)
 *
 * **Returns:**
 * Uninstall status with bundle ID, simulator info, and guidance for reinstallation
 *
 * **Example:**
 * ```typescript
 * // Uninstall app from simulator
 * await simctlUninstallTool({
 *   udid: 'ABC-123-DEF',
 *   bundleId: 'com.example.MyApp'
 * })
 * ```
 *
 * **Full documentation:** See simctl/uninstall.md for app management patterns
 *
 * @param args Uninstall configuration (requires udid and bundleId)
 * @returns Tool result with uninstall status and guidance
 * @throws McpError for invalid bundle ID or uninstall failure
 */
export async function simctlUninstallTool(args: any) {
  const { udid, bundleId } = args as SimctlUninstallToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'UDID is required and cannot be empty'
      );
    }

    if (!bundleId || bundleId.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Bundle ID is required and cannot be empty'
      );
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

    // Execute uninstall command
    const command = `xcrun simctl uninstall "${udid}" "${bundleId}"`;
    console.error(`[simctl-uninstall] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 30000, // 30 seconds for app uninstallation
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
            `✅ App "${bundleId}" uninstalled successfully from "${simulator.name}"`,
            `Install new app: simctl-install ${udid} /path/to/App.app`,
            `List installed apps: simctl-list ${udid}`,
            `Check app container: simctl-get-app-container ${udid} com.example.app`,
          ]
        : [
            `⚠️ Failed to uninstall app: ${result.stderr || 'Unknown error'}`,
            `App may not be installed`,
            `Verify bundle ID: ${bundleId}`,
            `Check simulator status: simctl-health-check`,
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
      `simctl-uninstall failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_UNINSTALL_DOCS = `
# simctl-uninstall

Uninstall iOS apps from simulators.

## Overview

Removes an installed app from a simulator by its bundle ID. This cleans up all app data, preferences, and the app bundle itself from the simulator. Useful for clean testing, data removal, space management, and workflow automation.

## Parameters

### Required
- **udid** (string): Simulator UDID (from simctl-list)
- **bundleId** (string): App bundle ID (e.g., com.example.MyApp)

## Returns

Uninstall status with bundle ID, simulator info (name, state, availability), success indicator, command output, and guidance for reinstallation or app management.

## Examples

### Uninstall app from simulator
\`\`\`typescript
await simctlUninstallTool({
  udid: 'ABC-123-DEF',
  bundleId: 'com.example.MyApp'
});
\`\`\`

### Clean install workflow
\`\`\`typescript
// Uninstall old version
await simctlUninstallTool({
  udid: 'TEST-DEVICE',
  bundleId: 'com.example.MyApp'
});
// Then reinstall
await simctlInstallTool({
  udid: 'TEST-DEVICE',
  appPath: '/path/to/MyApp.app'
});
\`\`\`

## Related Tools

- simctl-install: Reinstall app after uninstall
- simctl-list: Find simulator UDID
- simctl-get-app-container: Check app container before uninstall

## Notes

- Bundle ID must follow format: com.company.appname
- Removes app and all associated data/preferences
- Validates simulator exists before attempting uninstall
- Useful for clean testing workflows
- Frees simulator disk space by removing unused apps
- Test cycles requiring clean app installs benefit from uninstall automation
`;
