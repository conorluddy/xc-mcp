/**
 * Fixtures shaped like real `idb ui describe-all` output.
 *
 * Captured from idb-companion 1.5.7 on Xcode 27 (iPhone 17 Pro, 402x874 points).
 *
 * The wire format is ONE line containing a JSON array. Each element carries:
 *   - `AXLabel`     (not `label`)
 *   - `AXUniqueId`  (not `identifier`)
 *   - `frame`       as an OBJECT  { x, y, width, height }
 *   - `AXFrame`     as a STRING   "{{x, y}, {width, height}}"
 *
 * Tests previously mocked NDJSON lines with `label`/`identifier` and a string `frame`, a format idb
 * never emits. That false contract hid four separate bugs behind a green suite, so build fixtures
 * with these helpers rather than hand-writing element JSON.
 */

export interface AXElementSpec {
  type: string;
  label?: string;
  identifier?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  enabled?: boolean;
  role?: string;
  value?: string;
  help?: string;
}

/** Build one element in the exact shape idb emits. */
export function axElement(spec: AXElementSpec): Record<string, unknown> {
  const { type, label, identifier, x, y, width, height, enabled = true, role, value, help } = spec;

  return {
    AXUniqueId: identifier ?? null,
    AXLabel: label ?? null,
    AXValue: value ?? null,
    AXFrame: `{{${x}, ${y}}, {${width}, ${height}}}`,
    frame: { x, y, width, height },
    type,
    role: role ?? `AX${type}`,
    role_description: type.toLowerCase(),
    enabled,
    ...(help ? { help } : {}),
  };
}

/** Serialize elements the way idb does: a single line holding a JSON array. */
export function describeAllOutput(specs: AXElementSpec[]): string {
  return JSON.stringify(specs.map(axElement));
}

/** The root Application element, which carries the viewport frame in points. */
export const APPLICATION_ELEMENT: AXElementSpec = {
  type: 'Application',
  label: 'grapla',
  x: 0,
  y: 0,
  width: 402,
  height: 874,
  role: 'AXApplication',
};

/** iPhone 17 Pro viewport in POINTS — matches what IDBTargetCache stores. */
export const VIEWPORT = { width: 402, height: 874 };

/**
 * A trimmed real capture of Grapla's home screen.
 *
 * Deliberately includes elements BELOW the fold (y > 874): the accessibility tree reports frames in
 * scrolled-content space, so off-screen elements are normal and must be handled, not filtered out
 * by the fixture.
 */
export const GRAPLA_HOME_ELEMENTS: AXElementSpec[] = [
  APPLICATION_ELEMENT,
  {
    type: 'Button',
    label: 'Settings',
    identifier: 'home_settings_button',
    x: 350,
    y: 88,
    width: 26,
    height: 26,
  },
  {
    type: 'Button',
    label: 'Round Timer',
    identifier: 'base_timerEntryCard_tap',
    x: 13,
    y: 508.66666666666663,
    width: 376,
    height: 127,
  },
  {
    type: 'Button',
    label: 'ATLAS',
    identifier: 'clean_button_atlas',
    x: 26.000000000000057,
    y: 1079.3333333333333,
    width: 172.33333333333331,
    height: 42,
    help: 'Open Americana Control detail in Atlas',
  },
  {
    type: 'Button',
    label: 'FLOWLAB',
    identifier: 'clean_button_flowlab',
    x: 203.33333333333337,
    y: 1079.3333333333333,
    width: 172.33333333333331,
    height: 42,
  },
  {
    type: 'StaticText',
    label: 'Position of the day',
    x: 26,
    y: 300,
    width: 200,
    height: 20,
  },
];

export const GRAPLA_HOME_OUTPUT = describeAllOutput(GRAPLA_HOME_ELEMENTS);
