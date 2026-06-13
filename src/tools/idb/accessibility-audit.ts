import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

// === TYPES ===

interface AccessibilityAuditArgs {
  udid?: string;
  verbose?: boolean;
}

interface AuditElement {
  type?: string;
  AXLabel?: string;
  AXValue?: string;
  AXUniqueId?: string;
  help?: string;
  traits?: string[];
  frame?: { x: number; y: number; width: number; height: number } | string;
  depth?: number;
  // Alternate field names idb may use
  label?: string;
  value?: string;
  identifier?: string;
}

interface Issue {
  severity: 'critical' | 'warning' | 'info';
  rule: string;
  elementType: string;
  issue: string;
  fix: string;
  element: { type: string; label: string | null };
}

interface TopIssue {
  severity: 'critical' | 'warning' | 'info';
  rule: string;
  count: number;
  fix: string;
}

// === DOCS ===

export const ACCESSIBILITY_AUDIT_DOCS = `
# accessibility-audit

WCAG-aligned accessibility audit of the live iOS simulator accessibility tree.

## Overview

Fetches the full accessibility tree via \`idb ui describe-all\`, flattens it, and evaluates
every element against a tiered rule set (critical → warning → info). Returns a severity
summary and either the full issue list (verbose mode) or the top issues grouped by rule.

Distinct from \`accessibility-quality-check\`, which only scores tree richness. This tool
diagnoses *what* is broken and *how to fix it*.

## Parameters

### Optional
- **udid** (string): Target identifier — auto-detects if omitted
- **verbose** (boolean): Return all issues instead of grouped top-10 (default: false)

## Rules

### Critical — blocks assistive technology users
| Rule | Condition | Fix |
|------|-----------|-----|
| missing_label | Button or Link with no AXLabel | Add accessibilityLabel |
| empty_button | Button with no AXLabel AND no AXValue | Set button title or accessibilityLabel |
| image_no_alt | Image with no AXLabel | Add accessibilityLabel with description |

### Warning — degrades UX
| Rule | Condition | Fix |
|------|-----------|-----|
| missing_hint | Slider or TextField with no help text | Add accessibilityHint |
| missing_traits | Element has type but no traits | Set appropriate accessibilityTraits |
| small_touch_target | Tappable frame < 44×44pt | Increase tappable area to at least 44×44pt |

### Info — best-practice suggestions
| Rule | Condition | Fix |
|------|-----------|-----|
| no_identifier | Element missing AXUniqueId | Add accessibilityIdentifier for testing |
| deep_nesting | Element depth > 5 | Simplify view hierarchy |

## Returns

- **summary**: \`{ total, critical, warning, info }\`
- **issues** (verbose mode): Full issue list
- **topIssues** (default): Issues grouped by rule, sorted by severity then count, capped at 10

## Structured Content

\`\`\`json
{ "total": 3, "critical": 1, "warning": 1, "info": 1 }
\`\`\`

## Examples

\`\`\`typescript
// Quick audit — top issues only
const result = await accessibilityAuditTool({});

// Full details for CI reporting
const result = await accessibilityAuditTool({ verbose: true });
\`\`\`

## Related Tools

- \`accessibility-quality-check\`: Richness score — use before deciding accessibility vs screenshot
- \`idb-ui-describe\`: Full accessibility tree for manual inspection
`;

export const ACCESSIBILITY_AUDIT_DOCS_MINI =
  'WCAG accessibility audit of the live accessibility tree. Use rtfm({ toolName: "accessibility-audit" }) for docs.';

// === RULE DEFINITIONS ===

const ISSUE_DESCRIPTIONS: Record<string, string> = {
  missing_label: 'Interactive element missing accessibility label',
  empty_button: 'Button has no text or label',
  image_no_alt: 'Image missing alternative text',
  missing_hint: 'Complex control missing hint',
  missing_traits: 'Element missing accessibility traits',
  small_touch_target: 'Touch target smaller than 44×44pt',
  no_identifier: 'Missing accessibility identifier',
  deep_nesting: 'Deeply nested element (>5 levels)',
};

