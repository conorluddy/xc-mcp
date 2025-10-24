import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveDeviceId } from '../../utils/device-detection.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { responseCache } from '../../utils/response-cache.js';

interface SimctlQueryUiToolArgs {
  udid?: string;
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
  const { udid, bundleId, predicate, captureLocation } = args as SimctlQueryUiToolArgs;

  try {
    // Resolve device UDID (auto-detect if not provided)
    const resolvedUdid = await resolveDeviceId(udid);

    // Validate inputs
    if (!bundleId || bundleId.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Bundle ID is required and cannot be empty');
    }

    if (!bundleId.includes('.')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Bundle ID should follow the format: com.company.appname'
      );
    }

    if (!predicate || predicate.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Predicate is required and cannot be empty');
    }

    // Validate simulator exists
    const simulator = await simulatorCache.findSimulatorByUdid(resolvedUdid);
    if (!simulator) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator with UDID "${resolvedUdid}" not found. Use simctl-list to see available simulators.`
      );
    }

    // Build query command
    const command = `xcrun simctl query "${resolvedUdid}" "${bundleId}" "${predicate}"${
      captureLocation ? ' --locations' : ''
    }`;
    console.error(`[simctl-query-ui] Executing query: ${command}`);

    const result = await executeCommand(command, {
      timeout: 15000,
    });

    const success = result.code === 0;
    const lines = result.stdout.split('\n').filter(line => line.trim());

    // Store full response in cache for progressive disclosure
    const interactionId = responseCache.store({
      tool: 'simctl-query-ui',
      fullOutput: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      command,
      metadata: {
        udid: resolvedUdid,
        bundleId,
        predicate,
        captureLocation: captureLocation ? 'true' : 'false',
        elementCount: lines.length,
      },
    });

    // Create summary response with caching
    const responseData = {
      success,
      udid: resolvedUdid,
      bundleId,
      predicate,
      simulatorInfo: {
        name: simulator.name,
        state: simulator.state,
      },
      // Progressive disclosure: summary + cacheId
      summary: success
        ? {
            elementCount: lines.length,
            firstElement: lines[0] ? lines[0].substring(0, 100) : 'No elements found',
            note: `Found ${lines.length} element(s) matching predicate`,
          }
        : {
            error: result.stderr?.substring(0, 200) || 'Unknown error',
          },
      cacheId: interactionId,
      guidance: success
        ? [
            `✅ Query matched ${lines.length} UI element(s)`,
            captureLocation
              ? `📍 Element locations captured - elements include coordinate information`
              : `⚠️ Re-run with captureLocation: true to capture element coordinates for tapping`,
            `Use simctl-get-interaction-details to view full element list with positions`,
            `Next: Use element coordinates with simctl-tap for reliable interaction`,
          ]
        : [
            `❌ Failed to query UI: ${result.stderr?.split('\n')[0] || 'Unknown error'}`,
            `Troubleshooting:`,
            `• Check predicate syntax: ${predicate}`,
            `• Verify app bundle ID is correct: ${bundleId}`,
            `• Ensure app is running and visible on booted simulator`,
            `• Try simctl-screenshot to verify app is in foreground`,
            ``,
            `Common predicate examples:`,
            `  - type == "XCUIElementTypeButton"`,
            `  - label == "Initialize Database"`,
            `  - identifier == "button_id"`,
            `  - type == "XCUIElementTypeButton" AND enabled == true`,
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
