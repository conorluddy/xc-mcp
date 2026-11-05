import { workflowTapElementTool } from '../../../src/tools/workflows/tap-element.js';
import { idbSemanticActionTool } from '../../../src/tools/idb/semantic-action.js';
import { idbUiTapTool } from '../../../src/tools/idb/ui-tap.js';
import { idbUiFindElementTool } from '../../../src/tools/idb/ui-find-element.js';

jest.mock('../../../src/tools/idb/accessibility-quality-check.js', () => ({
  accessibilityQualityCheckTool: jest
    .fn()
    .mockResolvedValue({ content: [{ text: '{"quality":"rich"}' }] }),
}));
jest.mock('../../../src/tools/idb/ui-find-element.js', () => ({ idbUiFindElementTool: jest.fn() }));
jest.mock('../../../src/tools/idb/semantic-action.js', () => ({
  idbSemanticActionTool: jest.fn(),
}));
jest.mock('../../../src/tools/idb/ui-tap.js', () => ({ idbUiTapTool: jest.fn() }));
jest.mock('../../../src/tools/idb/ui-input.js', () => ({ idbUiInputTool: jest.fn() }));
jest.mock('../../../src/tools/simctl/screenshot-inline.js', () => ({
  simctlScreenshotInlineTool: jest.fn(),
}));

const reply = (data: object) => ({ content: [{ type: 'text', text: JSON.stringify(data) }] });
beforeEach(() => {
  jest.clearAllMocks();
  (idbUiFindElementTool as jest.Mock).mockResolvedValue(
    reply({
      udid: 'resolved-device',
      matchCount: 1,
      matchedElements: [
        { type: 'CheckBox', label: 'Wi-Fi', identifier: 'wifi', centerX: 50, centerY: 60 },
      ],
    })
  );
  (idbSemanticActionTool as jest.Mock).mockResolvedValue(
    reply({ success: true, method: 'accessibility' })
  );
  (idbUiTapTool as jest.Mock).mockResolvedValue(reply({ success: true }));
});
it('presses a unique toggle on the device used for search', async () => {
  const result = await workflowTapElementTool({ elementQuery: 'Wi-Fi' });
  expect(result.isError).toBe(false);
  expect(idbSemanticActionTool).toHaveBeenCalledWith({
    udid: 'resolved-device',
    query: 'wifi',
    exact: true,
    operation: 'press',
  });
  expect(idbUiTapTool).not.toHaveBeenCalled();
});
it('does not bypass a rejected semantic target with a coordinate tap', async () => {
  (idbSemanticActionTool as jest.Mock).mockResolvedValue(
    reply({ success: false, error: 'Ambiguous target' })
  );
  const result = await workflowTapElementTool({ elementQuery: 'Wi-Fi' });
  expect(result.isError).toBe(true);
  expect(idbUiTapTool).not.toHaveBeenCalled();
});
it('keeps coordinate focus for a text field', async () => {
  (idbUiFindElementTool as jest.Mock).mockResolvedValue(
    reply({
      udid: 'resolved-device',
      matchCount: 1,
      matchedElements: [{ type: 'TextField', label: 'Email', centerX: 50, centerY: 60 }],
    })
  );
  const result = await workflowTapElementTool({ elementQuery: 'Email' });
  expect(result.isError).toBe(false);
  expect(idbSemanticActionTool).not.toHaveBeenCalled();
  expect(idbUiTapTool).toHaveBeenCalledWith(
    expect.objectContaining({ udid: 'resolved-device', x: 50, y: 60 })
  );
});
