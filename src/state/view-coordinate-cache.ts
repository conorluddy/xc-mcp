import { ViewFingerprint, generateCacheKey } from '../utils/view-fingerprinting.js';
import { persistenceManager } from '../utils/persistence.js';

/**
 * Cached coordinate with confidence tracking
 * Following xcode-agent recommendation for confidence decay
 */
export interface CachedCoordinate {
  // Element identification
  elementId: string; // Accessibility identifier or label
  elementType: string; // Button, TextField, etc.

  // Absolute coordinates (device-specific)
  x: number;
  y: number;

  // Relative coordinates (normalized to safe area - Phase 4)
  relativeX?: number;
  relativeY?: number;

  // Bounds for validation
  bounds?: {
    width: number;
    height: number;
  };

  // Confidence tracking
  confidence: number; // successCount / (successCount + failureCount) * ageDecayFactor
  successCount: number;
  failureCount: number;

  // Timestamps
  createdAt: Date;
  lastUsed: Date;
}

/**
 * View coordinate mapping for a specific app screen
 */
export interface ViewCoordinateMapping {
  // Cache key (generated from fingerprint + bundleId + version)
  cacheKey: string;

  // View identification
  fingerprint: ViewFingerprint;
  bundleId: string;
  appVersion?: string;

  // Cached coordinates by element ID
  coordinates: Map<string, CachedCoordinate>;

  // Usage statistics
  createdAt: Date;
  lastAccessed: Date;
  hitCount: number;
}

/**
 * Cache configuration following xcode-agent recommendations
 */
export interface ViewCacheConfig {
  enabled: boolean; // Default: false (opt-in)
  maxAge: number; // Default: 30 minutes (conservative)
  minConfidence: number; // Default: 0.8 (high bar for cache hits)
  maxCachedViews: number; // Default: 50 (conservative)
  maxCoordinatesPerView: number; // Default: 5 (frequently used elements only)
  autoDisableThreshold: number; // Default: 0.6 (disable if hit rate < 60%)
}

/**
 * View Coordinate Cache
 *
 * Implements intelligent coordinate caching with:
 * - Element structure hash as primary key (per xcode-agent)
 * - Confidence tracking with auto-invalidation
 * - Auto-disable on low hit rate
 * - Conservative defaults for Phase 1
 */
export class ViewCoordinateCache {
  private static instance: ViewCoordinateCache;

  private cache: Map<string, ViewCoordinateMapping> = new Map();
  private config: ViewCacheConfig = {
    enabled: false, // Opt-in
    maxAge: 30 * 60 * 1000, // 30 minutes
    minConfidence: 0.8, // High bar
    maxCachedViews: 50,
    maxCoordinatesPerView: 5,
    autoDisableThreshold: 0.6,
  };

  // Performance tracking (per xcode-agent recommendation)
  private hitCount = 0;
  private missCount = 0;
  private totalQueries = 0;

  private constructor() {
    // Load persisted state asynchronously
    this.loadPersistedState().catch(error => {
      console.warn('Failed to load view coordinate cache state:', error);
    });
  }