const ISSUE_FIXES: Record<string, string> = {
  missing_label: 'Add accessibilityLabel',
  empty_button: 'Set button title or accessibilityLabel',
  image_no_alt: 'Add accessibilityLabel with description',
  missing_hint: 'Add accessibilityHint',
  missing_traits: 'Set appropriate accessibilityTraits',
  small_touch_target: 'Increase tappable area to at least 44×44pt',
  no_identifier: 'Add accessibilityIdentifier for testing',
  deep_nesting: 'Simplify view hierarchy',
};

// === RULE PREDICATES ===

function isMissingLabel(el: AuditElement): boolean {
  return (el.type === 'Button' || el.type === 'Link') && !label(el);
}

function isEmptyButton(el: AuditElement): boolean {
  return el.type === 'Button' && !label(el) && !value(el);
}

function isImageNoAlt(el: AuditElement): boolean {
  return el.type === 'Image' && !label(el);
}

function isMissingHint(el: AuditElement): boolean {
  return (el.type === 'Slider' || el.type === 'TextField') && !el.help;
}

function isMissingTraits(el: AuditElement): boolean {
  return !!el.type && (!el.traits || el.traits.length === 0);
}

function isSmallTouchTarget(el: AuditElement): boolean {
  const f = parseFrame(el.frame);
  if (!f) return false;
  return f.width < 44 || f.height < 44;
}

function hasNoIdentifier(el: AuditElement): boolean {
  return !el.AXUniqueId && !el.identifier;
}

function isDeepNesting(el: AuditElement): boolean {
  return (el.depth ?? 0) > 5;
}

// === HELPERS ===

function label(el: AuditElement): string | undefined {
  return el.AXLabel || el.label || undefined;
}

function value(el: AuditElement): string | undefined {
  return el.AXValue || el.value || undefined;
}

function parseFrame(frame: AuditElement['frame']): { width: number; height: number } | null {
  if (!frame) return null;

  // Object form: { x, y, width, height }
  if (typeof frame === 'object') {
    return { width: frame.width ?? 0, height: frame.height ?? 0 };
  }

  // String form: "{{x, y}, {width, height}}"
  const match = (frame as string).match(/\{\{[^}]+\},\s*\{([^}]+)\}\}/);
  if (!match) return null;
  const parts = match[1].split(',').map(s => parseFloat(s.trim()));
  if (parts.length < 2 || parts.some(isNaN)) return null;
  return { width: parts[0], height: parts[1] };
}

/**
 * Parse NDJSON (one JSON object per line) from idb output.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNdJson(text: string): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {
      console.error(`[accessibility-audit] Failed to parse NDJSON line: ${trimmed}`);
    }
  }
  return results;
}

/**
 * Flatten a nested accessibility tree, attaching depth to each node.
 * Handles both flat NDJSON lists (idb ui describe-all) and nested tree structures.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenTree(node: any, depth = 0): AuditElement[] {
  if (Array.isArray(node)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return node.flatMap((child: any) => flattenTree(child, depth));
  }

  if (!node || typeof node !== 'object') return [];

  const element: AuditElement = { ...node, depth };
  const children: AuditElement[] = [];

  const childArrays = ['children', 'nodes', 'elements'];
  for (const key of childArrays) {
    if (Array.isArray(node[key])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      children.push(...node[key].flatMap((child: any) => flattenTree(child, depth + 1)));
    }
  }

  return [element, ...children];
}

// === AUDIT LOGIC ===

/**
 * Evaluate one element. One tier fires per element (critical first).
 */
