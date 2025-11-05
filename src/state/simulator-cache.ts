import { SimulatorList, SimulatorRuntime, SimulatorDeviceType } from '../types/xcode.js';
import { executeCommand, buildSimctlCommand } from '../utils/command.js';
import { persistenceManager } from '../utils/persistence.js';

// Optimized simulator info - only essential fields to reduce cache size
export interface SimulatorInfo {
  // Core identification
  udid: string;
  name: string;
  deviceTypeIdentifier: string;

  // Essential state
  state: string;
  isAvailable: boolean;
  availability: string;
  availabilityError?: string;

  // XC-MCP enhancements for intelligence
  lastUsed?: Date;
  bootHistory: Date[];
  performanceMetrics?: {
    avgBootTime?: number;
    reliability?: number;
  };
}

export interface CachedSimulatorList {
  devices: { [runtime: string]: SimulatorInfo[] };
  runtimes: SimulatorRuntime[];
  devicetypes: SimulatorDeviceType[];
  lastUpdated: Date;
  preferredByProject: Map<string, string>;
}

export class SimulatorCache {
  private cache: CachedSimulatorList | null = null;
  private cacheMaxAge = 60 * 60 * 1000; // 1 hour default
  private bootStates: Map<string, 'booted' | 'shutdown' | 'booting'> = new Map();
  private preferredByProject: Map<string, string> = new Map();
  private lastUsed: Map<string, Date> = new Map();

  constructor() {
    // Load persisted state asynchronously without blocking initialization
    this.loadPersistedState().catch(error => {
      console.warn('Failed to load simulator cache state:', error);
    });
  }

  // Cache management methods
  setCacheMaxAge(milliseconds: number): void {
    this.cacheMaxAge = milliseconds;
  }

  getCacheMaxAge(): number {
    return this.cacheMaxAge;
  }

  clearCache(): void {
    this.cache = null;
    this.bootStates.clear();
    this.preferredByProject.clear();
    this.lastUsed.clear();
  }

  async getSimulatorList(force = false): Promise<CachedSimulatorList> {
    if (!force && this.cache && this.isCacheValid()) {
      return this.cache;
    }

    // Fetch fresh data
    const command = buildSimctlCommand('list', { json: true });
    const result = await executeCommand(command);

    if (result.code !== 0) {
      throw new Error(`Failed to list simulators: ${result.stderr}`);
    }

    const simulatorList: SimulatorList = JSON.parse(result.stdout);

    // Transform to cached format with enhanced info
    const cachedList: CachedSimulatorList = {
      devices: {},
      runtimes: simulatorList.runtimes,
      devicetypes: simulatorList.devicetypes,
      lastUpdated: new Date(),
      preferredByProject: this.preferredByProject,
    };

    // Transform devices to optimized format with historical data
    for (const [runtime, devices] of Object.entries(simulatorList.devices)) {
      cachedList.devices[runtime] = devices.map(device => {
        const existingInfo = this.findExistingDevice(device.udid);

        // Only store essential fields to minimize cache size
        const optimizedDevice: SimulatorInfo = {
          // Core identification
          udid: device.udid,
          name: device.name,
          deviceTypeIdentifier: device.deviceTypeIdentifier,

          // Essential state
          state: device.state,
          isAvailable: device.isAvailable,
          availability: device.availability,
          availabilityError: device.availabilityError,

          // XC-MCP enhancements
          lastUsed: existingInfo?.lastUsed || this.lastUsed.get(device.udid),
          bootHistory: existingInfo?.bootHistory || [],
          performanceMetrics: existingInfo?.performanceMetrics,
        };

        return optimizedDevice;
      });
    }

    this.cache = cachedList;
    return cachedList;
  }

  async getAvailableSimulators(deviceType?: string, runtime?: string): Promise<SimulatorInfo[]> {
    const list = await this.getSimulatorList();
    const devices: SimulatorInfo[] = [];

    for (const [runtimeKey, runtimeDevices] of Object.entries(list.devices)) {
      if (runtime && !runtimeKey.toLowerCase().includes(runtime.toLowerCase())) {
        continue;
      }

      const filteredDevices = runtimeDevices.filter(device => {
        if (!device.isAvailable) return false;
        if (deviceType && !device.name.toLowerCase().includes(deviceType.toLowerCase())) {
          return false;
        }
        return true;
      });

      devices.push(...filteredDevices);
    }

    // Sort by preference: recently used, then by name
    return devices.sort((a, b) => {
      const aLastUsed = a.lastUsed?.getTime() || 0;
      const bLastUsed = b.lastUsed?.getTime() || 0;

      if (aLastUsed !== bLastUsed) {
        return bLastUsed - aLastUsed; // Most recent first
      }

      return a.name.localeCompare(b.name);
    });
  }

