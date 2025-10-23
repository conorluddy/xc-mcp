import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlQueryUiToolArgs {
  udid: string;
  bundleId: string;
  predicate: string;
  captureLocation?: boolean;
}

/**
 * Query UI elements on a running app using XCUITest predicates
 *
 * Examples:
 * - Find buttons: udid: "device-123", bundleId: "com.example.app", predicate: 'type == "XCUIElementTypeButton"'
 * - Find by label: udid: "device-123", bundleId: "com.example.app", predicate: 'label == "Login"'
 * - Find enabled elements: udid: "device-123", bundleId: "com.example.app", predicate: 'enabled == true'
 * - Complex query: udid: "device-123", bundleId: "com.example.app", predicate: 'type == "XCUIElementTypeButton" AND label == "Sign In"'
 *
 * Predicates enable XCUITest queries for:
 * - Element types: Button, TextField, Switch, Slider, Table, Cell, Image, StaticText, etc.
 * - Accessibility: identifier, label, placeholderValue
 * - State: enabled, visible, hittable
 * - Compound predicates: AND, OR, NOT operators
 */
export async function simctlQueryUiTool(args: any) {
  const { udid, bundleId, predicate, captureLocation } =
    args as SimctlQueryUiToolArgs;

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

    if (!bundleId.includes('.')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Bundle ID should follow the format: com.company.appname'
      );
    }

    if (!predicate || predicate.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Predicate is required and cannot be empty'
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

    // Build query command
    const command = `xcrun simctl query "${udid}" "${bundleId}" "${predicate}"${
      captureLocation ? ' --locations' : ''
    }`;
    console.error(`[simctl-query-ui] Executing query: ${command}`);

    const result = await executeCommand(command, {
      timeout: 15000,
    });

    const success = result.code === 0;

    const responseData = {
      success,
      udid,
      bundleId,
      predicate,
      simulatorInfo: {
        name: simulator.name,
        udid: simulator.udid,
        state: simulator.state,
        isAvailable: simulator.isAvailable,
      },
      // LLM optimization: element metadata for agent interaction
      elements: success
        ? {
            found: true,
            query: predicate,
            output: result.stdout,
          }
        : undefined,
      command,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.code,
      guidance: success
        ? [
            `✅ UI query successful for "${bundleId}"`,
            `Predicate: ${predicate}`,
            `Result summary: ${result.stdout.split('\n')[0]}`,
            captureLocation
              ? `Element locations captured for interaction`
              : `Use captureLocation: true to get element coordinates`,
            `Next: Interact with element using simctl-tap, simctl-type-text, etc.`,
          ]
        : [
            `❌ Failed to query UI: ${result.stderr || 'Unknown error'}`,
            `Check predicate syntax: ${predicate}`,
            `Verify app is running: simctl-launch ${udid} ${bundleId}`,
            `Test predicate in Xcode UI Test explorer for debugging`,
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
      `simctl-query-ui failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
