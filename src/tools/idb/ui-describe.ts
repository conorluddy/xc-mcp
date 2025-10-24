import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { responseCache } from '../../utils/response-cache.js';

interface IdbUiDescribeArgs {
  udid?: string;
  operation: 'all' | 'point';

  // For 'point' operation
  x?: number;
  y?: number;

  // LLM optimization
  screenContext?: string; // e.g., "LoginScreen"
  purposeDescription?: string; // e.g., "Find tappable button"
}

/**
 * Query UI accessibility tree - discover tappable elements and text fields for precise automation
 *
 * **What it does:**
 * Queries iOS accessibility tree to discover UI elements, their properties (type, label, enabled state),
 * and screen locations. Provides full tree with progressive disclosure (summary + cache ID for full data),
 * element-at-point queries for tap validation, and data quality assessment (rich/moderate/minimal) to guide
 * automation strategy. Automatically caches large outputs to prevent token overflow.
 *
 * **Why you'd use it:**
 * - Discover tappable elements without visual screenshots - buttons, cells, links identified by accessibility data
 * - Assess data quality before choosing automation approach - rich data enables precise targeting, minimal data requires screenshots
 * - Validate tap coordinates by querying elements at specific points before execution
 * - Progressive disclosure prevents token overflow on complex UIs - get summary first, full tree on demand
 *
 * **Parameters:**
 * - operation (required): "all" | "point"
 * - x, y (required for point operation): Coordinates to query element at specific location
 * - udid (optional): Target identifier - auto-detects if omitted
 * - screenContext, purposeDescription (optional): Semantic tracking for element discovery context
 *
 * **Returns:**
 * For "all": UI tree summary with element counts (total, tappable, text fields), data quality assessment
 * (rich/moderate/minimal), top 20 interactive elements preview, uiTreeId for full tree retrieval, and
 * guidance on automation strategy based on data richness.
 *
 * For "point": Element details at coordinates including type, label, value, enabled state, and tappability.
 *
 * **Example:**
 * ```typescript
 * // Query full UI tree with data quality assessment
 * const result = await idbUiDescribeTool({
 *   operation: 'all',
 *   screenContext: 'LoginScreen',
 *   purposeDescription: 'Find email and password fields'
 * });
 *
 * // Validate element at tap coordinates
 * await idbUiDescribeTool({ operation: 'point', x: 200, y: 400 });
 * ```
 *
 * **Full documentation:** See idb/ui-describe.md for detailed parameters and progressive disclosure
 *
 * @param args Tool arguments with operation type and optional coordinates
 * @returns Tool result with UI tree data or element details
 */