  async getPreferredSimulator(
    projectPath?: string,
    deviceType?: string
  ): Promise<SimulatorInfo | null> {
    // Check project-specific preference first
    if (projectPath) {
      const preferredUdid = this.preferredByProject.get(projectPath);
      if (preferredUdid) {
        const preferred = await this.findSimulatorByUdid(preferredUdid);
        if (preferred && preferred.isAvailable) {
          return preferred;
        }
      }
    }

    // Fallback to most recently used available simulator
    const available = await this.getAvailableSimulators(deviceType);
    return available[0] || null;
  }

  async findSimulatorByUdid(udid: string): Promise<SimulatorInfo | null> {
    const list = await this.getSimulatorList();

    for (const devices of Object.values(list.devices)) {
      const found = devices.find(device => device.udid === udid);
      if (found) return found;
    }

    return null;
  }

  recordSimulatorUsage(udid: string, projectPath?: string): void {
    const now = new Date();
    this.lastUsed.set(udid, now);

    if (projectPath) {
      this.preferredByProject.set(projectPath, udid);
    }

    // Update cache if exists
    if (this.cache) {
      for (const devices of Object.values(this.cache.devices)) {
        const device = devices.find(d => d.udid === udid);
        if (device) {
          device.lastUsed = now;
          break;
        }
      }
    }

    // Persist state changes
    this.persistStateDebounced();
  }

  recordBootEvent(udid: string, success: boolean, duration?: number): void {
    this.bootStates.set(udid, success ? 'booted' : 'shutdown');

    if (this.cache && success) {
      for (const devices of Object.values(this.cache.devices)) {
        const device = devices.find(d => d.udid === udid);
        if (device) {
          device.bootHistory.push(new Date());

          // Update performance metrics
          if (duration) {
            const metrics = device.performanceMetrics || { avgBootTime: 0, reliability: 1.0 };
            const bootTimes = device.bootHistory.slice(-10); // Last 10 boots
            const currentAvg = metrics.avgBootTime || 0;
            metrics.avgBootTime = bootTimes.length > 1 ? (currentAvg + duration) / 2 : duration;
            metrics.reliability = Math.min(1.0, bootTimes.length / 10);
            device.performanceMetrics = metrics;
          }
          break;
        }
      }
    }

    // Persist state changes
    this.persistStateDebounced();
  }

  getBootState(udid: string): 'booted' | 'shutdown' | 'booting' | 'unknown' {
    return this.bootStates.get(udid) || 'unknown';
  }

  getCacheStats(): {
    isCached: boolean;
    lastUpdated?: Date;
    cacheMaxAgeMs: number;
    cacheMaxAgeHuman: string;
    deviceCount: number;
    recentlyUsedCount: number;
    isExpired: boolean;
    timeUntilExpiry?: string;
  } {
    const cacheMaxAgeHuman = this.formatDuration(this.cacheMaxAge);

    if (!this.cache) {
      return {
        isCached: false,
        cacheMaxAgeMs: this.cacheMaxAge,
        cacheMaxAgeHuman,
        deviceCount: 0,
        recentlyUsedCount: 0,
        isExpired: false,
      };
    }

    const deviceCount = Object.values(this.cache.devices).reduce(
      (sum, devices) => sum + devices.length,
      0
    );

    const recentlyUsedCount = Array.from(this.lastUsed.values()).filter(
      date => Date.now() - date.getTime() < 24 * 60 * 60 * 1000
    ).length;

    const ageMs = Date.now() - this.cache.lastUpdated.getTime();
    const isExpired = ageMs >= this.cacheMaxAge;
    const timeUntilExpiry = isExpired ? undefined : this.formatDuration(this.cacheMaxAge - ageMs);

    return {
      isCached: true,
      lastUpdated: this.cache.lastUpdated,
      cacheMaxAgeMs: this.cacheMaxAge,
      cacheMaxAgeHuman,
      deviceCount,
      recentlyUsedCount,
      isExpired,
      timeUntilExpiry,
    };
  }

  private isCacheValid(): boolean {
    if (!this.cache) return false;
    return Date.now() - this.cache.lastUpdated.getTime() < this.cacheMaxAge;
  }

