import { responseCache } from '../../src/utils/response-cache.js';

export const mockResponseCacheEntry = (
  cacheId: string,
  tool: string,
  fullOutput: string,
  stderr: string = '',
  exitCode: number = 0,
  command?: string,
  metadata: any = {}
) => {
  // We need to manually set the cache entry since responseCache.store() returns a random ID
  const entry = {
    id: cacheId,
    tool,
    fullOutput,
    stderr,
    exitCode,
    command: command || tool,
    metadata,
    timestamp: new Date(),
  };

  // Access the internal cache map
  (responseCache as any).cache.set(cacheId, entry);

  return cacheId;
};