export async function idbUiDescribeTool(args: IdbUiDescribeArgs) {
  const { udid, operation, x, y, screenContext, purposeDescription } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    if (!operation || !['all', 'point'].includes(operation)) {
      throw new McpError(ErrorCode.InvalidRequest, 'operation must be "all" or "point"');
    }

    // Validate point operation parameters
    if (operation === 'point') {
      if (x === undefined || y === undefined) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'point operation requires x and y coordinates'
        );
      }
    }

    // Resolve UDID and validate target is booted
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Query
    // ============================================================================

    const result =
      operation === 'all'
        ? await executeDescribeAllOperation(resolvedUdid, target, {
            screenContext,
            purposeDescription,
          })
        : await executeDescribePointOperation(resolvedUdid, x!, y!);

    // Record successful query
    if (result.success) {
      IDBTargetCache.recordSuccess(resolvedUdid);
    }

    // ============================================================================
    // STAGE 3: Response Formatting
    // ============================================================================

    const duration = Date.now() - startTime;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ...result,
              duration,
            },
            null,
            2
          ),
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
      `idb-ui-describe failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// QUERY EXECUTION
// ============================================================================

/**
 * Get full UI accessibility tree with progressive disclosure
 *
 * Why: Full UI trees can be 10k+ lines, causing token overflow.
 * Returns summary + cache ID, use idb-ui-get-details for full tree.
 */
async function executeDescribeAllOperation(
  udid: string,
  target: any,
  context: {
    screenContext?: string;
    purposeDescription?: string;
  }
): Promise<any> {
  const command = `idb ui describe-all --udid "${udid}"`;

  console.error(`[idb-ui-describe] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 30000 });

  if (result.code !== 0) {
    return {
      success: false,
      operation: 'all',
      udid,
      targetName: target.name,
      error: result.stderr || 'Failed to query UI tree',
      guidance: [
        `❌ Failed to query UI tree`,
        ``,
        `Troubleshooting:`,
        `• Verify app is running: idb-launch --bundle-id com.example.App`,
        `• Check accessibility enabled: Some apps require accessibility permissions`,
        `• Ensure UI is stable: Wait for loading/animation to complete`,
        `• Try simpler query: idb-ui-describe --operation point --x 200 --y 400`,
      ],
    };
  }

  // Parse UI tree output
  const uiTreeText = result.stdout;
  const lines = uiTreeText.split('\n');

  // Cache full UI tree for later retrieval (progressive disclosure)
  const uiTreeId = responseCache.store({
    tool: 'idb-ui-describe-all',
    fullOutput: uiTreeText,
    stderr: result.stderr || '',
    exitCode: result.code,
    command: `idb ui describe-all --udid "${udid}"`,
    metadata: {
      udid,
      targetName: target.name,
      lineCount: lines.length,
      screenContext: context.screenContext,
      purposeDescription: context.purposeDescription,
      timestamp: new Date().toISOString(),
    },
  });

  // Extract summary information
  const summary = extractUiTreeSummary(lines);

  // Assess data richness for hybrid approach
  const isRichData = summary.tappableCount > 3 || summary.textFieldCount > 0;
  const isMinimalData = summary.elementCount <= 1 || summary.tappableCount === 0;

  return {
    success: true,
    operation: 'all',
    udid,
    targetName: target.name,
    summary: {
      totalElements: summary.elementCount,
      totalLines: lines.length,
      elementTypes: summary.elementTypes,
      tappableElements: summary.tappableCount,
      textFields: summary.textFieldCount,
      dataQuality: isRichData ? 'rich' : isMinimalData ? 'minimal' : 'moderate',
    },
    // Progressive disclosure: provide cache ID for full tree
    uiTreeId,
    // Screen context for agent reasoning
    screenContext: context.screenContext,
    purposeDescription: context.purposeDescription,
    // Preview: Top 20 interactive elements
    interactiveElementsPreview: summary.interactiveElements.slice(0, 20),
    guidance: isRichData
      ? [
          `✅ Rich accessibility data available - USE THIS for navigation`,
          ``,
          `Summary:`,
          `• Total elements: ${summary.elementCount}`,
          `• Tappable elements: ${summary.tappableCount} ✅ (sufficient for automation)`,
          `• Text fields: ${summary.textFieldCount}`,
          `• Element types: ${Object.keys(summary.elementTypes).length} unique types`,
          ``,
          `✅ Recommended: Use accessibility tree for precise element targeting`,
          ``,
          `Progressive disclosure:`,
          `• Preview shows top 20 interactive elements`,
          `• Full tree cached with ID: ${uiTreeId}`,
          `• Retrieve full tree: idb-ui-get-details --uiTreeId ${uiTreeId}`,
          ``,
          `Next steps (prioritized):`,
          summary.tappableCount > 0
            ? `1. Tap element: idb-ui-tap --x ${summary.interactiveElements[0]?.x || 200} --y ${summary.interactiveElements[0]?.y || 400}`
            : undefined,
          summary.textFieldCount > 0 ? `2. Focus text field: idb-ui-tap + idb-ui-input` : undefined,
          `3. Screenshot (verification only): simctl-screenshot-inline --udid ${udid}`,
        ].filter(Boolean)
      : [
          isMinimalData
            ? `⚠️ Minimal accessibility data - FALL BACK to screenshots`
            : `⚠️ Limited accessibility data - consider screenshot approach`,
          ``,
          `Summary:`,
          `• Total elements: ${summary.elementCount}`,
          `• Tappable elements: ${summary.tappableCount} ${summary.tappableCount === 0 ? '❌ (insufficient)' : '⚠️ (limited)'}`,
          `• Text fields: ${summary.textFieldCount}`,
          `• Element types: ${Object.keys(summary.elementTypes).length} unique types`,
          ``,
          isMinimalData
            ? `❌ Data too limited for reliable automation - use screenshot approach:`
            : `⚠️ Limited data quality - screenshot approach recommended:`,
          ``,
          `Recommended workflow:`,
          `1. Take screenshot: simctl-screenshot-inline --udid ${udid} --size half`,
          `2. Analyze visual layout from screenshot`,
          `3. Use coordinate-based taps: idb-ui-tap --x <x> --y <y>`,
          `4. Verify with screenshots after each action`,
          ``,
          `Alternative (if accessibility improves):`,
          `• Retrieve full tree: idb-ui-get-details --uiTreeId ${uiTreeId}`,
          `• Query specific point: idb-ui-describe --operation point --x 200 --y 400`,
        ].filter(Boolean),
  };
}

