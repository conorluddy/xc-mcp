/**
 * Element visibility: the accessibility tree reports frames in scrolled-CONTENT space, so a
 * coordinate existing does not mean it can be tapped. Grapla's home screen returns elements down to
 * y=1665 on an 874pt viewport; idb accepts the tap and the simulator silently discards it.
 *
 * These tests pin the three cases the live app produced: on screen, scrolled off the bottom, and
 * scrolled off the top.
 */
import { idbUiFindElementTool } from '../../../src/tools/idb/ui-find-element.js';
import { idbUiDescribeTool } from '../../../src/tools/idb/ui-describe.js';
import { executeCommand } from '../../../src/utils/command.js';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';
import {
  isFrameVisible,
  describeOffscreenReason,
  extractViewport,
} from '../../../src/utils/ax-frame.js';
import {
  describeAllOutput,
  VIEWPORT,
  APPLICATION_ELEMENT,
} from '../../fixtures/idb-describe-all.js';

jest.mock('../../../src/utils/command.js');
jest.mock('../../../src/state/idb-target-cache.js');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockIDBTargetCache = IDBTargetCache as jest.Mocked<typeof IDBTargetCache>;

const UDID = 'test-udid-123';

/** Home screen with one on-screen button, one below the fold, one scrolled off the top. */
const MIXED_VISIBILITY_OUTPUT = describeAllOutput([
  APPLICATION_ELEMENT,
  {
    type: 'Button',
    label: 'Round Timer',
    identifier: 'timer',
    x: 13,
    y: 508,
    width: 376,
    height: 127,
  },
  {
    type: 'Button',
    label: 'ATLAS',
    identifier: 'clean_button_atlas',
    x: 26,
    y: 1079,
    width: 172,
    height: 42,
  },
  {
    type: 'Button',
    label: 'Settings',
    identifier: 'home_settings_button',
    x: 350,
    y: -886,
    width: 26,
    height: 26,
  },
]);

beforeEach(() => {
  jest.clearAllMocks();

  const target = {
    udid: UDID,
    name: 'iPhone 17 Pro',
    type: 'simulator',
    state: 'Booted',
    screenDimensions: VIEWPORT,
  };

  mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue(target);
  mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue(target);
  mockIDBTargetCache.recordSuccess = jest.fn();

  mockExecuteCommand.mockResolvedValue({
    code: 0,
    stdout: MIXED_VISIBILITY_OUTPUT,
    stderr: '',
  } as any);
});

describe('isFrameVisible', () => {
  const frame = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
    centerX: x + width / 2,
    centerY: y + height / 2,
  });

  it('accepts an element inside the viewport', () => {
    expect(isFrameVisible(frame(26, 500, 172, 42), VIEWPORT)).toBe(true);
  });

  it('rejects an element below the fold', () => {
    expect(isFrameVisible(frame(26, 1079, 172, 42), VIEWPORT)).toBe(false);
  });

  it('rejects an element scrolled off the top', () => {
    expect(isFrameVisible(frame(350, -886, 26, 26), VIEWPORT)).toBe(false);
  });

  it('accepts a partially visible element — intersection, not containment', () => {
    expect(isFrameVisible(frame(0, 850, 402, 100), VIEWPORT)).toBe(true);
    expect(isFrameVisible(frame(-10, 100, 50, 50), VIEWPORT)).toBe(true);
  });

  it('assumes visible when the viewport is unknown, rather than hiding on a guess', () => {
    expect(isFrameVisible(frame(26, 9999, 172, 42), { width: 0, height: 0 })).toBe(true);
  });
});

describe('describeOffscreenReason', () => {
  const frame = (x: number, y: number) => ({
    x,
    y,
    width: 100,
    height: 40,
    centerX: x + 50,
    centerY: y + 20,
  });

  it('names the scroll direction for an element below the fold', () => {
    expect(describeOffscreenReason(frame(26, 1079), VIEWPORT)).toContain('direction: "up"');
  });

  it('names the scroll direction for an element above the viewport', () => {
    expect(describeOffscreenReason(frame(26, -900), VIEWPORT)).toContain('direction: "down"');
  });

  it('returns null for a visible element', () => {
    expect(describeOffscreenReason(frame(26, 400), VIEWPORT)).toBeNull();
  });
});

describe('extractViewport', () => {
  it('falls back to the Application element frame', () => {
    const elements = JSON.parse(MIXED_VISIBILITY_OUTPUT);
    expect(extractViewport(elements)).toEqual({ width: 402, height: 874 });
  });

  it('returns a zero viewport when no Application element is present', () => {
    expect(extractViewport([{ type: 'Button' }])).toEqual({ width: 0, height: 0 });
  });
});

describe('idb-ui-find-element visibility', () => {
  it('marks an on-screen match visible', async () => {
    const response = JSON.parse(
      (await idbUiFindElementTool({ udid: UDID, query: 'Round Timer' })).content[0].text
    );

    expect(response.matchCount).toBe(1);
    expect(response.visibleMatchCount).toBe(1);
    expect(response.matchedElements[0].visible).toBe(true);
    expect(response.matchedElements[0].offscreenReason).toBeUndefined();
  });

  it('marks a below-the-fold match offscreen with an actionable reason', async () => {
    const response = JSON.parse(
      (await idbUiFindElementTool({ udid: UDID, query: 'ATLAS' })).content[0].text
    );

    expect(response.matchCount).toBe(1);
    expect(response.visibleMatchCount).toBe(0);
    expect(response.matchedElements[0].visible).toBe(false);
    expect(response.matchedElements[0].offscreenReason).toContain('below the 874pt viewport');
    // Coordinates are still returned — they are correct, just not currently reachable.
    expect(response.matchedElements[0].centerY).toBe(1100);
  });

  it('warns in guidance when nothing matched is on screen', async () => {
    const response = JSON.parse(
      (await idbUiFindElementTool({ udid: UDID, query: 'Settings' })).content[0].text
    );

    expect(response.visibleMatchCount).toBe(0);
    expect(response.guidance.join('\n')).toContain('No match is on screen right now');
  });

  it('sorts visible matches first so matchedElements[0] is tappable', async () => {
    const response = JSON.parse(
      (await idbUiFindElementTool({ udid: UDID, query: 'e' })).content[0].text
    );

    expect(response.matchCount).toBeGreaterThan(1);
    expect(response.matchedElements[0].visible).toBe(true);
  });
});

describe('idb-ui-describe visibility', () => {
  it('reports visibleTappableElements alongside the raw tappable count', async () => {
    const response = JSON.parse(
      ((await idbUiDescribeTool({ udid: UDID, operation: 'all' })).content[0] as any).text
    );

    expect(response.summary.tappableElements).toBe(3);
    expect(response.summary.visibleTappableElements).toBe(1);
    expect(response.summary.viewport).toEqual(VIEWPORT);
  });

  it('puts visible elements first in the truncated preview', async () => {
    const response = JSON.parse(
      ((await idbUiDescribeTool({ udid: UDID, operation: 'all' })).content[0] as any).text
    );

    expect(response.interactiveElementsPreview[0].visible).toBe(true);
    expect(response.interactiveElementsPreview.at(-1).visible).toBe(false);
  });
});
