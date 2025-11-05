import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { getCacheStatsTool } from './get-stats.js';
import { getCacheConfigTool } from './get-config.js';
import { setCacheConfigTool } from './set-config.js';
import { clearCacheTool } from './clear.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface CacheToolArgs {
  operation: 'get-stats' | 'get-config' | 'set-config' | 'clear';
  // Set-config specific
  cacheType?: 'simulator' | 'project' | 'response' | 'all';
  maxAgeMs?: number;
  maxAgeMinutes?: number;
  maxAgeHours?: number;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Unified cache management tool.
 *
 * Routes cache operations (get-stats, get-config, set-config, clear) to
 * specialized handlers while maintaining modular code organization.
 *
 * @param args Cache operation and parameters
 * @returns Tool result with operation status
 * @throws McpError for invalid operation or execution failure
 */
export async function cacheTool(args: any) {
  const typedArgs = args as CacheToolArgs;

  try {
    return await routeOperation(typedArgs);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `cache failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// OPERATION ROUTING
// ============================================================================

/**
 * Route cache operation to appropriate handler based on operation type.
 *
 * Each operation validates its required parameters and delegates to
 * specialized implementation for execution.
 */
async function routeOperation(args: CacheToolArgs) {
  const { operation } = args;

  switch (operation) {
    case 'get-stats':
      return getCacheStatsTool({});
    case 'get-config':
      return getCacheConfigTool({ cacheType: args.cacheType });
    case 'set-config':
      return setCacheConfigTool({
        cacheType: args.cacheType,
        maxAgeMs: args.maxAgeMs,
        maxAgeMinutes: args.maxAgeMinutes,
        maxAgeHours: args.maxAgeHours,
      });
    case 'clear':
      return clearCacheTool({ cacheType: args.cacheType });
    default:
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown operation: ${operation}. Valid operations: get-stats, get-config, set-config, clear`
      );
  }
}

// ============================================================================
// DOCUMENTATION
// ============================================================================

export const CACHE_DOCS = `
# cache

Unified cache management - get statistics, get configuration, set configuration, clear cache.

## Overview

Single tool for cache management. Routes to specialized handlers while maintaining clean operation semantics.

## Operations

### get-stats

Get cache statistics and metrics.

**Example:**
\`\`\`typescript
await cacheTool({ operation: 'get-stats' })
\`\`\`

**Returns:**
Cache statistics including size, hit rates, and usage metrics.

---

### get-config

Get cache configuration for specific cache type.

**Parameters:**
- \`cacheType\` (string, optional): Cache type - 'simulator', 'project', 'response', or 'all'

**Example:**
\`\`\`typescript
await cacheTool({
  operation: 'get-config',
  cacheType: 'simulator'
})
\`\`\`

**Returns:**
Current configuration including max age settings.

---

### set-config

Set cache configuration.

**Parameters:**
- \`cacheType\` (string): Cache type - 'simulator', 'project', 'response', or 'all'
- \`maxAgeMs\` (number, optional): Maximum age in milliseconds
- \`maxAgeMinutes\` (number, optional): Maximum age in minutes
- \`maxAgeHours\` (number, optional): Maximum age in hours

**Example:**
\`\`\`typescript
await cacheTool({
  operation: 'set-config',
  cacheType: 'simulator',
  maxAgeHours: 2
})
\`\`\`

---

### clear

Clear cache for specific type.

**Parameters:**
- \`cacheType\` (string, optional): Cache type - 'simulator', 'project', 'response', or 'all'

**Example:**
\`\`\`typescript
await cacheTool({
  operation: 'clear',
  cacheType: 'simulator'
})
\`\`\`

---

## Cache Types

- **simulator**: Simulator list and state cache
- **project**: Project configuration and build settings cache
- **response**: Large response output cache for progressive disclosure
- **all**: All caches (default when not specified)

## Related Tools

- \`list-cached-responses\`: View cached response IDs
- \`xcodebuild-get-details\`: Retrieve cached build output
- \`simctl-get-details\`: Retrieve cached simulator details
`;
