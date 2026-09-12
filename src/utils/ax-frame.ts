/**
 * Accessibility frame parsing shared by the idb UI tools.
 *
 * `idb ui describe-all` reports geometry two ways depending on version and field:
 * a parsed `frame` object, or an `AXFrame` string of the form "{{x, y}, {width, height}}".
 * Both forms appear in the same element, so every consumer must handle both.
 */

export interface AXFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/** Parse an element frame from either the object or string representation. */
export function parseAXFrame(frameInput: string | object | undefined): AXFrame | null {
  if (!frameInput) {
    return null;
  }

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

  if (typeof frameInput !== 'string') {
    return null;
  }

  const match = frameInput.match(/\{\{([^}]+)\},\s*\{([^}]+)\}\}/);
  if (!match) {
    return null;
  }

  const coords = match[1].split(',').map((value: string) => parseInt(value.trim(), 10));
  const size = match[2].split(',').map((value: string) => parseInt(value.trim(), 10));

  if (coords.length !== 2 || size.length !== 2 || coords.some(isNaN) || size.some(isNaN)) {
    return null;
  }

  const [x, y] = coords;
  const [width, height] = size;

  return { x, y, width, height, centerX: x + width / 2, centerY: y + height / 2 };
}

/** Viewport in POINTS — the unit `IDBTargetCache.screenDimensions` and AX frames both use. */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Whether an element's frame intersects the visible viewport.
 *
 * The accessibility tree reports frames in scrolled-CONTENT space, so a screen with scrollable
 * content routinely returns elements far below the fold (Grapla's home screen reaches y=1665 on an
 * 874pt viewport). Those coordinates are real but untappable until scrolled into view: idb sends
 * the HID event and the simulator discards it.
 *
 * Intersection, not containment — a partially visible row is still tappable.
 */
export function isFrameVisible(frame: AXFrame, viewport: Viewport): boolean {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return true; // Unknown viewport: never hide an element on a guess.
  }

  return (
    frame.x < viewport.width &&
    frame.y < viewport.height &&
    frame.x + frame.width > 0 &&
    frame.y + frame.height > 0
  );
}

/**
 * Describe why an element is off-screen, for actionable tool guidance.
 * Returns null when the element is visible.
 */
export function describeOffscreenReason(frame: AXFrame, viewport: Viewport): string | null {
  if (isFrameVisible(frame, viewport)) {
    return null;
  }

  if (frame.y >= viewport.height) {
    return `below the ${viewport.height}pt viewport (y=${Math.round(frame.y)}) — scroll down with idb-ui-gesture({ operation: "swipe", direction: "up" })`;
  }
  if (frame.y + frame.height <= 0) {
    return `above the viewport (y=${Math.round(frame.y)}) — scroll up with idb-ui-gesture({ operation: "swipe", direction: "down" })`;
  }
  if (frame.x >= viewport.width) {
    return `right of the ${viewport.width}pt viewport (x=${Math.round(frame.x)}) — scroll horizontally with idb-ui-gesture({ operation: "swipe", direction: "left" })`;
  }
  return `left of the viewport (x=${Math.round(frame.x)}) — scroll horizontally with idb-ui-gesture({ operation: "swipe", direction: "right" })`;
}

/**
 * Best-effort viewport from an accessibility tree.
 *
 * Prefer `IDBTargetCache.getTarget().screenDimensions`; use this when that is unavailable. The root
 * `Application` element's frame is the visible screen in points.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractViewport(elements: any[]): Viewport {
  const application = elements.find(element => element?.type === 'Application');
  const frame = parseAXFrame(application?.frame ?? application?.AXFrame);

  return frame ? { width: frame.width, height: frame.height } : { width: 0, height: 0 };
}