function auditElement(el: AuditElement): Issue | null {
  const elementType = el.type ?? 'Unknown';
  const elementLabel = label(el) ?? null;
  const elementRef = { type: elementType, label: elementLabel };

  // Critical
  const criticalChecks: Array<[string, () => boolean]> = [
    ['missing_label', () => isMissingLabel(el)],
    ['empty_button', () => isEmptyButton(el)],
    ['image_no_alt', () => isImageNoAlt(el)],
  ];

  for (const [rule, check] of criticalChecks) {
    if (check()) {
      return {
        severity: 'critical',
        rule,
        elementType,
        issue: ISSUE_DESCRIPTIONS[rule],
        fix: ISSUE_FIXES[rule],
        element: elementRef,
      };
    }
  }

  // Warning
  const warningChecks: Array<[string, () => boolean]> = [
    ['missing_hint', () => isMissingHint(el)],
    ['missing_traits', () => isMissingTraits(el)],
    ['small_touch_target', () => isSmallTouchTarget(el)],
  ];

  for (const [rule, check] of warningChecks) {
    if (check()) {
      return {
        severity: 'warning',
        rule,
        elementType,
        issue: ISSUE_DESCRIPTIONS[rule],
        fix: ISSUE_FIXES[rule],
        element: elementRef,
      };
    }
  }

  // Info
  const infoChecks: Array<[string, () => boolean]> = [
    ['no_identifier', () => hasNoIdentifier(el)],
    ['deep_nesting', () => isDeepNesting(el)],
  ];

  for (const [rule, check] of infoChecks) {
    if (check()) {
      return {
        severity: 'info',
        rule,
        elementType,
        issue: ISSUE_DESCRIPTIONS[rule],
        fix: ISSUE_FIXES[rule],
        element: elementRef,
      };
    }
  }

  return null;
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const TOP_ISSUES_CAP = 10;

function buildTopIssues(issues: Issue[]): TopIssue[] {
  const grouped: Record<string, TopIssue> = {};

  for (const issue of issues) {
    if (!grouped[issue.rule]) {
      grouped[issue.rule] = {
        severity: issue.severity,
        rule: issue.rule,
        count: 0,
        fix: issue.fix,
      };
    }
    grouped[issue.rule].count++;
  }

  return Object.values(grouped)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count)
    .slice(0, TOP_ISSUES_CAP);
}

// === TOOL ===

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function accessibilityAuditTool(args: any) {
  const { udid, verbose = false } = args as AccessibilityAuditArgs;

  try {
    // ============================================================================
    // STAGE 1: Resolve target
    // ============================================================================

    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    console.error(`[accessibility-audit] Auditing ${target.name} (${resolvedUdid})`);

    // ============================================================================
    // STAGE 2: Fetch accessibility tree
    // ============================================================================

    const result = await executeCommand(`idb ui describe-all --udid "${resolvedUdid}"`, {
      timeout: 30000,
    });

    if (result.code !== 0) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch accessibility tree: ${result.stderr || 'Unknown error'}`
      );
    }

    // ============================================================================
    // STAGE 3: Parse + flatten
    // ============================================================================

    const rawElements = parseNdJson(result.stdout);
    // idb describe-all returns flat NDJSON; flattenTree handles both flat and nested
    const elements: AuditElement[] = rawElements.flatMap(el => flattenTree(el));

    // ============================================================================
    // STAGE 4: Audit
    // ============================================================================

    const allIssues: Issue[] = [];
    for (const element of elements) {
      const issue = auditElement(element);
      if (issue) allIssues.push(issue);
    }

    IDBTargetCache.recordSuccess(resolvedUdid);

    // ============================================================================
    // STAGE 5: Build response
    // ============================================================================

    const critical = allIssues.filter(i => i.severity === 'critical').length;
    const warning = allIssues.filter(i => i.severity === 'warning').length;
    const info = allIssues.filter(i => i.severity === 'info').length;

    const summary = {
      total: allIssues.length,
      critical,
      warning,
      info,
    };

    const payload: Record<string, unknown> = {
      success: true,
      udid: resolvedUdid,
      targetName: target.name,
      elementsAudited: elements.length,
      summary,
    };

    if (verbose) {
      payload.issues = allIssues;
    } else {
      payload.topIssues = buildTopIssues(allIssues);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(payload, null, 2),
        },
      ],
      structuredContent: summary,
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `accessibility-audit failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
