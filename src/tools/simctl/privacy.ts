import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlPrivacyToolArgs {
  udid: string;
  bundleId: string;
  action: 'grant' | 'revoke' | 'reset';
  service: string;
  // LLM optimization: audit trail and test context
  scenario?: string;
  step?: number;
}

/**
 * Manage privacy permissions for apps on simulators
 *
 * Examples:
 * - Grant permission: udid: "device-123", bundleId: "com.example.MyApp", action: "grant", service: "camera"
 * - Revoke permission: udid: "device-123", bundleId: "com.example.MyApp", action: "revoke", service: "microphone"
 * - Reset all: udid: "device-123", bundleId: "com.example.MyApp", action: "reset", service: "all"
 * - With audit trail: udid: "device-123", bundleId: "com.example.MyApp", action: "grant", service: "location", scenario: "LocationTest", step: 1
 *
 * Supported services:
 * - camera, microphone, location, contacts, photos, calendar
 * - health, reminders, motion, keyboard, mediaLibrary, calls, siri
 *
 * LLM Optimization:
 * Include scenario and step for structured permission audit trail tracking. Enables agents to track
 * permission changes across test scenarios and verify state at each step.
 */
export async function simctlPrivacyTool(args: any) {
  const { udid, bundleId, action, service, scenario, step } = args as SimctlPrivacyToolArgs;

  try {
    // Validate inputs
    if (!udid || udid.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'UDID is required and cannot be empty');
    }

    if (!bundleId || bundleId.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Bundle ID is required and cannot be empty');
    }

    if (!bundleId.includes('.')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Bundle ID should follow the format: com.company.appname'
      );
    }

    if (!action || !['grant', 'revoke', 'reset'].includes(action)) {
      throw new McpError(ErrorCode.InvalidRequest, 'Action must be "grant", "revoke", or "reset"');
    }

    // Validate service
    const validServices = [
      'camera',
      'microphone',
      'location',
      'contacts',
      'photos',
      'calendar',
      'health',
      'reminders',
      'motion',
      'keyboard',
      'mediaLibrary',
      'calls',
      'siri',
      'all',
    ];

    if (!service || !validServices.includes(service)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Service must be one of: ${validServices.join(', ')}`
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

    // Execute privacy command
    const command = `xcrun simctl privacy "${udid}" ${action} ${service} "${bundleId}"`;
    console.error(`[simctl-privacy] Executing: ${command}`);

    const result = await executeCommand(command, {
      timeout: 10000,
    });

    const success = result.code === 0;

    // Build guidance messages
    const guidanceMessages: (string | undefined)[] = [];

    if (success) {
      guidanceMessages.push(
        `✅ Privacy permission ${action}ed for "${service}" on "${bundleId}"`,
        scenario ? `Scenario: ${scenario}` : undefined,
        step !== undefined ? `Step: ${step}` : undefined,
        `Action: ${action}`,
        `Service: ${service}`,
        `Verify in Settings app: simctl-launch ${udid} com.apple.Preferences`,
        `Grant another permission: simctl-privacy ${udid} ${bundleId} grant microphone`
      );
    } else {
      guidanceMessages.push(
        `❌ Failed to ${action} permission: ${result.stderr || 'Unknown error'}`,
        scenario ? `Scenario: ${scenario}` : undefined,
        step !== undefined ? `Step: ${step}` : undefined,
        `App may not be installed on this simulator`,
        `Verify bundle ID: ${bundleId}`,
        `Install app first: simctl-install ${udid} /path/to/App.app`
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
      action,
      service,
      simulatorInfo: {
        name: simulator.name,
        udid: simulator.udid,
        state: simulator.state,
        isAvailable: simulator.isAvailable,
      },
      // LLM optimization: audit trail entry for permission tracking
      auditEntry: {
        timestamp: new Date().toISOString(),
        action,
        service,
        bundleId,
        success,
        // Context for test scenario tracking
        testContext:
          scenario || step !== undefined
            ? {
                scenario: scenario || undefined,
                step: step !== undefined ? step : undefined,
              }
            : undefined,
      },
      command,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.code,
      guidance: guidanceMessages.filter(Boolean),
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
      `simctl-privacy failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
