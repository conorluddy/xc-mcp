import {
  resolveIdbUdid,
  validateDeviceReady,
  validateTargetBooted,
} from '../../../src/utils/idb-device-detection.js';
import { IDBTargetCache } from '../../../src/state/idb-target-cache.js';
import { executeCommand } from '../../../src/utils/command.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/state/idb-target-cache.js');
jest.mock('../../../src/utils/command.js');

const mockIDBTargetCache = IDBTargetCache as jest.Mocked<typeof IDBTargetCache>;
const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

describe('idb-device-detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveIdbUdid', () => {
    it('should return explicit UDID when provided', async () => {
      const result = await resolveIdbUdid('explicit-udid-123');

      expect(result).toBe('explicit-udid-123');
      expect(mockIDBTargetCache.getLastUsedTarget).not.toHaveBeenCalled();
    });

    it('should trim explicit UDID', async () => {
      const result = await resolveIdbUdid('  udid-with-spaces  ');

      expect(result).toBe('udid-with-spaces');
    });

    it('should auto-detect UDID when not provided', async () => {
      mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue({
        udid: 'auto-detected-udid',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Booted',
      });

      const result = await resolveIdbUdid();

      expect(result).toBe('auto-detected-udid');
      expect(mockIDBTargetCache.getLastUsedTarget).toHaveBeenCalled();
    });

    it('should auto-detect when empty string provided', async () => {
      mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue({
        udid: 'auto-detected-udid',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Booted',
      });

      const result = await resolveIdbUdid('');

      expect(result).toBe('auto-detected-udid');
      expect(mockIDBTargetCache.getLastUsedTarget).toHaveBeenCalled();
    });

    it('should throw error when no UDID provided and no booted targets', async () => {
      mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue(undefined);

      await expect(resolveIdbUdid()).rejects.toThrow(McpError);
      await expect(resolveIdbUdid()).rejects.toThrow(
        'No UDID provided and no booted targets found'
      );
    });

    it('should include helpful error message when no targets available', async () => {
      mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue(undefined);

      await expect(resolveIdbUdid()).rejects.toThrow(
        'Boot a simulator or device first, or provide explicit UDID parameter'
      );
    });
  });

  describe('validateDeviceReady', () => {
    it('should skip validation for simulators', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'sim-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Booted',
      });

      await expect(validateDeviceReady('sim-udid-123')).resolves.toBeUndefined();
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('should validate companion for physical devices', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'device-udid-123',
        name: 'iPhone 15 Pro',
        type: 'device',
        state: 'Booted',
        connectionType: 'usb',
      });

      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: 'Companion reachable',
        stderr: '',
      });

      await expect(validateDeviceReady('device-udid-123')).resolves.toBeUndefined();
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('idb connect device-udid-123 --check-companion'),
        expect.any(Object)
      );
    });

    it('should throw error when device companion not ready', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'device-udid-123',
        name: 'iPhone 15 Pro',
        type: 'device',
        state: 'Booted',
        connectionType: 'usb',
      });

      mockExecuteCommand.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'Companion not reachable',
      });

      await expect(validateDeviceReady('device-udid-123')).rejects.toThrow(McpError);
      await expect(validateDeviceReady('device-udid-123')).rejects.toThrow(
        'Physical device "iPhone 15 Pro" (device-udid-123) not ready'
      );
    });

    it('should include troubleshooting for USB devices', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'device-udid-123',
        name: 'iPhone 15 Pro',
        type: 'device',
        state: 'Booted',
        connectionType: 'usb',
      });

      mockExecuteCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Companion not reachable',
      });

      await expect(validateDeviceReady('device-udid-123')).rejects.toThrow(
        'Device connected via USB ✓'
      );
    });

    it('should include troubleshooting for WiFi devices', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'device-udid-123',
        name: 'iPhone 15 Pro',
        type: 'device',
        state: 'Booted',
        connectionType: 'wifi',
      });

      mockExecuteCommand.mockResolvedValueOnce({
        code: 1,
        stdout: '',
        stderr: 'Companion not reachable',
      });

      await expect(validateDeviceReady('device-udid-123')).rejects.toThrow(
        'Device connected via WiFi'
      );
    });

    it('should handle unexpected errors during validation', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'device-udid-123',
        name: 'iPhone 15 Pro',
        type: 'device',
        state: 'Booted',
      });

      mockExecuteCommand.mockRejectedValue(new Error('Network error'));

      await expect(validateDeviceReady('device-udid-123')).rejects.toThrow(McpError);
      await expect(validateDeviceReady('device-udid-123')).rejects.toThrow(
        'Failed to validate device companion'
      );
    });
  });

  describe('validateTargetBooted', () => {
    it('should pass validation for booted simulator', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'sim-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Booted',
      });

      const result = await validateTargetBooted('sim-udid-123');

      expect(result).toEqual({
        udid: 'sim-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Booted',
      });
    });

    it('should pass validation for booted device', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'device-udid-123',
        name: 'iPhone 15 Pro',
        type: 'device',
        state: 'Booted',
      });

      const result = await validateTargetBooted('device-udid-123');

      expect(result.state).toBe('Booted');
    });

    it('should throw error for shutdown simulator', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'sim-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Shutdown',
      });

      await expect(validateTargetBooted('sim-udid-123')).rejects.toThrow(McpError);
      await expect(validateTargetBooted('sim-udid-123')).rejects.toThrow(
        'Target "iPhone 16 Pro" (sim-udid-123) is not booted'
      );
    });

    it('should include current state in error message', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'sim-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Shutdown',
      });

      await expect(validateTargetBooted('sim-udid-123')).rejects.toThrow('Current state: Shutdown');
    });

    it('should suggest simctl-boot for simulators', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'sim-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Shutdown',
      });

      await expect(validateTargetBooted('sim-udid-123')).rejects.toThrow(
        'Simulator: simctl-boot sim-udid-123'
      );
    });

    it('should suggest wake/unlock for physical devices', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'device-udid-123',
        name: 'iPhone 15 Pro',
        type: 'device',
        state: 'Shutdown',
      });

      await expect(validateTargetBooted('device-udid-123')).rejects.toThrow(
        'Device: Wake device and unlock'
      );
    });

    it('should suggest idb-targets tool for listing booted targets', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'sim-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Shutdown',
      });

      await expect(validateTargetBooted('sim-udid-123')).rejects.toThrow(
        'idb-targets to list available booted targets'
      );
    });
  });

  describe('Error Types', () => {
    it('should throw McpError for missing UDID', async () => {
      mockIDBTargetCache.getLastUsedTarget = jest.fn().mockResolvedValue(undefined);

      await expect(resolveIdbUdid()).rejects.toThrow(McpError);
      await expect(resolveIdbUdid()).rejects.toThrow('No UDID provided');
    });

    it('should throw McpError for not booted target', async () => {
      mockIDBTargetCache.getTarget = jest.fn().mockResolvedValue({
        udid: 'sim-udid-123',
        name: 'iPhone 16 Pro',
        type: 'simulator',
        state: 'Shutdown',
      });

      await expect(validateTargetBooted('sim-udid-123')).rejects.toThrow(McpError);
      await expect(validateTargetBooted('sim-udid-123')).rejects.toThrow('not booted');
    });
  });
});
