import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { PersistenceManager } from '../../../src/utils/persistence.js';

// Mock fs operations
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    rename: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
    rm: jest.fn(),
  },
}));

// Mock os functions
jest.mock('os', () => ({
  homedir: jest.fn(() => '/home/user'),
  tmpdir: jest.fn(() => '/tmp'),
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'mock-uuid'),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('PersistenceManager - Core Functionality', () => {
  let persistenceManager: PersistenceManager;

  beforeEach(() => {
    jest.clearAllMocks();
    persistenceManager = new PersistenceManager();

    // Setup successful defaults
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockResolvedValue('test');
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.rename.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 1024, mtime: new Date() } as any);
    mockFs.readdir.mockResolvedValue([]);
    mockFs.rm.mockResolvedValue(undefined);
  });

  describe('enable/disable cycle', () => {
    it('should enable and disable persistence successfully', async () => {
      // Initially disabled
      expect(persistenceManager.isEnabled()).toBe(false);

      // Enable persistence
      const enableResult = await persistenceManager.enable('/test/dir');
      expect(enableResult.success).toBe(true);
      expect(persistenceManager.isEnabled()).toBe(true);

      // Disable persistence
      const disableResult = await persistenceManager.disable();
      expect(disableResult.success).toBe(true);
      expect(persistenceManager.isEnabled()).toBe(false);
    });

    it('should handle enable failure gracefully', async () => {
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      const result = await persistenceManager.enable('/readonly');
      expect(result.success).toBe(false);
      expect(persistenceManager.isEnabled()).toBe(false);
    });
  });

  describe('state operations', () => {
    beforeEach(async () => {
      await persistenceManager.enable('/test/dir');
      jest.clearAllMocks();
    });

    it('should save state when enabled', async () => {
      jest.useFakeTimers();

      const savePromise = persistenceManager.saveState('test', { data: 'value' });

      // Trigger debounced save
      jest.advanceTimersByTime(1100);
      await savePromise;

      expect(mockFs.writeFile).toHaveBeenCalled();
      jest.useRealTimers();
    }, 15000);

    it('should not save state when disabled', async () => {
      await persistenceManager.disable();
      await persistenceManager.saveState('test', { data: 'value' });

      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should load valid state successfully', async () => {
      const validData = JSON.stringify({
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: { test: 'value' },
      });

      mockFs.readFile.mockResolvedValue(validData);

      const result = await persistenceManager.loadState('test');
      expect(result).toEqual({ test: 'value' });
    });

    it('should handle missing files gracefully', async () => {
      mockFs.readFile.mockRejectedValue({ code: 'ENOENT' });

      const result = await persistenceManager.loadState('test');
      expect(result).toBeNull();
    });

    it('should handle version mismatches', async () => {
      const invalidData = JSON.stringify({
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        data: { test: 'value' },
      });

      mockFs.readFile.mockResolvedValue(invalidData);

      const result = await persistenceManager.loadState('test');
      expect(result).toBeNull();
    });
  });

  describe('serialization', () => {
    beforeEach(async () => {
      await persistenceManager.enable('/test/dir');
    });

    it('should serialize and deserialize Map objects', async () => {
      const data = JSON.stringify({
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: { mapData: { __type: 'Map', entries: [['key', 'value']] } },
      });

      mockFs.readFile.mockResolvedValue(data);

      const result = await persistenceManager.loadState<{ mapData: Map<string, string> }>('test');
      expect(result?.mapData).toBeInstanceOf(Map);
      expect(result?.mapData.get('key')).toBe('value');
    });

    it('should serialize and deserialize Date objects', async () => {
      const testDate = new Date('2024-01-01');
      const data = JSON.stringify({
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: { dateData: { __type: 'Date', value: testDate.toISOString() } },
      });

      mockFs.readFile.mockResolvedValue(data);

      const result = await persistenceManager.loadState<{ dateData: Date }>('test');
      expect(result?.dateData).toBeInstanceOf(Date);
      expect(result?.dateData.getTime()).toBe(testDate.getTime());
    });
  });

  describe('status reporting', () => {
    it('should report disabled status correctly', async () => {
      const status = await persistenceManager.getStatus();

      expect(status.enabled).toBe(false);
      expect(status.schemaVersion).toBe('1.0.0');
      expect(status.cacheDir).toBeUndefined();
    });

    it('should report enabled status correctly', async () => {
      await persistenceManager.enable('/test/dir');

      const status = await persistenceManager.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.cacheDir).toBe('/test/dir');
    });
  });

  describe('validation', () => {
    it('should validate simulators cache data correctly', async () => {
      const validData = JSON.stringify({
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: {
          cache: null,
          preferredByProject: [],
          lastUsed: [],
        },
      });

      mockFs.readFile.mockResolvedValue(validData);

      const result = await persistenceManager.loadState('simulators');
      expect(result).toBeDefined();
    });

    it('should reject invalid simulators data', async () => {
      const invalidData = JSON.stringify({
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        data: { invalid: 'structure' },
      });

      mockFs.readFile.mockResolvedValue(invalidData);

      const result = await persistenceManager.loadState('simulators');
      expect(result).toBeNull();
    });
  });
});
