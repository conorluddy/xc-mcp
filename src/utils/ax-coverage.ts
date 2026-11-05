import { parseAXFrame, type Viewport } from './ax-frame.js';

interface CoverageNode {
  type?: string;
  AXLabel?: string;
  label?: string;
  AXValue?: unknown;
  value?: unknown;
  frame?: unknown;
  AXFrame?: string;
  children?: CoverageNode[];
}

/** Sample labelled leaves on an 8-point grid; containers must not inflate coverage. */
export function labelledLeafCoverage(nodes: CoverageNode[], viewport?: Viewport): number {
  if (!viewport || viewport.width <= 0 || viewport.height <= 0) return 0;
  const frames: NonNullable<ReturnType<typeof parseAXFrame>>[] = [];
  const visit = (node: CoverageNode) => {
    if (node.children?.length) node.children.forEach(visit);
    else if (
      !['Application', 'Window'].includes(node.type || '') &&
      (node.AXLabel || node.label || node.AXValue || node.value)
    ) {
      const frame = parseAXFrame(node.frame ?? node.AXFrame);
      if (frame) frames.push(frame);
    }
  };
  nodes.forEach(visit);
  let points = 0;
  let covered = 0;
  for (let x = 4; x < viewport.width; x += 8) {
    for (let y = 4; y < viewport.height; y += 8) {
      points++;
      if (frames.some(f => x >= f.x && x < f.x + f.width && y >= f.y && y < f.y + f.height))
        covered++;
    }
  }
  return points ? covered / points : 0;
}
