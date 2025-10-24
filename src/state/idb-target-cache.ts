import { executeCommand } from '../utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * IDB Target Cache
 *
 * <architecture>
 * Caches IDB target information to avoid repeated `idb list-targets` calls.
 * Similar to SimulatorCache, tracks:
 * - Available targets (devices + simulators)
 * - Screen dimensions for coordinate validation
 * - Connection status (USB/WiFi for devices)
 * - Last used target for auto-detection
 * - Usage tracking for intelligent defaults
 * </architecture>
 */

export interface IDBTarget {
  udid: string;
  name: string;
  type: 'device' | 'simulator';
  state: 'Booted' | 'Shutdown';
  osVersion: string;
  architecture: string;
  screenDimensions: { width: number; height: number };

  // Device-specific fields
  connectionType?: 'usb' | 'wifi';
  companionPort?: number;

  // Usage tracking for intelligent defaults
  lastUsed?: number;
  successfulOperations: number;
}

interface IDBTargetCacheEntry {
  targets: Map<string, IDBTarget>;
  lastFetched: number;
  ttl: number; // Default: 60000ms (1 minute)
}

/**
 * IDB Target Cache Manager
 *
 * Why: Avoid expensive `idb list-targets` calls on every operation.
 * Cache targets for 1 minute (configurable) and track usage for intelligent defaults.
 */
class IDBTargetCacheManager {
  private cache: IDBTargetCacheEntry = {
    targets: new Map(),
    lastFetched: 0,
    ttl: 60000, // 1 minute default
  };

  /**
   * Get target by UDID, refreshing cache if stale
   *
   * Why: Primary method for accessing target info.
   * Auto-refreshes cache if TTL expired.
   *
   * @param udid - Target UDID
   * @returns IDBTarget with full details
   * @throws McpError if target not found
   */
  async getTarget(udid: string): Promise<IDBTarget> {
    await this.refreshIfStale();

    const target = this.cache.targets.get(udid);
    if (!target) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Target "${udid}" not found. Use idb-targets to list available targets.`
      );
    }

    return target;
  }

  /**
   * Get last used target for auto-detection
   *
   * Why: Enable UDID auto-detection for better UX.
   * Prefers booted targets, then most recently used.
   *
   * @returns Last used booted target, or undefined if none
   */
  async getLastUsedTarget(): Promise<IDBTarget | undefined> {
    await this.refreshIfStale();

    const targets = Array.from(this.cache.targets.values());
    const bootedTargets = targets.filter(t => t.state === 'Booted');

    if (bootedTargets.length === 0) {
      return undefined;
    }

    // Sort by last used timestamp (most recent first)
    return bootedTargets.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))[0];
  }

  /**
   * Find target by UDID (no error if not found)
   *
   * Why: Non-throwing version for existence checks.
   *
   * @param udid - Target UDID
   * @returns IDBTarget if found, undefined otherwise
   */
  async findTargetByUdid(udid: string): Promise<IDBTarget | undefined> {
    await this.refreshIfStale();
    return this.cache.targets.get(udid);
  }

  /**
   * List all cached targets
   *
   * Why: Support idb-targets tool for listing available targets.
   *
   * @param filters - Optional filters for state, type
   * @returns Array of IDBTargets
   */
  async listTargets(filters?: {
    state?: 'Booted' | 'Shutdown';
    type?: 'device' | 'simulator';
  }): Promise<IDBTarget[]> {
    await this.refreshIfStale();

    let targets = Array.from(this.cache.targets.values());

    if (filters?.state) {
      targets = targets.filter(t => t.state === filters.state);
    }

    if (filters?.type) {
      targets = targets.filter(t => t.type === filters.type);
    }

    return targets;
  }

  /**
   * Record successful operation for usage tracking
   *
   * Why: Track which targets are actively used for intelligent defaults.
   *
   * @param udid - Target UDID
   */
  recordSuccess(udid: string): void {
    const target = this.cache.targets.get(udid);
    if (target) {
      target.lastUsed = Date.now();
      target.successfulOperations++;
    }
  }

  /**
   * Clear cache to force refresh
   *
   * Why: Support manual cache invalidation for troubleshooting.
   */
  clearCache(): void {
    this.cache.targets.clear();
    this.cache.lastFetched = 0;
  }

  /**
   * Set cache TTL
   *
   * Why: Allow runtime configuration of cache duration.
   *
   * @param ttlMs - Time-to-live in milliseconds
   */
  setCacheTTL(ttlMs: number): void {
    this.cache.ttl = ttlMs;
  }

  /**
   * Get cache statistics
   *
   * Why: Support cache-get-stats tool for monitoring.
   *
   * @returns Cache stats including target count, TTL, last fetch time
   */
  getCacheStats(): {
    targetCount: number;
    ttl: number;
    lastFetched: number;
    cacheAge: number;
  } {
    return {
      targetCount: this.cache.targets.size,
      ttl: this.cache.ttl,
      lastFetched: this.cache.lastFetched,
      cacheAge: Date.now() - this.cache.lastFetched,
    };
  }

  /**
   * Refresh cache from IDB if stale
   *
   * Why: Internal method to maintain cache freshness.
   * Called automatically by public methods.
   */
  private async refreshIfStale(): Promise<void> {
    const now = Date.now();
    if (now - this.cache.lastFetched < this.cache.ttl) {
      return; // Cache still valid
    }

    await this.refreshCache();
  }

  /**
   * Force cache refresh from IDB
   *
   * Why: Fetch latest target list from IDB.
   * Parses JSON output and populates cache.
   */
  private async refreshCache(): Promise<void> {
    try {
      const result = await executeCommand('idb list-targets --json', {
        timeout: 10000,
      });

      if (result.code !== 0) {
        throw new Error(`idb list-targets failed: ${result.stderr}`);
      }

      // Parse IDB NDJSON output (newline-delimited JSON)
      // IDB returns one JSON object per line, not a JSON array
      const targets: any[] = result.stdout
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      this.cache.targets.clear();
      for (const target of targets) {
        // Preserve existing usage tracking if target already cached
        const existing = this.cache.targets.get(target.udid);

        this.cache.targets.set(target.udid, {
          udid: target.udid,
          name: target.name,
          type: target.type === 'simulator' ? 'simulator' : 'device',
          state: target.state === 'Booted' ? 'Booted' : 'Shutdown',
          osVersion: target.os_version || 'Unknown',
          architecture: target.architecture || 'Unknown',
          screenDimensions: {
            width: target.screen_dimensions?.width || 0,
            height: target.screen_dimensions?.height || 0,
          },
          connectionType: target.connection_type,
          companionPort: target.companion_info?.port,
          // Preserve usage tracking
          lastUsed: existing?.lastUsed,
          successfulOperations: existing?.successfulOperations || 0,
        });
      }

      this.cache.lastFetched = Date.now();
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to refresh IDB target cache: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Export singleton instance
export const IDBTargetCache = new IDBTargetCacheManager();
