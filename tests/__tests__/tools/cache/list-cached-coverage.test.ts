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
      metadata: { projectPath: 'Test.xcodeproj' }
    });

    const id2 = responseCache.store({
      tool: 'simctl-list',
      fullOutput: JSON.stringify({ devices: {} }),
      metadata: {}
    });

    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.entries).toHaveLength(2);
    expect(data.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: id1,
        tool: 'xcodebuild-build'
      }),
      expect.objectContaining({
        id: id2,
        tool: 'simctl-list'
      })
    ]));
  });

  it('should filter by tool', async () => {
    responseCache.store({
      tool: 'xcodebuild-build',
      fullOutput: 'Build output',
      metadata: {}
    });

    const simctlId = responseCache.store({
      tool: 'simctl-list',
      fullOutput: 'List output',
      metadata: {}
    });

    const result = await listCachedResponsesTool({
      tool: 'simctl-list'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].id).toBe(simctlId);
  });

  it('should limit results', async () => {
    // Add multiple entries
    for (let i = 0; i < 5; i++) {
      responseCache.store({
        tool: 'xcodebuild-build',
        fullOutput: `Build ${i}`,
        metadata: {}
      });
    }

    const result = await listCachedResponsesTool({
      limit: 3
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.entries).toHaveLength(3);
  });

  it('should handle empty cache', async () => {
    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.entries).toHaveLength(0);
    expect(data.stats.totalEntries).toBe(0);
  });

  it('should include cache stats', async () => {
    responseCache.store({
      tool: 'xcodebuild-build',
      fullOutput: 'Output',
      metadata: {}
    });

    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.stats).toMatchObject({
      totalEntries: 1,
      totalSizeBytes: expect.any(Number)
    });
  });

  it('should sort by timestamp descending', async () => {
    const id1 = responseCache.store({
      tool: 'tool1',
      fullOutput: 'First',
      metadata: {}
    });

    // Small delay to ensure different timestamps
    await new Promise(resolve => setTimeout(resolve, 10));

    const id2 = responseCache.store({
      tool: 'tool2',
      fullOutput: 'Second',
      metadata: {}
    });

    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.entries[0].id).toBe(id2); // Most recent first
    expect(data.entries[1].id).toBe(id1);
  });
});