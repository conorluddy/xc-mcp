import { idbUiDescribeTool } from '../../../src/tools/idb/ui-describe.js';
import { executeCommand } from '../../../src/utils/command.js';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';
import { responseCache } from '../../../src/utils/response-cache.js';

// Mock dependencies
jest.mock('../../../src/utils/command.js');
jest.mock('../../../src/state/idb-target-cache.js');
jest.mock('../../../src/utils/response-cache.js');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockIDBTargetCache = IDBTargetCache as jest.Mocked<typeof IDBTargetCache>;
const mockResponseCache = responseCache as jest.Mocked<typeof responseCache>;

describe('idb-ui-describe', () => {
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

    // Default mock for responseCache
    mockResponseCache.store = jest.fn().mockReturnValue('cached-ui-tree-123');
  });

  describe('Parameter Validation', () => {
    it('should require operation parameter', async () => {
      await expect(
        idbUiDescribeTool({
          operation: undefined as any,
        })
      ).rejects.toThrow('operation must be "all" or "point"');
    });

    it('should reject invalid operation', async () => {
      await expect(
        idbUiDescribeTool({
          operation: 'invalid' as any,
        })
      ).rejects.toThrow('operation must be "all" or "point"');
    });

    it('should require x and y for point operation', async () => {
      await expect(
        idbUiDescribeTool({
          operation: 'point',
        })
      ).rejects.toThrow('point operation requires x and y coordinates');
    });

    it('should accept x=0 and y=0 as valid coordinates', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '{"type":"Button","label":"Test","enabled":true}',
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'point',
        x: 0,
        y: 0,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('Operation: all', () => {
    it('should parse NDJSON output with multiple elements', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Login","enabled":true,"frame":"{{100, 200}, {150, 50}}"}\n{"type":"Button","label":"Cancel","enabled":true,"frame":"{{100, 300}, {150, 50}}"}\n{"type":"TextField","label":"Email","enabled":true,"frame":"{{50, 100}, {300, 40}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.summary.totalElements).toBe(3);
      expect(response.summary.tappableElements).toBe(2);
      expect(response.summary.textFields).toBe(1);
    });

    it('should classify as rich when >3 tappable elements', async () => {
      const ndjsonOutput = `{"type":"Button","label":"B1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}\n{"type":"Button","label":"B2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}\n{"type":"Button","label":"B3","enabled":true,"frame":"{{0, 100}, {100, 50}}"}\n{"type":"Button","label":"B4","enabled":true,"frame":"{{0, 150}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.dataQuality).toBe('rich');
      expect(response.summary.tappableElements).toBe(4);
    });

    it('should classify as rich when text fields present', async () => {
      const ndjsonOutput = `{"type":"TextField","label":"Email","enabled":true,"frame":"{{0, 0}, {300, 40}}"}\n{"type":"Button","label":"Submit","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.dataQuality).toBe('rich');
      expect(response.summary.textFields).toBe(1);
    });

    it('should classify as minimal when ≤1 element', async () => {
      const ndjsonOutput = `{"type":"Label","label":"Title","enabled":false,"frame":"{{0, 0}, {200, 30}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.dataQuality).toBe('minimal');
    });

    it('should classify as minimal when no tappable elements', async () => {
      const ndjsonOutput = `{"type":"Label","label":"Label 1","enabled":false,"frame":"{{0, 0}, {200, 30}}"}\n{"type":"Label","label":"Label 2","enabled":false,"frame":"{{0, 30}, {200, 30}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.dataQuality).toBe('minimal');
      expect(response.summary.tappableElements).toBe(0);
    });

    it('should classify as moderate when 2-3 tappable elements', async () => {
      const ndjsonOutput = `{"type":"Button","label":"B1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}\n{"type":"Button","label":"B2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.dataQuality).toBe('moderate');
      expect(response.summary.tappableElements).toBe(2);
    });

    it('should extract centerX and centerY coordinates', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Tap Me","enabled":true,"frame":"{{50, 100}, {200, 80}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.interactiveElementsPreview[0].centerX).toBe(150); // 50 + 200/2
      expect(response.interactiveElementsPreview[0].centerY).toBe(140); // 100 + 80/2
      expect(response.interactiveElementsPreview[0].x).toBe(50);
      expect(response.interactiveElementsPreview[0].y).toBe(100);
    });

    it('should cache full UI tree for progressive disclosure', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Test","enabled":true,"frame":"{{0, 0}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        screenContext: 'LoginScreen',
        purposeDescription: 'Find buttons',
      });

      const response = JSON.parse(result.content[0].text);

      expect(mockResponseCache.store).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'idb-ui-describe-all',
          fullOutput: ndjsonOutput,
          metadata: expect.objectContaining({
            udid: 'test-udid-123',
            targetName: 'iPhone 16 Pro',
            elementCount: 1,
            screenContext: 'LoginScreen',
            purposeDescription: 'Find buttons',
          }),
        })
      );

      expect(response.uiTreeId).toBe('cached-ui-tree-123');
    });

    it('should limit preview to top 20 interactive elements', async () => {
      const buttons = Array.from({ length: 30 }, (_, i) =>
        JSON.stringify({
          type: 'Button',
          label: `Button ${i + 1}`,
          enabled: true,
          frame: `{{0, ${i * 50}}, {100, 50}}`,
        })
      ).join('\n');

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: buttons,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(30);
      expect(response.interactiveElementsPreview).toHaveLength(20);
    });

    it('should skip empty lines in NDJSON', async () => {
      const ndjsonOutput = `{"type":"Button","label":"B1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}\n\n{"type":"Button","label":"B2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.totalElements).toBe(2);
    });

    it('should handle malformed JSON lines gracefully', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Valid","enabled":true,"frame":"{{0, 0}, {100, 50}}"}\n{malformed json\n{"type":"Button","label":"Valid2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      // Should parse 2 valid lines and skip malformed
      expect(response.summary.totalElements).toBe(2);
    });

    it('should count element types', async () => {
      const ndjsonOutput = `{"type":"Button","label":"B1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}\n{"type":"Button","label":"B2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}\n{"type":"TextField","label":"Email","enabled":true,"frame":"{{0, 100}, {300, 40}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.elementTypes).toEqual({
        Button: 2,
        TextField: 1,
      });
    });

    it('should not count disabled elements as tappable', async () => {
      const ndjsonOutput = `{"type":"Button","label":"Disabled","enabled":false,"frame":"{{0, 0}, {100, 50}}"}\n{"type":"Button","label":"Enabled","enabled":true,"frame":"{{0, 50}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(1);
    });

    it('should handle command failure', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'IDB connection failed',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toContain('IDB connection failed');
    });

    it('should include screen context in response', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        screenContext: 'LoginScreen',
        purposeDescription: 'Find login button',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.screenContext).toBe('LoginScreen');
      expect(response.purposeDescription).toBe('Find login button');
    });

    it('should record successful operation', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await idbUiDescribeTool({
        operation: 'all',
      });

      expect(mockIDBTargetCache.recordSuccess).toHaveBeenCalledWith('test-udid-123');
    });
  });

  describe('Operation: point', () => {
    it('should query element at specific coordinates', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout:
          '{"type":"Button","label":"Login","enabled":true,"frame":"{{100, 200}, {150, 50}}"}',
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'point',
        x: 175,
        y: 225,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(true);
      expect(response.coordinates).toEqual({ x: 175, y: 225 });
      expect(response.element.type).toBe('Button');
      expect(response.element.label).toBe('Login');
    });

    it('should parse JSON element output', async () => {
      const elementJson = {
        type: 'TextField',
        label: 'Email',
        value: 'test@example.com',
        identifier: 'email-field',
        enabled: true,
        frame: '{{50, 100}, {300, 40}}',
      };

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify(elementJson),
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'point',
        x: 200,
        y: 120,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.element.type).toBe('TextField');
      expect(response.element.label).toBe('Email');
      expect(response.element.value).toBe('test@example.com');
      expect(response.element.identifier).toBe('email-field');
      expect(response.element.enabled).toBe(true);
      expect(response.element.frame).toEqual({
        x: 50,
        y: 100,
        width: 300,
        height: 40,
        centerX: 200,
        centerY: 120,
      });
    });

    it('should parse legacy text output format', async () => {
      const textOutput = `type: Button, label: "Submit", enabled: true`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: textOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'point',
        x: 200,
        y: 400,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.element.type).toBe('Button');
      expect(response.element.label).toBe('Submit');
      expect(response.element.enabled).toBe(true);
    });

    it('should handle disabled elements', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '{"type":"Button","label":"Disabled","enabled":false}',
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'point',
        x: 100,
        y: 200,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.element.enabled).toBe(false);
      expect(response.guidance.join('\n')).toContain('Element not enabled');
    });

    it('should provide TextField-specific guidance', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '{"type":"TextField","label":"Email","enabled":true}',
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'point',
        x: 200,
        y: 100,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.guidance.join('\n')).toContain('Type text');
      expect(response.guidance.join('\n')).toContain('idb-ui-input');
    });

    it('should handle command failure', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'No element found',
      });

      const result = await idbUiDescribeTool({
        operation: 'point',
        x: 500,
        y: 500,
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.success).toBe(false);
      expect(response.error).toContain('No element found');
    });

    it('should call correct IDB command', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '{"type":"Button","enabled":true}',
        stderr: '',
      });

      await idbUiDescribeTool({
        operation: 'point',
        x: 123,
        y: 456,
        udid: 'explicit-udid',
      });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'idb ui describe-point --udid "explicit-udid" 123 456',
        expect.objectContaining({ timeout: 10000 })
      );
    });
  });

  describe('UDID Resolution', () => {
    it('should auto-detect UDID when not provided', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await idbUiDescribeTool({
        operation: 'all',
      });

      expect(mockIDBTargetCache.getLastUsedTarget).toHaveBeenCalled();
    });

    it('should use provided UDID', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await idbUiDescribeTool({
        operation: 'all',
        udid: 'explicit-udid-456',
      });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('explicit-udid-456'),
        expect.any(Object)
      );
    });
  });

  describe('Element Type Detection', () => {
    it('should detect Cells as tappable', async () => {
      const ndjsonOutput = `{"type":"Cell","label":"List Item","enabled":true,"frame":"{{0, 0}, {400, 60}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(1);
    });

    it('should detect Links as tappable', async () => {
      const ndjsonOutput = `{"type":"Link","label":"Learn More","enabled":true,"frame":"{{0, 0}, {200, 30}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(1);
    });

    it('should detect SecureTextField', async () => {
      const ndjsonOutput = `{"type":"SecureTextField","label":"Password","enabled":true,"frame":"{{0, 0}, {300, 40}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.summary.textFields).toBe(1);
    });
  });

  describe('Response Format', () => {
    it('should include duration metric', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response).toHaveProperty('duration');
      expect(typeof response.duration).toBe('number');
    });

    it('should include target information', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '',
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });

      const response = JSON.parse(result.content[0].text);

      expect(response.udid).toBe('test-udid-123');
      expect(response.targetName).toBe('iPhone 16 Pro');
    });
  });

  describe('Filter Levels', () => {
    // Test data with iOS-specific fields
    const ndjsonWithIOSFields = `{"role":"AXButton","role_description":"button","AXLabel":"Positions","enabled":true,"AXFrame":"{{25, 292}, {173, 120}}"}\n{"type":"Text","AXLabel":"Header","enabled":true}\n{"type":"Unknown","enabled":true}`;

    it('should apply strict filtering (original behavior)', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonWithIOSFields,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'strict',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.totalElements).toBe(3);
      expect(response.summary.tappableElements).toBe(0); // Strict misses iOS role_description
    });

    it('should apply moderate filtering with iOS roles (default)', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonWithIOSFields,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        // filterLevel: 'moderate' (default)
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.totalElements).toBe(3);
      expect(response.summary.tappableElements).toBe(1); // Finds button via role_description
      expect(response.summary.dataQuality).toBe('moderate'); // 1 tappable
    });

    it('should apply permissive filtering', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonWithIOSFields,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'permissive',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.totalElements).toBe(3);
      expect(response.summary.tappableElements).toBe(3); // Finds all 3 elements with AXLabel
    });

    it('should return all elements with no filtering', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonWithIOSFields,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'none',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.totalElements).toBe(3);
      expect(response.summary.tappableElements).toBe(3); // Returns everything
      expect(response.summary.dataQuality).toBe('moderate'); // 3 tappable = moderate (need >3 for rich)
    });

    it('should include filter level in guidance for rich data', async () => {
      const ndjsonOutput = `{"type":"Button","label":"B1","enabled":true,"frame":"{{0, 0}, {100, 50}}"}\n{"type":"Button","label":"B2","enabled":true,"frame":"{{0, 50}, {100, 50}}"}\n{"type":"Button","label":"B3","enabled":true,"frame":"{{0, 100}, {100, 50}}"}\n{"type":"Button","label":"B4","enabled":true,"frame":"{{0, 150}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'moderate',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.guidance.some((g: string) => g.includes('Filter level: moderate'))).toBe(
        true
      );
    });

    it('should suggest trying higher filter level when minimal with strict', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: `{"type":"Text"}`,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'strict',
      });
      const response = JSON.parse(result.content[0].text);

      expect(
        response.guidance.some(
          (g: string) =>
            g && g.includes('filterLevel') && (g.includes('moderate') || g.includes('permissive'))
        )
      ).toBe(true);
    });

    it('should suggest trying permissive when minimal with moderate', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: `{"type":"Text"}`,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'moderate',
      });
      const response = JSON.parse(result.content[0].text);

      expect(
        response.guidance.some((g: string) => (g && g.includes('permissive')) || g.includes('none'))
      ).toBe(true);
    });
  });

  describe('iOS-Specific Field Detection', () => {
    it('should detect buttons via role field', async () => {
      const ndjsonOutput = `{"role":"AXButton","AXLabel":"Submit","enabled":true,"AXFrame":"{{100, 200}, {150, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'moderate',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(1);
      expect(response.interactiveElementsPreview[0].role).toBe('AXButton');
    });

    it('should detect buttons via role_description field', async () => {
      const ndjsonOutput = `{"role_description":"button","AXLabel":"Login","enabled":true,"AXFrame":"{{50, 100}, {200, 60}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'moderate',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(1);
      expect(response.interactiveElementsPreview[0].role_description).toBe('button');
    });

    it('should normalize AXLabel to label', async () => {
      const ndjsonOutput = `{"type":"Button","AXLabel":"Click Me","enabled":true,"AXFrame":"{{0, 0}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.interactiveElementsPreview[0].label).toBe('Click Me');
    });

    it('should normalize AXFrame to frame coordinates', async () => {
      const ndjsonOutput = `{"type":"Button","AXLabel":"Test","enabled":true,"AXFrame":"{{25, 50}, {100, 75}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.interactiveElementsPreview[0].x).toBe(25);
      expect(response.interactiveElementsPreview[0].y).toBe(50);
      expect(response.interactiveElementsPreview[0].centerX).toBe(75); // 25 + 100/2
      expect(response.interactiveElementsPreview[0].centerY).toBe(87.5); // 50 + 75/2
    });

    it('should handle mixed iOS and standard field names', async () => {
      const ndjsonOutput = `{"type":"Button","AXLabel":"Standard Button","enabled":true,"frame":"{{0, 0}, {100, 50}}"}\n{"role":"AXButton","role_description":"button","AXLabel":"iOS Button","enabled":true,"AXFrame":"{{0, 60}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'moderate',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.totalElements).toBe(2);
      expect(response.summary.tappableElements).toBe(2);
      expect(response.interactiveElementsPreview[0].label).toBe('Standard Button');
      expect(response.interactiveElementsPreview[1].label).toBe('iOS Button');
    });

    it('should detect links via role_description', async () => {
      const ndjsonOutput = `{"role_description":"link","AXLabel":"Learn More","enabled":true,"AXFrame":"{{10, 20}, {80, 30}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'moderate',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(1);
      expect(response.interactiveElementsPreview[0].role_description).toBe('link');
    });

    it('should detect tabs via role field', async () => {
      const ndjsonOutput = `{"role":"AXTab","AXLabel":"Profile","enabled":true,"AXFrame":"{{0, 700}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'moderate',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(1);
      expect(response.interactiveElementsPreview[0].role).toBe('AXTab');
    });

    it('should handle disabled elements with iOS fields', async () => {
      const ndjsonOutput = `{"role":"AXButton","role_description":"button","AXLabel":"Disabled","enabled":false,"AXFrame":"{{0, 0}, {100, 50}}"}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: ndjsonOutput,
        stderr: '',
      });

      const result = await idbUiDescribeTool({
        operation: 'all',
        filterLevel: 'moderate',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.summary.tappableElements).toBe(0); // Disabled elements not tappable
    });
  });
});
