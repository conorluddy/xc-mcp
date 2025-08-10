import type { OutputFormat } from '../../types/xcode.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { simulatorCache, type CachedSimulatorList } from '../../state/simulator-cache.js';
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
}

export async function simctlListTool(args: any) {
  const {
    deviceType,
    runtime,
    availability = 'available',
    outputFormat = 'json',
    concise = true,
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
      // Legacy mode: return full filtered list
      if (outputFormat === 'json') {
        // Apply filters if specified
        const filteredList = filterCachedSimulatorList(cachedList, {
          deviceType,
          runtime,
          availability,
        });

        responseData = {
          devices: filteredList.devices,
          runtimes: filteredList.runtimes,
          devicetypes: filteredList.devicetypes,
          lastUpdated: filteredList.lastUpdated.toISOString(),
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
