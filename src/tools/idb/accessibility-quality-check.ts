import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface AccessibilityQualityCheckArgs {
  udid?: string;
  screenContext?: string; // Optional context for semantic tracking
}

/**
 * Quick accessibility tree quality assessment - decide accessibility vs screenshot approach
 *
 * **What it does:**
 * Rapidly queries the accessibility tree and assesses data richness without returning
 * full element details. Returns a quality score and recommendation (accessibility-ready
 * or screenshot-fallback) in ~80ms with minimal token cost. Prevents agents from wasting
 * tokens on expensive screenshots when accessibility data is sufficient.
 *
 * **Why you'd use it:**
 * - Quick check before deciding whether to query accessibility tree or take screenshot
 * - Assess data richness without loading full element tree (saves ~40 tokens vs full describe)
 * - Guide automation approach based on actual UI complexity
 * - Prevent unnecessary screenshot operations (costs 3-4x more tokens)
 *
 * **Parameters:**
 * - udid (optional): Target identifier - auto-detects if omitted
 * - screenContext (optional): Screen name for semantic tracking (e.g., "LoginScreen")
 *
 * **Returns:**
 * Quality score (rich/moderate/minimal), element counts, recommendation (accessibility or
 * screenshot), and guidance for next steps.
 *
 * **Example:**
 * ```typescript
 * // Quick check of current screen
 * const check = await accessibilityQualityCheckTool({
 *   screenContext: 'LoginScreen'
 * });
 *
 * if (check.quality === 'rich') {
 *   // Use accessibility: idb-ui-describe --operation all
 * } else {
 *   // Fall back to screenshot: screenshot
 * }
 * ```
 *
 * **Full documentation:** See idb/accessibility-quality-check.md
 *
 * @param args Tool arguments with optional UDID and screen context
 * @returns Tool result with quality score and recommendation
 */

export const ACCESSIBILITY_QUALITY_CHECK_DOCS = `
# accessibility-quality-check

Quick assessment of accessibility tree richness - decide whether to use accessibility or screenshots.

## Overview

Rapidly queries the accessibility tree and assesses data richness without returning full element details. Returns a quality score and recommendation (accessibility-ready or screenshot-fallback) in ~80ms with minimal token cost. Prevents agents from wasting tokens on expensive screenshots when accessibility data is sufficient.

## Parameters

### Optional
- **udid** (string): Target identifier - auto-detects if omitted
- **screenContext** (string): Screen name for semantic tracking (e.g., "LoginScreen")

## Returns

- **quality**: "rich" | "moderate" | "minimal"
- **recommendation**: "accessibility-ready" | "consider-screenshot"
- **elementCounts**: Total elements, tappable elements, text fields, element types
- **queryTime**: Query execution time in milliseconds
- **queryGuidance**: Next steps based on quality assessment

## Examples

### Quick check of current screen
\`\`\`typescript
const check = await accessibilityQualityCheckTool({
  screenContext: 'LoginScreen'
});

if (check.quality === 'rich') {
  // Use accessibility: idb-ui-describe
} else {
  // Fall back to screenshot
}
\`\`\`

### Check before deciding automation approach
\`\`\`typescript
const assessment = await accessibilityQualityCheckTool({
  udid: 'DEVICE-UDID'
});

// Workflow guided by quality
\`\`\`

## Quality Levels

### Rich (✅ Use accessibility)
- >3 tappable elements, OR
- Text input fields detected
- **Recommendation**: Use idb-ui-describe and accessibility-based navigation

### Moderate (⚠️ Try accessibility first)
- 2-3 tappable elements
- Some custom UI that may not be recognized
- **Recommendation**: Try accessibility tree first, fall back to screenshot if needed

### Minimal (📸 Use screenshot)
- ≤1 element, OR
- No tappable elements found
- **Recommendation**: Take screenshot for visual analysis

## How It Works

1. **Quick query**: Calls \`idb ui describe-all\` (~80ms)
2. **Assess richness**: Counts tappable elements, text fields
3. **Return score**: Quality assessment + recommendation
4. **No elements returned**: Just the counts and guidance

## Cost Comparison

- **accessibility-quality-check**: ~80ms, 30 tokens
- **Full idb-ui-describe**: ~120ms, 50 tokens
- **screenshot**: ~2000ms, 170 tokens

## Related Tools

- \`idb-ui-describe\`: Full accessibility tree with element details
- \`idb-ui-find-element\`: Search for specific element by name
- \`screenshot\`: Visual fallback when accessibility insufficient

## Notes

- Returns quality assessment only (not full element tree)
- Recommended as first step before choosing automation approach
- Saves tokens by preventing unnecessary screenshots
- Identifies when UI has minimal accessibility support
`;

