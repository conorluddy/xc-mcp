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
 *
 * **Full documentation:** See simctl/push.md for detailed parameters and examples
 */
export async function simctlPushTool(args: any) {
  const { udid, bundleId, payload, testName, expectedBehavior } = args as SimctlPushToolArgs;

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

    if (!payload || payload.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'Payload is required and cannot be empty');
    }

    // Validate JSON payload
    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      throw new McpError(ErrorCode.InvalidRequest, 'Payload must be valid JSON');
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

      // Build guidance messages
      const guidanceMessages: (string | undefined)[] = [];

      if (success) {
        guidanceMessages.push(
          `✅ Push notification sent to "${bundleId}" on "${simulator.name}"`,
          testName ? `Test: ${testName}` : undefined,
          expectedBehavior ? `Expected: ${expectedBehavior}` : undefined,
          `Verify notification in app`,
          `Take screenshot to confirm visual delivery: simctl-io ${udid} screenshot`,
          `Send another notification: simctl-push ${udid} ${bundleId} '{"aps":{"alert":"Test"}}'`
        );
      } else {
        guidanceMessages.push(
          `❌ Failed to send push: ${result.stderr || 'Unknown error'}`,
          testName ? `Test: ${testName}` : undefined,
          `App may not be running`,
          `Launch app first: simctl-launch ${udid} ${bundleId}`,
          `Verify app has push support`
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
        testContext:
          testName || expectedBehavior
            ? {
                testName: testName || undefined,
                expectedBehavior: expectedBehavior || undefined,
                actualBehavior: success
                  ? 'Notification sent successfully'
                  : 'Notification delivery failed',
                passed: success,
              }
            : undefined,
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

export const SIMCTL_PUSH_DOCS = `
# simctl-push

Send simulated push notifications to apps on simulators with test context tracking.

## What it does

Sends push notifications with custom JSON payloads to apps, simulating remote notifications
from APNS. Supports test tracking to verify push delivery and validate app behavior.

## Parameters

- **udid** (string, required): Simulator UDID (from simctl-list)
- **bundleId** (string, required): App bundle ID (e.g., com.example.MyApp)
- **payload** (string, required): JSON payload with APS dictionary
- **testName** (string, optional): Test name for tracking
- **expectedBehavior** (string, optional): Expected app behavior description

## Payload Format

Must be valid JSON with an "aps" dictionary:
\`\`\`json
{
  "aps": {
    "alert": "Notification text",
    "badge": 1,
    "sound": "default"
  },
  "custom": "Additional data"
}
\`\`\`

## LLM Optimization

The **testName** and **expectedBehavior** parameters enable structured test tracking.
This allows AI agents to verify push notification delivery and validate that app behavior
matches expectations (e.g., navigation, UI updates, data refresh).

## Returns

JSON response with:
- Push delivery status
- Delivery information (sent timestamp)
- Test context with expected vs actual behavior
- Guidance for verifying notification handling

## Examples

### Simple alert notification
\`\`\`typescript
await simctlPushTool({
  udid: 'device-123',
  bundleId: 'com.example.MyApp',
  payload: JSON.stringify({
    aps: { alert: 'Test notification' }
  })
})
\`\`\`

### Notification with badge and sound
\`\`\`typescript
await simctlPushTool({
  udid: 'device-123',
  bundleId: 'com.example.MyApp',
  payload: JSON.stringify({
    aps: {
      alert: 'New message',
      badge: 5,
      sound: 'default'
    }
  })
})
\`\`\`

### Rich notification with custom data
\`\`\`typescript
await simctlPushTool({
  udid: 'device-123',
  bundleId: 'com.example.MyApp',
  payload: JSON.stringify({
    aps: {
      alert: {
        title: 'New Order',
        body: 'Order #1234 has been placed'
      },
      badge: 1
    },
    orderId: '1234',
    action: 'view_order'
  })
})
\`\`\`

### Push with test context tracking
\`\`\`typescript
await simctlPushTool({
  udid: 'device-123',
  bundleId: 'com.example.MyApp',
  payload: JSON.stringify({
    aps: { alert: 'Product available' },
    productId: '567'
  }),
  testName: 'PushNotification_DeepLinkTest',
  expectedBehavior: 'App navigates to ProductDetail view for product 567'
})
\`\`\`

## Common Use Cases

1. **Notification delivery testing**: Verify app receives and displays notifications
2. **Deep link navigation**: Test notification taps navigate to correct screens
3. **Badge updates**: Verify badge count is updated correctly
4. **Custom data handling**: Test app processes custom payload data
5. **Background behavior**: Test app behavior when notification arrives in background

## Important Notes

- **App must be running**: Launch app first or test background notification handling
- **Payload validation**: JSON must be valid and include "aps" dictionary
- **Immediate delivery**: Notification is delivered immediately (no delay)
- **No user interaction**: Notification appears automatically without tapping
- **Visual verification**: Use simctl-io screenshot to confirm notification display

## Error Handling

- **Invalid JSON**: Error if payload is not valid JSON
- **App not running**: May fail if app is not running (test background handling)
- **Simulator not booted**: Indicates simulator must be booted first
- **Invalid bundle ID**: Validates bundle ID format (must contain '.')

## Testing Workflow

1. **Launch app**: \`simctl-launch <udid> <bundleId>\`
2. **Send push**: \`simctl-push <udid> <bundleId> <payload>\`
3. **Take screenshot**: \`simctl-io <udid> screenshot\` to verify delivery
4. **Check navigation**: Verify app navigated to expected screen
5. **Validate data**: Confirm app processed custom payload data

## Test Context Tracking

The testContext in the response includes:
- testName: Identifier for this push notification test
- expectedBehavior: What should happen when notification is received
- actualBehavior: What actually happened (delivery success/failure)
- passed: Whether test passed

This enables agents to track push notification tests and verify expected behavior.

## Advanced Testing

- **Multiple notifications**: Send sequential pushes to test badge accumulation
- **Different payload types**: Test alert, sound-only, silent notifications
- **Content extensions**: Test notification service extensions with custom content
- **Action buttons**: Test notification actions and user responses
- **Notification grouping**: Test thread-id for notification grouping
`;

export const SIMCTL_PUSH_DOCS_MINI =
  'Send push notifications to simulator. Use rtfm({ toolName: "simctl-push" }) for docs.';

