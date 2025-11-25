import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { idbTargetsTool } from '../targets.js';
import { idbConnectTool } from '../connect.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface IdbTargetsToolArgs {
  operation: 'list' | 'describe' | 'focus' | 'connect' | 'disconnect';
  udid?: string;
  state?: 'Booted' | 'Shutdown';
  type?: 'device' | 'simulator';
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Unified IDB target management - discover, describe, focus, and manage connections.
 *
 * Routes IDB operations (list, describe, focus, connect, disconnect) to specialized
 * handlers while maintaining modular code organization.
 *
 * @param args Target operation and parameters
 * @returns Tool result with operation status
 * @throws McpError for invalid operation or execution failure
 */
export async function idbTargetsRouter(args: any) {
  const typedArgs = args as IdbTargetsToolArgs;

  try {
    return await routeOperation(typedArgs);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `idb-targets failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// OPERATION ROUTING
// ============================================================================

/**
 * Route IDB target operation to appropriate handler based on operation type.
 *
 * Discovery operations (list, describe, focus) are routed to idbTargetsTool.
 * Connection operations (connect, disconnect) are routed to idbConnectTool.
 */
async function routeOperation(args: IdbTargetsToolArgs) {
  const { operation } = args;

  switch (operation) {
    case 'list':
      return idbTargetsTool({ operation: 'list', state: args.state, type: args.type });
    case 'describe':
      return idbTargetsTool({ operation: 'describe', udid: args.udid });
    case 'focus':
      return idbTargetsTool({ operation: 'focus', udid: args.udid });
    case 'connect':
      return idbConnectTool({ udid: args.udid, operation: 'connect' });
    case 'disconnect':
      return idbConnectTool({ udid: args.udid, operation: 'disconnect' });
    default:
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown operation: ${operation}. Valid operations: list, describe, focus, connect, disconnect`
      );
  }
}

// ============================================================================
// DOCUMENTATION
// ============================================================================

export const IDB_TARGETS_DOCS = `
# idb-targets

Unified IDB target management - discover, inspect, focus, and manage connections.

## Overview

Single tool for IDB target discovery and connection management. Routes to specialized handlers while maintaining clean operation semantics.

## Operations

### list

List all available IDB targets.

**Parameters:**
- \`state\` (string, optional): Filter by state - 'Booted' or 'Shutdown'
- \`type\` (string, optional): Filter by type - 'device' or 'simulator'

**Example:**
\`\`\`typescript
await idbTargetsToolUnified({
  operation: 'list',
  state: 'Booted'
})
\`\`\`

**Returns:**
List of targets with metadata, state, and type information.

---

### describe

Get detailed information about a specific target.

**Parameters:**
- \`udid\` (string): Target UDID

**Example:**
\`\`\`typescript
await idbTargetsToolUnified({
  operation: 'describe',
  udid: 'ABC-123-DEF'
})
\`\`\`

**Returns:**
Detailed target information including screen dimensions, device model, iOS version.

---

### focus

Focus simulator window for interactive testing.

**Parameters:**
- \`udid\` (string): Simulator UDID

**Example:**
\`\`\`typescript
await idbTargetsToolUnified({
  operation: 'focus',
  udid: 'ABC-123-DEF'
})
\`\`\`

---

### connect

Establish IDB companion connection to target.

**Parameters:**
- \`udid\` (string, optional): Target UDID - auto-detects if omitted

**Example:**
\`\`\`typescript
await idbTargetsToolUnified({
  operation: 'connect',
  udid: 'ABC-123-DEF'
})
\`\`\`

**Notes:**
Establishes persistent gRPC connection for faster subsequent operations. Useful for warming up connections before automated testing.

---

### disconnect

Close IDB companion connection to target.

**Parameters:**
- \`udid\` (string, optional): Target UDID

**Example:**
\`\`\`typescript
await idbTargetsToolUnified({
  operation: 'disconnect',
  udid: 'ABC-123-DEF'
})
\`\`\`

---

## Related Tools

- \`idb-app\`: App management on IDB targets
- \`idb-ui-tap\`, \`idb-ui-input\`, \`idb-ui-gesture\`: UI automation on targets
`;

export const IDB_TARGETS_DOCS_MINI =
  'Manage IDB targets (list/describe/connect). Use rtfm({ toolName: "idb-targets" }) for docs.';
