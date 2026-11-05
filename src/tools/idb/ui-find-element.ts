import { flattenNodes } from './semantic-action.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { parseFlexibleJson } from '../../utils/json-parser.js';
import {
  parseAXFrame,
  isFrameVisible,
  describeOffscreenReason,
  extractViewport,
} from '../../utils/ax-frame.js';

interface IdbUiFindElementArgs {
  udid?: string;
  query?: string; // Search term for label or identifier
  exact?: boolean;
  elementType?: string;
  identifier?: string;
  index?: number;
}

/**
 * Find UI elements by label or identifier - semantic element search in accessibility tree
 *
 * **What it does:**
 * Queries the accessibility tree and searches for elements matching a label or identifier.
 * Returns matching elements with tap-ready coordinates (centerX, centerY), enabling agents
 * to find specific UI controls without visual analysis. Fast semantic search replaces
 * screenshot-based visual scanning for complex UIs.
 *
 * **Why you'd use it:**
 * - Find specific button, field, or cell by label name without needing screenshots
 * - Reduce token usage by searching semantically instead of analyzing screenshots
 * - Navigate complex layouts by searching for element names ("login", "submit", "email")
 * - Get immediate tap coordinates without visual pattern matching
 *
 * **Parameters:**
 * - query (required): Search term to match against element labels or identifiers
 * - udid (optional): Target identifier - auto-detects if omitted
 *
 * **Returns:**
 * Array of matching elements with type, label, identifier, and tap-ready coordinates (centerX, centerY).
 * Returns empty array if no matches found - query can be refined or try full tree with idb-ui-describe.
 *
 * **Example:**
 * ```typescript
 * // Find login button
 * const result = await idbUiFindElementTool({
 *   query: 'login',
 *   udid: 'DEVICE-UDID'
 * });
 * // Returns: [{ type: 'Button', label: 'Login', centerX: 200, centerY: 400 }]
 * // Immediately tap it: idb-ui-tap --x 200 --y 400
 *
 * // Find email field
 * const emailField = await idbUiFindElementTool({
 *   query: 'email'
 * });
 * // Returns email input field with coordinates, ready to type into
 * ```
 *
 * **Full documentation:** See idb/ui-find-element.md
 *
 * @param args Tool arguments with search query and optional UDID
 * @returns Tool result with matching elements
 */

export const IDB_UI_FIND_ELEMENT_DOCS = `
# idb-ui-find-element

Find UI elements by semantic search in accessibility tree - no screenshots needed.

## Overview

Queries the accessibility tree and searches for elements matching a label or identifier. Returns matching elements with tap-ready coordinates (centerX, centerY), enabling agents to find specific UI controls without visual analysis. Fast semantic search replaces screenshot-based visual scanning for complex UIs.

## Parameters

### Required
- **query** (string): Search term to match against element labels or identifiers

### Optional
- **exact** (boolean): Exact matching instead of substring matching
- **elementType** (string): Filter by accessibility type; can be used without query
- **identifier** (string): Exact identifier filter; can be used without query
- **index** (integer): Zero-based selection returned as selectedElement
- **udid** (string): Target identifier - auto-detects if omitted

## Returns

Array of matching elements with:
- Type, label, identifier
- Tap-ready coordinates (centerX, centerY)
- Full frame boundaries (x, y, width, height)

Returns empty array if no matches found.

## Examples

### Find login button
\`\`\`typescript
const result = await idbUiFindElementTool({
  query: 'login'
});
\`\`\`

### Find email field on specific device
\`\`\`typescript
const emailField = await idbUiFindElementTool({
  query: 'email',
  udid: 'DEVICE-UDID'
});
\`\`\`

### Find by identifier partial match
\`\`\`typescript
const search = await idbUiFindElementTool({
  query: 'submit'
});
\`\`\`

## How It Works

1. **Query accessibility tree**: Calls \`idb ui describe-all\` (~80ms)
2. **Filter by query**: Searches element labels and identifiers (case-insensitive partial match)
3. **Return coordinates**: Provides tap-ready centerX/centerY for direct use with idb-ui-tap

## Related Tools

- \`accessibility-quality-check\`: Quick assessment of accessibility data richness
- \`idb-ui-describe\`: Full accessibility tree with all element details
- \`idb-ui-tap\`: Tap elements using coordinates
- \`screenshot\`: Visual fallback if accessibility insufficient

## Notes

- Uses case-insensitive partial matching ("log" matches "Login")
- Returns all matching elements (filter in agent logic if needed)
- Only returns elements with valid frame coordinates
- Much faster than visual analysis (~80ms vs 2000ms for screenshot)
- 5-6x cheaper token cost (~40 tokens vs ~170 for screenshot)
`;

