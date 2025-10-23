import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand, buildSimctlCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlCreateToolArgs {
  name: string;
  deviceType: string;
  runtime?: string;
}

/**
 * Create a new iOS simulator device
 *
 * Examples:
 * - Create iPhone 16 Pro with latest iOS:
 *   name: "MyTestDevice", deviceType: "iPhone 16 Pro"
 *
 * - Create iPad with specific iOS version:
 *   name: "TestPad", deviceType: "iPad Pro (6th generation)", runtime: "17.0"
 *
 * Device type identifiers:
 * - iPhone models: "iPhone 16 Pro", "iPhone 16", "iPhone 15 Pro", etc.
 * - iPad models: "iPad Pro (12.9-inch)", "iPad (10th generation)", etc.
 * - Apple Watch: "Apple Watch Series 9 (45mm)", etc.
 * - Apple TV: "Apple TV 4K (3rd generation)", etc.
 *
 * Use simctl-list to see available device types and runtimes.
 */
export async function simctlCreateTool(args: any) {
  const { name, deviceType, runtime } = args as SimctlCreateToolArgs;

  try {
    // Validate inputs
    if (!name || name.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Device name is required and cannot be empty'
      );
    }

    if (!deviceType || deviceType.trim().length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Device type is required (e.g., "iPhone 16 Pro")'
      );
    }

    // Get device type identifier
    const simulatorList = await simulatorCache.getSimulatorList();
    const deviceTypeId = findDeviceTypeId(
      deviceType,
      simulatorList.devicetypes
    );

    if (!deviceTypeId) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Device type "${deviceType}" not found. Use simctl-list to see available types.`
      );
    }

    // Get runtime identifier if specified
    let runtimeId: string | undefined = undefined;
    if (runtime) {
      runtimeId = findRuntimeId(runtime, simulatorList.runtimes);
      if (!runtimeId) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Runtime "${runtime}" not found. Use simctl-list to see available runtimes.`
        );
      }
    } else {
      // Use latest available runtime
      const latestRuntime = simulatorList.runtimes.filter(r =>
        r.isAvailable
      ).sort((a, b) => {
        const aVersion = parseVersion(a.version);
        const bVersion = parseVersion(b.version);
        return bVersion - aVersion;
      })[0];

      if (latestRuntime) {
        runtimeId = latestRuntime.identifier;
      }
    }

    // Build create command
    let createCommand = `xcrun simctl create "${name}" "${deviceTypeId}"`;
    if (runtimeId) {
      createCommand += ` "${runtimeId}"`;
    }

    console.error(`[simctl-create] Executing: ${createCommand}`);

    // Execute create command
    const result = await executeCommand(createCommand, {
      timeout: 30000, // 30 seconds to create device
    });

    const success = result.code === 0;

    if (!success && result.stderr.includes('already exists')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Simulator named "${name}" already exists`
      );
    }

    // Extract UDID from output
    const udid = success ? result.stdout.trim() : null;

    // Invalidate simulator list cache so next call sees new device
    if (success) {
      simulatorCache.clearCache();
    }

    const responseData = {
      success,
      name,
      deviceType,
      runtime: runtime || 'latest available',
      udid: success ? udid : undefined,
      command: createCommand,
      output: result.stdout,
      error: result.stderr || undefined,
      exitCode: result.code,
      guidance: success
        ? [
            `Simulator "${name}" created successfully with UDID: ${udid}`,
            `Boot device: simctl-boot ${udid}`,
            `Delete device: simctl-delete ${udid}`,
            `Erase device: simctl-erase ${udid}`,
          ]
        : [
            `Failed to create simulator: ${result.stderr || 'Unknown error'}`,
            `Check device type with: simctl-list --device-type`,
            `Check runtimes with: simctl-list --runtime`,
          ],
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: !success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-create failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Find device type identifier from display name
 */
function findDeviceTypeId(
  displayName: string,
  deviceTypes: any[]
): string | null {
  // Try exact match first
  const exact = deviceTypes.find(
    dt => dt.name.toLowerCase() === displayName.toLowerCase()
  );
  if (exact) return exact.identifier;

  // Try partial match
  const partial = deviceTypes.find(dt =>
    dt.name.toLowerCase().includes(displayName.toLowerCase())
  );
  if (partial) return partial.identifier;

  return null;
}

/**
 * Find runtime identifier from version string
 */
function findRuntimeId(versionStr: string, runtimes: any[]): string | undefined {
  // Try exact match
  const exact = runtimes.find(
    r =>
      r.version === versionStr ||
      r.identifier === versionStr ||
      r.name.toLowerCase() === versionStr.toLowerCase()
  );
  if (exact) return exact.identifier;

  // Try partial match on version
  const partial = runtimes.find(r =>
    r.version.includes(versionStr) || r.name.includes(versionStr)
  );
  if (partial) return partial.identifier;

  return undefined;
}

/**
 * Parse version string to number for comparison
 */
function parseVersion(versionStr: string): number {
  const match = versionStr.match(/(\d+)\.(\d+)/);
  if (match) {
    return parseInt(match[1], 10) * 100 + parseInt(match[2], 10);
  }
  return 0;
}
