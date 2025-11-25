import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { responseCache } from '../../utils/response-cache.js';
import { formatToolError } from '../../utils/error-formatter.js';
import { parseFlexibleJson } from '../../utils/json-parser.js';

interface IdbUiDescribeArgs {
  udid?: string;
  operation: 'all' | 'point';

  // For 'point' operation
  x?: number;
  y?: number;

  // LLM optimization
  screenContext?: string; // e.g., "LoginScreen"
  purposeDescription?: string; // e.g., "Find tappable button"

  // Progressive disclosure via filtering (for 'all' operation)
  filterLevel?: 'strict' | 'moderate' | 'permissive' | 'none'; // default: 'moderate'
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
 * - Progressive filter escalation - start with moderate filtering, escalate to permissive/none if minimal data found
 *
 * **Improvements (Phase 2):**
 * - Fixed NDJSON parsing: Now returns all elements, not just first line
 * - AXFrame coordinate extraction: Parses "{{x, y}, {width, height}}" to get x, y, width, height, centerX, centerY
 * - Proper JSON parsing: Each line parsed as separate JSON object representing one element
 * - Coordinate-ready: All interactive elements include tap-ready centerX/centerY coordinates
 * - iOS field detection: Recognizes role, role_description, AXLabel, AXFrame fields from iOS accessibility
 * - Progressive filtering: 4 filter levels (strict, moderate, permissive, none) for element discovery
 *
 * **Parameters:**
 * - operation (required): "all" | "point"
 * - x, y (required for point operation): Coordinates to query element at specific location
 * - udid (optional): Target identifier - auto-detects if omitted
 * - screenContext, purposeDescription (optional): Semantic tracking for element discovery context
 * - filterLevel (optional): "strict" | "moderate" | "permissive" | "none" (default: "moderate")
 *   - strict: Only obvious interactive elements via type field (original behavior)
 *   - moderate: Include iOS roles (role, role_description) - DEFAULT, fixes iOS button detection
 *   - permissive: Any element with role/type/label information
 *   - none: Return everything (debugging)
 *
 * **Returns:**
 * For "all": UI tree summary with element counts (total, tappable, text fields), data quality assessment
 * (rich/moderate/minimal), top 20 interactive elements preview with centerX/centerY coordinates,
 * uiTreeId for full tree retrieval, current filter level, and guidance on automation strategy including
 * suggestions to escalate filter level if minimal data found.
 *
 * For "point": Element details at coordinates including type, label, value, identifier, frame coordinates
 * (x, y, centerX, centerY), enabled state, and tappability.
 *
 * **Example:**
 * ```typescript
 * // Query full UI tree with default moderate filtering
 * const result = await idbUiDescribeTool({
 *   operation: 'all',
 *   screenContext: 'LoginScreen',
 *   purposeDescription: 'Find email and password fields'
 * });
 * // Result includes elements with centerX, centerY for direct tapping
 *
 * // If minimal data, try permissive filtering
 * if (result.summary.dataQuality === 'minimal') {
 *   const result2 = await idbUiDescribeTool({
 *     operation: 'all',
 *     filterLevel: 'permissive'
 *   });
 * }
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
  const { udid, operation, x, y, screenContext, purposeDescription, filterLevel } = args;

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
            filterLevel,
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
    filterLevel?: 'strict' | 'moderate' | 'permissive' | 'none';
  }
): Promise<any> {
  const command = `idb ui describe-all --udid "${udid}"`;

  console.error(`[idb-ui-describe] Executing: ${command}`);

  const result = await executeCommand(command, { timeout: 30000 });

  if (result.code !== 0) {
    const condensedError = formatToolError(result.stderr, 'Failed to query UI tree');
    return {
      success: false,
      operation: 'all',
      udid,
      targetName: target.name,
      error: condensedError,
      guidance: [
        `❌ Failed to query UI tree`,
        ``,
        `Troubleshooting:`,
        `• Verify app is running: idb-launch --bundle-id com.example.App`,
        `• Ensure UI is stable: Wait for animations to complete`,
        `• Try point query: idb-ui-describe --operation point --x 200 --y 400`,
      ],
    };
  }

  // Parse UI tree output (handles both JSON array and NDJSON formats)
  const uiTreeText = result.stdout;
  const elements = parseFlexibleJson(uiTreeText);

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
  const filterLevel = context.filterLevel || 'moderate';
  const summary = extractUiTreeSummary(elements, filterLevel);

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
          `• Filter level: ${filterLevel} (default: moderate)`,
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
            ? `⚠️ Minimal accessibility data with filterLevel='${filterLevel}'`
            : `⚠️ Limited accessibility data - consider screenshot approach`,
          ``,
          `Summary:`,
          `• Filter level: ${filterLevel} (current)`,
          `• Total elements: ${summary.elementCount}`,
          `• Tappable elements: ${summary.tappableCount} ${summary.tappableCount === 0 ? '❌ (insufficient)' : '⚠️ (limited)'}`,
          `• Text fields: ${summary.textFieldCount}`,
          `• Element types: ${Object.keys(summary.elementTypes).length} unique types`,
          ``,
          summary.tappableCount === 0 && filterLevel === 'strict'
            ? `💡 Try increasing filterLevel to 'moderate' or 'permissive' for more elements`
            : summary.tappableCount === 0 && filterLevel === 'moderate'
              ? `💡 Try increasing filterLevel to 'permissive' or 'none' for more elements`
              : summary.tappableCount === 0 && filterLevel === 'permissive'
                ? `💡 Try filterLevel='none' to see all elements (debugging)`
                : undefined,
          ``,
          isMinimalData && filterLevel !== 'none'
            ? `Progressive escalation recommended:`
            : `Screenshot approach recommended:`,
          isMinimalData && filterLevel === 'moderate'
            ? `1. Try permissive filter: idb-ui-describe --operation all --filterLevel permissive`
            : isMinimalData && filterLevel === 'permissive'
              ? `1. Try no filter: idb-ui-describe --operation all --filterLevel none`
              : undefined,
          isMinimalData && filterLevel !== 'none'
            ? `2. If still minimal, fall back to screenshots`
            : undefined,
          ``,
          filterLevel === 'none' || !isMinimalData
            ? `Recommended workflow:`
            : `Alternative workflow (if escalation fails):`,
          `1. Take screenshot: simctl-screenshot-inline --udid ${udid} --size half`,
          `2. Analyze visual layout from screenshot`,
          `3. Use coordinate-based taps: idb-ui-tap --x <x> --y <y>`,
          `4. Verify with screenshots after each action`,
          ``,
          `Debug options:`,
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
    const condensedError = formatToolError(result.stderr, 'No element found at coordinates');
    return {
      success: false,
      operation: 'point',
      udid,
      coordinates: { x, y },
      error: condensedError,
      guidance: [
        `❌ No element found at (${x}, ${y})`,
        ``,
        `Troubleshooting:`,
        `• Verify coordinates are on screen`,
        `• Take screenshot to see what's at that location`,
        `• Try nearby coordinates`,
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
function parseAXFrame(frameInput: string | object | undefined): {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} | null {
  if (!frameInput) {
    return null;
  }

  // If already parsed as object (from JSON array format)
  if (typeof frameInput === 'object' && 'x' in frameInput && 'y' in frameInput) {
    const frame = frameInput as { x: number; y: number; width: number; height: number };
    return {
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      centerX: frame.x + frame.width / 2,
      centerY: frame.y + frame.height / 2,
    };
  }

  // Parse string format "{{x, y}, {width, height}}"
  if (typeof frameInput !== 'string') {
    return null;
  }

  const match = frameInput.match(/\{\{([^}]+)\},\s*\{([^}]+)\}\}/);
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
 * Check if element is tappable based on filter level
 *
 * Why: iOS returns multiple field names (type, role, role_description).
 * Different filter levels allow progressive escalation from strict to permissive.
 *
 * @param element UI element from accessibility tree
 * @param filterLevel Filter strictness level
 * @returns true if element should be considered tappable
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isElementTappable(element: any, filterLevel: string = 'moderate'): boolean {
  const type = element.type || '';
  const role = element.role || '';
  const roleDescription = (element.role_description || '').toLowerCase();

  switch (filterLevel) {
    case 'strict':
      // STRICT: Only obvious interactive elements via type field (original behavior)
      return (
        element.enabled &&
        (type.includes('Button') ||
          type.includes('Cell') ||
          type.includes('Link') ||
          type.includes('Tab') ||
          type.includes('Switch') ||
          type.includes('PickerWheel'))
      );

    case 'moderate':
      // MODERATE: Include iOS-specific roles and common interactive patterns (DEFAULT - fixes the bug)
      return (
        element.enabled !== false && // Standard types
        (type.includes('Button') ||
          type.includes('Cell') ||
          type.includes('Link') ||
          type.includes('Tab') ||
          type.includes('Image') ||
          type.includes('Switch') ||
          type.includes('PickerWheel') ||
          // iOS accessibility roles
          role.includes('Button') ||
          role.includes('Link') ||
          role.includes('Tab') ||
          // Role descriptions
          roleDescription.includes('button') ||
          roleDescription.includes('link') ||
          roleDescription.includes('tab'))
      );

    case 'permissive':
      // PERMISSIVE: Anything with role/type/label information
      return (
        element.enabled !== false &&
        (element.role ||
          element.role_description ||
          element.type ||
          element.AXLabel ||
          element.label)
      );

    case 'none':
      // NONE: Return everything, no filtering
      return true;

    default:
      return false;
  }
}

