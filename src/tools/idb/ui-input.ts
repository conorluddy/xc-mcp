import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface IdbUiInputArgs {
  udid?: string;
  operation: 'text' | 'key' | 'key-sequence';

  // For 'text' operation
  text?: string;

  // For 'key' operation
  key?:
    | 'home'
    | 'lock'
    | 'siri'
    | 'delete'
    | 'return'
    | 'space'
    | 'escape'
    | 'tab'
    | 'up'
    | 'down'
    | 'left'
    | 'right';

  // For 'key-sequence' operation
  keySequence?: string[]; // Array of key names

  // LLM optimization
  actionName?: string; // e.g., "Enter Email"
  fieldContext?: string; // e.g., "Email TextField"
  expectedOutcome?: string; // e.g., "Email field populated"
  isSensitive?: boolean; // Mark as sensitive (password, etc.)
}

/**
 * Input text and keyboard commands on iOS target
 *
 * Examples:
 * - Type text: operation: "text", text: "test@example.com"
 * - Press key: operation: "key", key: "return"
 * - Key sequence: operation: "key-sequence", keySequence: ["tab", "return"]
 * - Sensitive input: operation: "text", text: "password123", isSensitive: true
 * - With context: operation: "text", text: "user@example.com", actionName: "Enter Email"
 *
 * Operations:
 * - text: Type text string (requires focused text field)
 * - key: Press single special key (home, return, etc.)
 * - key-sequence: Press multiple keys in sequence
 *
 * Available Keys:
 * home, lock, siri, delete, return, space, escape, tab,
 * up, down, left, right
 *
 * Device Support:
 * - Simulators: Full support ✅
 * - Physical Devices: Requires USB + idb_companion ✅
 */
export async function idbUiInputTool(args: IdbUiInputArgs) {
  const {
    udid,
    operation,
    text,
    key,
    keySequence,
    actionName,
    fieldContext,
    expectedOutcome,
    isSensitive,
  } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    if (!operation || !['text', 'key', 'key-sequence'].includes(operation)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'operation must be "text", "key", or "key-sequence"'
      );
    }

    // Validate operation-specific parameters
    if (operation === 'text' && !text) {
      throw new McpError(ErrorCode.InvalidRequest, 'text parameter required for text operation');
    }

    if (operation === 'key' && !key) {
      throw new McpError(ErrorCode.InvalidRequest, 'key parameter required for key operation');
    }

    if (operation === 'key-sequence' && (!keySequence || keySequence.length === 0)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'keySequence parameter required for key-sequence operation'
      );
    }

    // Resolve UDID and validate target is booted
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Input
    // ============================================================================

    const result = await executeInputCommand(resolvedUdid, {
      operation,
      text,
      key,
      keySequence,
    });

    // Record successful input
    if (result.success) {
      IDBTargetCache.recordSuccess(resolvedUdid);
    }

    // ============================================================================
    // STAGE 3: Response Formatting
    // ============================================================================

    const duration = Date.now() - startTime;

    // Redact sensitive text in response
    const displayText = isSensitive && text ? `[REDACTED (${text.length} chars)]` : text;

    const responseData = {
      success: result.success,
      udid: resolvedUdid,
      targetName: target.name,
      operation,
      input:
        operation === 'text'
          ? { text: displayText, length: text?.length }
          : operation === 'key'
            ? { key }
            : { keySequence, count: keySequence?.length },
      duration,
      // LLM optimization: input context
      inputContext:
        actionName || fieldContext || expectedOutcome
          ? {
              actionName,
              fieldContext,
              expectedOutcome,
              isSensitive,
            }
          : undefined,
      output: result.output,
      error: result.error || undefined,
      guidance: formatGuidance(result.success, target, {
        operation,
        displayText,
        key,
        keySequence,
        actionName,
        expectedOutcome,
        resolvedUdid,
      }),
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(responseData, null, 2),
        },
      ],
      isError: !result.success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `idb-ui-input failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// INPUT EXECUTION
// ============================================================================

/**
 * Execute IDB input command
 *
 * Why: Sends text or keyboard events to focused element.
 * Different command formats for text vs keys.
 */
async function executeInputCommand(
  udid: string,
  params: {
    operation: string;
    text?: string;
    key?: string;
    keySequence?: string[];
  }
): Promise<{ success: boolean; output: string; error?: string }> {
  const { operation, text, key, keySequence } = params;

  let command: string;

  switch (operation) {
    case 'text': {
      // Format: idb ui text --udid <UDID> "text to type"
      // Escape quotes in text
      const escapedText = text!.replace(/"/g, '\\"');
      command = `idb ui text --udid "${udid}" "${escapedText}"`;
      break;
    }

    case 'key': {
      // Format: idb ui key --udid <UDID> <key-name>
      command = `idb ui key --udid "${udid}" ${key}`;
      break;
    }

    case 'key-sequence': {
      // Format: idb ui key-sequence --udid <UDID> <key1> <key2> ...
      command = `idb ui key-sequence --udid "${udid}" ${keySequence!.join(' ')}`;
      break;
    }

    default:
      throw new McpError(ErrorCode.InvalidRequest, `Unknown operation: ${operation}`);
  }

  console.error(`[idb-ui-input] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 10000 });

  return {
    success: result.code === 0,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatGuidance(
  success: boolean,
  target: any,
  context: {
    operation: string;
    displayText?: string;
    key?: string;
    keySequence?: string[];
    actionName?: string;
    expectedOutcome?: string;
    resolvedUdid: string;
  }
): string[] {
  const { operation, displayText, key, keySequence, actionName, expectedOutcome, resolvedUdid } =
    context;

  if (success) {
    let inputDescription = '';
    if (operation === 'text') {
      inputDescription = `text "${displayText}"`;
    } else if (operation === 'key') {
      inputDescription = `key "${key}"`;
    } else {
      inputDescription = `key sequence: ${keySequence?.join(' → ')}`;
    }

    return [
      `✅ Input successful: ${inputDescription}`,
      actionName ? `Action: ${actionName}` : undefined,
      expectedOutcome ? `Expected: ${expectedOutcome}` : undefined,
      ``,
      `Next steps to verify input:`,
      `• Take screenshot: simctl-screenshot-inline --udid ${resolvedUdid}`,
      expectedOutcome
        ? `• Verify outcome: Check if ${expectedOutcome}`
        : `• Check UI state: Verify text field or UI updated`,
      operation === 'text' ? `• Submit form: idb-ui-input --operation key --key return` : undefined,
      `• Continue workflow: Use idb-ui-tap to proceed`,
    ].filter(Boolean) as string[];
  }

  return [
    `❌ Failed to input ${operation === 'text' ? 'text' : operation === 'key' ? `key "${key}"` : 'key sequence'}`,
    ``,
    `Troubleshooting:`,
    operation === 'text'
      ? [
          `• Ensure text field is focused: Tap on field first with idb-ui-tap`,
          `• Check keyboard is visible: Some fields show keyboard automatically`,
          `• Verify field accepts text: Some fields may be read-only`,
        ]
      : [
          `• Verify key name is valid: ${key || keySequence?.join(', ')}`,
          `• Check target supports key: Not all keys work on all devices`,
          `• Try alternative: Use idb-ui-tap for on-screen buttons`,
        ],
    ``,
    `Available keys:`,
    `home, lock, siri, delete, return, space, escape, tab, up, down, left, right`,
    ``,
    `Verify target state:`,
    `• idb-targets --operation describe --udid ${resolvedUdid}`,
    `• Take screenshot to see current UI`,
  ]
    .flat()
    .filter(Boolean) as string[];
}
