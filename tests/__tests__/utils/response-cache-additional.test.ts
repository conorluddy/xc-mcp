import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { responseCache } from '../../../src/utils/response-cache.js';

describe('ResponseCache - Additional Coverage', () => {
  beforeEach(() => {
    responseCache.clear();
  });

  describe('cleanup operations', () => {
    it('should cleanup expired entries during get operations', async () => {
      // Store entries
      const id1 = responseCache.store({
        tool: 'test',
        fullOutput: 'value1',
        stderr: '',
        exitCode: 0,
        command: 'test1',
        metadata: {}
      });
      
      const id2 = responseCache.store({
        tool: 'test',
        fullOutput: 'value2',
        stderr: '',
        exitCode: 0,
        command: 'test2',
        metadata: {}
      });
      
      // Wait for expiration (assuming 30 min default, we'll mock the time)
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 31 * 60 * 1000);
      
      // Get should trigger cleanup
      expect(responseCache.get(id1)).toBeUndefined();
      expect(responseCache.get(id2)).toBeUndefined();
      
      // Verify cache is cleaned
      expect(responseCache.getStats().totalEntries).toBe(0);
    });

    it('should handle cleanup with mixed expired and valid entries', async () => {
      // Add some entries
      const oldId = responseCache.store({
        tool: 'old',
        fullOutput: 'old data',
        stderr: '',
        exitCode: 0,
        command: 'old',
        metadata: {}
      });
      
      // Mock time to make first entry old
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 31 * 60 * 1000);
      
      // Add fresh entries
      const freshId = responseCache.store({
        tool: 'fresh',
        fullOutput: 'fresh data',
        stderr: '',
        exitCode: 0,
        command: 'fresh',
        metadata: {}
      });
      
      // Old entry should be expired
      expect(responseCache.get(oldId)).toBeUndefined();
      // Fresh entry should exist
      expect(responseCache.get(freshId)).toBeDefined();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle very large metadata', () => {
      const largeMetadata: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        largeMetadata[`key${i}`] = `value${i}`.repeat(100);
      }
      
      const id = responseCache.store({
        tool: 'test',
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'test',
        metadata: largeMetadata
      });
      
      const result = responseCache.get(id);
      expect(result?.metadata).toEqual(largeMetadata);
    });

    it('should handle concurrent stores', async () => {
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => responseCache.store({
            tool: `tool${i}`,
            fullOutput: `output${i}`,
            stderr: '',
            exitCode: 0,
            command: `cmd${i}`,
            metadata: {}
          }))
        );
      }
      
      await Promise.all(promises);
      
      expect(responseCache.getStats().totalEntries).toBe(100);
    });

    it('should enforce max entries limit', () => {
      // Store more than maxEntries (100)
      for (let i = 0; i < 105; i++) {
        responseCache.store({
          tool: `tool${i}`,
          fullOutput: `output${i}`,
          stderr: '',
          exitCode: 0,
          command: `cmd${i}`,
          metadata: {}
        });
      }
      
      // Should be limited to 100
      expect(responseCache.getStats().totalEntries).toBeLessThanOrEqual(100);
    });
  });

  describe('getRecentByTool', () => {
    it('should handle tools with special characters', () => {
      const toolName = 'tool-with-special@chars#123';
      
      responseCache.store({
        tool: toolName,
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'test',
        metadata: {}
      });
      
      const recent = responseCache.getRecentByTool(toolName);
      expect(recent).toHaveLength(1);
      expect(recent[0].tool).toBe(toolName);
    });

    it('should limit results correctly', () => {
      // Store 10 entries for same tool
      for (let i = 0; i < 10; i++) {
        responseCache.store({
          tool: 'test-tool',
          fullOutput: `output${i}`,
          stderr: '',
          exitCode: 0,
          command: `cmd${i}`,
          metadata: {}
        });
      }
      
      // Request only 3
      const recent = responseCache.getRecentByTool('test-tool', 3);
      expect(recent).toHaveLength(3);
    });
  });

  describe('store and metadata', () => {
    it('should preserve all fields accurately', () => {
      const data = {
        tool: 'complex-tool',
        fullOutput: 'Multi\nline\noutput\nwith special chars: 🎉',
        stderr: 'Some stderr\noutput',
        exitCode: 42,
        command: 'complex --command "with args"',
        metadata: {
          stringValue: 'value',
          numberValue: 123,
          bool: true,
          nullValue: null
        }
      };
      
      const id = responseCache.store(data);
      const retrieved = responseCache.get(id);
      
      expect(retrieved).toMatchObject(data);
      expect(retrieved?.id).toBe(id);
      expect(retrieved?.timestamp).toBeInstanceOf(Date);
    });

    it('should handle empty strings and zero values', () => {
      const id = responseCache.store({
        tool: '',
        fullOutput: '',
        stderr: '',
        exitCode: 0,
        command: '',
        metadata: {}
      });
      
      const result = responseCache.get(id);
      expect(result?.tool).toBe('');
      expect(result?.fullOutput).toBe('');
      expect(result?.exitCode).toBe(0);
    });
  });

  describe('performance with large data', () => {
    it('should handle very large output efficiently', () => {
      const largeOutput = 'A'.repeat(10 * 1024 * 1024); // 10MB
      
      const start = Date.now();
      const id = responseCache.store({
        tool: 'large',
        fullOutput: largeOutput,
        stderr: '',
        exitCode: 0,
        command: 'large',
        metadata: {}
      });
      
      const storeTime = Date.now() - start;
      expect(storeTime).toBeLessThan(100); // Should be fast
      
      const getStart = Date.now();
      const result = responseCache.get(id);
      const getTime = Date.now() - getStart;
      
      expect(getTime).toBeLessThan(10); // Gets should be very fast
      expect(result?.fullOutput).toBe(largeOutput);
    });
  });

  describe('statistics accuracy', () => {
    it('should track tool counts correctly', () => {
      responseCache.store({
        tool: 'tool1',
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'cmd',
        metadata: {}
      });
      
      responseCache.store({
        tool: 'tool1',
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'cmd',
        metadata: {}
      });
      
      responseCache.store({
        tool: 'tool2',
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'cmd',
        metadata: {}
      });
      
      const stats = responseCache.getStats();
      expect(stats.byTool['tool1']).toBe(2);
      expect(stats.byTool['tool2']).toBe(1);
    });

    it('should update stats after delete', () => {
      const id = responseCache.store({
        tool: 'test',
        fullOutput: 'output',
        stderr: '',
        exitCode: 0,
        command: 'cmd',
        metadata: {}
      });
      
      expect(responseCache.getStats().totalEntries).toBe(1);
      
      responseCache.delete(id);
      
      expect(responseCache.getStats().totalEntries).toBe(0);
      expect(responseCache.getStats().byTool['test']).toBeUndefined();
    });
  });
});