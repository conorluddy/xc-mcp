import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { simctlInstallTool } from '../install.js';
import { simctlUninstallTool } from '../uninstall.js';
import { simctlLaunchTool } from '../launch.js';
import { simctlTerminateTool } from '../terminate.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface SimctlAppToolArgs {
  operation: 'install' | 'uninstall' | 'launch' | 'terminate';
  // Common
  udid?: string;
  bundleId?: string;
  // Install
  appPath?: string;
  // Launch
  arguments?: string[];
  environment?: Record<string, string>;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Unified app lifecycle management on simulators.
 *
 * Routes app operations (install, uninstall, launch, terminate) to specialized
 * handlers while maintaining modular code organization.
 *
 * @param args App operation and parameters
 * @returns Tool result with operation status
 * @throws McpError for invalid operation or execution failure
 */
export async function simctlAppTool(args: any) {
  const typedArgs = args as SimctlAppToolArgs;

  try {
    return await routeOperation(typedArgs);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-app failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// OPERATION ROUTING
// ============================================================================

/**
 * Route app operation to appropriate handler based on operation type.
 *
 * Each operation validates its required parameters and delegates to
 * specialized implementation for execution.
 */
async function routeOperation(args: SimctlAppToolArgs) {
  const { operation } = args;

  switch (operation) {
    case 'install':
      if (!args.appPath) {
        throw new McpError(ErrorCode.InvalidRequest, 'appPath is required for install operation');
      }
      return simctlInstallTool({ udid: args.udid, appPath: args.appPath });
    case 'uninstall':
      if (!args.bundleId) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'bundleId is required for uninstall operation'
        );
      }
      return simctlUninstallTool({ udid: args.udid, bundleId: args.bundleId });
    case 'launch':
      if (!args.bundleId) {
        throw new McpError(ErrorCode.InvalidRequest, 'bundleId is required for launch operation');
      }
      return simctlLaunchTool({
        udid: args.udid,
        bundleId: args.bundleId,
        arguments: args.arguments,
        environment: args.environment,
      });
    case 'terminate':
      if (!args.bundleId) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          'bundleId is required for terminate operation'
        );
      }
      return simctlTerminateTool({ udid: args.udid, bundleId: args.bundleId });
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

export const SIMCTL_APP_DOCS = `
# simctl-app

Unified iOS app lifecycle management - install, uninstall, launch, terminate.

## Overview

Single tool for app management on simulators. Routes to specialized handlers while maintaining clean operation semantics.

## Operations

### install

Install iOS app to simulator.

**Parameters:**
- \`udid\` (string): Simulator UDID (from simctl-list)
- \`appPath\` (string): Path to .app bundle

**Example:**
\`\`\`typescript
await simctlAppTool({
  operation: 'install',
  udid: 'ABC-123-DEF',
  appPath: '/path/to/MyApp.app'
})
\`\`\`

---

### uninstall

Uninstall iOS app from simulator.

**Parameters:**
- \`udid\` (string): Simulator UDID
- \`bundleId\` (string): App bundle ID (e.g., com.example.MyApp)

**Example:**
\`\`\`typescript
await simctlAppTool({
  operation: 'uninstall',
  udid: 'ABC-123-DEF',
  bundleId: 'com.example.MyApp'
})
\`\`\`

---

### launch

Launch iOS app on simulator.

**Parameters:**
- \`udid\` (string): Simulator UDID
- \`bundleId\` (string): App bundle ID
- \`arguments\` (string[], optional): Command-line arguments
- \`environment\` (object, optional): Environment variables

**Example:**
\`\`\`typescript
await simctlAppTool({
  operation: 'launch',
  udid: 'ABC-123-DEF',
  bundleId: 'com.example.MyApp',
  arguments: ['--verbose'],
  environment: { 'DEBUG': '1' }
})
\`\`\`

---

### terminate

Terminate running iOS app on simulator.

**Parameters:**
- \`udid\` (string): Simulator UDID
- \`bundleId\` (string): App bundle ID

**Example:**
\`\`\`typescript
await simctlAppTool({
  operation: 'terminate',
  udid: 'ABC-123-DEF',
  bundleId: 'com.example.MyApp'
})
\`\`\`

---

## Related Tools

- \`simctl-device\`: Boot/shutdown simulators
- \`simctl-list\`: Discover simulators and their UDIDs
- \`idb-app\`: IDB-based app management
`;

export const SIMCTL_APP_DOCS_MINI =
  'Manage apps on simulators (install/launch/etc). Use rtfm({ toolName: "simctl-app" }) for docs.';
