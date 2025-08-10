import { xcodebuildGetDetailsTool } from '../../../src/tools/xcodebuild/get-details.js';
import { responseCache } from '../../../src/utils/response-cache.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock the response cache
jest.mock('../../../src/utils/response-cache.js', () => ({
  responseCache: {
    get: jest.fn(),
  },
}));

const mockResponseCache = responseCache as jest.Mocked<typeof responseCache>;

describe('xcodebuildGetDetailsTool', () => {
  const mockCachedResult = {
    id: 'test-build-123',
    tool: 'xcodebuild-build',
    timestamp: new Date('2025-08-10T16:30:00.000Z'),
    fullOutput: `Building for platform iOS Simulator...
warning: Some warning here
Build completed successfully
error: Some error here
** BUILD FAILED **
fatal error: Critical error`,
    stderr: 'Standard error output here\nerror: Another error from stderr',
    exitCode: 1,
    command: 'xcodebuild -project MyApp.xcodeproj -scheme MyApp -configuration Debug build',
    metadata: {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
      success: false,
      duration: 45000,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockResponseCache.get.mockReturnValue(mockCachedResult);
  });

  describe('basic functionality', () => {
    it('should return cached build details for valid buildId', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'summary',
      });

      expect(mockResponseCache.get).toHaveBeenCalledWith('test-build-123');
      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
    });

    it('should throw error for missing buildId', async () => {
      await expect(
        xcodebuildGetDetailsTool({
          detailType: 'summary',
        })
      ).rejects.toThrow(McpError);

      await expect(
        xcodebuildGetDetailsTool({
          buildId: '',
          detailType: 'summary',
        })
      ).rejects.toThrow(McpError);
    });

    it('should throw error for non-existent buildId', async () => {
      mockResponseCache.get.mockReturnValue(undefined);

      await expect(
        xcodebuildGetDetailsTool({
          buildId: 'non-existent',
          detailType: 'summary',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('detail types', () => {
    it('should return full log with all content', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'full-log',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('buildId', 'test-build-123');
      expect(response).toHaveProperty('detailType', 'full-log');
      expect(response).toHaveProperty('content');
      expect(response.content).toContain('Building for platform iOS Simulator');
      expect(response.content).toContain('Standard error output here');
    });

    it('should handle full log with maxLines truncation', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'full-log',
        maxLines: 3,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('totalLines');
      expect(response).toHaveProperty('showing', 'Last 3 lines');
      expect(response).toHaveProperty('note');
      expect(response.note).toContain('Use maxLines parameter');
    });

    it('should return errors only', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'errors-only',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('buildId', 'test-build-123');
      expect(response).toHaveProperty('detailType', 'errors-only');
      expect(response).toHaveProperty('errorCount');
      expect(response).toHaveProperty('errors');
      expect(response.errors.length).toBeGreaterThan(0);
      expect(response.errors.some((error: string) => error.includes('error:'))).toBe(true);
    });

    it('should return warnings only', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'warnings-only',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('buildId', 'test-build-123');
      expect(response).toHaveProperty('detailType', 'warnings-only');
      expect(response).toHaveProperty('warningCount');
      expect(response).toHaveProperty('warnings');
      expect(response.warnings.some((warning: string) => warning.includes('warning:'))).toBe(true);
    });

    it('should return summary with metadata', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'summary',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('buildId', 'test-build-123');
      expect(response).toHaveProperty('detailType', 'summary');
      expect(response).toHaveProperty('projectPath', '/path/to/MyApp.xcodeproj');
      expect(response).toHaveProperty('scheme', 'MyApp');
      expect(response).toHaveProperty('success', false);
      expect(response).toHaveProperty('duration', 45000);
      expect(response).toHaveProperty('command');
      expect(response).toHaveProperty('exitCode', 1);
    });

    it('should return command information', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'command',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('buildId', 'test-build-123');
      expect(response).toHaveProperty('detailType', 'command');
      expect(response).toHaveProperty('command');
      expect(response).toHaveProperty('exitCode', 1);
      expect(response).toHaveProperty('executedAt');
      expect(response.command).toContain('xcodebuild');
    });

    it('should return metadata with cache info', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'metadata',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('buildId', 'test-build-123');
      expect(response).toHaveProperty('detailType', 'metadata');
      expect(response).toHaveProperty('metadata');
      expect(response).toHaveProperty('cacheInfo');
      expect(response.cacheInfo).toHaveProperty('tool', 'xcodebuild-build');
      expect(response.cacheInfo).toHaveProperty('outputSize');
      expect(response.cacheInfo).toHaveProperty('stderrSize');
    });

    it('should throw error for invalid detailType', async () => {
      await expect(
        xcodebuildGetDetailsTool({
          buildId: 'test-build-123',
          detailType: 'invalid-type',
        })
      ).rejects.toThrow(McpError);

      try {
        await xcodebuildGetDetailsTool({
          buildId: 'test-build-123',
          detailType: 'invalid-type',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
        expect((error as McpError).message).toContain('Invalid detailType');
      }
    });
  });

  describe('maxLines handling', () => {
    it('should use default maxLines value', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'errors-only',
      });

      const response = JSON.parse(result.content[0].text);
      // Should process with default maxLines of 100
      expect(response).toHaveProperty('errors');
    });

    it('should respect custom maxLines for errors', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'errors-only',
        maxLines: 2,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.errors.length).toBeLessThanOrEqual(2);
      if (response.errorCount > 2) {
        expect(response.truncated).toBe(true);
      }
    });

    it('should respect custom maxLines for warnings', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'warnings-only',
        maxLines: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.warnings.length).toBeLessThanOrEqual(1);
    });
  });

  describe('error detection', () => {
    it('should detect various error patterns', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'errors-only',
      });

      const response = JSON.parse(result.content[0].text);
      const allErrors = response.errors.join(' ');

      // Should detect all error patterns from mockCachedResult
      expect(allErrors).toMatch(/error:|BUILD FAILED|fatal error/i);
    });

    it('should handle case with no errors', async () => {
      mockResponseCache.get.mockReturnValue({
        ...mockCachedResult,
        fullOutput: 'Build completed successfully\nAll tests passed',
        stderr: 'No errors',
      } as any);

      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'errors-only',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.errorCount).toBe(0);
      expect(response.errors).toHaveLength(0);
    });

    it('should handle case with no warnings', async () => {
      mockResponseCache.get.mockReturnValue({
        ...mockCachedResult,
        fullOutput: 'Build completed successfully',
        stderr: 'No warnings',
      } as any);

      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'warnings-only',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.warningCount).toBe(0);
      expect(response.warnings).toHaveLength(0);
    });
  });

  describe('response format', () => {
    it('should return proper MCP tool response format', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'summary',
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in text field', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'summary',
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty('buildId');
      expect(parsed).toHaveProperty('detailType');
    });
  });

  describe('error handling', () => {
    it('should propagate McpError from cache', async () => {
      const mcpError = new McpError(ErrorCode.InvalidRequest, 'Cache error');
      mockResponseCache.get.mockImplementation(() => {
        throw mcpError;
      });

      await expect(
        xcodebuildGetDetailsTool({
          buildId: 'test-build-123',
          detailType: 'summary',
        })
      ).rejects.toThrow(mcpError);
    });

    it('should wrap regular errors in McpError', async () => {
      const regularError = new Error('Regular error');
      mockResponseCache.get.mockImplementation(() => {
        throw regularError;
      });

      try {
        await xcodebuildGetDetailsTool({
          buildId: 'test-build-123',
          detailType: 'summary',
        });
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
        expect((error as McpError).message).toContain('xcodebuild-get-details failed');
        expect((error as McpError).message).toContain('Regular error');
      }
    });

    it('should handle null/undefined arguments gracefully', async () => {
      await expect(xcodebuildGetDetailsTool(null)).rejects.toThrow();
      await expect(xcodebuildGetDetailsTool(undefined)).rejects.toThrow();
    });

    it('should handle empty object', async () => {
      await expect(xcodebuildGetDetailsTool({})).rejects.toThrow(McpError);
    });
  });

  describe('argument validation', () => {
    it('should require buildId parameter', async () => {
      const error = await xcodebuildGetDetailsTool({
        detailType: 'summary',
      }).catch(e => e);

      expect(error).toBeInstanceOf(McpError);
      expect(error.code).toBe(ErrorCode.InvalidParams);
      expect(error.message).toContain('buildId is required');
    });

    it('should validate all supported detail types', async () => {
      const detailTypes = [
        'full-log',
        'errors-only',
        'warnings-only',
        'summary',
        'command',
        'metadata',
      ];

      for (const detailType of detailTypes) {
        const result = await xcodebuildGetDetailsTool({
          buildId: 'test-build-123',
          detailType,
        });

        const response = JSON.parse(result.content[0].text);
        expect(response.detailType).toBe(detailType);
      }
    });
  });

  describe('progressive disclosure integration', () => {
    it('should work as progressive disclosure companion to xcodebuild-build', async () => {
      // Simulates the typical workflow: build fails, user wants details
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'errors-only',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('buildId', 'test-build-123');
      expect(response).toHaveProperty('errorCount');
      expect(response.errors.length).toBeGreaterThan(0);
    });

    it('should provide cache size information for large outputs', async () => {
      const result = await xcodebuildGetDetailsTool({
        buildId: 'test-build-123',
        detailType: 'metadata',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.cacheInfo).toHaveProperty('outputSize');
      expect(response.cacheInfo).toHaveProperty('stderrSize');
      expect(typeof response.cacheInfo.outputSize).toBe('number');
      expect(typeof response.cacheInfo.stderrSize).toBe('number');
    });
  });
});
