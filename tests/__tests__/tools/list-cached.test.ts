import { jest } from '@jest/globals';
import { listCachedResponsesTool } from '../../../src/tools/cache/list-cached.js';
import { responseCache } from '../../../src/utils/response-cache.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock the response cache
jest.mock('../../../src/utils/response-cache.js', () => ({
  responseCache: {
    getStats: jest.fn(),
    getRecentByTool: jest.fn(),
  },
}));

const mockResponseCache = responseCache as jest.Mocked<typeof responseCache>;

describe('listCachedResponsesTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockStats = {
    totalEntries: 15,
    byTool: {
      'xcodebuild-build': 8,
      'simctl-list': 4,
      'xcodebuild-clean': 3,
    },
  };

  const mockCachedResponses = [
    {
      id: 'response-1',
      tool: 'xcodebuild-build',
      timestamp: new Date('2024-01-01T12:00:00Z'),
      exitCode: 0,
      fullOutput: 'Build succeeded output',
      stderr: '',
      command: 'xcodebuild -project MyApp.xcodeproj -scheme MyApp build',
      metadata: {
        projectPath: '/path/to/project',
        scheme: 'MyApp',
        success: true,
        duration: 30.5,
      },
    },
    {
      id: 'response-2',
      tool: 'simctl-list',
      timestamp: new Date('2024-01-01T11:30:00Z'),
      exitCode: 0,
      fullOutput: 'Device list output',
      stderr: '',
      command: 'xcrun simctl list devices',
      metadata: {
        totalDevices: 10,
      },
    },
    {
      id: 'response-3',
      tool: 'xcodebuild-clean',
      timestamp: new Date('2024-01-01T11:00:00Z'),
      exitCode: 0,
      fullOutput: 'Clean succeeded',
      stderr: 'Warning message',
      command: 'xcodebuild -project MyApp.xcodeproj clean',
      metadata: {},
    },
  ];

  it('should list all cached responses with default limit', async () => {
    mockResponseCache.getStats.mockReturnValue(mockStats);
    mockResponseCache.getRecentByTool.mockImplementation((tool, limit) => {
      const toolResponses = mockCachedResponses.filter(r => r.tool === tool);
      return toolResponses.slice(0, limit);
    });

    const result = await listCachedResponsesTool({});

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const response = JSON.parse(result.content[0].text);

    expect(response.cacheStats).toEqual(mockStats);
    expect(response.usage.totalCached).toBe(15);
    expect(response.usage.availableTools).toEqual([
      'xcodebuild-build',
      'simctl-list',
      'xcodebuild-clean',
    ]);
    expect(response.usage.note).toBe(
      'Use xcodebuild-get-details with any ID to retrieve full details'
    );

    // Should call getRecentByTool for each tool type
    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledWith(
      'xcodebuild-build',
      expect.any(Number)
    );
    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledWith(
      'simctl-list',
      expect.any(Number)
    );
    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledWith(
      'xcodebuild-clean',
      expect.any(Number)
    );
  });

  it('should filter by specific tool', async () => {
    const buildResponses = mockCachedResponses.filter(r => r.tool === 'xcodebuild-build');

    mockResponseCache.getStats.mockReturnValue(mockStats);
    mockResponseCache.getRecentByTool.mockReturnValue(buildResponses);

    const result = await listCachedResponsesTool({ tool: 'xcodebuild-build' });

    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledWith('xcodebuild-build', 10);
    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledTimes(1);

    const response = JSON.parse(result.content[0].text);
    expect(response.recentResponses).toHaveLength(1);
    expect(response.recentResponses[0].tool).toBe('xcodebuild-build');
  });

  it('should respect custom limit', async () => {
    mockResponseCache.getStats.mockReturnValue(mockStats);
    mockResponseCache.getRecentByTool.mockImplementation((tool, limit) => {
      const toolResponses = mockCachedResponses.filter(r => r.tool === tool);
      return toolResponses.slice(0, limit);
    });

    const _result = await listCachedResponsesTool({ limit: 5 });

    // Should call with limit divided among tools
    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledWith('xcodebuild-build', 2); // ceil(5/3)
    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledWith('simctl-list', 2);
    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledWith('xcodebuild-clean', 2);
  });

  it('should format response data correctly', async () => {
    mockResponseCache.getStats.mockReturnValue(mockStats);
    mockResponseCache.getRecentByTool.mockReturnValue([mockCachedResponses[0]]);

    const result = await listCachedResponsesTool({ tool: 'xcodebuild-build' });
    const response = JSON.parse(result.content[0].text);

    expect(response.recentResponses[0]).toEqual({
      id: 'response-1',
      tool: 'xcodebuild-build',
      timestamp: mockCachedResponses[0].timestamp.toISOString(),
      exitCode: 0,
      outputSize: 'Build succeeded output'.length,
      stderrSize: 0,
      summary: {},
      projectPath: '/path/to/project',
      scheme: 'MyApp',
    });
  });

  it('should handle responses with missing metadata', async () => {
    const responseWithMinimalMetadata = {
      ...mockCachedResponses[2],
      metadata: {}, // Empty metadata
      command: 'xcodebuild -project MyApp.xcodeproj clean', // Ensure command is present
    };

    mockResponseCache.getStats.mockReturnValue(mockStats);
    mockResponseCache.getRecentByTool.mockReturnValue([responseWithMinimalMetadata]);

    const result = await listCachedResponsesTool({ tool: 'xcodebuild-clean' });
    const response = JSON.parse(result.content[0].text);

    expect(response.recentResponses[0]).toMatchObject({
      id: 'response-3',
      tool: 'xcodebuild-clean',
      summary: {},
    });
    // Check that projectPath and scheme are undefined (or not present)
    expect(response.recentResponses[0].projectPath).toBeUndefined();
    expect(response.recentResponses[0].scheme).toBeUndefined();
  });

  it('should sort responses by timestamp when combining tools', async () => {
    const _sortedResponses = [...mockCachedResponses].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    mockResponseCache.getStats.mockReturnValue(mockStats);
    mockResponseCache.getRecentByTool.mockImplementation(tool => {
      return mockCachedResponses.filter(r => r.tool === tool);
    });

    const result = await listCachedResponsesTool({ limit: 10 });
    const response = JSON.parse(result.content[0].text);

    // Should be sorted by timestamp descending (most recent first)
    expect(response.recentResponses[0].id).toBe('response-1'); // 12:00:00 - most recent
    expect(response.recentResponses[1].id).toBe('response-2'); // 11:30:00
    expect(response.recentResponses[2].id).toBe('response-3'); // 11:00:00 - oldest
  });

  it('should handle empty cache stats', async () => {
    const emptyStats = {
      totalEntries: 0,
      byTool: {},
    };

    mockResponseCache.getStats.mockReturnValue(emptyStats);

    const result = await listCachedResponsesTool({});
    const response = JSON.parse(result.content[0].text);

    expect(response.cacheStats).toEqual(emptyStats);
    expect(response.usage.totalCached).toBe(0);
    expect(response.usage.availableTools).toEqual([]);
    expect(response.recentResponses).toEqual([]);
  });

  it('should handle tool filter with no matching responses', async () => {
    mockResponseCache.getStats.mockReturnValue(mockStats);
    mockResponseCache.getRecentByTool.mockReturnValue([]);

    const result = await listCachedResponsesTool({ tool: 'nonexistent-tool' });

    expect(mockResponseCache.getRecentByTool).toHaveBeenCalledWith('nonexistent-tool', 10);

    const response = JSON.parse(result.content[0].text);
    expect(response.recentResponses).toEqual([]);
  });

  it('should handle errors from responseCache', async () => {
    mockResponseCache.getStats.mockImplementation(() => {
      throw new Error('Cache stats error');
    });

    await expect(listCachedResponsesTool({})).rejects.toThrow(McpError);
    await expect(listCachedResponsesTool({})).rejects.toThrow(
      'list-cached-responses failed: Cache stats error'
    );
  });

  it('should handle non-Error exceptions', async () => {
    mockResponseCache.getStats.mockImplementation(() => {
      throw 'String error';
    });

    await expect(listCachedResponsesTool({})).rejects.toThrow(McpError);
    await expect(listCachedResponsesTool({})).rejects.toThrow(
      'list-cached-responses failed: String error'
    );
  });
});
