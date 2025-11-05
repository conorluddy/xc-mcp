import { getBootedDevice, resolveDeviceId } from '../../../src/utils/device-detection.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock the command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

const { executeCommand } = require('../../../src/utils/command.js');

describe('device-detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getBootedDevice', () => {
    it('should find booted simulator', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            {
              name: 'iPhone 16 Pro',
              udid: 'ABC-123-DEF',
              state: 'Booted',
              isAvailable: true,
            },
          ],
        },
      };

      executeCommand.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify(mockOutput),
        stderr: '',
      });

      const device = await getBootedDevice();

      expect(device.name).toBe('iPhone 16 Pro');
      expect(device.udid).toBe('ABC-123-DEF');
    });

    it('should skip unavailable devices', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            {
              name: 'iPhone 15',
              udid: 'UNAVAILABLE-123',
              state: 'Booted',
              isAvailable: false,
            },
            {
              name: 'iPhone 16 Pro',
              udid: 'AVAILABLE-456',
              state: 'Booted',
              isAvailable: true,
            },
          ],
        },
      };

      executeCommand.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify(mockOutput),
        stderr: '',
      });

      const device = await getBootedDevice();

      expect(device.udid).toBe('AVAILABLE-456');
    });

    it('should throw if no booted device found', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            {
              name: 'iPhone 16 Pro',
              udid: 'ABC-123-DEF',
              state: 'Shutdown',
              isAvailable: true,
            },
          ],
        },
      };

      executeCommand.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify(mockOutput),
        stderr: '',
      });

      await expect(getBootedDevice()).rejects.toThrow('No booted simulator found');
    });

    it('should throw if simctl command fails', async () => {
      executeCommand.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Device list error',
      });

      await expect(getBootedDevice()).rejects.toThrow('Failed to list devices');
    });

    it('should handle multiple runtimes', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            {
              name: 'iPhone 15',
              udid: 'OLD-123',
              state: 'Shutdown',
              isAvailable: true,
            },
          ],
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            {
              name: 'iPhone 16 Pro',
              udid: 'NEW-456',
              state: 'Booted',
              isAvailable: true,
            },
          ],
        },
      };

      executeCommand.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify(mockOutput),
        stderr: '',
      });

      const device = await getBootedDevice();

      expect(device.udid).toBe('NEW-456');
      expect(device.name).toBe('iPhone 16 Pro');
    });
  });

  describe('resolveDeviceId', () => {
    it('should return provided UDID when given', async () => {
      const result = await resolveDeviceId('PROVIDED-123');

      expect(result).toBe('PROVIDED-123');
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it('should auto-detect when UDID not provided', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            {
              name: 'iPhone 16 Pro',
              udid: 'AUTO-DETECTED-123',
              state: 'Booted',
              isAvailable: true,
            },
          ],
        },
      };

      executeCommand.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify(mockOutput),
        stderr: '',
      });

      const result = await resolveDeviceId();

      expect(result).toBe('AUTO-DETECTED-123');
      expect(executeCommand).toHaveBeenCalled();
    });

    it('should auto-detect when empty string provided', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            {
              name: 'iPhone 16 Pro',
              udid: 'AUTO-DETECTED-123',
              state: 'Booted',
              isAvailable: true,
            },
          ],
        },
      };

      executeCommand.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify(mockOutput),
        stderr: '',
      });

      const result = await resolveDeviceId('');

      expect(result).toBe('AUTO-DETECTED-123');
    });

    it('should throw McpError when auto-detection fails', async () => {
      const mockOutput = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
            {
              name: 'iPhone 16 Pro',
              udid: 'ABC-123',
              state: 'Shutdown',
              isAvailable: true,
            },
          ],
        },
      };

      executeCommand.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify(mockOutput),
        stderr: '',
      });

      await expect(resolveDeviceId()).rejects.toThrow(McpError);
    });

    it('should preserve whitespace in provided UDID', async () => {
      const result = await resolveDeviceId('  PROVIDED-123  ');

      expect(result).toBe('  PROVIDED-123  ');
      expect(executeCommand).not.toHaveBeenCalled();
    });
  });
});
