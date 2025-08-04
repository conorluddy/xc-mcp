import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { listCachedResponsesTool } from '../../../../src/tools/cache/list-cached.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import { responseCache } from '../../../../src/utils/response-cache.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('list-cached-responses tool', () => {
  setupTest();

  beforeEach(() => {
    responseCache.clear();
  });

  it('should list all cached responses', async () => {
    const cache = responseCache;

    // Add some cached responses
    cache.store({
      tool: 'xcodebuild-build',
      fullOutput: 'Build output for project A',
      stderr: '',
      exitCode: 0,
      command: 'xcodebuild',
      metadata: {},
    });

    cache.store({
      tool: 'simctl-list',
      fullOutput: JSON.stringify({ devices: {} }),
      stderr: '',
      exitCode: 0,
      command: 'simctl list',
      metadata: {},
    });

    cache.store({
      tool: 'test',
      fullOutput: 'Some test data',
      stderr: '',
      exitCode: 0,
      command: 'test',
      metadata: {},
    });

    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);

    expect(data).toMatchObject({
      responses: expect.arrayContaining([
        expect.objectContaining({
          tool: 'xcodebuild-build',
        }),
        expect.objectContaining({
          tool: 'simctl-list',
        }),
        expect.objectContaining({
          tool: 'test',
        }),
      ]),
      total: 3,
    });
  });

  it('should handle empty cache', async () => {
    const result = await listCachedResponsesTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);

    expect(data).toMatchObject({
      responses: [],
      total: 0,
    });
  });

  it('should sort responses by timestamp', async () => {
    const cache = responseCache;

    // Add responses with slight delays to ensure different timestamps
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const id = cache.store({
        tool: `tool${i}`,
        fullOutput: `Response ${i}`,
        stderr: '',
        exitCode: 0,
        command: `command${i}`,
        metadata: {},
      });
      ids.push(id);
      // Small delay between stores
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const result = await listCachedResponsesTool({});
    const data = JSON.parse(result.content[0].text);

    // Most recent should be first
    expect(data.responses[0].tool).toBe('tool2');
    expect(data.responses[1].tool).toBe('tool1');
    expect(data.responses[2].tool).toBe('tool0');
  });

  it('should include response metadata', async () => {
    const cache = responseCache;

    const smallData = 'Small';
    const largeData = 'A'.repeat(1000);

    cache.store({
      tool: 'small-tool',
      fullOutput: smallData,
      stderr: '',
      exitCode: 0,
      command: 'small',
      metadata: { scheme: 'Debug' },
    });

    cache.store({
      tool: 'large-tool',
      fullOutput: largeData,
      stderr: '',
      exitCode: 0,
      command: 'large',
      metadata: { project: 'MyApp' },
    });

    const result = await listCachedResponsesTool({});
    const data = JSON.parse(result.content[0].text);

    expect(data.responses).toHaveLength(2);
    expect(data.responses.some(r => r.tool === 'small-tool')).toBe(true);
    expect(data.responses.some(r => r.tool === 'large-tool')).toBe(true);
    expect(data.total).toBe(2);
  });

  it('should handle errors gracefully', async () => {
    // Mock an error in responseCache
    jest.spyOn(responseCache, 'getStats').mockImplementation(() => {
      throw new Error('Cache error');
    });

    await expect(listCachedResponsesTool({})).rejects.toThrow();
  });
});
