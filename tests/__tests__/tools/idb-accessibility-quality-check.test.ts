import { accessibilityQualityCheckTool } from '../../../src/tools/idb/accessibility-quality-check.js';
import { executeCommand } from '../../../src/utils/command.js';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';

// Mock dependencies
jest.mock('../../../src/utils/command.js');
jest.mock('../../../src/state/idb-target-cache.js');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockIDBTargetCache = IDBTargetCache as jest.Mocked<typeof IDBTargetCache>;

describe('accessibility-quality-check', () => {
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

  describe('Quality Assessment - Rich Data', () => {
    it('should classify as rich when >3 tappable elements', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Button 1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}
{"type":"Button","label":"Button 2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}
{"type":"Button","label":"Button 3","enabled":true,"frame":"{{0, 100}, {100, 50}}"}
{"type":"Button","label":"Button 4","enabled":true,"frame":"{{0, 150}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.quality).toBe('rich');
      expect(response.recommendation).toBe('accessibility-ready');
      expect(response.elementCounts.tappable).toBe(4);
    });

    it('should classify as rich when text fields present', async () => {
      const ndjsonOutput = `{"type":"TextField","label":"Email","enabled":true,"frame":"{{0, 0}, {300, 40}}"}
{"type":"Button","label":"Submit","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.quality).toBe('rich');
      expect(response.recommendation).toBe('accessibility-ready');
      expect(response.elementCounts.textFields).toBe(1);
    });
  });

  describe('Quality Assessment - Minimal Data', () => {
    it('should classify as minimal when ≤1 element', async () => {
      const ndjsonOutput = `{"type":"Label","label":"Title","enabled":false,"frame":"{{0, 0}, {200, 30}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.quality).toBe('minimal');
      expect(response.recommendation).toBe('consider-screenshot');
      expect(response.elementCounts.total).toBe(1);
    });

    it('should classify as minimal when no tappable elements', async () => {
      const ndjsonOutput = `{"type":"Label","label":"Label 1","enabled":false,"frame":"{{0, 0}, {200, 30}}"}
{"type":"Label","label":"Label 2","enabled":false,"frame":"{{0, 30}, {200, 30}}"}
{"type":"Label","label":"Label 3","enabled":false,"frame":"{{0, 60}, {200, 30}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.quality).toBe('minimal');
      expect(response.recommendation).toBe('consider-screenshot');
      expect(response.elementCounts.tappable).toBe(0);
    });
  });

  describe('Quality Assessment - Moderate Data', () => {
    it('should classify as moderate when 2-3 tappable elements', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Button 1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}
{"type":"Button","label":"Button 2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.quality).toBe('moderate');
      expect(response.recommendation).toBe('consider-screenshot');
      expect(response.elementCounts.tappable).toBe(2);
    });
  });

  describe('Element Type Detection', () => {
    it('should detect buttons as tappable', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Test","enabled":true,"frame":"{{0, 0}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.elementCounts.tappable).toBe(1);
    });

    it('should detect cells as tappable', async () => {
      const ndjsonOutput = `{"type":"Cell","label":"List Item","enabled":true,"frame":"{{0, 0}, {400, 60}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.elementCounts.tappable).toBe(1);
    });

    it('should detect links as tappable', async () => {
      const ndjsonOutput = `{"type":"Link","label":"Learn More","enabled":true,"frame":"{{0, 0}, {200, 30}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.elementCounts.tappable).toBe(1);
    });

    it('should detect text fields', async () => {
      const ndjsonOutput = `{"type":"TextField","label":"Email Input","enabled":true,"frame":"{{0, 0}, {300, 40}}"}
{"type":"SecureTextField","label":"Password","enabled":true,"frame":"{{0, 50}, {300, 40}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.elementCounts.textFields).toBe(2);
    });

    it('should not count disabled elements as tappable', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Disabled","enabled":false,"frame":"{{0, 0}, {100, 50}}"}
{"type":"Button","label":"Enabled","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.elementCounts.tappable).toBe(1);
    });
  });

  describe('Performance Metrics', () => {
    it('should include query time metric', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('queryTime');
      expect(response.queryTime).toMatch(/\d+ms/);
    });

    it('should include cost comparison metrics', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.queryCost).toBe('~30 tokens');
      expect(response.screenshotCost).toBe('~170 tokens');
      expect(response.speedAdvantage).toBe('5-6x faster');
      expect(response.costAdvantage).toBe('5.7x cheaper');
    });
  });

  describe('Screen Context Tracking', () => {
    it('should include screen context in response', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({
        screenContext: 'LoginScreen',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.screenContext).toBe('LoginScreen');
    });

    it('should default to "Current" when no context provided', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.screenContext).toBe('Current');
    });
  });

  describe('Guidance Messages', () => {
    it('should provide accessibility-first guidance for rich data', async () => {
      const ndjsonOutput = `{"type":"Button","label":"B1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}
{"type":"Button","label":"B2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}
{"type":"Button","label":"B3","enabled":true,"frame":"{{0, 100}, {100, 50}}"}
{"type":"Button","label":"B4","enabled":true,"frame":"{{0, 150}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.guidance.join('\n')).toContain('Recommended workflow');
      expect(response.guidance.join('\n')).toContain('idb-ui-describe');
      expect(response.guidance.join('\n')).toContain('idb-ui-find-element');
    });

    it('should provide screenshot guidance for minimal data', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.guidance.join('\n')).toContain('screenshot');
      expect(response.guidance.join('\n')).toContain('visual layout');
    });

    it('should provide try-first guidance for moderate data', async () => {
      const ndjsonOutput = `{"type":"Button","label":"B1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}
{"type":"Button","label":"B2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.guidance.join('\n')).toContain('Try accessibility tree first');
      expect(response.guidance.join('\n')).toContain('fall back to screenshot');
    });
  });

  describe('Quality Reasoning', () => {
    it('should explain rich quality assessment', async () => {
      const ndjsonOutput = `{"type":"Button","label":"B1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}
{"type":"Button","label":"B2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}
{"type":"Button","label":"B3","enabled":true,"frame":"{{0, 100}, {100, 50}}"}
{"type":"Button","label":"B4","enabled":true,"frame":"{{0, 150}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.qualityReasoning.join('\n')).toContain('Rich accessibility data');
      expect(response.qualityReasoning.join('\n')).toContain('4 tappable elements');
    });

    it('should explain minimal quality assessment', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response.qualityReasoning.join('\n')).toContain('Minimal accessibility data');
      expect(response.qualityReasoning.join('\n')).toContain('No tappable elements');
    });
  });

  describe('UDID Resolution', () => {
    it('should auto-detect UDID when not provided', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await accessibilityQualityCheckTool({});

      expect(mockIDBTargetCache.getLastUsedTarget).toHaveBeenCalled();
    });

    it('should use provided UDID', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await accessibilityQualityCheckTool({
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

      await expect(accessibilityQualityCheckTool({})).rejects.toThrow(
        'Failed to query accessibility tree'
      );
    });

    it('should handle target not booted', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'test-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Shutdown',
      });

      await expect(accessibilityQualityCheckTool({})).rejects.toThrow();
    });
  });

  describe('Response Format', () => {
    it('should include all required fields', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await accessibilityQualityCheckTool({});

      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('udid');
      expect(response).toHaveProperty('targetName');
      expect(response).toHaveProperty('quality');
      expect(response).toHaveProperty('recommendation');
      expect(response).toHaveProperty('elementCounts');
      expect(response).toHaveProperty('queryTime');
      expect(response).toHaveProperty('guidance');
      expect(response).toHaveProperty('qualityReasoning');
    });
  });

  describe('Usage Tracking', () => {
    it('should record successful operation', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await accessibilityQualityCheckTool({});

      expect(mockIDBTargetCache.recordSuccess).toHaveBeenCalledWith('test-udid-123');
    });
  });
});
