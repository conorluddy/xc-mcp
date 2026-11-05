import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { formatToolError } from '../../utils/error-formatter.js';
import { executeCommandWithArgs } from '../../utils/command.js';
import { assertHidWritesSupported } from '../../utils/idb-environment.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { isValidUdid } from '../../utils/shell-escape.js';

interface IdbUiInputArgs {
  udid?: string;
  operation: 'text' | 'key' | 'key-sequence' | 'clear';
  modifiers?: ('shift' | 'control' | 'option' | 'command')[];

  // For 'text' operation
  text?: string;

  // For 'key' operation
  key?: string;

  // For 'key-sequence' operation
  keySequence?: string[]; // Array of key names

  // LLM optimization
  actionName?: string; // e.g., "Enter Email"
  fieldContext?: string; // e.g., "Email TextField"
  expectedOutcome?: string; // e.g., "Email field populated"
  isSensitive?: boolean; // Mark as sensitive (password, etc.)
}

/**
 * Input text and keyboard commands - automated text entry and special key presses for form automation
 *
 * **What it does:**
 * Sends text input and keyboard commands to focused elements on iOS targets. Types text strings into
 * active text fields, presses special keys (home, return, delete, arrows), and executes key sequences
 * for complex input workflows. Automatically redacts sensitive data (passwords) in responses and provides
 * semantic field context tracking for test documentation.
 *
 * **Why you'd use it:**
 * - Automate form filling without manual keyboard interaction - login flows, search, data entry
 * - Execute keyboard shortcuts and navigation (tab, return, arrows) for multi-field workflows
 * - Safely handle sensitive data with automatic redaction in tool responses and logs
 * - Track input operations with semantic metadata (actionName, fieldContext, expectedOutcome)
 *
 * **Parameters:**
 * - operation (required): "text" | "key" | "key-sequence"
 * - text (required for text operation): String to type into focused field
 * - key (required for key operation): Special key name (home, return, delete, tab, arrows, etc.)
 * - keySequence (required for key-sequence operation): Array of key names to press in order
 * - udid (optional): Target identifier - auto-detects if omitted
 * - actionName, fieldContext, expectedOutcome (optional): Semantic tracking for test documentation
 * - isSensitive (optional): Mark as sensitive to redact from output
 *
 * **Returns:**
 * Input execution status with operation details (redacted if sensitive), duration, input context
 * metadata for test tracking, error details if failed, and troubleshooting guidance specific to
 * text vs. key operations.
 *
 * **Example:**
 * ```typescript
 * // Type email into focused field
 * const result = await idbUiInputTool({
 *   operation: 'text',
 *   text: 'user@example.com',
 *   actionName: 'Enter Email',
 *   fieldContext: 'Email TextField'
 * });
 *
 * // Press return to submit
 * await idbUiInputTool({ operation: 'key', key: 'return' });
 * ```
 *
 * **Full documentation:** See idb/ui-input.md for detailed parameters and available keys
 *
 * @param args Tool arguments with operation type and input data
 * @returns Tool result with input status and semantic context
 */
