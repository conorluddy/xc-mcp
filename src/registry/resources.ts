import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  responseCache,
  responseResourceUri,
  RESPONSE_RESOURCE_PREFIX,
} from '../utils/response-cache.js';

/**
 * Register MCP resources for progressive-disclosure cached output.
 *
 * Tools that produce large output (xcodebuild-build/-test, simctl-list, idb-ui-describe)
 * cache it under an opaque id and return a `resource_link` to `xcmcp://response/{cacheId}`.
 * Spec-aware clients can read that resource directly instead of calling a *-get-details tool.
 * The cache id is still returned in the tool payload for older clients (backwards compatible).
 */
export function registerResources(server: McpServer): void {
  server.registerResource(
    'cached-response',
    new ResourceTemplate(`${RESPONSE_RESOURCE_PREFIX}{cacheId}`, {
      list: () => ({
        resources: responseCache.list().map(cached => ({
          uri: responseResourceUri(cached.id),
          name: `${cached.tool}-output`,
          description: `Cached ${cached.tool} output from ${cached.timestamp.toISOString()} (exit ${cached.exitCode})`,
          mimeType: 'text/plain',
        })),
      }),
    }),
    {
      title: 'Cached Tool Output',
      description:
        'Full output of a prior tool run (build logs, simulator lists, accessibility trees), addressable by its cache id.',
      mimeType: 'text/plain',
    },
    async (uri, variables) => {
      const cacheId = Array.isArray(variables.cacheId) ? variables.cacheId[0] : variables.cacheId;
      const cached = cacheId ? responseCache.get(cacheId) : undefined;

      if (!cached) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `No cached response found for id "${cacheId}". It may have expired (30 min TTL) or never existed.`,
            },
          ],
        };
      }

      const sections = [cached.fullOutput];
      if (cached.stderr?.trim()) {
        sections.push(`\n--- stderr ---\n${cached.stderr}`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: sections.join('\n'),
          },
        ],
      };
    }
  );
}
