/**
 * Tool Registry - Searchable metadata for all xc-mcp tools
 *
 * This registry provides comprehensive metadata for all 28 tools, enabling:
 * - Semantic search and discovery by agents
 * - Tool categorization and organization
 * - Operation documentation for router tools
 * - Keyword-based tool finding for LLM agents
 */

export interface ToolMetadata {
  name: string; // Tool registration name (e.g., 'xcodebuild-build')
  description: string; // Short description for search results
  category: string; // Category: 'build' | 'simulator' | 'app' | 'idb' | 'io' | 'cache' | 'system'
  keywords: string[]; // Searchable terms for semantic discovery
  operations?: string[]; // For router tools, list the available operations
}

export const TOOL_REGISTRY: ToolMetadata[] = [
  // Build Tools (7 tools)
  {
    name: 'xcodebuild-version',
    description: 'Get Xcode version information and SDK details',
    category: 'build',
    keywords: ['xcode', 'version', 'sdk', 'info', 'toolchain', 'compiler'],
  },
  {
    name: 'xcodebuild-list',
    description: 'List Xcode project schemes and build targets',
    category: 'build',
    keywords: ['schemes', 'targets', 'project', 'list', 'discover', 'configuration'],
  },
  {
    name: 'xcodebuild-build',
    description: 'Build Xcode project for iOS, with intelligent defaults and caching',
    category: 'build',
    keywords: ['build', 'compile', 'xcode', 'app', 'project', 'debug', 'release', 'destination'],
  },
  {
    name: 'xcodebuild-clean',
    description: 'Clean Xcode build artifacts and derived data',
    category: 'build',
    keywords: ['clean', 'derived-data', 'reset', 'clear', 'rebuild', 'fresh'],
  },
  {
    name: 'xcodebuild-test',
    description: 'Run XCTest/XCUITest with support for test plans, filtering, and specific tests',
    category: 'build',
    keywords: [
      'test',
      'xctest',
      'xcuitest',
      'unit-test',
      'integration-test',
      'test-plan',
      'testing',
      'validation',
    ],
  },
  {
    name: 'xcodebuild-get-details',
    description: 'Get cached build/test details including logs, errors, and warnings',
    category: 'build',
    keywords: [
      'logs',
      'errors',
      'warnings',
      'details',
      'output',
      'results',
      'cache',
      'progressive-disclosure',
    ],
  },

  // Simulator Discovery & Lifecycle (4 tools)
  {
    name: 'simctl-list',
    description: 'List available iOS simulators with runtime and availability information',
    category: 'simulator',
    keywords: ['simulators', 'devices', 'list', 'available', 'discover', 'runtime', 'ios'],
  },
  {
    name: 'simctl-get-details',
    description: 'Get detailed cached simulator information with full device data',
    category: 'simulator',
    keywords: [
      'details',
      'full-list',
      'device-info',
      'runtimes',
      'cache',
      'progressive-disclosure',
    ],
  },
  {
    name: 'simctl-device',
    description:
      'Manage simulator device lifecycle: boot, shutdown, create, delete, erase, clone, rename',
    category: 'simulator',
    keywords: [
      'boot',
      'shutdown',
      'create',
      'delete',
      'erase',
      'clone',
      'rename',
      'simulator',
      'device',
      'lifecycle',
    ],
    operations: ['boot', 'shutdown', 'create', 'delete', 'erase', 'clone', 'rename'],
  },
  {
    name: 'simctl-health-check',
    description: 'Validate iOS development environment and Xcode setup',
    category: 'simulator',
    keywords: ['health', 'validate', 'environment', 'xcode', 'check', 'setup', 'diagnostics'],
  },

  // App Management (5 tools)
  {
    name: 'simctl-app',
    description: 'Manage apps on simulator via simctl: install, uninstall, launch, terminate',
    category: 'app',
    keywords: [
      'install',
      'uninstall',
      'launch',
      'terminate',
      'app',
      'bundle',
      'simulator',
      'lifecycle',
    ],
    operations: ['install', 'uninstall', 'launch', 'terminate'],
  },
  {
    name: 'simctl-get-app-container',
    description: 'Get app container filesystem path (data, bundle, or group containers)',
    category: 'app',
    keywords: ['container', 'data', 'bundle', 'path', 'group-container', 'filesystem', 'documents'],
  },
  {
    name: 'simctl-openurl',
    description: 'Open URL or deep link in simulator app',
    category: 'app',
    keywords: ['url', 'deeplink', 'open', 'scheme', 'launch', 'navigate', 'link'],
  },
  {
    name: 'simctl-push',
    description: 'Simulate push notification delivery to app',
    category: 'app',
    keywords: ['push', 'notification', 'apns', 'remote-notification', 'payload', 'delivery'],
  },
  {
    name: 'simctl-io',
    description: 'Capture screenshots or record video from simulator',
    category: 'io',
    keywords: ['screenshot', 'video', 'capture', 'record', 'media', 'visual', 'output'],
  },

  // IDB UI Automation (9 tools)
  {
    name: 'idb-targets',
    description: 'Manage IDB targets: list, describe, focus, connect, disconnect',
    category: 'idb',
    keywords: ['targets', 'connect', 'disconnect', 'focus', 'idb', 'device', 'management'],
    operations: ['list', 'describe', 'focus', 'connect', 'disconnect'],
  },
  {
    name: 'idb-ui-describe',
    description: 'Query accessibility tree to get UI elements and their properties',
    category: 'idb',
    keywords: [
      'accessibility',
      'tree',
      'elements',
      'ui',
      'describe',
      'semantic',
      'labels',
      'properties',
    ],
  },
  {
    name: 'idb-ui-find-element',
    description: 'Find UI element by semantic label or accessibility identifier',
    category: 'idb',
    keywords: [
      'find',
      'search',
      'element',
      'label',
      'accessibility',
      'identifier',
      'semantic',
      'locate',
    ],
  },
  {
    name: 'accessibility-quality-check',
    description: 'Quick assessment of UI accessibility richness for automation decision-making',
    category: 'idb',
    keywords: ['accessibility', 'quality', 'check', 'rich', 'semantic', 'assessment', 'evaluation'],
  },
  {
    name: 'idb-ui-tap',
    description: 'Tap at specific UI coordinates to interact with UI elements',
    category: 'idb',
    keywords: ['tap', 'click', 'touch', 'coordinates', 'interact', 'press', 'action'],
  },
  {
    name: 'idb-ui-input',
    description: 'Type text or press keys in simulator (keyboard input)',
    category: 'idb',
    keywords: ['type', 'input', 'text', 'keyboard', 'key', 'enter', 'delete', 'character'],
  },
  {
    name: 'idb-ui-gesture',
    description: 'Perform swipe gestures or hardware button presses',
    category: 'idb',
    keywords: ['swipe', 'gesture', 'scroll', 'button', 'home', 'lock', 'side-button', 'siri'],
  },
  {
    name: 'idb-list-apps',
    description: 'List installed apps on simulator with bundle identifiers',
    category: 'idb',
    keywords: ['apps', 'list', 'installed', 'bundle', 'bundles', 'discover', 'applications'],
  },
  {
    name: 'idb-app',
    description: 'Manage apps via IDB: install, uninstall, launch, terminate',
    category: 'app',
    keywords: ['install', 'uninstall', 'launch', 'terminate', 'idb', 'app', 'bundle', 'lifecycle'],
    operations: ['install', 'uninstall', 'launch', 'terminate'],
  },

  // Cache & System Tools (3 tools)
  {
    name: 'cache',
    description: 'Manage cache settings: get stats, config, set config, or clear',
    category: 'cache',
    keywords: [
      'cache',
      'stats',
      'config',
      'clear',
      'statistics',
      'settings',
      'memory',
      'management',
    ],
    operations: ['get-stats', 'get-config', 'set-config', 'clear'],
  },
  {
    name: 'persistence',
    description: 'Manage cache persistence to disk: enable, disable, or check status',
    category: 'cache',
    keywords: ['persistence', 'disk', 'save', 'load', 'storage', 'enable', 'disable', 'status'],
    operations: ['enable', 'disable', 'status'],
  },
  {
    name: 'screenshot',
    description: 'Capture simulator screenshot as inline base64-encoded image',
    category: 'io',
    keywords: ['screenshot', 'base64', 'image', 'vision', 'visual', 'capture', 'inline'],
  },

  // Documentation Tool (1 tool)
  {
    name: 'rtfm',
    description: 'Read tool documentation: get category docs or specific tool details',
    category: 'system',
    keywords: ['docs', 'documentation', 'help', 'manual', 'guide', 'reference', 'learn', 'rtfm'],
  },

  // Workflow Tools (2 tools) - v3.0.0 Programmatic Tool Calling
  {
    name: 'workflow-tap-element',
    description: 'High-level semantic UI tap: find element by name and tap it in one call',
    category: 'workflow',
    keywords: [
      'workflow',
      'tap',
      'element',
      'semantic',
      'accessibility',
      'click',
      'touch',
      'automation',
      'find',
      'high-level',
    ],
  },
  {
    name: 'workflow-fresh-install',
    description:
      'Clean slate app installation: shutdown, erase, boot, build, install, launch in one call',
    category: 'workflow',
    keywords: [
      'workflow',
      'install',
      'fresh',
      'clean',
      'build',
      'boot',
      'erase',
      'launch',
      'deploy',
      'automation',
    ],
  },
];

