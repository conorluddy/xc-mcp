import { jest } from '@jest/globals';
import { assertHidWritesSupported } from '../../../src/utils/idb-environment.js';

/**
 * The point of the preflight: on Xcode 27 an old idb-companion accepts HID
 * events and drops them, so these tools must refuse rather than report a
 * success that never happened.
 */
jest.mock('../../../src/utils/idb-environment.js', () => ({
  assertHidWritesSupported: jest.fn(),
}));

const mockAssert = assertHidWritesSupported as jest.MockedFunction<typeof assertHidWritesSupported>;

const tools: Array<[string, () => Promise<unknown>]> = [
  [
    'idb-ui-tap',
    async () => {
      const { idbUiTapTool } = await import('../../../src/tools/idb/ui-tap.js');
      return idbUiTapTool({ udid: 'ABC-123', x: 10, y: 20 } as never);
    },
  ],
  [
    'idb-ui-gesture',
    async () => {
      const { idbUiGestureTool } = await import('../../../src/tools/idb/ui-gesture.js');
      return idbUiGestureTool({ udid: 'ABC-123', operation: 'swipe' } as never);
    },
  ],
  [
    'idb-ui-input',
    async () => {
      const { idbUiInputTool } = await import('../../../src/tools/idb/ui-input.js');
      return idbUiInputTool({ udid: 'ABC-123', operation: 'text', text: 'hi' } as never);
    },
  ],
];

describe('HID write preflight', () => {
  beforeEach(() => jest.clearAllMocks());

  describe.each(tools)('%s', (_name, invoke) => {
    it('refuses to run when idb cannot deliver input', async () => {
      mockAssert.mockRejectedValue(
        new Error('idb-companion 1.1.8 cannot drive the Xcode 27 framework layout')
      );

      await expect(invoke()).rejects.toThrow(/Xcode 27/);
    });

    it('runs the check before touching the simulator', async () => {
      // The rejection above is itself the proof of ordering: the tool never
      // reaches any simulator work, so the guard must be first.
      mockAssert.mockRejectedValue(new Error('idb is not installed.'));

      await expect(invoke()).rejects.toThrow(/not installed/);
      expect(mockAssert).toHaveBeenCalledTimes(1);
    });
  });
});