export async function idbUiInputTool(args: IdbUiInputArgs) {
  // Fail loudly rather than let a stale idb-companion drop the event silently.
  await assertHidWritesSupported();

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

    if (!operation || !['text', 'key', 'key-sequence', 'clear'].includes(operation)) {
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
      modifiers: args.modifiers,
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
    modifiers?: string[];
    text?: string;
    key?: string;
    keySequence?: string[];
  }
): Promise<{ success: boolean; output: string; error?: string }> {
  const { operation, text, key, keySequence } = params;

  // Validate UDID to prevent command injection
  if (!isValidUdid(udid)) {
    throw new McpError(ErrorCode.InvalidRequest, `Invalid UDID format: ${udid}`);
  }

  const codes: Record<string, number> = {
    return: 40,
    enter: 40,
    escape: 41,
    delete: 42,
    backspace: 42,
    tab: 43,
    space: 44,
    right: 79,
    left: 80,
    down: 81,
    up: 82,
  };
  const modifiers = params.modifiers || [];
  if (modifiers.some(m => !['shift', 'control', 'option', 'command'].includes(m))) {
    throw new McpError(ErrorCode.InvalidRequest, 'Unknown keyboard modifier');
  }
  const keyArgs = (name: string): string[] => {
    const lower = name.toLowerCase();
    if (['home', 'lock', 'siri'].includes(lower))
      return ['ui', 'button', '--udid', udid, lower.toUpperCase()];
    const code =
      codes[lower] ??
      (/^[a-z]$/.test(lower)
        ? lower.charCodeAt(0) - 93
        : /^[1-9]$/.test(lower)
          ? Number(lower) + 29
          : lower === '0'
            ? 39
            : undefined);
    if (code === undefined) throw new McpError(ErrorCode.InvalidRequest, `Unknown key: ${name}`);
    return ['ui', 'key', '--udid', udid, String(code), ...modifiers.map(m => `--${m}`)];
  };
  const commands =
    operation === 'text'
      ? [['ui', 'text', '--udid', udid, text!]]
      : operation === 'clear'
        ? [
            ['ui', 'key', '--udid', udid, '4', '--command'],
            ['ui', 'key', '--udid', udid, '42'],
          ]
        : (operation === 'key' ? [key!] : keySequence!).map(keyArgs);
  let output = '';
  for (const command of commands) {
    const result = await executeCommandWithArgs('idb', command, { timeout: 10000 });
    if (result.code !== 0) return { success: false, output, error: formatToolError(result.stderr) };
    output += result.stdout;
  }
  return { success: true, output };
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
    let inputDescription: string;
    if (operation === 'text') {
      inputDescription = `text "${displayText}"`;
    } else if (operation === 'key') {
      inputDescription = `key "${key}"`;
    } else if (operation === 'clear') {
      inputDescription = 'select all and delete';
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

export const IDB_UI_INPUT_DOCS = `
# idb-ui-input

⌨️ **Input text and keyboard commands** - automated text entry and special key presses for form automation

## What it does

Sends text input and keyboard commands to focused elements on iOS targets. Types text strings into active text fields, presses special keys (home, return, delete, arrows), and executes key sequences for complex input workflows. Automatically redacts sensitive data (passwords) in responses and provides semantic field context tracking for test documentation.

## Why you'd use it

- Automate form filling without manual keyboard interaction - login flows, search, data entry
- Execute keyboard shortcuts and navigation (tab, return, arrows) for multi-field workflows
- Safely handle sensitive data with automatic redaction in tool responses and logs
- Track input operations with semantic metadata (actionName, fieldContext, expectedOutcome)

## Additional input operations

- operation: clear selects all (Command+A) and deletes.
- modifiers: shift, control, option, command apply to key/key-sequence events.
- key and keySequence accept letters, digits and named keys; sequences send individual HID events.

## Parameters

### Required
- **operation** (string): "text" | "key" | "key-sequence"

### Operation-specific parameters
- **text** (string, required for text operation): String to type into focused field
- **key** (string, required for key operation): Special key name (home, return, delete, tab, arrows, etc.)
- **keySequence** (string[], required for key-sequence operation): Array of key names to press in order

### Optional
- **udid** (string): Target identifier - auto-detects if omitted
- **actionName** (string): Semantic action name (e.g., "Enter Email")
- **fieldContext** (string): Field name for context (e.g., "Email TextField")
- **expectedOutcome** (string): Expected result (e.g., "Email field populated")
- **isSensitive** (boolean): Mark as sensitive to redact from output

## Returns

Input execution status with operation details (redacted if sensitive), duration, input context metadata for test tracking, error details if failed, and troubleshooting guidance specific to text vs. key operations.

## Examples

### Type email into focused field
\`\`\`typescript
const result = await idbUiInputTool({
  operation: 'text',
  text: 'user@example.com',
  actionName: 'Enter Email',
  fieldContext: 'Email TextField'
});
\`\`\`

### Press return to submit
\`\`\`typescript
await idbUiInputTool({ operation: 'key', key: 'return' });
\`\`\`

## Related Tools

- idb-ui-tap: Tap to focus text fields before typing
- idb-ui-describe: Find text field coordinates
`;

export const IDB_UI_INPUT_DOCS_MINI =
  'Input text and keyboard commands. Use rtfm({ toolName: "idb-ui-input" }) for docs.';
