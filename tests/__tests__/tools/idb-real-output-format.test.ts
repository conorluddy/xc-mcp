/**
 * Regression tests pinned to the output `idb ui describe-all` ACTUALLY produces.
 *
 * The pre-existing idb tests mock a format idb never emits: NDJSON lines with `label`,
 * `identifier` and a *string* `frame`. Real output (idb-companion 1.5.7, Xcode 27) is a single
 * line containing a JSON array whose elements use `AXLabel`, `AXUniqueId`, an object `frame`,
 * and a separate `AXFrame` string. That mismatch let four separate bugs pass a green suite:
 * quality-check counted 1 element for every screen, find-element matched nothing ever,
 * frame parsing threw once matching worked, and screen bounds were stored in pixels.
 *
 * The fixture below is trimmed from a live capture. Keep it byte-shaped like real output.
 */
import { idbUiFindElementTool } from '../../../src/tools/idb/ui-find-element.js';
import { accessibilityQualityCheckTool } from '../../../src/tools/idb/accessibility-quality-check.js';
import { executeCommand } from '../../../src/utils/command.js';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';
import { parseAXFrame } from '../../../src/utils/ax-frame.js';

jest.mock('../../../src/utils/command.js');
jest.mock('../../../src/state/idb-target-cache.js');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockIDBTargetCache = IDBTargetCache as jest.Mocked<typeof IDBTargetCache>;

/** One line, JSON array, iOS field names — exactly as `idb ui describe-all` returns it. */
const REAL_IDB_OUTPUT = JSON.stringify([
  {
    AXUniqueId: null,
    type: 'Application',
    frame: { width: 402, y: 0, x: 0, height: 874 },
    AXLabel: 'grapla',
    enabled: true,
    role: 'AXApplication',
  },
  {
    help: 'Open Americana Control detail in Atlas',
    AXUniqueId: 'clean_button_atlas',
    AXValue: null,
    AXFrame: '{{26.000000000000057, 1079.3333333333333}, {172.33333333333331, 42}}',
    enabled: true,
    type: 'Button',
    role: 'AXButton',
    frame: { height: 42, y: 1079.3333333333333, width: 172.33333333333331, x: 26.000000000000057 },
    AXLabel: 'ATLAS',
    role_description: 'button',
  },
  {
    AXUniqueId: 'clean_button_flowlab',
    AXFrame: '{{203.33333333333337, 1079.3333333333333}, {172.33333333333331, 42}}',
    enabled: true,
    type: 'Button',
    role: 'AXButton',
    frame: { height: 42, y: 1079.3333333333333, width: 172.33333333333331, x: 203.33333333333337 },
    AXLabel: 'FLOWLAB',
    role_description: 'button',
  },
  {
    AXUniqueId: 'home_settings_button',
    enabled: true,
    type: 'Button',
    role: 'AXButton',
    frame: { height: 26, y: 88, width: 26, x: 350 },
    AXLabel: 'Settings',
    role_description: 'button',
  },
  {
    AXUniqueId: 'base_timerEntryCard_tap',
    enabled: true,
    type: 'Button',
    role: 'AXButton',
    frame: { height: 127, y: 508.66666666666663, width: 376, x: 13 },
    AXLabel: 'Round Timer',
    role_description: 'button',
  },
  {
    AXUniqueId: null,
    enabled: true,
    type: 'StaticText',
    role: 'AXStaticText',
    frame: { height: 20, y: 300, width: 200, x: 26 },
    AXLabel: 'Position of the day',
  },
]);

beforeEach(() => {
  jest.clearAllMocks();

  const target = {
    udid: 'test-udid-123',
    name: 'iPhone 17 Pro',
    type: 'simulator',
    state: 'Booted',
    screenDimensions: { width: 402, height: 874 },
  };

  mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue(target);
  mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue(target);
  mockIDBTargetCache.recordSuccess = jest.fn();

  mockExecuteCommand.mockResolvedValue({
    code: 0,
    stdout: REAL_IDB_OUTPUT,
    stderr: '',
  } as any);
});

describe('real idb output: accessibility-quality-check', () => {
  it('counts every element in the JSON array, not the array itself', async () => {
    const response = JSON.parse(
      (await accessibilityQualityCheckTool({ udid: 'test-udid-123' })).content[0].text
    );

    // The bug: a line-by-line NDJSON parse saw one line, parsed one array, and reported 1 element.
    expect(response.elementCounts.total).toBe(6);
    expect(response.elementCounts.tappable).toBeGreaterThan(3);
    expect(response.quality).toBe('rich');
    expect(response.recommendation).toBe('accessibility-ready');
  });
});

describe('real idb output: idb-ui-find-element', () => {
  it('matches on AXLabel', async () => {
    const response = JSON.parse(
      (await idbUiFindElementTool({ udid: 'test-udid-123', query: 'ATLAS' })).content[0].text
    );

    expect(response.matchCount).toBe(1);
    expect(response.matchedElements[0].label).toBe('ATLAS');
    expect(response.matchedElements[0].identifier).toBe('clean_button_atlas');
  });

  it('matches on AXUniqueId', async () => {
    const response = JSON.parse(
      (await idbUiFindElementTool({ udid: 'test-udid-123', query: 'home_settings' })).content[0]
        .text
    );

    expect(response.matchCount).toBe(1);
    expect(response.matchedElements[0].label).toBe('Settings');
  });

  it('derives tap coordinates from the object frame', async () => {
    const response = JSON.parse(
      (await idbUiFindElementTool({ udid: 'test-udid-123', query: 'FLOWLAB' })).content[0].text
    );

    const element = response.matchedElements[0];
    expect(element.centerX).toBeCloseTo(203.33333333333337 + 172.33333333333331 / 2);
    expect(element.centerY).toBeCloseTo(1079.3333333333333 + 42 / 2);
  });

  it('returns no matches for a genuinely absent label', async () => {
    const response = JSON.parse(
      (await idbUiFindElementTool({ udid: 'test-udid-123', query: 'nonexistent-thing' })).content[0]
        .text
    );

    expect(response.matchCount).toBe(0);
  });
});

describe('parseAXFrame', () => {
  it('parses the object form idb emits in `frame`', () => {
    expect(parseAXFrame({ x: 10, y: 20, width: 100, height: 50 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      centerX: 60,
      centerY: 45,
    });
  });

  it('parses the string form idb emits in `AXFrame`', () => {
    expect(parseAXFrame('{{10, 20}, {100, 50}}')).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      centerX: 60,
      centerY: 45,
    });
  });

  it('returns null rather than throwing on unusable input', () => {
    expect(parseAXFrame(undefined)).toBeNull();
    expect(parseAXFrame('not a frame')).toBeNull();
    expect(parseAXFrame(42 as unknown as string)).toBeNull();
  });
});
