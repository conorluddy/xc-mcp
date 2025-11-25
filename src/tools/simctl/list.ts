import type { OutputFormat } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  simulatorCache,
  type CachedSimulatorList,
  type SimulatorInfo,
} from '../../state/simulator-cache.js';
import {
  responseCache,
  extractSimulatorSummary,
  createProgressiveSimulatorResponse,
} from '../../utils/response-cache.js';

interface SimctlListArgs {
  deviceType?: string;
  runtime?: string;
  availability?: 'available' | 'unavailable' | 'all';
  outputFormat?: OutputFormat;
  concise?: boolean;
  max?: number;
}

/**
 * List iOS simulators with intelligent progressive disclosure and caching
 *
 * **What it does:**
 * Retrieves comprehensive simulator information including devices, runtimes, and device types.
 * Returns concise summaries by default with cache IDs for progressive access to full details,
 * preventing token overflow while maintaining complete functionality.
 *
 * **Why you'd use it:**
 * - Prevents token overflow with 10k+ device lists via progressive disclosure
 * - Shows booted devices and recently used simulators first for faster workflows
 * - 1-hour intelligent caching eliminates redundant queries
 * - Provides smart filtering by device type, runtime, and availability
 * - Limits full output to most recently used devices for efficient browsing
 *
 * **Parameters:**
 * - `deviceType` (string, optional): Filter by device type (e.g., "iPhone", "iPad")
 * - `runtime` (string, optional): Filter by iOS runtime version (e.g., "17", "iOS 17.0")
 * - `availability` (string, optional): Filter by availability ("available", "unavailable", "all")
 * - `outputFormat` (string, optional): Output format ("json" or "text")
 * - `concise` (boolean, optional): Return concise summary with cache ID (default: true)
 * - `max` (number, optional): Maximum devices to return in full mode (default: 5, sorted by lastUsed)
 *
 * **Returns:**
 * - Concise mode: Summary with cacheId for detailed retrieval via simctl-get-details
 * - Full mode: Limited device list (default 5 most recently used) with metadata about limiting
 *
 * **Example:**
 * ```typescript
 * // Get concise summary (default - prevents token overflow)
 * await simctlListTool({})
 *
 * // Get full list for iPhone devices (limited to 5 most recent)
 * await simctlListTool({ deviceType: "iPhone", concise: false })
 *
 * // Get full list with custom limit
 * await simctlListTool({ concise: false, max: 10 })
 *
 * // Filter by iOS version
 * await simctlListTool({ runtime: "17.0" })
 * ```
 *
 * **Full documentation:** See simctl/list.md for detailed parameters and progressive disclosure
 *
 * @param args Tool arguments including optional filters, format, and max device limit
 * @returns Tool result with simulator list or summary with cache ID
 */
