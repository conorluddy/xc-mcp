import { jest } from '@jest/globals';
import {
  persistenceEnableTool,
  persistenceDisableTool,
  persistenceStatusTool,
} from '../../../src/tools/persistence/persistence-tools.js';
import { persistenceManager } from '../../../src/utils/persistence.js';

// Mock the persistence manager
jest.mock('../../../src/utils/persistence.js', () => ({
  persistenceManager: {
    isEnabled: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    getStatus: jest.fn(),
  },
}));

const mockPersistenceManager = persistenceManager as jest.Mocked<typeof persistenceManager>;

describe('Persistence Tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('persistenceEnableTool', () => {
    it('should enable persistence successfully', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(false);
      mockPersistenceManager.enable.mockResolvedValue({
        success: true,
        cacheDir: '/test/cache/dir',
        message: 'Persistence enabled successfully',
      });
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
        storageInfo: {
          diskUsage: 1024,
          fileCount: 2,
          isWritable: true,
        },
      });

      const result = await persistenceEnableTool({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Persistence enabled successfully');
      expect(response.cacheDirectory).toBe('/test/cache/dir');
      expect(response.privacyNotice).toContain('Only usage patterns');
      expect(response.nextSteps).toContain('State will now persist across server restarts');
    });

    it('should handle custom cache directory', async () => {
      const customDir = '/custom/cache/dir';

      mockPersistenceManager.isEnabled.mockReturnValue(false);
      mockPersistenceManager.enable.mockResolvedValue({
        success: true,
        cacheDir: customDir,
        message: 'Persistence enabled successfully',
      });
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: customDir,
        schemaVersion: '1.0.0',
      });

      const result = await persistenceEnableTool({ cacheDir: customDir });

      expect(mockPersistenceManager.enable).toHaveBeenCalledWith(customDir);

      const response = JSON.parse(result.content[0].text);
      expect(response.cacheDirectory).toBe(customDir);
    });

    it('should return error when already enabled', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(true);
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
      });

      const result = await persistenceEnableTool({});

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Persistence is already enabled');
      expect(response.currentStatus).toBeDefined();
    });

    it('should handle enable failure', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(false);
      mockPersistenceManager.enable.mockResolvedValue({
        success: false,
        cacheDir: '/test/cache/dir',
        message: 'Directory is not writable',
      });

      await expect(persistenceEnableTool({})).rejects.toThrow(
        'Failed to enable persistence: Directory is not writable'
      );
    });

    it('should handle unexpected errors', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(false);
      mockPersistenceManager.enable.mockRejectedValue(new Error('Unexpected error'));

      await expect(persistenceEnableTool({})).rejects.toThrow(
        'Failed to enable persistence: Unexpected error'
      );
    });
  });

  describe('persistenceDisableTool', () => {
    it('should disable persistence successfully', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(true);
      mockPersistenceManager.disable.mockResolvedValue({
        success: true,
        message: 'Persistence disabled',
      });

      const result = await persistenceDisableTool({});

      expect(mockPersistenceManager.disable).toHaveBeenCalledWith(false);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Persistence disabled');
      expect(response.clearedData).toBe(false);
      expect(response.effect).toContain('in-memory caching only');
    });

    it('should disable persistence and clear data', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(true);
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
        storageInfo: {
          diskUsage: 2048,
          fileCount: 3,
          isWritable: true,
        },
      });
      mockPersistenceManager.disable.mockResolvedValue({
        success: true,
        message: 'Persistence disabled and data cleared',
      });

      const result = await persistenceDisableTool({ clearData: true });

      expect(mockPersistenceManager.disable).toHaveBeenCalledWith(true);
      expect(mockPersistenceManager.getStatus).toHaveBeenCalledWith(true);

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.clearedData).toBe(true);
      expect(response.previousStorageInfo).toEqual({
        diskUsage: 2048,
        fileCount: 3,
        isWritable: true,
      });
    });

    it('should return error when already disabled', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(false);

      const result = await persistenceDisableTool({});

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.message).toBe('Persistence is already disabled');
      expect(response.clearData).toBe(false);
    });

    it('should handle disable failure', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(true);
      mockPersistenceManager.disable.mockResolvedValue({
        success: false,
        message: 'Failed to clear data',
      });

      await expect(persistenceDisableTool({})).rejects.toThrow(
        'Failed to disable persistence: Failed to clear data'
      );
    });

    it('should handle unexpected errors', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(true);
      mockPersistenceManager.disable.mockRejectedValue(new Error('Unexpected error'));

      await expect(persistenceDisableTool({})).rejects.toThrow(
        'Failed to disable persistence: Unexpected error'
      );
    });
  });

  describe('persistenceStatusTool', () => {
    it('should return disabled status', async () => {
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: false,
        schemaVersion: '1.0.0',
      });

      const result = await persistenceStatusTool({});

      const response = JSON.parse(result.content[0].text);
      expect(response.enabled).toBe(false);
      expect(response.schemaVersion).toBe('1.0.0');
      expect(response.message).toContain('Persistence is disabled');
      expect(response.features).toContain('Remembers successful build configurations');
      expect(response.timestamp).toBeDefined();
    });

    it('should return enabled status with storage info', async () => {
      const mockDate = new Date('2024-01-01T12:00:00Z');

      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
        storageInfo: {
          diskUsage: 1048576, // 1MB
          fileCount: 5,
          lastSave: mockDate,
          isWritable: true,
        },
      });

      const result = await persistenceStatusTool({});

      const response = JSON.parse(result.content[0].text);
      expect(response.enabled).toBe(true);
      expect(response.cacheDirectory).toBe('/test/cache/dir');
      expect(response.storage).toEqual({
        diskUsage: '1 MB',
        diskUsageBytes: 1048576,
        fileCount: 5,
        lastSave: mockDate.toISOString(),
        isWritable: true,
      });
    });

    it('should format disk usage correctly', async () => {
      const testCases = [
        { bytes: 0, expected: '0 B' },
        { bytes: 512, expected: '512 B' },
        { bytes: 1024, expected: '1 KB' },
        { bytes: 1536, expected: '1.5 KB' },
        { bytes: 1048576, expected: '1 MB' },
        { bytes: 1073741824, expected: '1 GB' },
      ];

      for (const testCase of testCases) {
        mockPersistenceManager.getStatus.mockResolvedValue({
          enabled: true,
          cacheDir: '/test/cache/dir',
          schemaVersion: '1.0.0',
          storageInfo: {
            diskUsage: testCase.bytes,
            fileCount: 1,
            isWritable: true,
          },
        });

        const result = await persistenceStatusTool({});
        const response = JSON.parse(result.content[0].text);

        expect(response.storage.diskUsage).toBe(testCase.expected);
      }
    });

    it('should provide recommendations based on storage state', async () => {
      // Test case: not writable directory
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
        storageInfo: {
          diskUsage: 1024,
          fileCount: 1,
          isWritable: false,
        },
      });

      let result = await persistenceStatusTool({});
      let response = JSON.parse(result.content[0].text);

      expect(response.recommendations).toContain(
        '⚠️  Cache directory is not writable - persistence may fail'
      );

      // Test case: large disk usage
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
        storageInfo: {
          diskUsage: 60 * 1024 * 1024, // 60MB
          fileCount: 100,
          isWritable: true,
        },
      });

      result = await persistenceStatusTool({});
      response = JSON.parse(result.content[0].text);

      expect(response.recommendations).toContain(
        '💾 Cache directory is using significant disk space - consider periodic cleanup'
      );

      // Test case: no cache files
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
        storageInfo: {
          diskUsage: 0,
          fileCount: 0,
          isWritable: true,
        },
      });

      result = await persistenceStatusTool({});
      response = JSON.parse(result.content[0].text);

      expect(response.recommendations).toContain(
        '📝 No cache files found - new usage patterns will be learned and saved'
      );

      // Test case: old last save
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
        storageInfo: {
          diskUsage: 1024,
          fileCount: 2,
          lastSave: oldDate,
          isWritable: true,
        },
      });

      result = await persistenceStatusTool({});
      response = JSON.parse(result.content[0].text);

      expect(response.recommendations).toContain(
        '🕐 No recent cache updates - persistence is working but not actively used'
      );
    });

    it('should handle includeStorageInfo parameter', async () => {
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/test/cache/dir',
        schemaVersion: '1.0.0',
      });

      const result = await persistenceStatusTool({ includeStorageInfo: false });

      expect(mockPersistenceManager.getStatus).toHaveBeenCalledWith(false);

      const response = JSON.parse(result.content[0].text);
      expect(response.storage).toBeUndefined();
    });

    it('should handle unexpected errors', async () => {
      mockPersistenceManager.getStatus.mockRejectedValue(new Error('Unexpected error'));

      await expect(persistenceStatusTool({})).rejects.toThrow(
        'Failed to get persistence status: Unexpected error'
      );
    });
  });

  describe('tool parameter validation', () => {
    it('should handle empty parameters for persistenceEnableTool', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(false);
      mockPersistenceManager.enable.mockResolvedValue({
        success: true,
        cacheDir: '/default/cache/dir',
        message: 'Persistence enabled successfully',
      });
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: true,
        cacheDir: '/default/cache/dir',
        schemaVersion: '1.0.0',
      });

      const result = await persistenceEnableTool({});

      expect(mockPersistenceManager.enable).toHaveBeenCalledWith(undefined);
      expect(result.content).toHaveLength(1);
    });

    it('should handle empty parameters for persistenceDisableTool', async () => {
      mockPersistenceManager.isEnabled.mockReturnValue(true);
      mockPersistenceManager.disable.mockResolvedValue({
        success: true,
        message: 'Persistence disabled',
      });

      const result = await persistenceDisableTool({});

      expect(mockPersistenceManager.disable).toHaveBeenCalledWith(false);
      expect(result.content).toHaveLength(1);
    });

    it('should handle empty parameters for persistenceStatusTool', async () => {
      mockPersistenceManager.getStatus.mockResolvedValue({
        enabled: false,
        schemaVersion: '1.0.0',
      });

      const result = await persistenceStatusTool({});

      expect(mockPersistenceManager.getStatus).toHaveBeenCalledWith(true);
      expect(result.content).toHaveLength(1);
    });
  });
});