/**
 * Extract summary from parsed UI elements
 *
 * Why: Provide quick overview without loading full tree into tokens.
 * Processes parsed JSON elements instead of raw text lines.
 */

function extractUiTreeSummary(
  elements: any[],
  filterLevel: string = 'moderate'
): {
  elementCount: number;
  tappableCount: number;
  textFieldCount: number;
  elementTypes: Record<string, number>;
  interactiveElements: Array<{
    type: string;
    label?: string;
    identifier?: string;
    role?: string;
    role_description?: string;
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
    role?: string;
    role_description?: string;
    x?: number;
    y?: number;
    centerX?: number;
    centerY?: number;
  }> = [];
  let tappableCount = 0;
  let textFieldCount = 0;

  for (const element of elements) {
    // Normalize fields: support both standard and iOS-specific field names
    const type = element.type || element.role || 'Unknown';
    const label = element.label || element.AXLabel;
    const identifier = element.identifier || element.AXUniqueId;
    const frame = element.frame || element.AXFrame;

    elementTypes[type] = (elementTypes[type] || 0) + 1;

    // Check if tappable using filter level
    const isTappable = isElementTappable(element, filterLevel);

    if (isTappable) {
      tappableCount++;

      // Extract frame and calculate center
      const parsedFrame = parseAXFrame(frame);

      interactiveElements.push({
        type,
        label,
        identifier,
        role: element.role,
        role_description: element.role_description,
        x: parsedFrame?.x,
        y: parsedFrame?.y,
        centerX: parsedFrame?.centerX,
        centerY: parsedFrame?.centerY,
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

🔍 **Query UI accessibility tree** - discover tappable elements and text fields for precise automation

## What it does

Queries iOS accessibility tree to discover UI elements, their properties (type, label, enabled state), coordinates (frame, centerX, centerY), and accessibility identifiers. Returns full tree with progressive disclosure (summary + cache ID for full data), element-at-point queries for tap validation, and data quality assessment (rich/moderate/minimal) to guide automation strategy. Automatically parses NDJSON output to extract all elements (not just first), includes AXFrame coordinate parsing for precise tapping, and caches large outputs to prevent token overflow.

**Progressive Filtering:** Supports 4 filter levels for element discovery - start conservative with moderate filtering (default), escalate to permissive/none if minimal data found.

**iOS Compatibility:** Recognizes iOS-specific accessibility fields (role, role_description, AXLabel, AXFrame) in addition to standard fields.

## Why you'd use it

- Discover all tappable elements from accessibility tree - buttons, cells, links identified by JSON element objects
- Get precise tap coordinates (centerX, centerY) for elements without needing screenshots
- Assess data quality before choosing automation approach - rich data enables precise targeting, minimal data requires screenshots
- Validate tap coordinates by querying elements at specific points before execution
- Progressive disclosure prevents token overflow on complex UIs - get summary first, full tree on demand
- Progressive filter escalation - start with moderate filtering, escalate to permissive/none if minimal data found

## Parameters

### Required
- **operation** (string): "all" | "point"

### Point operation parameters
- **x** (number, required for point operation): X coordinate to query
- **y** (number, required for point operation): Y coordinate to query

### Optional
- **udid** (string): Target identifier - auto-detects if omitted
- **screenContext** (string): Screen name for context (e.g., "LoginScreen")
- **purposeDescription** (string): Query purpose (e.g., "Find tappable button")
- **filterLevel** (string): "strict" | "moderate" | "permissive" | "none" (default: "moderate")
  - **strict**: Only obvious interactive elements via type field (original behavior)
  - **moderate**: Include iOS roles (role, role_description) - DEFAULT, fixes iOS button detection
  - **permissive**: Any element with role/type/label information
  - **none**: Return everything (debugging)

## Returns

**For "all":** UI tree summary with element counts (total, tappable, text fields), data quality assessment (rich/moderate/minimal), top 20 interactive elements preview with centerX/centerY coordinates, uiTreeId for full tree retrieval, current filter level, and guidance on automation strategy including suggestions to escalate filter level if minimal data found.

**For "point":** Element details at coordinates including type, label, value, identifier, frame coordinates (x, y, centerX, centerY), enabled state, and tappability.

## Examples

### Query full UI tree with default moderate filtering
\`\`\`typescript
const result = await idbUiDescribeTool({
  operation: 'all',
  screenContext: 'LoginScreen',
  purposeDescription: 'Find email and password fields'
});
// Result includes elements with centerX, centerY for direct tapping
\`\`\`

### Progressive filter escalation pattern
\`\`\`typescript
// 1. Start with default (moderate)
let result = await idbUiDescribeTool({ operation: 'all' });

// 2. If minimal data, try permissive
if (result.summary.dataQuality === 'minimal') {
  result = await idbUiDescribeTool({
    operation: 'all',
    filterLevel: 'permissive'
  });
}

// 3. If still minimal, try none (return everything)
if (result.summary.dataQuality === 'minimal') {
  result = await idbUiDescribeTool({
    operation: 'all',
    filterLevel: 'none'
  });
}

// 4. If STILL minimal, fall back to screenshots
if (result.summary.dataQuality === 'minimal') {
  // Use screenshot-based approach
}
\`\`\`

### Validate element at tap coordinates
\`\`\`typescript
const element = await idbUiDescribeTool({
  operation: 'point',
  x: 200,
  y: 400
});
// Element includes frame coordinates if available
\`\`\`

## Related Tools

- idb-ui-tap: Tap discovered elements using centerX/centerY coordinates
- screenshot: Capture screenshot for visual element identification
- idb-ui-find-element: Semantic element search by label/identifier
- accessibility-quality-check: Quick assessment before choosing approach
`;

export const IDB_UI_DESCRIBE_DOCS_MINI =
  'Query UI accessibility tree. Use rtfm({ toolName: "idb-ui-describe" }) for docs.';