/**
 * Get element at specific coordinates
 *
 * Why: Verify what element exists at tap coordinates.
 * Useful for debugging tap failures.
 */
async function executeDescribePointOperation(udid: string, x: number, y: number): Promise<any> {
  const command = `idb ui describe-point --udid "${udid}" ${x} ${y}`;

  console.error(`[idb-ui-describe] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 10000 });

  const success = result.code === 0;

  if (!success) {
    return {
      success: false,
      operation: 'point',
      udid,
      coordinates: { x, y },
      error: result.stderr || 'No element found at coordinates',
      guidance: [
        `❌ No element found at (${x}, ${y})`,
        ``,
        `Troubleshooting:`,
        `• Verify coordinates are on screen`,
        `• Take screenshot to see what's at that location`,
        `• Try nearby coordinates`,
        `• Use idb-ui-describe --operation all to see all elements`,
      ],
    };
  }

  // Parse element information from output
  const elementInfo = parseElementInfo(result.stdout);

  return {
    success: true,
    operation: 'point',
    udid,
    coordinates: { x, y },
    element: elementInfo,
    output: result.stdout,
    guidance: [
      `✅ Element found at (${x}, ${y})`,
      ``,
      `Element details:`,
      `• Type: ${elementInfo.type || 'Unknown'}`,
      `• Label: ${elementInfo.label || 'None'}`,
      `• Value: ${elementInfo.value || 'None'}`,
      `• Enabled: ${elementInfo.enabled ? 'Yes' : 'No'}`,
      `• Tappable: ${elementInfo.enabled ? 'Yes' : 'No'}`,
      ``,
      `Next steps:`,
      elementInfo.enabled
        ? `• Tap element: idb-ui-tap --x ${x} --y ${y}`
        : `• Element not enabled - cannot interact`,
      elementInfo.type?.includes('TextField')
        ? `• Type text: idb-ui-tap --x ${x} --y ${y} then idb-ui-input --operation text --text "your text"`
        : undefined,
    ].filter(Boolean),
  };
}

// ============================================================================
// PARSING HELPERS
// ============================================================================

/**
 * Extract summary from UI tree
 *
 * Why: Provide quick overview without loading full tree into tokens.
 */
function extractUiTreeSummary(lines: string[]): {
  elementCount: number;
  tappableCount: number;
  textFieldCount: number;
  elementTypes: Record<string, number>;
  interactiveElements: Array<{ type: string; label?: string; x?: number; y?: number }>;
} {
  const elementTypes: Record<string, number> = {};
  const interactiveElements: Array<{ type: string; label?: string; x?: number; y?: number }> = [];
  let tappableCount = 0;
  let textFieldCount = 0;

  for (const line of lines) {
    // Parse element type (simplified - actual parsing would be more robust)
    const typeMatch = line.match(/type[=:]?\s*["']?(\w+)["']?/i);
    if (typeMatch) {
      const type = typeMatch[1];
      elementTypes[type] = (elementTypes[type] || 0) + 1;

      // Count tappable elements (buttons, cells, etc.)
      if (
        type.includes('Button') ||
        type.includes('Cell') ||
        type.includes('Link') ||
        type.includes('Tab')
      ) {
        tappableCount++;

        // Extract label if present
        const labelMatch = line.match(/label[=:]?\s*["']([^"']+)["']?/i);
        const label = labelMatch?.[1];

        interactiveElements.push({ type, label });
      }

      // Count text fields
      if (type.includes('TextField') || type.includes('TextInput')) {
        textFieldCount++;
      }
    }
  }

  return {
    elementCount: lines.length,
    tappableCount,
    textFieldCount,
    elementTypes,
    interactiveElements,
  };
}

/**
 * Parse element information from describe-point output
 */
function parseElementInfo(output: string): {
  type?: string;
  label?: string;
  value?: string;
  enabled: boolean;
} {
  const typeMatch = output.match(/type[=:]?\s*["']?(\w+)["']?/i);
  const labelMatch = output.match(/label[=:]?\s*["']([^"']+)["']?/i);
  const valueMatch = output.match(/value[=:]?\s*["']([^"']+)["']?/i);
  const enabledMatch = output.match(/enabled[=:]?\s*(true|false|yes|no|1|0)/i);

  return {
    type: typeMatch?.[1],
    label: labelMatch?.[1],
    value: valueMatch?.[1],
    enabled: enabledMatch ? ['true', 'yes', '1'].includes(enabledMatch[1].toLowerCase()) : true,
  };
}