export async function simctlListTool(args: any) {
  const {
    deviceType,
    runtime,
    availability = 'available',
    outputFormat = 'json',
    concise = true,
    max = 5,
  } = args as SimctlListArgs;

  try {
    // Use the new caching system
    const cachedList = await simulatorCache.getSimulatorList();

    let responseData: Record<string, unknown> | string;

    // Use progressive disclosure by default (concise=true)
    if (concise && outputFormat === 'json') {
      // Generate concise summary
      const summary = extractSimulatorSummary(cachedList);

      // Store full output in response cache
      const cacheId = responseCache.store({
        tool: 'simctl-list',
        fullOutput: JSON.stringify(cachedList, null, 2),
        stderr: '',
        exitCode: 0,
        command: 'simctl list -j',
        metadata: {
          totalDevices: summary.totalDevices,
          availableDevices: summary.availableDevices,
          hasFilters: !!(deviceType || runtime || availability !== 'available'),
        },
      });

      // Return progressive disclosure response
      responseData = createProgressiveSimulatorResponse(summary, cacheId, {
        deviceType,
        runtime,
        availability,
      });
    } else {
      // Legacy mode: return full filtered list with device limiting
      if (outputFormat === 'json') {
        // Apply filters if specified
        const filteredList = filterCachedSimulatorList(cachedList, {
          deviceType,
          runtime,
          availability,
        });

        // Limit devices to max count, sorted by lastUsed date
        const allDevices: Array<{ runtime: string; device: SimulatorInfo }> = [];
        for (const [runtimeKey, devices] of Object.entries(filteredList.devices)) {
          devices.forEach(device => {
            allDevices.push({ runtime: runtimeKey, device });
          });
        }

        // Sort by lastUsed date descending (most recent first), nulls at end
        allDevices.sort((a, b) => {
          if (!a.device.lastUsed && !b.device.lastUsed) return 0;
          if (!a.device.lastUsed) return 1;
          if (!b.device.lastUsed) return -1;
          return b.device.lastUsed.getTime() - a.device.lastUsed.getTime();
        });

        // Take first max devices
        const limitedDevices = allDevices.slice(0, max);

        // Reconstruct grouped structure with limited devices
        const limitedDevicesByRuntime: { [runtime: string]: SimulatorInfo[] } = {};
        for (const { runtime: runtimeKey, device } of limitedDevices) {
          if (!limitedDevicesByRuntime[runtimeKey]) {
            limitedDevicesByRuntime[runtimeKey] = [];
          }
          limitedDevicesByRuntime[runtimeKey].push(device);
        }

        responseData = {
          devices: limitedDevicesByRuntime,
          runtimes: filteredList.runtimes,
          devicetypes: filteredList.devicetypes,
          lastUpdated: filteredList.lastUpdated.toISOString(),
          metadata: {
            totalDevicesInCache: Object.values(filteredList.devices).flat().length,
            devicesReturned: limitedDevices.length,
            limitApplied: max,
          },
        };
      } else {
        // For text format, we need to convert back to original format
        responseData =
          `Simulator List (cached at ${cachedList.lastUpdated.toISOString()}):\n` +
          JSON.stringify(cachedList, null, 2);
      }
    }

    const responseText =
      outputFormat === 'json'
        ? JSON.stringify(responseData, null, 2)
        : typeof responseData === 'string'
          ? responseData
          : JSON.stringify(responseData, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-list failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function filterCachedSimulatorList(
  list: CachedSimulatorList,
  filters: {
    deviceType?: string;
    runtime?: string;
    availability?: string;
  }
): CachedSimulatorList {
  const filtered: CachedSimulatorList = {
    devices: {},
    runtimes: list.runtimes,
    devicetypes: list.devicetypes,
    lastUpdated: list.lastUpdated,
    preferredByProject: list.preferredByProject,
  };

  // Filter device types if specified
  if (filters.deviceType) {
    filtered.devicetypes = list.devicetypes.filter(dt =>
      dt.name.toLowerCase().includes(filters.deviceType!.toLowerCase())
    );
  }

  // Filter runtimes if specified
  if (filters.runtime) {
    filtered.runtimes = list.runtimes.filter(
      rt =>
        rt.name.toLowerCase().includes(filters.runtime!.toLowerCase()) ||
        rt.version.includes(filters.runtime!)
    );
  }

  // Filter devices
  for (const [runtimeKey, devices] of Object.entries(list.devices)) {
    // Skip runtime if it doesn't match filter
    if (filters.runtime && !runtimeKey.toLowerCase().includes(filters.runtime.toLowerCase())) {
      continue;
    }

    const filteredDevices = devices.filter(device => {
      // Filter by device type
      if (
        filters.deviceType &&
        !device.name.toLowerCase().includes(filters.deviceType.toLowerCase())
      ) {
        return false;
      }

      // Filter by availability
      if (filters.availability === 'available' && !device.isAvailable) {
        return false;
      }
      if (filters.availability === 'unavailable' && device.isAvailable) {
        return false;
      }

      return true;
    });

    if (filteredDevices.length > 0) {
      filtered.devices[runtimeKey] = filteredDevices;
    }
  }

  return filtered;
}

export const SIMCTL_LIST_DOCS = `
# simctl-list

List iOS simulators with intelligent progressive disclosure and caching.

## Overview

Retrieves comprehensive simulator information including devices, runtimes, and device types. Returns concise summaries by default with cache IDs for progressive access to full details, preventing token overflow while maintaining complete functionality. Shows booted devices and recently used simulators first for faster workflows. Full output mode limits results to the most recently used devices for efficient browsing.

## Parameters

### Required
None - all parameters are optional

### Optional
- **deviceType** (string): Filter by device type (e.g., "iPhone", "iPad")
- **runtime** (string): Filter by iOS runtime version (e.g., "17", "iOS 17.0")
- **availability** (string, default: "available"): Filter by availability ("available", "unavailable", "all")
- **outputFormat** (string, default: "json"): Output format ("json" or "text")
- **concise** (boolean, default: true): Return concise summary with cache ID
- **max** (number, default: 5): Maximum devices to return in full mode, sorted by lastUsed date (most recent first)

## Returns

- Concise mode: Summary with cacheId for detailed retrieval via simctl-get-details
- Full mode: Limited device list (default 5 most recently used) with metadata showing total available and limit applied

## Device Limiting in Full Mode

When \`concise: false\`, the response includes:
- **devices**: Top N devices across all runtimes, sorted by lastUsed date (most recent first)
- **metadata**: Shows total devices in cache, devices returned, and limit applied
- Devices without lastUsed date are placed at the end
- Total limit applies across all runtimes, not per-runtime

## Examples

### Get concise summary (default - prevents token overflow)
\`\`\`typescript
await simctlListTool({});
\`\`\`

### Get full list for iPhone devices (limited to 5 most recent)
\`\`\`typescript
await simctlListTool({
  deviceType: "iPhone",
  concise: false
});
\`\`\`

### Get full list with custom device limit
\`\`\`typescript
await simctlListTool({
  concise: false,
  max: 10
});
\`\`\`

### Filter by iOS version
\`\`\`typescript
await simctlListTool({ runtime: "17.0" });
\`\`\`

## Related Tools

- simctl-get-details: Retrieve full device list using cache ID (bypasses max limit)
- simctl-device: Boot, shutdown, or manage specific simulators
- simctl-app: Install and launch apps on simulators

## Notes

- Prevents token overflow (raw output = 10k+ tokens) via concise summaries and device limiting
- Default max=5 limits output to ~2.5k tokens (90% reduction from full 50-device list)
- 1-hour intelligent caching eliminates redundant queries
- Shows booted devices and recently used simulators first in concise mode
- Use simctl-get-details with cacheId for progressive access to full data (ignores max limit)
- Device sorting: mostRecent (with lastUsed) → oldest (with lastUsed) → unknown (no lastUsed)
- Smart filtering by device type, runtime, and availability
- Essential: Use this instead of 'xcrun simctl list' for better performance
`;

export const SIMCTL_LIST_DOCS_MINI =
  'List iOS simulators with caching. Use rtfm({ toolName: "simctl-list" }) for docs.';
