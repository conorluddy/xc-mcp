import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { idbInstallTool } from '../install.js';
import { idbUninstallTool } from '../uninstall.js';
import { idbLaunchTool } from '../launch.js';
import { idbTerminateTool } from '../terminate.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface IdbAppToolArgs {
  operation: 'install' | 'uninstall' | 'launch' | 'terminate';
  // Common
  udid?: string;
  bundleId?: string;
  // Install
  appPath?: string;
  // Launch
  arguments?: string[];
  environment?: Record<string, string>;
  streamOutput?: boolean;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Unified IDB app lifecycle management.
 *
 * Routes IDB app operations (install, uninstall, launch, terminate) to
 * specialized handlers while maintaining modular code organization.
 *
 * @param args App operation and parameters
 * @returns Tool result with operation status
 * @throws McpError for invalid operation or execution failure
 */
export async function idbAppTool(args: any) {
  const typedArgs = args as IdbAppToolArgs;

  try {
    return await routeOperation(typedArgs);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `idb-app failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// OPERATION ROUTING
// ============================================================================

/**
 * Route IDB app operation to appropriate handler based on operation type.
 *
 * Each operation validates its required parameters and delegates to
 * specialized implementation for execution.
 */
async function routeOperation(args: IdbAppToolArgs) {
  const { operation } = args;

  switch (operation) {
    case 'install':
      if (!args.appPath) {
        throw new McpError(ErrorCode.InvalidRequest, 'appPath is required for install operation');
      }
      return idbInstallTool({ appPath: args.appPath, udid: args.udid });
    case 'uninstall':
      if (!args.bundleId) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'bundleId is required for uninstall operation'
        );
      }
      return idbUninstallTool({ bundleId: args.bundleId, udid: args.udid });
    case 'launch':
      if (!args.bundleId) {
        throw new McpError(ErrorCode.InvalidRequest, 'bundleId is required for launch operation');
      }
      return idbLaunchTool({
        bundleId: args.bundleId,
        udid: args.udid,
        arguments: args.arguments,
        environment: args.environment,
        streamOutput: args.streamOutput,
      });
    case 'terminate':
      if (!args.bundleId) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'bundleId is required for terminate operation'
        );
      }
      return idbTerminateTool({ bundleId: args.bundleId, udid: args.udid });
    default:
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown operation: ${operation}. Valid operations: install, uninstall, launch, terminate`
      );
  }
}

// ============================================================================
// DOCUMENTATION
// ============================================================================

export const IDB_APP_DOCS = `
# idb-app

Unified IDB app lifecycle management - install, uninstall, launch, terminate.

## Overview

Single tool for IDB-based app management. Routes to specialized handlers while maintaining clean operation semantics.

## Operations

### install

Install iOS app via IDB.

**Parameters:**
- \`appPath\` (string): Path to .app bundle
- \`udid\` (string, optional): Target device UDID

**Example:**
\`\`\`typescript
await idbAppTool({
  operation: 'install',
  appPath: '/path/to/MyApp.app'
})
\`\`\`

---

### uninstall

Uninstall iOS app via IDB.

**Parameters:**
- \`bundleId\` (string): App bundle ID
- \`udid\` (string, optional): Target device UDID

**Example:**
\`\`\`typescript
await idbAppTool({
  operation: 'uninstall',
  bundleId: 'com.example.MyApp'
})
\`\`\`

---

### launch

Launch iOS app via IDB.

**Parameters:**
- \`bundleId\` (string): App bundle ID
- \`udid\` (string, optional): Target device UDID
- \`arguments\` (string[], optional): Command-line arguments
- \`environment\` (object, optional): Environment variables
- \`streamOutput\` (boolean, optional): Stream app output

**Example:**
\`\`\`typescript
await idbAppTool({
  operation: 'launch',
  bundleId: 'com.example.MyApp',
  arguments: ['--debug'],
  streamOutput: true
})
\`\`\`

---

### terminate

Terminate running iOS app via IDB.

**Parameters:**
- \`bundleId\` (string): App bundle ID
- \`udid\` (string, optional): Target device UDID

**Example:**
\`\`\`typescript
await idbAppTool({
  operation: 'terminate',
  bundleId: 'com.example.MyApp'
})
\`\`\`

---

## Related Tools

- \`idb-targets\`: List and manage IDB targets
- \`idb-ui-tap\`, \`idb-ui-input\`, \`idb-ui-gesture\`: UI automation
- \`simctl-app\`: Simctl-based app management
`;
