import { createHash } from 'crypto';
import { AccessibilityElement } from './element-extraction.js';

/**
 * View fingerprint for identifying unique app screens/views
 * Based on xcode-agent recommendation: element structure hash is primary key
 */
export interface ViewFingerprint {
  // Primary identifier: accessibility tree structure
  elementStructureHash: string;

  // Context that makes views unique
  orientation: 'portrait' | 'landscape' | 'portraitUpsideDown' | 'landscapeRight';
  screenBounds: { width: number; height: number };

  // Optional: for visual validation in future phases
  screenshotHash?: string;

  // Metadata
  timestamp: Date;
  elementCount: number;
  topLevelContainers: string[];
}

/**
 * Configuration for view fingerprinting
 */
export interface FingerprintConfig {
  includeScreenshotHash?: boolean; // Default: false (Phase 3 feature)
  includeTimestamps?: boolean; // Default: false (exclude dynamic content)
  sortElements?: boolean; // Default: true (order-independent hashing)
}

/**
 * Compute unique fingerprint for a view based on accessibility element structure
 *
 * Following xcode-agent recommendation:
 * - Element structure hash is PRIMARY key (more stable than screenshot)
 * - Includes orientation and screen bounds for device-specific layouts
 * - Excludes screenshot hash by default (fragile due to status bar, animations)
 *
 * @param elements Accessibility elements from view
 * @param screenDimensions Screen width/height
 * @param orientation Device orientation
 * @param config Optional fingerprinting configuration
 */
export function computeViewFingerprint(
  elements: AccessibilityElement[],
  screenDimensions: { width: number; height: number; scale: number },
  orientation: 'portrait' | 'landscape' | 'portraitUpsideDown' | 'landscapeRight' = 'portrait',
  config: FingerprintConfig = {}
): ViewFingerprint {
  const {
    includeScreenshotHash: _includeScreenshotHash = false, // Reserved for Phase 3
    includeTimestamps = false,
    sortElements = true,
  } = config;

  // Filter to hittable elements with bounds (interactive elements only)
  const interactiveElements = elements.filter(
    el => el.bounds && el.hittable !== false && el.enabled !== false
  );

  // Build element structure signature
  // Format: "type:identifier:label:x,y,w,h"
  let elementSignatures = interactiveElements.map(el => {
    const type = el.type.replace('XCUIElementType', ''); // Shorten type names
    const id = el.identifier || '';
    const label = includeTimestamps ? el.label || '' : sanitizeLabel(el.label || '');
    const bounds = el.bounds
      ? `${Math.round(el.bounds.x)},${Math.round(el.bounds.y)},${Math.round(el.bounds.width)},${Math.round(el.bounds.height)}`
      : '';

    return `${type}:${id}:${label}:${bounds}`;
  });

  // Sort for order-independent hashing (same elements, different order = same hash)
  if (sortElements) {
    elementSignatures = elementSignatures.sort();
  }

  // Compute element structure hash
  const elementSignature = elementSignatures.join('|');
  const elementStructureHash = createHash('sha256')
    .update(elementSignature)
    .digest('hex')
    .substring(0, 16); // 16 chars = 64 bits = ~1 in 2^64 collision probability

  // Extract top-level containers for debugging/logging
  const topLevelContainers = [
    ...new Set(
      interactiveElements
        .filter(el => el.type.includes('NavigationBar') || el.type.includes('TabBar'))
        .map(el => el.label || el.identifier || el.type)
    ),
  ].slice(0, 3);

  return {
    elementStructureHash,
    orientation,
    screenBounds: {
      width: screenDimensions.width,
      height: screenDimensions.height,
    },
    timestamp: new Date(),
    elementCount: interactiveElements.length,
    topLevelContainers,
  };
}

/**
 * Sanitize element labels to exclude dynamic content
 * Removes timestamps, numbers, percentages that change frequently
 */
function sanitizeLabel(label: string): string {
  return (
    label
      // Remove timestamps (e.g., "10:23 AM", "14:35")
      .replace(/\d{1,2}:\d{2}\s*(AM|PM)?/gi, 'TIME')
      // Remove percentages (e.g., "87%", "100%")
      .replace(/\d+%/g, 'PERCENT')
      // Remove standalone numbers over 2 digits (e.g., "1,234", "5678")
      .replace(/\b\d{3,}[,\d]*\b/g, 'NUMBER')
      // Remove currency amounts (e.g., "$12.99", "€50")
      .replace(/[$€£¥]\s*\d+[.,]?\d*/g, 'CURRENCY')
      // Trim whitespace
      .trim()
  );
}

/**
 * Generate cache key from fingerprint, bundleId, and app version
 * Following xcode-agent recommendation to include app version
 */
export function generateCacheKey(
  fingerprint: ViewFingerprint,
  bundleId: string,
  appVersion?: string
): string {
  const versionPart = appVersion ? `:${appVersion}` : '';
  return `${bundleId}:${fingerprint.orientation}:${fingerprint.elementStructureHash}${versionPart}`;
}

/**
 * Check if a view is cacheable (excludes dynamic/animated content)
 * Following xcode-agent recommendation to exclude uncacheable views
 */
export function isViewCacheable(elements: AccessibilityElement[]): boolean {
  const UNCACHEABLE_PATTERNS = [
    /loading/i,
    /progress/i,
    /animation/i,
    /spinner/i,
    /activity.*indicator/i,
    /refreshing/i,
  ];

  // Don't cache views with loading/animation indicators
  const hasDynamicContent = elements.some(el => {
    const text = `${el.label || ''} ${el.identifier || ''} ${el.type}`;
    return UNCACHEABLE_PATTERNS.some(pattern => pattern.test(text));
  });

  if (hasDynamicContent) {
    return false;
  }

  // Don't cache views with very few elements (likely loading state)
  const interactiveElements = elements.filter(el => el.bounds && el.hittable !== false);
  if (interactiveElements.length < 3) {
    return false;
  }

  return true;
}

/**
 * Compute Hamming distance between two hash strings
 * Used for perceptual hash comparison in future phases
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash lengths must match for Hamming distance calculation');
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }

  return distance;
}