  private findExistingDevice(udid: string): SimulatorInfo | undefined {
    if (!this.cache) return undefined;

    for (const devices of Object.values(this.cache.devices)) {
      const found = devices.find(device => device.udid === udid);
      if (found) return found;
    }

    return undefined;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Get suggested simulators ranked by multiple criteria
   *
   * Scoring Algorithm:
   * - Recent usage (40% weight): Most recent first
   * - iOS version (30% weight): Latest versions preferred
   * - Common models (20% weight): Popular models ranked higher
   * - Boot performance (10% weight): Faster boots preferred
   */
  async getSuggestedSimulators(
    projectPath?: string,
    deviceType?: string,
    maxSuggestions = 4
  ): Promise<
    Array<{
      simulator: SimulatorInfo;
      score: number;
      reasons: string[];
    }>
  > {
    const available = await this.getAvailableSimulators(deviceType);

    if (available.length === 0) {
      return [];
    }

    // Common device models ranked by popularity
    const commonModels = [
      'iPhone 16 Pro',
      'iPhone 16',
      'iPhone 15 Pro',
      'iPhone 15',
      'iPhone SE',
      'iPad Pro',
      'iPad',
      'iPad mini',
    ];

    // Get recently used devices
    const recentlyUsed = Array.from(this.lastUsed.entries())
      .sort(([, dateA], [, dateB]) => dateB.getTime() - dateA.getTime())
      .slice(0, 3)
      .map(([udid]) => udid);

    // Score each device
    const scored = available.map(device => {
      let score = 0;
      const reasons: string[] = [];

      // Recent usage (40%)
      if (projectPath) {
        const preferredUdid = this.preferredByProject.get(projectPath);
        if (device.udid === preferredUdid) {
          score += 40;
          reasons.push(`Project preference`);
        }
      }

      if (recentlyUsed.includes(device.udid)) {
        const recentBonus = 40 * (1 - recentlyUsed.indexOf(device.udid) / 3);
        score += recentBonus;
        reasons.push(`Recently used`);
      }

      // iOS version (30%) - prefer latest
      const versionMatch = device.deviceTypeIdentifier.match(/(\d+)/);
      if (versionMatch) {
        const version = parseInt(versionMatch[1], 10);
        const versionBonus = Math.min(30, (version / 18) * 30); // 30 points for iOS 18+
        score += versionBonus;
        reasons.push(`iOS ${version}`);
      }

      // Common models (20%)
      const modelIndex = commonModels.findIndex(model => device.name.includes(model));
      if (modelIndex !== -1) {
        const modelBonus = Math.max(0, 20 - modelIndex * 2);
        score += modelBonus;
        reasons.push(`Common model: #${modelIndex + 1}`);
      } else {
        reasons.push(`Custom device`);
      }

      // Boot performance (10%) - faster is better
      if (device.performanceMetrics?.avgBootTime) {
        const avgBootTime = device.performanceMetrics.avgBootTime;
        // Assume 60s is average, normalize to 10 points
        const performanceBonus = Math.max(0, 10 * (1 - Math.min(1, avgBootTime / 60000)));
        score += performanceBonus;
        reasons.push(`Boot: ${Math.round(avgBootTime)}ms avg`);
      } else {
        reasons.push('No boot data yet');
      }

      return {
        simulator: device,
        score,
        reasons,
      };
    });

    // Sort by score descending
    return scored.sort((a, b) => b.score - a.score).slice(0, maxSuggestions);
  }

  /**
   * Get best simulator for a project
   * Considers: project preference, recent usage, boot performance, availability
   */
  async getBestSimulator(
    projectPath?: string,
    deviceType?: string
  ): Promise<{
    simulator: SimulatorInfo;
    score: number;
    reason: string;
  } | null> {
    const suggestions = await this.getSuggestedSimulators(projectPath, deviceType, 1);

    if (suggestions.length === 0) {
      return null;
    }

    const top = suggestions[0];
    return {
      simulator: top.simulator,
      score: top.score,
      reason: top.reasons[0] || 'Available simulator',
    };
  }

  /**
   * Load persisted state from disk
   */
  private async loadPersistedState(): Promise<void> {
    if (!persistenceManager.isEnabled()) return;

    try {
      const data = await persistenceManager.loadState<{
        cache: CachedSimulatorList | null;
        preferredByProject: Array<[string, string]>;
        lastUsed: Array<[string, Date]>;
      }>('simulators');

      if (data) {
        // Merge with existing state, preserving in-memory updates
        this.cache = data.cache || this.cache;
        this.preferredByProject = new Map(data.preferredByProject || []);
        this.lastUsed = new Map(data.lastUsed || []);
      }
    } catch (error) {
      console.warn('Failed to load simulator cache state:', error);
      // Continue with empty state - graceful degradation
    }
  }

  /**
   * Persist state to disk with debouncing
   */
  private saveStateTimeout: NodeJS.Timeout | null = null;
  private persistStateDebounced(): void {
    if (!persistenceManager.isEnabled()) return;

    // Clear existing timeout
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
    }

    // Debounce saves to avoid excessive disk I/O
    this.saveStateTimeout = setTimeout(async () => {
      try {
        await persistenceManager.saveState('simulators', {
          cache: this.cache,
          preferredByProject: Array.from(this.preferredByProject.entries()),
          lastUsed: Array.from(this.lastUsed.entries()),
        });
        this.saveStateTimeout = null;
      } catch (error) {
        console.warn('Failed to persist simulator cache state:', error);
      }
    }, 1000);
  }
}

// Global simulator cache instance
export const simulatorCache = new SimulatorCache();
