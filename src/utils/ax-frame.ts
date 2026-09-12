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
