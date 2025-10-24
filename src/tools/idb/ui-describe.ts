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
 * coordinates (frame, centerX, centerY), and accessibility identifiers. Returns full tree with progressive
 * disclosure (summary + cache ID for full data), element-at-point queries for tap validation, and data
 * quality assessment (rich/moderate/minimal) to guide automation strategy. Automatically parses NDJSON output
 * to extract all elements (not just first), includes AXFrame coordinate parsing for precise tapping, and
 * caches large outputs to prevent token overflow.
 *
 * **Why you'd use it:**
 * - Discover all tappable elements from accessibility tree - buttons, cells, links identified by JSON element objects
 * - Get precise tap coordinates (centerX, centerY) for elements without needing screenshots
 * - Assess data quality before choosing automation approach - rich data enables precise targeting, minimal data requires screenshots
 * - Validate tap coordinates by querying elements at specific points before execution
 * - Progressive disclosure prevents token overflow on complex UIs - get summary first, full tree on demand
 *
 * **Improvements (Phase 2):**
 * - Fixed NDJSON parsing: Now returns all elements, not just first line
 * - AXFrame coordinate extraction: Parses "{{x, y}, {width, height}}" to get x, y, width, height, centerX, centerY
 * - Proper JSON parsing: Each line parsed as separate JSON object representing one element
 * - Coordinate-ready: All interactive elements include tap-ready centerX/centerY coordinates
 *
 * **Parameters:**
 * - operation (required): "all" | "point"
 * - x, y (required for point operation): Coordinates to query element at specific location
 * - udid (optional): Target identifier - auto-detects if omitted
 * - screenContext, purposeDescription (optional): Semantic tracking for element discovery context
 *
 * **Returns:**
 * For "all": UI tree summary with element counts (total, tappable, text fields), data quality assessment
 * (rich/moderate/minimal), top 20 interactive elements preview with centerX/centerY coordinates,
 * uiTreeId for full tree retrieval, and guidance on automation strategy based on data richness.
 *
 * For "point": Element details at coordinates including type, label, value, identifier, frame coordinates
 * (x, y, centerX, centerY), enabled state, and tappability.
 *
 * **Example:**
 * ```typescript
 * // Query full UI tree with coordinate data
 * const result = await idbUiDescribeTool({
 *   operation: 'all',
 *   screenContext: 'LoginScreen',
 *   purposeDescription: 'Find email and password fields'
 * });
 * // Result includes elements with centerX, centerY for direct tapping
 *
 * // Validate element at tap coordinates
 * const element = await idbUiDescribeTool({ operation: 'point', x: 200, y: 400 });
 * // Element includes frame coordinates if available
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
        : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          await executeDescribePointOperation(resolvedUdid, x!, y!);

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

  // Parse UI tree output (NDJSON format)
  const uiTreeText = result.stdout;
  const elements = parseNdJson(uiTreeText);

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
      elementCount: elements.length,
      screenContext: context.screenContext,
      purposeDescription: context.purposeDescription,
      timestamp: new Date().toISOString(),
    },
  });

  // Extract summary information from parsed elements
  const summary = extractUiTreeSummary(elements);

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
 * Parse AXFrame string format to coordinates
 *
 * Why: IDB returns frame as "{{x, y}, {width, height}}"
 * Need to extract individual values and calculate center coordinates.
 *
 * Example: "{{100, 200}, {50, 100}}" -> { x: 100, y: 200, width: 50, height: 100, centerX: 125, centerY: 250 }
 */
function parseAXFrame(frameStr: string | undefined): {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} | null {
  if (!frameStr) {
    return null;
  }

  // Parse "{{x, y}, {width, height}}"
  const match = frameStr.match(/\{\{([^}]+)\},\s*\{([^}]+)\}\}/);
  if (!match) {
    return null;
  }

  const coords = match[1].split(',').map((v: string) => parseInt(v.trim(), 10));
  const size = match[2].split(',').map((v: string) => parseInt(v.trim(), 10));

  if (coords.length !== 2 || size.length !== 2 || coords.some(isNaN) || size.some(isNaN)) {
    return null;
  }

  const x = coords[0];
  const y = coords[1];
  const width = size[0];
  const height = size[1];

  return {
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

/**
 * Parse NDJSON output from idb ui describe-all
 *
 * Why: Output is newline-delimited JSON where each line is a separate element object.
 * Previous implementation only processed lines as text, missing all but first element.
 * This correctly parses each line as JSON.
 *
 * @param ndjsonText Raw NDJSON output
 * @returns Array of parsed elements
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNdJson(ndjsonText: string): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements: any[] = [];
  const lines = ndjsonText.split('\n');

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }

    try {
      const element = JSON.parse(line);
      elements.push(element);
    } catch {
      // Skip malformed JSON lines
      console.error(`[idb-ui-describe] Failed to parse NDJSON line: ${line}`);
    }
  }

  return elements;
}

/**
 * Extract summary from parsed UI elements
 *
 * Why: Provide quick overview without loading full tree into tokens.
 * Processes parsed JSON elements instead of raw text lines.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractUiTreeSummary(elements: any[]): {
  elementCount: number;
  tappableCount: number;
  textFieldCount: number;
  elementTypes: Record<string, number>;
  interactiveElements: Array<{
    type: string;
    label?: string;
    identifier?: string;
    x?: number;
    y?: number;
    centerX?: number;
    centerY?: number;
  }>;
} {
  const elementTypes: Record<string, number> = {};
  const interactiveElements: Array<{
    type: string;
    label?: string;
    identifier?: string;
    x?: number;
    y?: number;
    centerX?: number;
    centerY?: number;
  }> = [];
  let tappableCount = 0;
  let textFieldCount = 0;

  for (const element of elements) {
    const type = element.type || 'Unknown';
    elementTypes[type] = (elementTypes[type] || 0) + 1;

    // Check if tappable: enabled && (Button, Cell, Link, Tab, etc.)
    const isTappable =
      element.enabled &&
      (type.includes('Button') ||
        type.includes('Cell') ||
        type.includes('Link') ||
        type.includes('Tab') ||
        type.includes('Image') ||
        type.includes('PickerWheel') ||
        type.includes('Switch'));

    if (isTappable) {
      tappableCount++;

      // Extract frame and calculate center
      const frame = parseAXFrame(element.frame);

      interactiveElements.push({
        type,
        label: element.label,
        identifier: element.identifier,
        x: frame?.x,
        y: frame?.y,
        centerX: frame?.centerX,
        centerY: frame?.centerY,
      });
    }

    // Count text fields
    if (
      type.includes('TextField') ||
      type.includes('TextInput') ||
      type.includes('SecureTextField')
    ) {
      textFieldCount++;
    }
  }

  return {
    elementCount: elements.length,
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
  identifier?: string;
  enabled: boolean;
  frame?: {
    x: number;
    y: number;
    centerX: number;
    centerY: number;
  };
} {
  // Try parsing as JSON first (if output is single JSON object)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = JSON.parse(output);
    const frame = parseAXFrame(parsed.frame);
    return {
      type: parsed.type,
      label: parsed.label,
      value: parsed.value,
      identifier: parsed.identifier,
      enabled: parsed.enabled !== false,
      frame: frame || undefined,
    };
  } catch {
    // Fall back to regex parsing for legacy text output
  }

  const typeMatch = output.match(/type[=:]?\s*["']?(\w+)["']?/i);
  const labelMatch = output.match(/label[=:]?\s*["']([^"']+)["']?/i);
  const valueMatch = output.match(/value[=:]?\s*["']([^"']+)["']?/i);
  const identifierMatch = output.match(/identifier[=:]?\s*["']([^"']+)["']?/i);
  const frameMatch = output.match(/frame[=:]?\s*["']?([^"']+)["']?/i);
  const enabledMatch = output.match(/enabled[=:]?\s*(true|false|yes|no|1|0)/i);

  const frame = frameMatch ? parseAXFrame(frameMatch[1]) : null;

  return {
    type: typeMatch?.[1],
    label: labelMatch?.[1],
    value: valueMatch?.[1],
    identifier: identifierMatch?.[1],
    enabled: enabledMatch ? ['true', 'yes', '1'].includes(enabledMatch[1].toLowerCase()) : true,
    frame: frame || undefined,
  };
}

export const IDB_UI_DESCRIBE_DOCS = `
# idb-ui-describe

🔍 Query UI accessibility tree for element discovery
Operations:
- all: Get full accessibility tree (uses progressive disclosure)
- point: Get element at specific coordinates

## Parameters

### Required
- (See implementation for parameters)

### Optional
- (See implementation for optional parameters)

## Returns

- Tool execution results with structured output
- Success/failure status
- Guidance for next steps

## Related Tools

- See MCP server documentation for related tools

## Notes

- Tool is auto-registered with MCP server
- Full documentation in idb_ui_describe.ts
`;