/**
 * Search for tools by keyword
 * @param query - Search query (case-insensitive)
 * @returns Array of matching tool metadata
 */
export function searchTools(query: string): ToolMetadata[] {
  const lowerQuery = query.toLowerCase();
  return TOOL_REGISTRY.filter(tool => {
    const matchesName = tool.name.toLowerCase().includes(lowerQuery);
    const matchesDescription = tool.description.toLowerCase().includes(lowerQuery);
    const matchesKeyword = tool.keywords.some(keyword =>
      keyword.toLowerCase().includes(lowerQuery)
    );
    const matchesOperation = tool.operations?.some(op => op.toLowerCase().includes(lowerQuery));
    return matchesName || matchesDescription || matchesKeyword || matchesOperation;
  });
}

/**
 * Get tools by category
 * @param category - Category name
 * @returns Array of tools in the specified category
 */
export function getToolsByCategory(category: string): ToolMetadata[] {
  return TOOL_REGISTRY.filter(tool => tool.category === category);
}

/**
 * Get all unique categories
 * @returns Array of category names
 */
export function getAllCategories(): string[] {
  return Array.from(new Set(TOOL_REGISTRY.map(tool => tool.category))).sort();
}

/**
 * Get tool by name
 * @param name - Tool registration name
 * @returns Tool metadata or undefined if not found
 */
export function getToolByName(name: string): ToolMetadata | undefined {
  return TOOL_REGISTRY.find(tool => tool.name === name);
}
