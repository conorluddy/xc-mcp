import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { listCachedResponsesTool } from '../../../../src/tools/cache/list-cached.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { responseCache } from '../../../../src/utils/response-cache.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('list-cached-responses tool', () => {
  setupTest();

  beforeEach(() => {
    responseCache.clear();
  });

  it('should list all cached responses', async () => {
    // Add some cached entries
    const id1 = responseCache.store({
      tool: 'xcodebuild-build',
      fullOutput: 'Build output',
      stderr: '',
      exitCode: 0,
      command: 'xcodebuild build',
      metadata: { projectPath: 'Test.xcodeproj' },
    });

    const id2 = responseCache.store({
      tool: 'simctl-list',
      fullOutput: JSON.stringify({ devices: {} }),
      stderr: '',
      exitCode: 0,
      command: 'xcrun simctl list devices',
      metadata: {},
    });

    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.recentResponses).toHaveLength(2);
    expect(data.recentResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: id1,
          tool: 'xcodebuild-build',
        }),
        expect.objectContaining({
          id: id2,
          tool: 'simctl-list',
        }),
      ])
    );
  });

  it('should filter by tool', async () => {
    responseCache.store({
      tool: 'xcodebuild-build',
      fullOutput: 'Build output',
      stderr: '',
      exitCode: 0,
      command: 'xcodebuild build',
      metadata: {},
    });

    const simctlId = responseCache.store({
      tool: 'simctl-list',
      fullOutput: 'List output',
      stderr: '',
      exitCode: 0,
      command: 'xcrun simctl list devices',
      metadata: {},
    });

    const result = await listCachedResponsesTool({
      tool: 'simctl-list',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.recentResponses).toHaveLength(1);
    expect(data.recentResponses[0].id).toBe(simctlId);
  });

  it('should limit results', async () => {
    // Add multiple entries
    for (let i = 0; i < 5; i++) {
      responseCache.store({
        tool: 'xcodebuild-build',
        fullOutput: `Build ${i}`,
        stderr: '',
        exitCode: 0,
        command: 'xcodebuild build',
        metadata: {},
      });
    }

    const result = await listCachedResponsesTool({
      limit: 3,
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.recentResponses).toHaveLength(3);
  });

  it('should handle empty cache', async () => {
    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.recentResponses).toHaveLength(0);
    expect(data.cacheStats.totalEntries).toBe(0);
  });

  it('should include cache stats', async () => {
    responseCache.store({
      tool: 'xcodebuild-build',
      fullOutput: 'Output',
      stderr: '',
      exitCode: 0,
      command: 'xcodebuild build',
      metadata: {},
    });

    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.cacheStats).toMatchObject({
      totalEntries: 1,
      byTool: expect.any(Object),
    });
    expect(data.usage.totalCached).toBe(1);
  });

  it('should sort by timestamp descending', async () => {
    const id1 = responseCache.store({
      tool: 'tool1',
      fullOutput: 'First',
      stderr: '',
      exitCode: 0,
      command: 'tool1 command',
      metadata: {},
    });

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const id2 = responseCache.store({
      tool: 'tool2',
      fullOutput: 'Second',
      stderr: '',
      exitCode: 0,
      command: 'tool2 command',
      metadata: {},
    });

    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.recentResponses[0].id).toBe(id2); // Most recent first
    expect(data.recentResponses[1].id).toBe(id1);
  });
});
