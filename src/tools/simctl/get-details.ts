import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { responseCache } from '../../utils/response-cache.js';
import type { CachedSimulatorList } from '../../state/simulator-cache.js';

interface SimctlGetDetailsArgs {
  cacheId: string;
  detailType: 'full-list' | 'devices-only' | 'runtimes-only' | 'available-only';
  deviceType?: string;
  runtime?: string;
  maxDevices?: number;
}

/**
 * Get detailed simulator information from cached simctl-list results with progressive disclosure
 *
 * **Full documentation:** See simctl/get-details.md for detailed parameters and examples
 */
export async function simctlGetDetailsTool(args: any) {
  const {
    cacheId,
    detailType,
    deviceType,
    runtime,
    maxDevices = 20,
  } = args as SimctlGetDetailsArgs;

  try {
    const cached = responseCache.get(cacheId);
    if (!cached) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Cache ID '${cacheId}' not found or expired. Use recent simctl-list result.`
      );
    }

    if (cached.tool !== 'simctl-list') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Cache ID '${cacheId}' is not from simctl-list tool.`
      );
    }

    const fullList: CachedSimulatorList = JSON.parse(cached.fullOutput);

    let responseData: any;

    switch (detailType) {
      case 'full-list':
        responseData = formatFullList(fullList, { deviceType, runtime, maxDevices });
        break;
      case 'devices-only':
        responseData = formatDevicesOnly(fullList, { deviceType, runtime, maxDevices });
        break;
      case 'runtimes-only':
        responseData = formatRuntimesOnly(fullList);
        break;
      case 'available-only':
        responseData = formatAvailableOnly(fullList, { deviceType, runtime, maxDevices });
        break;
      default:
        throw new McpError(ErrorCode.InvalidParams, `Unknown detailType: ${detailType}`);
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(responseData, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-get-details failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function formatFullList(
  fullList: CachedSimulatorList,
  filters: { deviceType?: string; runtime?: string; maxDevices?: number }
): any {
  const filtered = applyFilters(fullList, filters);
  return {
    summary: {
      totalDevices: Object.values(filtered.devices).flat().length,
      lastUpdated: filtered.lastUpdated,
      runtimeCount: Object.keys(filtered.devices).length,
      deviceTypeCount: filtered.devicetypes.length,
    },
    devices: filtered.devices,
    runtimes: filtered.runtimes,
    devicetypes: filtered.devicetypes,
  };
}

function formatDevicesOnly(
  fullList: CachedSimulatorList,
  filters: { deviceType?: string; runtime?: string; maxDevices?: number }
): any {
  const filtered = applyFilters(fullList, filters);
  const allDevices = Object.entries(filtered.devices).flatMap(([runtime, devices]) =>
    devices.map(device => ({ ...device, runtime }))
  );

  const limitedDevices = filters.maxDevices ? allDevices.slice(0, filters.maxDevices) : allDevices;

  return {
    summary: {
      totalMatching: allDevices.length,
      showing: limitedDevices.length,
      filters: filters,
    },
    devices: limitedDevices,
  };
}

function formatRuntimesOnly(fullList: CachedSimulatorList): any {
  return {
    summary: {
      totalRuntimes: fullList.runtimes.length,
      lastUpdated: fullList.lastUpdated,
    },
    runtimes: fullList.runtimes.map(runtime => ({
      name: runtime.name,
      version: runtime.version,
      identifier: runtime.identifier,
      isAvailable: runtime.isAvailable,
      deviceCount: fullList.devices[runtime.identifier]?.length || 0,
    })),
  };
}

function formatAvailableOnly(
  fullList: CachedSimulatorList,
  filters: { deviceType?: string; runtime?: string; maxDevices?: number }
): any {
  const filtered = applyFilters(fullList, filters);
  const availableDevices = Object.entries(filtered.devices).flatMap(([runtime, devices]) =>
    devices.filter(device => device.isAvailable).map(device => ({ ...device, runtime }))
  );

  // Sort by recent usage and boot state
  availableDevices.sort((a, b) => {
    // Booted devices first
    if (a.state === 'Booted' && b.state !== 'Booted') return -1;
    if (b.state === 'Booted' && a.state !== 'Booted') return 1;

    // Then by last used
    const aLastUsed = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
    const bLastUsed = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
    if (aLastUsed !== bLastUsed) return bLastUsed - aLastUsed;

    // Finally by name
    return a.name.localeCompare(b.name);
  });

  const limitedDevices = filters.maxDevices
    ? availableDevices.slice(0, filters.maxDevices)
    : availableDevices;

  return {
    summary: {
      totalAvailable: availableDevices.length,
      showing: limitedDevices.length,
      bootedCount: availableDevices.filter(d => d.state === 'Booted').length,
      filters: filters,
    },
    devices: limitedDevices,
    recommendations: {
      preferredForBuild: limitedDevices.slice(0, 3),
      bootedDevices: limitedDevices.filter(d => d.state === 'Booted'),
    },
  };
}

function applyFilters(
  fullList: CachedSimulatorList,
  filters: { deviceType?: string; runtime?: string; maxDevices?: number }
): CachedSimulatorList {
  const filtered: CachedSimulatorList = {
    devices: {},
    runtimes: fullList.runtimes,
    devicetypes: fullList.devicetypes,
    lastUpdated: fullList.lastUpdated,
    preferredByProject: fullList.preferredByProject,
  };

  // Filter device types if specified
  if (filters.deviceType) {
    filtered.devicetypes = fullList.devicetypes.filter(dt =>
      dt.name.toLowerCase().includes(filters.deviceType!.toLowerCase())
    );
  }

  // Filter runtimes if specified
  if (filters.runtime) {
    filtered.runtimes = fullList.runtimes.filter(
      rt =>
        rt.name.toLowerCase().includes(filters.runtime!.toLowerCase()) ||
        rt.version.includes(filters.runtime!)
    );
  }

  // Filter devices
  for (const [runtimeKey, devices] of Object.entries(fullList.devices)) {
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

      return true;
    });

    if (filteredDevices.length > 0) {
      filtered.devices[runtimeKey] = filteredDevices;
    }
  }

  return filtered;
}
