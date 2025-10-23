import { simctlQueryUiTool } from '../../../src/tools/simctl/query-ui';
import { simulatorCache } from '../../../src/state/simulator-cache';
import { executeCommand } from '../../../src/utils/command';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

jest.mock('../../../src/state/simulator-cache');
jest.mock('../../../src/utils/command');

const mockSimulator = {
  name: 'iPhone 16 Pro',
  udid: 'device-iphone16pro',
  state: 'Booted',
  isAvailable: true,
  runtime: 'iOS 18.0',
};

describe('simctlQueryUiTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(mockSimulator);
  });

  describe('input validation', () => {
    it('should reject empty UDID', async () => {
      await expect(
        simctlQueryUiTool({
          udid: '',
          bundleId: 'com.example.app',
          predicate: 'type == "XCUIElementTypeButton"',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('UDID'),
        })
      );
    });

    it('should reject empty bundle ID', async () => {
      await expect(
        simctlQueryUiTool({
          udid: 'device-iphone16pro',
          bundleId: '',
          predicate: 'type == "XCUIElementTypeButton"',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(/[Bb]undle [Ii][Dd]/),
        })
      );
    });

    it('should reject invalid bundle ID format', async () => {
      await expect(
        simctlQueryUiTool({
          udid: 'device-iphone16pro',
          bundleId: 'invalid',
          predicate: 'type == "XCUIElementTypeButton"',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('com.company.appname'),
        })
      );
    });

    it('should reject empty predicate', async () => {
      await expect(
        simctlQueryUiTool({
          udid: 'device-iphone16pro',
          bundleId: 'com.example.app',
          predicate: '',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(/[Pp]redicate/),
        })
      );
    });

    it('should reject non-existent simulator', async () => {
      (simulatorCache.findSimulatorByUdid as jest.Mock).mockResolvedValue(null);

      await expect(
        simctlQueryUiTool({
          udid: 'invalid-udid',
          bundleId: 'com.example.app',
          predicate: 'type == "XCUIElementTypeButton"',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('not found'),
        })
      );
    });

    it('should handle whitespace-only inputs', async () => {
      await expect(
        simctlQueryUiTool({
          udid: '   ',
          bundleId: 'com.example.app',
          predicate: 'type == "XCUIElementTypeButton"',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining('UDID'),
        })
      );
    });
  });

  describe('successful queries', () => {
    it('should query button elements', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Button (XCUIElementTypeButton) at {100, 200}, label: "Login"',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.bundleId).toBe('com.example.app');
      // Progressive disclosure: summary returned instead of full elements
      expect(response.summary).toBeDefined();
      expect(response.cacheId).toBeDefined();
    });

    it('should query text field elements', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'TextField (XCUIElementTypeTextField) at {100, 150}',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeTextField"',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should query with label predicate', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Button at {100, 200}, label: "Login"',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'label == "Login"',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should query with complex predicate', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Multiple elements found: 3',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton" AND enabled == true',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should return element count in response', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Found 5 elements',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle command execution failure', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Query failed: invalid predicate syntax',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'invalid syntax',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.summary).toBeDefined();
      expect(response.summary.error).toContain('Query failed');
      expect(result.isError).toBe(true);
    });

    it('should handle no elements found', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'No elements found matching predicate',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'label == "NonExistent"',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should include helpful guidance on error', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Error executing query',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'bad predicate',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.guidance).toBeDefined();
      expect(response.guidance.length).toBeGreaterThan(0);
      // Check for error guidance message
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('❌');
    });
  });

  describe('response format', () => {
    it('should include simulator info in response', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Found elements',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
      });

      const response = JSON.parse(result.content[0].text);
      // Progressive disclosure: simulator info now only includes essential fields
      expect(response.simulatorInfo).toBeDefined();
      expect(response.simulatorInfo.name).toBe('iPhone 16 Pro');
      expect(response.simulatorInfo.state).toBe('Booted');
    });

    it('should include command in cached response details', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Result',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
      });

      const response = JSON.parse(result.content[0].text);
      // Command is now stored in cache, retrieved via cacheId
      expect(response.cacheId).toBeDefined();
      // Guidance should mention how to retrieve full details including command
      expect(response.guidance.join(' ')).toContain('simctl-get-interaction-details');
    });

    it('should include guidance suggestions', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Found 1 button',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);
    });
  });

  describe('predicate handling', () => {
    it('should handle element type predicates', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Found button',
        stderr: '',
      });

      const types = [
        'Button',
        'TextField',
        'Switch',
        'Slider',
        'Table',
        'Cell',
        'Image',
        'StaticText',
      ];

      for (const type of types) {
        await simctlQueryUiTool({
          udid: 'device-iphone16pro',
          bundleId: 'com.example.app',
          predicate: `type == "XCUIElementType${type}"`,
        });

        expect(executeCommand).toHaveBeenCalled();
      }
    });

    it('should handle accessibility predicates', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Found elements',
        stderr: '',
      });

      await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'identifier == "loginButton"',
      });

      expect(executeCommand).toHaveBeenCalled();
    });

    it('should handle enabled/visible predicates', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Found elements',
        stderr: '',
      });

      await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'enabled == true AND isHittable == true',
      });

      expect(executeCommand).toHaveBeenCalled();
    });
  });

  describe('LLM optimization', () => {
    it('should include element accessibility info for agents', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Button: "Login" at {100, 200}',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
        captureLocation: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should support location capture for interaction', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Button at {100, 200}',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
        captureLocation: true,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });
  });

  describe('Progressive disclosure caching', () => {
    it('should include cacheId in response for retrieving full details', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Button 1\nButton 2\nButton 3',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.cacheId).toBeDefined();
      expect(typeof response.cacheId).toBe('string');
      expect(response.cacheId.length).toBeGreaterThan(0);
    });

    it('should return summary with cacheId for large result sets', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Element 1\nElement 2\nElement 3\nElement 4\nElement 5',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'enabled == true',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.summary).toBeDefined();
      expect(response.summary.elementCount).toBe(5);
      expect(response.cacheId).toBeDefined();
      // Check that guidance contains reference to get-interaction-details
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('simctl-get-interaction-details');
    });

    it('should include guidance for accessing full element list', async () => {
      (executeCommand as jest.Mock).mockResolvedValue({
        code: 0,
        stdout: 'Button: Login',
        stderr: '',
      });

      const result = await simctlQueryUiTool({
        udid: 'device-iphone16pro',
        bundleId: 'com.example.app',
        predicate: 'type == "XCUIElementTypeButton"',
      });

      const response = JSON.parse(result.content[0].text);
      // Check that guidance contains reference to get-interaction-details
      const guidanceStr = response.guidance.join(' ');
      expect(guidanceStr).toContain('simctl-get-interaction-details');
    });
  });
});