export const ACCESSIBILITY_QUALITY_CHECK_DOCS_MINI =
  'Assess accessibility tree quality. Use rtfm({ toolName: "accessibility-quality-check" }) for docs.';

export async function accessibilityQualityCheckTool(args: AccessibilityQualityCheckArgs) {
  const { udid, screenContext } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    console.error(`[accessibility-quality-check] Checking quality on ${target.name}`);

    // ============================================================================
    // STAGE 2: Query Accessibility Tree
    // ============================================================================

    const startTime = Date.now();

    const result = await executeCommand(`idb ui describe-all --udid "${resolvedUdid}"`, {
      timeout: 10000,
    });

    const queryTime = Date.now() - startTime;

    if (result.code !== 0) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to query accessibility tree: ${result.stderr || 'Unknown error'}`
      );
    }

    // ============================================================================
    // STAGE 3: Assess Quality
    // ============================================================================

    const elements = parseNdJson(result.stdout);
    const assessment = assessAccessibilityQuality(elements);

    // Record successful operation
    IDBTargetCache.recordSuccess(resolvedUdid);

    // ============================================================================
    // STAGE 4: Format Response
    // ============================================================================

    const recommendation =
      assessment.quality === 'rich' ? 'accessibility-ready' : 'consider-screenshot';

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: true,
              udid: resolvedUdid,
              targetName: target.name,
              screenContext: screenContext || 'Current',
              quality: assessment.quality,
              recommendation: recommendation,
              // Efficiency metrics
              queryTime: `${queryTime}ms`,
              queryCost: '~30 tokens',
              screenshotCost: '~170 tokens',
              speedAdvantage: '5-6x faster',
              costAdvantage: '5.7x cheaper',
              // Element counts
              elementCounts: {
                total: assessment.totalElements,
                tappable: assessment.tappableCount,
                textFields: assessment.textFieldCount,
                elementTypes: Object.keys(assessment.elementTypes).length,
              },
              // Detailed quality reasoning
              qualityReasoning: getQualityReasoning(assessment),
              // Guidance
              guidance: getGuidance(assessment, screenContext),
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
      `accessibility-quality-check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// ASSESSMENT LOGIC
// ============================================================================

/**
 * Assess accessibility tree quality based on element counts
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function assessAccessibilityQuality(elements: any[]): {
  quality: 'rich' | 'moderate' | 'minimal';
  totalElements: number;
  tappableCount: number;
  textFieldCount: number;
  elementTypes: Record<string, number>;
} {
  const elementTypes: Record<string, number> = {};
  let tappableCount = 0;
  let textFieldCount = 0;

  for (const element of elements) {
    const type = element.type || 'Unknown';
    elementTypes[type] = (elementTypes[type] || 0) + 1;

    // Check if tappable
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

  // Assess quality
  const isRich = tappableCount > 3 || textFieldCount > 0;
  const isMinimal = elements.length <= 1 || tappableCount === 0;

  return {
    quality: isRich ? 'rich' : isMinimal ? 'minimal' : 'moderate',
    totalElements: elements.length,
    tappableCount,
    textFieldCount,
    elementTypes,
  };
}

/**
 * Generate quality reasoning explanation
 */
function getQualityReasoning(assessment: {
  quality: string;
  totalElements: number;
  tappableCount: number;
  textFieldCount: number;
}): string[] {
  const reasons: string[] = [];

  if (assessment.quality === 'rich') {
    reasons.push(`✅ Rich accessibility data - Excellent for automation`);
    if (assessment.tappableCount > 3) {
      reasons.push(`   • ${assessment.tappableCount} tappable elements (>3 threshold)`);
    }
    if (assessment.textFieldCount > 0) {
      reasons.push(`   • ${assessment.textFieldCount} text input fields detected`);
    }
  } else if (assessment.quality === 'minimal') {
    reasons.push(`⚠️ Minimal accessibility data - Screenshots recommended`);
    if (assessment.totalElements <= 1) {
      reasons.push(`   • Very few elements (≤1 detected)`);
    }
    if (assessment.tappableCount === 0) {
      reasons.push(`   • No tappable elements found`);
    }
  } else {
    reasons.push(`⚠️ Moderate accessibility data - Try accessibility first`);
    if (assessment.tappableCount > 0) {
      reasons.push(`   • ${assessment.tappableCount} tappable elements (2-3 range)`);
    }
    reasons.push(`   • May have custom UI elements not recognized by accessibility tree`);
  }

  return reasons;
}

/**
 * Generate next-steps guidance
 */
function getGuidance(
  assessment: {
    quality: string;
    totalElements: number;
    tappableCount: number;
    textFieldCount: number;
  },
  screenContext?: string
): string[] {
  const guidance: string[] = [];

  if (assessment.quality === 'rich') {
    guidance.push(`🚀 Recommended workflow:`);
    guidance.push(
      `1. Use accessibility tree: idb-ui-describe --operation all${screenContext ? ` --screenContext "${screenContext}"` : ''}`
    );
    guidance.push(`2. Find element: idb-ui-find-element --query "element name"`);
    guidance.push(`3. Tap element: idb-ui-tap --x <centerX> --y <centerY>`);
    guidance.push(`4. Verify with screenshot if needed (not required)`);
  } else if (assessment.quality === 'minimal') {
    guidance.push(`📸 Recommended workflow:`);
    guidance.push(
      `1. Take screenshot: screenshot --udid <udid>${screenContext ? ` --screenName "${screenContext}"` : ''}`
    );
    guidance.push(`2. Analyze visual layout`);
    guidance.push(`3. Tap by coordinates: idb-ui-tap --x <x> --y <y>`);
    guidance.push(`4. Optionally try accessibility tree again for dynamic content`);
  } else {
    guidance.push(`🔍 Recommended workflow:`);
    guidance.push(
      `1. Try accessibility tree first: idb-ui-describe --operation all${screenContext ? ` --screenContext "${screenContext}"` : ''}`
    );
    guidance.push(`2. If insufficient, fall back to screenshot`);
    guidance.push(`3. Consider searching specific element: idb-ui-find-element --query "term"`);
  }

  guidance.push(``);
  guidance.push(`Additional context:`);
  guidance.push(`• Total elements: ${assessment.totalElements}`);
  guidance.push(
    `• Element types: ${assessment.tappableCount} tappable, ${assessment.textFieldCount} text fields`
  );
  guidance.push(`• Query cost: ~30 tokens (vs ~170 for screenshot)`);

  return guidance;
}

// ============================================================================
// PARSING HELPERS (Reused from ui-describe.ts)
// ============================================================================

/**
 * Parse NDJSON output from idb ui describe-all
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNdJson(ndjsonText: string): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements: any[] = [];
  const lines = ndjsonText.split('\n');

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      const element = JSON.parse(line);
      elements.push(element);
    } catch {
      console.error(`[accessibility-quality-check] Failed to parse NDJSON line: ${line}`);
    }
  }

  return elements;
}
