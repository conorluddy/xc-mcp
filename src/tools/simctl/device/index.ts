import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { simctlBootTool } from '../boot.js';
import { simctlShutdownTool } from '../shutdown.js';
import { simctlCreateTool } from '../create.js';
import { simctlDeleteTool } from '../delete.js';
import { simctlEraseTool } from '../erase.js';
import { simctlCloneTool } from '../clone.js';
import { simctlRenameTool } from '../rename.js';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface SimctlDeviceToolArgs {
  operation: 'boot' | 'shutdown' | 'create' | 'delete' | 'erase' | 'clone' | 'rename';
  // Boot/Shutdown/Delete/Erase
  deviceId?: string;
  // Boot
  waitForBoot?: boolean;
  openGui?: boolean;
  // Create
  name?: string;
  deviceType?: string;
  runtime?: string;
  // Erase
  force?: boolean;
  // Clone/Rename
  newName?: string;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Unified iOS simulator device management tool.
 *
 * Routes device operations (boot, shutdown, create, delete, erase, clone, rename)
 * to specialized handlers while maintaining modular code organization.
 *
 * @param args Device operation and parameters
 * @returns Tool result with operation status
 * @throws McpError for invalid operation or execution failure
 */
export async function simctlDeviceTool(args: any) {
  const typedArgs = args as SimctlDeviceToolArgs;

  try {
    return await routeOperation(typedArgs);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-device failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// OPERATION ROUTING
// ============================================================================

/**
 * Route device operation to appropriate handler based on operation type.
 *
 * Each operation type has its own validation and execution logic.
 * This router ensures consistent error handling and parameter passing.
 */
async function routeOperation(args: SimctlDeviceToolArgs) {
  const { operation } = args;

  switch (operation) {
    case 'boot':
      if (!args.deviceId) {
        throw new McpError(ErrorCode.InvalidRequest, 'deviceId is required for boot operation');
      }
      return simctlBootTool({
        deviceId: args.deviceId,
        waitForBoot: args.waitForBoot,
        openGui: args.openGui,
      });
    case 'shutdown':
      if (!args.deviceId) {
        throw new McpError(ErrorCode.InvalidRequest, 'deviceId is required for shutdown operation');
      }
      return simctlShutdownTool({ deviceId: args.deviceId });
    case 'create':
      if (!args.name) {
        throw new McpError(ErrorCode.InvalidRequest, 'name is required for create operation');
      }
      if (!args.deviceType) {
        throw new McpError(ErrorCode.InvalidRequest, 'deviceType is required for create operation');
      }
      if (!args.runtime) {
        throw new McpError(ErrorCode.InvalidRequest, 'runtime is required for create operation');
      }
      return simctlCreateTool({
        name: args.name,
        deviceType: args.deviceType,
        runtime: args.runtime,
      });
    case 'delete':
      if (!args.deviceId) {
        throw new McpError(ErrorCode.InvalidRequest, 'deviceId is required for delete operation');
      }
      return simctlDeleteTool({ deviceId: args.deviceId });
    case 'erase':
      if (!args.deviceId) {
        throw new McpError(ErrorCode.InvalidRequest, 'deviceId is required for erase operation');
      }
      return simctlEraseTool({ deviceId: args.deviceId, force: args.force });
    case 'clone':
      if (!args.deviceId) {
        throw new McpError(ErrorCode.InvalidRequest, 'deviceId is required for clone operation');
      }
      if (!args.newName) {
        throw new McpError(ErrorCode.InvalidRequest, 'newName is required for clone operation');
      }
      return simctlCloneTool({ deviceId: args.deviceId, newName: args.newName });
    case 'rename':
      if (!args.deviceId) {
        throw new McpError(ErrorCode.InvalidRequest, 'deviceId is required for rename operation');
      }
      if (!args.newName) {
        throw new McpError(ErrorCode.InvalidRequest, 'newName is required for rename operation');
      }
      return simctlRenameTool({ deviceId: args.deviceId, newName: args.newName });
    default:
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown operation: ${operation}. Valid operations: boot, shutdown, create, delete, erase, clone, rename`
      );
  }
}

// ============================================================================
// DOCUMENTATION
// ============================================================================

export const SIMCTL_DEVICE_DOCS = `
# simctl-device

Unified iOS simulator device management - boot, shutdown, create, delete, erase, clone, rename.

## Overview

Single tool for all simulator device lifecycle operations. Routes to specialized handlers while maintaining clean operation semantics.

## Complete JSON Examples

### Boot a Simulator
\`\`\`json
{"operation": "boot", "deviceId": "ABCD1234-5678-90EF-GHIJ-KLMNOPQRSTUV", "waitForBoot": true, "openGui": true}
\`\`\`

### Shutdown Running Simulator
\`\`\`json
{"operation": "shutdown", "deviceId": "booted"}
\`\`\`

### Create New Simulator
\`\`\`json
{"operation": "create", "name": "Test iPhone 16", "deviceType": "iPhone 16 Pro", "runtime": "iOS-18-0"}
\`\`\`

### Delete Simulator
\`\`\`json
{"operation": "delete", "deviceId": "ABCD1234-5678-90EF-GHIJ-KLMNOPQRSTUV"}
\`\`\`

### Factory Reset (Erase)
\`\`\`json
{"operation": "erase", "deviceId": "simulator-udid", "force": true}
\`\`\`

### Clone Simulator
\`\`\`json
{"operation": "clone", "deviceId": "source-udid", "newName": "Snapshot Before Tests"}
\`\`\`

### Rename Simulator
\`\`\`json
{"operation": "rename", "deviceId": "simulator-udid", "newName": "My Test Device"}
\`\`\`

## Operations

### boot

Boot iOS simulator device with performance tracking.

**Parameters:**
- \`deviceId\` (string): Device UDID, "booted" for current, or "all"
- \`waitForBoot\` (boolean, default: true): Wait for device to finish booting
- \`openGui\` (boolean, default: true): Open Simulator.app GUI

**Example:**
\`\`\`typescript
await simctlDeviceTool({ operation: 'boot', deviceId: 'ABC-123-DEF' })
\`\`\`

---

### shutdown

Shutdown iOS simulator devices.

**Parameters:**
- \`deviceId\` (string): Device UDID, "booted" for all booted devices, or "all"

**Example:**
\`\`\`typescript
await simctlDeviceTool({ operation: 'shutdown', deviceId: 'ABC-123-DEF' })
\`\`\`

---

### create

Create new iOS simulator device.

**Parameters:**
- \`name\` (string): Display name for new simulator
- \`deviceType\` (string): Device type (e.g., "iPhone 16 Pro")
- \`runtime\` (string, optional): iOS version - defaults to latest

**Example:**
\`\`\`typescript
await simctlDeviceTool({ operation: 'create', name: 'TestDevice', deviceType: 'iPhone 16 Pro' })
\`\`\`

---

### delete

Permanently delete iOS simulator device.

**Parameters:**
- \`deviceId\` (string): Device UDID to delete

**Example:**
\`\`\`typescript
await simctlDeviceTool({ operation: 'delete', deviceId: 'ABC-123-DEF' })
\`\`\`

---

### erase

Reset simulator to factory settings.

**Parameters:**
- \`deviceId\` (string): Device UDID to erase
- \`force\` (boolean, optional): Force erase even if booted

**Example:**
\`\`\`typescript
await simctlDeviceTool({ operation: 'erase', deviceId: 'ABC-123-DEF' })
\`\`\`

---

### clone

Clone simulator with complete state preservation.

**Parameters:**
- \`deviceId\` (string): Source device UDID
- \`newName\` (string): Name for cloned simulator

**Example:**
\`\`\`typescript
await simctlDeviceTool({ operation: 'clone', deviceId: 'ABC-123-DEF', newName: 'Snapshot' })
\`\`\`

---

### rename

Rename simulator device.

**Parameters:**
- \`deviceId\` (string): Device UDID to rename
- \`newName\` (string): New display name

**Example:**
\`\`\`typescript
await simctlDeviceTool({ operation: 'rename', deviceId: 'ABC-123-DEF', newName: 'Production' })
\`\`\`

---

## Related Tools

- \`simctl-list\`: Discover simulators and their UDIDs
- \`simctl-app\`: Install and launch apps on devices
- \`simctl-io\`: Take screenshots and record videos
`;

export const SIMCTL_DEVICE_DOCS_MINI =
  'Manage simulator lifecycle (boot/shutdown/create/etc). Use rtfm({ toolName: "simctl-device" }) for docs.';
