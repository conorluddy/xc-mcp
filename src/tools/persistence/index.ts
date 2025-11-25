import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { persistenceEnableTool } from './enable.js';
import { persistenceDisableTool } from './disable.js';
import { persistenceStatusTool } from './status.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface PersistenceToolArgs {
  operation: 'enable' | 'disable' | 'status';
  // Enable specific
  cacheDir?: string;
  // Disable specific
  clearData?: boolean;
  // Status specific
  includeStorageInfo?: boolean;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Unified cache persistence management.
 *
 * Routes persistence operations (enable, disable, status) to specialized
 * handlers while maintaining modular code organization.
 *
 * @param args Persistence operation and parameters
 * @returns Tool result with operation status
 * @throws McpError for invalid operation or execution failure
 */
export async function persistenceTool(args: any) {
  const typedArgs = args as PersistenceToolArgs;

  try {
    return await routeOperation(typedArgs);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `persistence failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// OPERATION ROUTING
// ============================================================================

/**
 * Route persistence operation to appropriate handler based on operation type.
 *
 * Each operation validates its required parameters and delegates to
 * specialized implementation for execution.
 */
async function routeOperation(args: PersistenceToolArgs) {
  const { operation } = args;

  switch (operation) {
    case 'enable':
      if (!args.cacheDir) {
        throw new McpError(ErrorCode.InvalidRequest, 'cacheDir is required for enable operation');
      }
      return persistenceEnableTool({ cacheDir: args.cacheDir });
    case 'disable':
      return persistenceDisableTool({ clearData: args.clearData ?? false });
    case 'status':
      return persistenceStatusTool({ includeStorageInfo: args.includeStorageInfo ?? true });
    default:
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown operation: ${operation}. Valid operations: enable, disable, status`
      );
  }
}

// ============================================================================
// DOCUMENTATION
// ============================================================================

export const PERSISTENCE_DOCS = `
# persistence

Unified cache persistence management - enable, disable, check status.

## Overview

Single tool for persistence configuration. Routes to specialized handlers while maintaining clean operation semantics.

## Operations

### enable

Enable cache persistence to disk.

**Parameters:**
- \`cacheDir\` (string, optional): Custom cache directory path

**Example:**
\`\`\`typescript
await persistenceTool({
  operation: 'enable',
  cacheDir: '/path/to/cache'
})
\`\`\`

**Notes:**
Persists cache data across sessions. Useful for long-running projects or CI environments.

---

### disable

Disable cache persistence.

**Parameters:**
- \`clearData\` (boolean, optional): Clear existing persistent data on disable

**Example:**
\`\`\`typescript
await persistenceTool({
  operation: 'disable',
  clearData: true
})
\`\`\`

---

### status

Check persistence status.

**Parameters:**
- \`includeStorageInfo\` (boolean, optional): Include storage usage details

**Example:**
\`\`\`typescript
await persistenceTool({
  operation: 'status',
  includeStorageInfo: true
})
\`\`\`

**Returns:**
Persistence status (enabled/disabled), cache directory path, and optional storage information.

---

## When to Use

**Enable persistence:**
- Long-running projects that benefit from cross-session cache
- CI/CD environments where cache survives across builds
- Development workflows where build history is valuable

**Disable persistence:**
- Temporary debugging sessions
- Testing with clean cache state
- Clearing sensitive cached information

## Related Tools

- \`cache\`: Cache management and configuration
`;

export const PERSISTENCE_DOCS_MINI =
  'Manage cache persistence (enable/disable/status). Use rtfm({ toolName: "persistence" }) for docs.';