export const IDB_UI_FIND_ELEMENT_DOCS_MINI =
  'Find UI elements by semantic search. Use rtfm({ toolName: "idb-ui-find-element" }) for docs.';

export async function idbUiFindElementTool(args: IdbUiFindElementArgs) {
  const { udid, query = '' } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    if (!query.trim() && !args.elementType && !args.identifier) {
      throw new McpError(ErrorCode.InvalidRequest, 'query, elementType, or identifier is required');
    }

    if (args.index !== undefined && (!Number.isInteger(args.index) || args.index < 0))
      throw new McpError(ErrorCode.InvalidRequest, 'index must be a nonnegative integer');
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);
    const normalizedQuery = query.toLowerCase().trim();

    // ============================================================================
    // STAGE 2: Query Accessibility Tree
    // ============================================================================

    console.error(`[idb-ui-find-element] Searching for "${query}" on ${target.name}`);

    const result = await executeCommand(`idb ui describe-all --udid "${resolvedUdid}"`, {
      timeout: 10000,
    });

    if (result.code !== 0) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to query accessibility tree: ${result.stderr || 'Unknown error'}`
      );
    }

    // ============================================================================
    // STAGE 3: Parse and Filter Elements
    // ============================================================================

    const elements = parseFlexibleJson(result.stdout);
    const viewport = target.screenDimensions ?? extractViewport(elements);
    const matches = filterElementsByQuery(flattenNodes(elements), normalizedQuery, args)
      .map(element => ({
        ...element,
        visible: isFrameVisible(element, viewport),
        offscreenReason: describeOffscreenReason(element, viewport) ?? undefined,
      }))
      // Visible matches first: matchedElements[0] should be one the agent can actually tap.
      .sort(
        (a, b) =>
          Number(b.visible) - Number(a.visible) ||
          (query
            ? Number(![a.label, a.value].some(v => v?.toLowerCase() === normalizedQuery)) -
                Number(![b.label, b.value].some(v => v?.toLowerCase() === normalizedQuery)) ||
              Number(
                !/^(Button|Link|Switch|CheckBox|Tab|TextField|SecureTextField|Slider)$/.test(a.type)
              ) -
                Number(
                  !/^(Button|Link|Switch|CheckBox|Tab|TextField|SecureTextField|Slider)$/.test(
                    b.type
                  )
                )
            : 0)
      );
    const selectedElement = matches[args.index ?? 0];

    const visibleMatchCount = matches.filter(element => element.visible).length;

    // Record successful operation
    IDBTargetCache.recordSuccess(resolvedUdid);

    // ============================================================================
    // STAGE 4: Format Response
    // ============================================================================

    if (matches.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                success: true,
                query: query,
                matchCount: 0,
                matchedElements: [],
                guidance: [
                  `No elements found matching "${query}"`,
                  ``,
                  `Try:`,
                  `• Refine query with partial match (e.g., "log" for "Login")`,
                  `• Use full accessibility tree: idb-ui-describe --operation all`,
                  `• Check element identifiers with: idb-ui-describe --operation all`,
                  `• Take screenshot if layout unclear: screenshot`,
                ],
              },
              null,
              2
            ),
          },
        ],
        isError: false,
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              query: query,
              udid: resolvedUdid,
              targetName: target.name,
              matchCount: matches.length,
              visibleMatchCount,
              selectedElement,
              matchedElements: matches.map(el => ({
                type: el.type,
                label: el.label,
                identifier: el.identifier,
                enabled: el.enabled,
                visible: el.visible,
                ...(el.offscreenReason ? { offscreenReason: el.offscreenReason } : {}),
                // Tap-ready coordinates
                centerX: el.centerX,
                centerY: el.centerY,
                // Full frame for reference
                frame: {
                  x: el.x,
                  y: el.y,
                  width: el.width,
                  height: el.height,
                },
              })),
              guidance: [
                `✅ Found ${matches.length} element${matches.length === 1 ? '' : 's'} matching "${query}"` +
                  (visibleMatchCount === matches.length
                    ? ''
                    : ` (${visibleMatchCount} currently on screen)`),
                ``,
                visibleMatchCount === 0
                  ? `⚠️ No match is on screen right now — tapping these coordinates will be rejected:`
                  : `Quick tap:`,
                matches
                  .slice(0, 3)
                  .map((el, idx) =>
                    el.visible
                      ? `${idx + 1}. "${el.label || el.identifier || el.type}": idb-ui-tap --x ${el.centerX} --y ${el.centerY}`
                      : `${idx + 1}. "${el.label || el.identifier || el.type}": offscreen — ${el.offscreenReason}`
                  )
                  .join('\n'),
                matches.length > 3
                  ? `... and ${matches.length - 3} more (see matchedElements above)`
                  : undefined,
                ``,
                `If element not found or incorrect:`,
                `• Query for similar term: idb-ui-find-element --query "<alternative>"`,
                `• See full tree: idb-ui-describe --operation all`,
                `• Validate coordinates: idb-ui-describe --operation point --x ${matches[0]?.centerX || 0} --y ${matches[0]?.centerY || 0}`,
              ].filter(Boolean),
            },
            null,
            2
          ),
        },
      ],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `idb-ui-find-element failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// PARSING HELPERS (Reused from ui-describe.ts)