  static getInstance(): ViewCoordinateCache {
    if (!ViewCoordinateCache.instance) {
      ViewCoordinateCache.instance = new ViewCoordinateCache();
    }
    return ViewCoordinateCache.instance;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  setConfig(config: Partial<ViewCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ViewCacheConfig {
    return { ...this.config };
  }

  enable(): void {
    this.config.enabled = true;
  }

  disable(): void {
    this.config.enabled = false;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ============================================================================
  // CACHE OPERATIONS
  // ============================================================================

  /**
   * Get cached coordinate for an element on a specific view
   */
  async getCachedCoordinate(
    fingerprint: ViewFingerprint,
    bundleId: string,
    elementId: string,
    appVersion?: string
  ): Promise<CachedCoordinate | null> {
    if (!this.config.enabled) {
      return null;
    }

    this.totalQueries++;

    const cacheKey = generateCacheKey(fingerprint, bundleId, appVersion);
    const viewMapping = this.cache.get(cacheKey);

    if (!viewMapping) {
      this.missCount++;
      this.checkAutoDisable();
      return null;
    }

    // Update last accessed
    viewMapping.lastAccessed = new Date();

    const coordinate = viewMapping.coordinates.get(elementId);
    if (!coordinate) {
      this.missCount++;
      this.checkAutoDisable();
      return null;
    }

    // Check age
    const age = Date.now() - coordinate.lastUsed.getTime();
    if (age > this.config.maxAge) {
      // Entry expired - remove it
      viewMapping.coordinates.delete(elementId);
      this.missCount++;
      this.checkAutoDisable();
      return null;
    }

    // Compute confidence with age decay
    const ageDecayFactor = Math.max(0, 1 - age / this.config.maxAge);
    const baseConfidence =
      coordinate.successCount / (coordinate.successCount + coordinate.failureCount);
    coordinate.confidence = baseConfidence * ageDecayFactor;

    // Check confidence threshold
    if (coordinate.confidence < this.config.minConfidence) {
      this.missCount++;
      this.checkAutoDisable();
      return null;
    }

    // Cache hit!
    this.hitCount++;
    viewMapping.hitCount++;
    coordinate.lastUsed = new Date();

    return coordinate;
  }

  /**
   * Store successful tap coordinates in cache
   */
  async storeCoordinate(
    fingerprint: ViewFingerprint,
    bundleId: string,
    elementId: string,
    elementType: string,
    x: number,
    y: number,
    bounds?: { width: number; height: number },
    appVersion?: string
  ): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const cacheKey = generateCacheKey(fingerprint, bundleId, appVersion);

    // Get or create view mapping
    let viewMapping = this.cache.get(cacheKey);
    if (!viewMapping) {
      // Check cache size limit
      if (this.cache.size >= this.config.maxCachedViews) {
        this.evictLRU();
      }

      viewMapping = {
        cacheKey,
        fingerprint,
        bundleId,
        appVersion,
        coordinates: new Map(),
        createdAt: new Date(),
        lastAccessed: new Date(),
        hitCount: 0,
      };

      this.cache.set(cacheKey, viewMapping);
    }

    // Get or create coordinate entry
    let coordinate = viewMapping.coordinates.get(elementId);
    if (!coordinate) {
      // Check coordinates per view limit
      if (viewMapping.coordinates.size >= this.config.maxCoordinatesPerView) {
        // Remove least recently used coordinate
        this.evictLRUCoordinate(viewMapping);
      }

      coordinate = {
        elementId,
        elementType,
        x,
        y,
        bounds,
        confidence: 1.0,
        successCount: 1,
        failureCount: 0,
        createdAt: new Date(),
        lastUsed: new Date(),
      };

      viewMapping.coordinates.set(elementId, coordinate);
    } else {
      // Update existing coordinate
      coordinate.x = x;
      coordinate.y = y;
      coordinate.bounds = bounds;
      coordinate.successCount++;
      coordinate.lastUsed = new Date();
      coordinate.confidence =
        coordinate.successCount / (coordinate.successCount + coordinate.failureCount);
    }

    // Persist asynchronously
    await this.persistState();
  }

  /**
   * Record successful tap using cached coordinate
   */
  async recordSuccess(
    fingerprint: ViewFingerprint,
    bundleId: string,
    elementId: string,
    appVersion?: string
  ): Promise<void> {
    const cacheKey = generateCacheKey(fingerprint, bundleId, appVersion);
    const viewMapping = this.cache.get(cacheKey);

    if (!viewMapping) return;

    const coordinate = viewMapping.coordinates.get(elementId);
    if (!coordinate) return;

    coordinate.successCount++;
    coordinate.lastUsed = new Date();
    coordinate.confidence =
      coordinate.successCount / (coordinate.successCount + coordinate.failureCount);

    await this.persistState();
  }

  /**
   * Invalidate coordinate on tap failure
   */
  async invalidateCoordinate(
    fingerprint: ViewFingerprint,
    bundleId: string,
    elementId: string,
    appVersion?: string
  ): Promise<void> {
    const cacheKey = generateCacheKey(fingerprint, bundleId, appVersion);
    const viewMapping = this.cache.get(cacheKey);

    if (!viewMapping) return;

    const coordinate = viewMapping.coordinates.get(elementId);
    if (!coordinate) return;

    coordinate.failureCount++;
    coordinate.confidence =
      coordinate.successCount / (coordinate.successCount + coordinate.failureCount);

    // Aggressive invalidation: remove if confidence drops below threshold
    if (coordinate.confidence < this.config.minConfidence) {
      viewMapping.coordinates.delete(elementId);
      console.error(
        `[view-coordinate-cache] Invalidated coordinate for ${elementId} (confidence: ${coordinate.confidence.toFixed(2)})`
      );
    }

    await this.persistState();
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.totalQueries = 0;
  }

  /**
   * Clear cache for specific bundle ID
   */
  clearForBundle(bundleId: string): void {
    for (const [key, mapping] of this.cache.entries()) {
      if (mapping.bundleId === bundleId) {
        this.cache.delete(key);
      }
    }
  }

  // ============================================================================
  // STATISTICS & OBSERVABILITY
  // ============================================================================

  getStatistics() {
    const hitRate = this.totalQueries > 0 ? this.hitCount / this.totalQueries : 0;
    const missRate = this.totalQueries > 0 ? this.missCount / this.totalQueries : 0;

    let totalCoordinates = 0;
    for (const mapping of this.cache.values()) {
      totalCoordinates += mapping.coordinates.size;
    }

    return {
      enabled: this.config.enabled,
      hitRate,
      missRate,
      totalQueries: this.totalQueries,
      hitCount: this.hitCount,
      missCount: this.missCount,
      cachedViews: this.cache.size,
      totalCoordinates,
      config: this.config,
    };
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================

  /**
   * Auto-disable cache if hit rate falls below threshold
   * Per xcode-agent recommendation
   */
  private checkAutoDisable(): void {
    if (this.totalQueries < 100) {
      return; // Need sufficient data
    }

    const hitRate = this.hitCount / this.totalQueries;
    if (hitRate < this.config.autoDisableThreshold) {
      console.warn(
        `[view-coordinate-cache] Hit rate ${(hitRate * 100).toFixed(1)}% < ${(this.config.autoDisableThreshold * 100).toFixed(1)}% threshold, auto-disabling cache`
      );
      this.config.enabled = false;
    }
  }

  /**
   * Evict least recently used view mapping (LRU eviction)
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, mapping] of this.cache.entries()) {
      if (mapping.lastAccessed.getTime() < oldestTime) {
        oldestTime = mapping.lastAccessed.getTime();
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Evict least recently used coordinate from a view mapping
   */
  private evictLRUCoordinate(mapping: ViewCoordinateMapping): void {
    let oldestElementId: string | null = null;
    let oldestTime = Date.now();

    for (const [elementId, coordinate] of mapping.coordinates.entries()) {
      if (coordinate.lastUsed.getTime() < oldestTime) {
        oldestTime = coordinate.lastUsed.getTime();
        oldestElementId = elementId;
      }
    }

    if (oldestElementId) {
      mapping.coordinates.delete(oldestElementId);
    }
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  private async persistState(): Promise<void> {
    if (!persistenceManager.isEnabled()) {
      return;
    }

    try {
      // Convert Map to serializable object
      const serializable = {
        cache: Array.from(this.cache.entries()).map(([key, mapping]) => ({
          key,
          mapping: {
            ...mapping,
            coordinates: Array.from(mapping.coordinates.entries()),
          },
        })),
        hitCount: this.hitCount,
        missCount: this.missCount,
        totalQueries: this.totalQueries,
      };

      await persistenceManager.saveState('view-coordinate-cache', serializable);
    } catch (error) {
      console.warn('[view-coordinate-cache] Failed to persist state:', error);
    }
  }

  private async loadPersistedState(): Promise<void> {
    if (!persistenceManager.isEnabled()) {
      return;
    }

    try {
      const data = await persistenceManager.loadState('view-coordinate-cache');
      if (!data) {
        return;
      }

      const serialized = data as {
        cache: Array<{ key: string; mapping: any }>;
        hitCount: number;
        missCount: number;
        totalQueries: number;
      };

      // Restore cache from serialized data
      this.cache.clear();
      for (const { key, mapping } of serialized.cache || []) {
        this.cache.set(key, {
          ...mapping,
          coordinates: new Map(mapping.coordinates),
          createdAt: new Date(mapping.createdAt),
          lastAccessed: new Date(mapping.lastAccessed),
          fingerprint: {
            ...mapping.fingerprint,
            timestamp: new Date(mapping.fingerprint.timestamp),
          },
        });
      }

      this.hitCount = serialized.hitCount || 0;
      this.missCount = serialized.missCount || 0;
      this.totalQueries = serialized.totalQueries || 0;

      console.error(
        `[view-coordinate-cache] Loaded ${this.cache.size} cached views from persistence`
      );
    } catch (error) {
      console.warn('[view-coordinate-cache] Failed to load persisted state:', error);
    }
  }
}

// Export singleton instance
export const viewCoordinateCache = ViewCoordinateCache.getInstance();
