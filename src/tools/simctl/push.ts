import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlPushToolArgs {
  udid: string;
  bundleId: string;
  payload: string;
  // LLM optimization: delivery tracking and test context
  testName?: string;
  expectedBehavior?: string;
}

/**
 * Send simulated push notifications to an app on a simulator
 *
 * Examples:
 * - Simple alert: udid: "device-123", bundleId: "com.example.MyApp", payload: '{"aps":{"alert":"Test notification"}}'
 * - With badge: udid: "device-123", bundleId: "com.example.MyApp", payload: '{"aps":{"alert":"Test","badge":1}}'
 * - Complex payload: udid: "device-123", bundleId: "com.example.MyApp", payload: '{"aps":{"alert":{"title":"Title","body":"Body"},"sound":"default"},"custom":"data"}'
 * - With test context: udid: "device-123", bundleId: "com.example.MyApp", payload: '...', testName: "PushNotification_DeepLinkTest", expectedBehavior: "App navigates to ProductDetail view"
 *
 * Payload must be valid JSON with APS dictionary
 *
 * LLM Optimization:
 * Include testName and expectedBehavior for structured test tracking. Enables agents to verify
 * push delivery and validate app behavior against expectations.
 */
export async function simctlPushTool(args: any) {
  const { udid, bundleId, payload, testName, expectedBehavior } =
    args as SimctlPushToolArgs;

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

    if (!payload || payload.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Payload is required and cannot be empty'
      );
    }

    // Validate JSON payload
    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Payload must be valid JSON'
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

    // Write payload to temp file
    const tempFile = `/tmp/push_payload_${Date.now()}.json`;
    const fs = await import('fs/promises');
    await fs.writeFile(tempFile, payload);

    try {
      // Execute push command
      const command = `xcrun simctl push "${udid}" "${bundleId}" "${tempFile}"`;
      console.error(`[simctl-push] Executing: ${command}`);

      const result = await executeCommand(command, {
        timeout: 15000,
      });

      const success = result.code === 0;

      const responseData = {
        success,
        udid,
        bundleId,
        payload: parsedPayload,
        simulatorInfo: {
          name: simulator.name,
          udid: simulator.udid,
          state: simulator.state,
          isAvailable: simulator.isAvailable,
        },
        // LLM optimization: delivery tracking and test context
        deliveryInfo: {
          sent: success,
          sentAt: new Date().toISOString(),
          // Note: For full delivery confirmation with app response, pair with simctl-io screenshot
          // to verify the notification was visually displayed in the app
        },
        testContext: testName || expectedBehavior ? {
          testName: testName || undefined,
          expectedBehavior: expectedBehavior || undefined,
          actualBehavior: success ? 'Notification sent successfully' : 'Notification delivery failed',
          passed: success,
        } : undefined,
        command,
        output: result.stdout,
        error: result.stderr || undefined,
        exitCode: result.code,
        guidance: success
          ? [
              `✅ Push notification sent to "${bundleId}" on "${simulator.name}"`,
              testName ? `Test: ${testName}` : undefined,
              expectedBehavior ? `Expected: ${expectedBehavior}` : undefined,
              `Verify notification in app`,
              `Take screenshot to confirm visual delivery: simctl-io ${udid} screenshot`,
              `Send another notification: simctl-push ${udid} ${bundleId} '{"aps":{"alert":"Test"}}'`,
            ].filter(Boolean)
          : [
              `❌ Failed to send push: ${result.stderr || 'Unknown error'}`,
              testName ? `Test: ${testName}` : undefined,
              `App may not be running`,
              `Launch app first: simctl-launch ${udid} ${bundleId}`,
              `Verify app has push support`,
            ].filter(Boolean),
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
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-push failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
