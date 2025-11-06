import {
  extractAccessibilityElements,
  getScreenDimensions,
  AccessibilityElement,
} from '../../../src/utils/element-extraction.js';
import { executeCommand } from '../../../src/utils/command.js';

// Mock dependencies
jest.mock('../../../src/utils/command.js');

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

describe('element-extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('extractAccessibilityElements', () => {
    it('should extract button elements with labels and bounds', async () => {
      const queryOutput = `Button, "Login", {x 100 y 200 w 150 h 50}`;

      mockExecuteCommand.mockResolvedValue({
        code: 0,
        stdout: queryOutput,
        stderr: '',
      });

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result).toHaveLength(8); // 8 element types queried
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('xcrun simctl query'),
        expect.any(Object)
      );
    });

    it('should extract multiple elements from query output', async () => {
      const queryOutput = `Button, "Login", {x 100 y 200 w 150 h 50}
Button, "Cancel", {x 100 y 300 w 150 h 50}`;

      mockExecuteCommand.mockResolvedValue({
        code: 0,
        stdout: queryOutput,
        stderr: '',
      });

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      // Each element type is queried, so we get multiple results
      expect(result.length).toBeGreaterThan(0);
      expect(mockExecuteCommand).toHaveBeenCalledTimes(8); // 8 element types
    });

    it('should parse element with label, bounds, and enabled state', async () => {
      const queryOutput = `Button, "Submit", {x 50 y 100 w 200 h 60} enabled: 1 hittable: 1`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: queryOutput,
        stderr: '',
      });

      // Mock remaining element types as empty
      for (let i = 1; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'XCUIElementTypeButton',
        label: 'Submit',
        bounds: {
          x: 50,
          y: 100,
          width: 200,
          height: 60,
        },
        enabled: true,
        hittable: true,
      });
    });

    it('should parse element with disabled state', async () => {
      const queryOutput = `Button, "Disabled Button", {x 50 y 100 w 200 h 60} enabled: 0 hittable: 0`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: queryOutput,
        stderr: '',
      });

      // Mock remaining element types as empty
      for (let i = 1; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result).toHaveLength(1);
      expect(result[0].enabled).toBe(false);
      expect(result[0].hittable).toBe(false);
    });

    it('should query all 8 element types', async () => {
      mockExecuteCommand.mockResolvedValue({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await extractAccessibilityElements('test-udid', 'com.example.app');

      const expectedElementTypes = [
        'XCUIElementTypeButton',
        'XCUIElementTypeTextField',
        'XCUIElementTypeSecureTextField',
        'XCUIElementTypeSwitch',
        'XCUIElementTypeSlider',
        'XCUIElementTypeStaticText',
        'XCUIElementTypeLink',
        'XCUIElementTypePickerWheel',
      ];

      expect(mockExecuteCommand).toHaveBeenCalledTimes(8);

      expectedElementTypes.forEach(elementType => {
        expect(mockExecuteCommand).toHaveBeenCalledWith(
          expect.stringContaining(`type == "${elementType}"`),
          expect.any(Object)
        );
      });
    });

    it('should include --locations flag in query command', async () => {
      mockExecuteCommand.mockResolvedValue({
        code: 0,
        stdout: '',
        stderr: '',
      });

      await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('--locations'),
        expect.any(Object)
      );
    });

    it('should skip empty lines in query output', async () => {
      const queryOutput = `Button, "Button 1", {x 0 y 0 w 100 h 50}

Button, "Button 2", {x 0 y 50 w 100 h 50}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: queryOutput,
        stderr: '',
      });

      // Mock remaining element types as empty
      for (let i = 1; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result).toHaveLength(2);
    });

    it('should handle malformed lines gracefully', async () => {
      const queryOutput = `Button, "Valid", {x 0 y 0 w 100 h 50}
This is malformed data without proper format
Button, "Another Valid", {x 0 y 50 w 100 h 50}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: queryOutput,
        stderr: '',
      });

      // Mock remaining element types as empty
      for (let i = 1; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      // Should parse valid lines and skip malformed
      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Valid');
      expect(result[1].label).toBe('Another Valid');
    });

    it('should continue with next element type if one fails', async () => {
      // First element type fails
      mockExecuteCommand.mockRejectedValueOnce(new Error('Command failed'));

      // Second element type succeeds
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: `TextField, "Email", {x 50 y 100 w 300 h 40}`,
        stderr: '',
      });

      // Remaining element types empty
      for (let i = 2; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      // Should still extract from successful queries
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some(el => el.type === 'XCUIElementTypeTextField')).toBe(true);
    });

    it('should return empty array if all queries fail', async () => {
      mockExecuteCommand.mockRejectedValue(new Error('Command failed'));

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result).toEqual([]);
    });

    it('should handle non-zero exit codes', async () => {
      mockExecuteCommand.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Error querying elements',
      });

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result).toEqual([]);
    });

    it('should only return elements with label or bounds', async () => {
      const queryOutput = `Button, {x 100 y 200 w 150 h 50}
Button, "Valid Label", {x 100 y 300 w 150 h 50}
Button, "Only Label"
Invalid line without data`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: queryOutput,
        stderr: '',
      });

      // Mock remaining element types as empty
      for (let i = 1; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      // Should have 3 elements (one with bounds only, one with both, one with label only)
      expect(result).toHaveLength(3);
    });

    it('should round floating point coordinates', async () => {
      const queryOutput = `Button, "Test", {x 100.5 y 200.7 w 150.2 h 50.9}`;

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: queryOutput,
        stderr: '',
      });

      // Mock remaining element types as empty
      for (let i = 1; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result[0].bounds).toEqual({
        x: 101,
        y: 201,
        width: 150,
        height: 51,
      });
    });
  });

  describe('getScreenDimensions', () => {
    it('should return screen dimensions when device found', async () => {
      const simulatorListOutput = {
        devices: {
          'iOS 17.0': [
            {
              udid: 'test-udid-123',
              name: 'iPhone 16 Pro',
              state: 'Booted',
            },
          ],
        },
      };

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify(simulatorListOutput),
        stderr: '',
      });

      const result = await getScreenDimensions('test-udid-123');

      expect(result).toEqual({
        width: 393,
        height: 852,
        scale: 3,
      });
    });

    it('should return null when device not found', async () => {
      const simulatorListOutput = {
        devices: {
          'iOS 17.0': [
            {
              udid: 'other-udid-456',
              name: 'iPhone 15',
              state: 'Shutdown',
            },
          ],
        },
      };

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify(simulatorListOutput),
        stderr: '',
      });

      const result = await getScreenDimensions('test-udid-123');

      expect(result).toBeNull();
    });

    it('should return null on command failure', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Command failed',
      });

      const result = await getScreenDimensions('test-udid-123');

      expect(result).toBeNull();
    });

    it('should return null on JSON parse error', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: 'Invalid JSON output',
        stderr: '',
      });

      const result = await getScreenDimensions('test-udid-123');

      expect(result).toBeNull();
    });

    it('should handle executeCommand exception', async () => {
      mockExecuteCommand.mockRejectedValueOnce(new Error('Network error'));

      const result = await getScreenDimensions('test-udid-123');

      expect(result).toBeNull();
    });

    it('should call simctl list devices with JSON flag', async () => {
      const simulatorListOutput = {
        devices: {
          'iOS 17.0': [
            {
              udid: 'test-udid-123',
              name: 'iPhone 16 Pro',
              state: 'Booted',
            },
          ],
        },
      };

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify(simulatorListOutput),
        stderr: '',
      });

      await getScreenDimensions('test-udid-123');

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        'xcrun simctl list devices -j',
        expect.objectContaining({ timeout: 5000 })
      );
    });

    it('should search across multiple runtime versions', async () => {
      const simulatorListOutput = {
        devices: {
          'iOS 16.0': [
            {
              udid: 'other-udid-456',
              name: 'iPhone 14',
              state: 'Shutdown',
            },
          ],
          'iOS 17.0': [
            {
              udid: 'test-udid-123',
              name: 'iPhone 16 Pro',
              state: 'Booted',
            },
          ],
          'iOS 17.2': [
            {
              udid: 'another-udid-789',
              name: 'iPhone 15 Plus',
              state: 'Shutdown',
            },
          ],
        },
      };

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: JSON.stringify(simulatorListOutput),
        stderr: '',
      });

      const result = await getScreenDimensions('test-udid-123');

      expect(result).toEqual({
        width: 393,
        height: 852,
        scale: 3,
      });
    });
  });

  describe('Element Type Coverage', () => {
    it('should extract TextField elements', async () => {
      const queryOutput = `TextField, "Email", {x 50 y 100 w 300 h 40}`;

      mockExecuteCommand
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // Button
        .mockResolvedValueOnce({ code: 0, stdout: queryOutput, stderr: '' }); // TextField

      // Mock remaining element types as empty
      for (let i = 2; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result.some(el => el.type === 'XCUIElementTypeTextField')).toBe(true);
    });

    it('should extract SecureTextField elements', async () => {
      const queryOutput = `SecureTextField, "Password", {x 50 y 150 w 300 h 40}`;

      mockExecuteCommand
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // Button
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // TextField
        .mockResolvedValueOnce({ code: 0, stdout: queryOutput, stderr: '' }); // SecureTextField

      // Mock remaining element types as empty
      for (let i = 3; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result.some(el => el.type === 'XCUIElementTypeSecureTextField')).toBe(true);
    });

    it('should extract Switch elements', async () => {
      const queryOutput = `Switch, "Notifications", {x 300 y 200 w 50 h 30} enabled: 1`;

      mockExecuteCommand
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // Button
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // TextField
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // SecureTextField
        .mockResolvedValueOnce({ code: 0, stdout: queryOutput, stderr: '' }); // Switch

      // Mock remaining element types as empty
      for (let i = 4; i < 8; i++) {
        mockExecuteCommand.mockResolvedValueOnce({
          code: 0,
          stdout: '',
          stderr: '',
        });
      }

      const result = await extractAccessibilityElements('test-udid', 'com.example.app');

      expect(result.some(el => el.type === 'XCUIElementTypeSwitch')).toBe(true);
    });
  });
});
