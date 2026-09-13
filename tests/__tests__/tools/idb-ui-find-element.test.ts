import { idbUiFindElementTool } from '../../../src/tools/idb/ui-find-element.js';
import { executeCommand } from '../../../src/utils/command.js';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';

// Mock dependencies
jest.mock('../../../src/utils/command.js');
jest.mock('../../../src/state/idb-target-cache.js');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockIDBTargetCache = IDBTargetCache as jest.Mocked<typeof IDBTargetCache>;

describe('idb-ui-find-element', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for IDBTargetCache
    mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue({
      udid: 'test-udid-123',
      name: 'iPhone 16 Pro',
      type: 'simulator',
      state: 'Booted',
    });

    mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
      udid: 'test-udid-123',
      name: 'iPhone 16 Pro',
      type: 'simulator',
      state: 'Booted',
    });

    mockIDBTargetCache.recordSuccess = jest.fn();
  });

  describe('Parameter Validation', () => {
    it('should require query parameter', async () => {
      await expect(
        idbUiFindElementTool({
          query: '',
        })
      ).rejects.toThrow('query parameter is required and cannot be empty');
    });

    it('should reject undefined query', async () => {
      await expect(
        idbUiFindElementTool({
          query: undefined as any,
        })
      ).rejects.toThrow('query parameter is required and cannot be empty');
    });

    it('should trim and accept valid query', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await idbUiFindElementTool({
        query: '  login  ',
      });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('idb ui describe-all'),
        expect.any(Object)
      );
    });
  });

  describe('Element Matching', () => {
    it('should find element by label (exact match)', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'login-button',
          AXLabel: 'Login',
          AXFrame: '{{100, 200}, {150, 50}}',
          frame: {
            x: 100,
            y: 200,
            width: 150,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
        {
          AXUniqueId: 'cancel-button',
          AXLabel: 'Cancel',
          AXFrame: '{{100, 300}, {150, 50}}',
          frame: {
            x: 100,
            y: 300,
            width: 150,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'login',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.matchCount).toBe(1);
      expect(response.matchedElements).toHaveLength(1);
      expect(response.matchedElements[0].label).toBe('Login');
      expect(response.matchedElements[0].centerX).toBe(175); // 100 + 150/2
      expect(response.matchedElements[0].centerY).toBe(225); // 200 + 50/2
    });

    it('should find element by identifier (partial match)', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'email-input-field',
          AXLabel: 'Email',
          AXFrame: '{{50, 100}, {300, 40}}',
          frame: {
            x: 50,
            y: 100,
            width: 300,
            height: 40,
          },
          type: 'TextField',
          role: 'AXTextField',
          role_description: 'textfield',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'email',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.matchCount).toBe(1);
      expect(response.matchedElements[0].identifier).toBe('email-input-field');
    });

    it('should find multiple matching elements', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'list-item-1',
          AXLabel: 'Item 1',
          AXFrame: '{{0, 100}, {400, 60}}',
          frame: {
            x: 0,
            y: 100,
            width: 400,
            height: 60,
          },
          type: 'Cell',
          role: 'AXCell',
          role_description: 'cell',
          enabled: true,
        },
        {
          AXUniqueId: 'list-item-2',
          AXLabel: 'Item 2',
          AXFrame: '{{0, 160}, {400, 60}}',
          frame: {
            x: 0,
            y: 160,
            width: 400,
            height: 60,
          },
          type: 'Cell',
          role: 'AXCell',
          role_description: 'cell',
          enabled: true,
        },
        {
          AXUniqueId: 'list-item-3',
          AXLabel: 'Item 3',
          AXFrame: '{{0, 220}, {400, 60}}',
          frame: {
            x: 0,
            y: 220,
            width: 400,
            height: 60,
          },
          type: 'Cell',
          role: 'AXCell',
          role_description: 'cell',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'item',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.matchCount).toBe(3);
      expect(response.matchedElements).toHaveLength(3);
    });

    it('should be case-insensitive', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'submit-btn',
          AXLabel: 'Submit Form',
          AXFrame: '{{100, 400}, {200, 50}}',
          frame: {
            x: 100,
            y: 400,
            width: 200,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'SUBMIT',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.matchCount).toBe(1);
      expect(response.matchedElements[0].label).toBe('Submit Form');
    });

    it('should return empty array when no matches found', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'cancel-button',
          AXLabel: 'Cancel',
          AXFrame: '{{100, 300}, {150, 50}}',
          frame: {
            x: 100,
            y: 300,
            width: 150,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'nonexistent',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.matchCount).toBe(0);
      expect(response.matchedElements).toHaveLength(0);
      expect(response.guidance).toContain('No elements found matching "nonexistent"');
    });
  });

  describe('Coordinate Extraction', () => {
    it('should extract centerX and centerY from frame', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'tap-button',
          AXLabel: 'Tap Me',
          AXFrame: '{{50, 100}, {200, 80}}',
          frame: {
            x: 50,
            y: 100,
            width: 200,
            height: 80,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'tap',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.matchedElements[0].centerX).toBe(150); // 50 + 200/2
      expect(response.matchedElements[0].centerY).toBe(140); // 100 + 80/2
      expect(response.matchedElements[0].frame).toEqual({
        x: 50,
        y: 100,
        width: 200,
        height: 80,
      });
    });

    it('should skip elements without valid frame coordinates', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'no-frame-btn',
          AXLabel: 'No Frame',
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
        {
          AXUniqueId: 'valid-btn',
          AXLabel: 'Valid Frame',
          AXFrame: '{{100, 200}, {50, 50}}',
          frame: {
            x: 100,
            y: 200,
            width: 50,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'frame',
      });

      const response = JSON.parse(result.content[0].text);

      // Should only return element with valid frame
      expect(response.matchCount).toBe(1);
      expect(response.matchedElements[0].label).toBe('Valid Frame');
    });
  });

  describe('NDJSON Parsing', () => {
    it('should parse newline-delimited JSON correctly', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'btn1',
          AXLabel: 'Button 1',
          AXFrame: '{{0, 0}, {100, 50}}',
          frame: {
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
        {
          AXUniqueId: 'btn2',
          AXLabel: 'Button 2',
          AXFrame: '{{0, 50}, {100, 50}}',
          frame: {
            x: 0,
            y: 50,
            width: 100,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
        {
          AXUniqueId: 'btn3',
          AXLabel: 'Button 3',
          AXFrame: '{{0, 100}, {100, 50}}',
          frame: {
            x: 0,
            y: 100,
            width: 100,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'button',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.matchCount).toBe(3);
    });

    it('should skip empty lines in NDJSON', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'test',
          AXLabel: 'Test',
          AXFrame: '{{0, 0}, {100, 50}}',
          frame: {
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
        {
          AXUniqueId: 'test2',
          AXLabel: 'Test 2',
          AXFrame: '{{0, 50}, {100, 50}}',
          frame: {
            x: 0,
            y: 50,
            width: 100,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'test',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.matchCount).toBe(2);
    });

    it('should handle malformed JSON lines gracefully', async () => {
      const describeOutput = `{"type":"Button","label":"Valid","identifier":"valid","frame":"{{0, 0}, {100, 50}}","enabled":true}
{malformed json line
{"type":"Button","label":"Valid 2","identifier":"valid2","frame":"{{0, 50}, {100, 50}}","enabled":true}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'valid',
      });

      const response = JSON.parse(result.content[0].text);

      // Should parse 2 valid lines and skip malformed
      expect(response.matchCount).toBe(2);
    });
  });

  describe('UDID Resolution', () => {
    it('should auto-detect UDID when not provided', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await idbUiFindElementTool({
        query: 'test',
      });

      expect(mockIDBTargetCache.getLastUsedTarget).toHaveBeenCalled();
    });

    it('should use provided UDID', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await idbUiFindElementTool({
        query: 'test',
        udid: 'explicit-udid-456',
      });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('explicit-udid-456'),
        expect.any(Object)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle IDB command failure', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'IDB connection failed',
      });

      await expect(
        idbUiFindElementTool({
          query: 'test',
        })
      ).rejects.toThrow('Failed to query accessibility tree');
    });

    it('should handle target not booted', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'test-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Shutdown',
      });

      await expect(
        idbUiFindElementTool({
          query: 'test',
        })
      ).rejects.toThrow();
    });
  });

  describe('Response Format', () => {
    it('should include success indicator and match count', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'login-btn',
          AXLabel: 'Login',
          AXFrame: '{{100, 200}, {150, 50}}',
          frame: {
            x: 100,
            y: 200,
            width: 150,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'login',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('query', 'login');
      expect(response).toHaveProperty('matchCount', 1);
      expect(response).toHaveProperty('matchedElements');
      expect(response).toHaveProperty('guidance');
    });

    it('should include target information', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: `{"type":"Button","label":"Test","identifier":"test","frame":"{{0, 0}, {100, 50}}","enabled":true}`,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'test',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('udid', 'test-udid-123');
      expect(response).toHaveProperty('targetName', 'iPhone 16 Pro');
    });

    it('should provide helpful guidance for matches', async () => {
      const describeOutput = JSON.stringify([
        {
          AXUniqueId: 'submit-btn',
          AXLabel: 'Submit',
          AXFrame: '{{100, 400}, {200, 50}}',
          frame: {
            x: 100,
            y: 400,
            width: 200,
            height: 50,
          },
          type: 'Button',
          role: 'AXButton',
          role_description: 'button',
          enabled: true,
        },
      ]);

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: describeOutput,
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'submit',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.guidance.join('\n')).toContain('Found 1 element matching "submit"');
      expect(response.guidance.join('\n')).toContain('idb-ui-tap');
    });

    it('should provide helpful guidance for no matches', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await idbUiFindElementTool({
        query: 'nonexistent',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.guidance).toContain('No elements found matching "nonexistent"');
      expect(response.guidance.join('\n')).toContain('Refine query');
    });
  });

  describe('Usage Tracking', () => {
    it('should record successful operation', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await idbUiFindElementTool({
        query: 'test',
      });

      expect(mockIDBTargetCache.recordSuccess).toHaveBeenCalledWith('test-udid-123');
    });
  });
});