// ============================================================================

/**
 * Parse NDJSON output from idb ui describe-all
 */

/**
 * Filter elements matching search query
 */

function filterElementsByQuery(
  elements: any[],
  query: string,
  options: IdbUiFindElementArgs
): Array<{
  type: string;
  label?: string;
  value?: string;
  identifier?: string;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}> {
  const matches: Array<{
    type: string;
    label?: string;
    value?: string;
    identifier?: string;
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }> = [];

  for (const element of elements) {
    // iOS `idb ui describe-all` emits AXLabel/AXUniqueId; other versions emit label/identifier.
    const elementLabel = element.label || element.AXLabel;
    const elementIdentifier = element.identifier || element.AXUniqueId;

    if (element.enabled === false) continue;
    if (options.elementType && element.type !== options.elementType) continue;
    if (options.identifier && elementIdentifier !== options.identifier) continue;
    const value = String(element.value ?? element.AXValue ?? '');
    const label = (elementLabel || '').toLowerCase();
    const identifier = (elementIdentifier || '').toLowerCase();

    // Match if query appears in label or identifier
    if (
      !query ||
      (options.exact
        ? [label, value.toLowerCase(), identifier].includes(query)
        : [label, value.toLowerCase(), identifier].some(v => v.includes(query)))
    ) {
      const frame = parseAXFrame(element.frame ?? element.AXFrame);

      // Skip elements without frame coordinates
      if (!frame) {
        continue;
      }

      matches.push({
        type: element.type || 'Unknown',
        label: elementLabel,
        value,
        identifier: elementIdentifier,
        enabled: element.enabled !== false, // Default to true if not specified
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        centerX: frame.centerX,
        centerY: frame.centerY,
      });
    }
  }

  return matches;
}
