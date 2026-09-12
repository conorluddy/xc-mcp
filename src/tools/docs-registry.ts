/**
 * Central registry of all tool documentation.
 *
 * This file imports documentation constants from all tool implementations
 * and provides a unified map for the get-tool-docs MCP tool.
 *
 * Documentation is embedded as TypeScript constants to ensure it's
 * bundled with the npm package (no external .md file dependencies).
 */

// Xcodebuild documentation
import { XCODEBUILD_BUILD_DOCS } from './xcodebuild/build.js';
import { XCODEBUILD_CLEAN_DOCS } from './xcodebuild/clean.js';
import { XCODEBUILD_LIST_DOCS } from './xcodebuild/list.js';
import { XCODEBUILD_SHOWSDKS_DOCS } from './xcodebuild/showsdks.js';
import { XCODEBUILD_VERSION_DOCS } from './xcodebuild/version.js';
import { XCODEBUILD_GET_DETAILS_DOCS } from './xcodebuild/get-details.js';
import { XCODEBUILD_TEST_DOCS } from './xcodebuild/xcodebuild-test.js';

// Simctl lifecycle documentation (non-consolidated only)
import { SIMCTL_LIST_DOCS } from './simctl/list.js';
import { SIMCTL_GET_DETAILS_DOCS } from './simctl/get-details.js';
import { SIMCTL_SUGGEST_DOCS } from './simctl/suggest.js';
import { SIMCTL_HEALTH_CHECK_DOCS } from './simctl/health-check.js';

// Simctl app management documentation (non-consolidated only)
import { SIMCTL_GET_APP_CONTAINER_DOCS } from './simctl/get-app-container.js';
import { SIMCTL_OPENURL_DOCS } from './simctl/openurl.js';

// Simctl I/O and testing documentation
import { SIMCTL_IO_DOCS } from './simctl/io.js';
import { SIMCTL_ADDMEDIA_DOCS } from './simctl/addmedia.js';
import { SIMCTL_PRIVACY_DOCS } from './simctl/privacy.js';
import { SIMCTL_PUSH_DOCS } from './simctl/push.js';
import { SIMCTL_PBCOPY_DOCS } from './simctl/pbcopy.js';
import { SIMCTL_STATUS_BAR_DOCS } from './simctl/status-bar.js';
import { SIMCTL_SCREENSHOT_INLINE_DOCS } from './simctl/screenshot-inline.js';
import { SIMCTL_STREAM_LOGS_DOCS } from './simctl/stream-logs.js';

// IDB documentation (non-consolidated only)
import { IDB_TARGETS_DOCS } from './idb/targets.js';
import { IDB_UI_TAP_DOCS } from './idb/ui-tap.js';
import { IDB_UI_INPUT_DOCS } from './idb/ui-input.js';
import { IDB_UI_GESTURE_DOCS } from './idb/ui-gesture.js';
import { IDB_UI_DESCRIBE_DOCS } from './idb/ui-describe.js';
import { IDB_UI_FIND_ELEMENT_DOCS } from './idb/ui-find-element.js';
import { ACCESSIBILITY_QUALITY_CHECK_DOCS } from './idb/accessibility-quality-check.js';
import { IDB_LIST_APPS_DOCS } from './idb/list-apps.js';

// Cache documentation (non-consolidated only)

// Workflow documentation (v3.0.0)
import { WORKFLOW_TAP_ELEMENT_DOCS } from './workflows/tap-element.js';
import { WORKFLOW_FRESH_INSTALL_DOCS } from './workflows/fresh-install.js';
import { BUILD_AND_RUN_DOCS } from './workflows/build-and-run.js';
import { XCODEBUILD_INSPECT_SCHEME_DOCS } from './xcodebuild/inspect-scheme.js';
import { XCODEBUILD_VALIDATE_CAPABILITIES_DOCS } from './xcodebuild/validate-capabilities.js';
// Discrete tool docs (v4 — routers dissolved into discrete tools)
import { SIMCTL_BOOT_DOCS } from './simctl/boot.js';
import { SIMCTL_SHUTDOWN_DOCS } from './simctl/shutdown.js';
import { SIMCTL_CREATE_DOCS } from './simctl/create.js';
import { SIMCTL_DELETE_DOCS } from './simctl/delete.js';
import { SIMCTL_ERASE_DOCS } from './simctl/erase.js';
import { SIMCTL_CLONE_DOCS } from './simctl/clone.js';
import { SIMCTL_RENAME_DOCS } from './simctl/rename.js';
import { SIMCTL_INSTALL_DOCS } from './simctl/install.js';
import { SIMCTL_UNINSTALL_DOCS } from './simctl/uninstall.js';
import { SIMCTL_LAUNCH_DOCS } from './simctl/launch.js';
import { SIMCTL_TERMINATE_DOCS } from './simctl/terminate.js';
import { IDB_INSTALL_DOCS } from './idb/install.js';
import { IDB_UNINSTALL_DOCS } from './idb/uninstall.js';
import { IDB_LAUNCH_DOCS } from './idb/launch.js';
import { IDB_TERMINATE_DOCS } from './idb/terminate.js';
import { CACHE_GET_STATS_DOCS } from './cache/get-stats.js';
import { CACHE_GET_CONFIG_DOCS } from './cache/get-config.js';
import { CACHE_SET_CONFIG_DOCS } from './cache/set-config.js';
import { CACHE_CLEAR_DOCS } from './cache/clear.js';
import { PERSISTENCE_ENABLE_DOCS } from './persistence/enable.js';
import { PERSISTENCE_DISABLE_DOCS } from './persistence/disable.js';
import { PERSISTENCE_STATUS_DOCS } from './persistence/status.js';
// Phase 2 — feature parity tools
import { SIMCTL_APPEARANCE_DOCS } from './simctl/appearance.js';
import { SIMCTL_LOCATION_DOCS } from './simctl/location.js';
import { SIMCTL_CONTAINER_DOCS } from './simctl/container.js';
import { ACCESSIBILITY_AUDIT_DOCS } from './idb/accessibility-audit.js';
import { LOCALIZATION_AUDIT_DOCS } from './analysis/localization-audit.js';
import { XCODE_MODEL_INSPECT_DOCS } from './analysis/model-inspect.js';
import { VISUAL_DIFF_DOCS } from './io/visual-diff.js';
import {
  HANG_START_DOCS,
  HANG_STOP_DOCS,
  HANG_GET_DETAILS_DOCS,
  HANG_LIST_DOCS,
} from './diagnostics/hang/tools.js';
import { IDB_DOCTOR_DOCS } from './diagnostics/idb-doctor.js';
import { TEST_RECORD_STEP_DOCS } from './workflows/test-record-step.js';
import { TEST_RECORD_REPORT_DOCS } from './workflows/test-record-report.js';

// ============================================================================
// RTFM AND SCREENSHOT-SAVE TOOL DOCS
// ============================================================================
// These are defined here instead of in get-tool-docs.ts to avoid circular
// dependency (get-tool-docs.ts imports TOOL_DOCS from this file)

export const SCREENSHOT_SAVE_DOCS = `
# screenshot-save

📸 **File-Based Screenshot Alias** - Save screenshots/videos to files via simctl-io.

## Overview

\`screenshot-save\` is a convenience alias for the file-based variant of \`simctl-io\`. Use this when you want to save screenshots or videos to disk files. For inline base64 screenshots optimized for vision models, use the \`screenshot\` tool instead.

## Relationship to Other Tools

- **screenshot-save** → Saves to file (uses \`simctl-io\`)
- **screenshot** → Returns inline base64 with coordinate metadata (uses \`simctl-screenshot-inline\`)
- **simctl-io** → Direct access to I/O operations (screenshots, videos, both file-based)

## When to Use

**Use screenshot-save when:**
- You need to save screenshots to specific file paths
- Recording videos for later playback
- Building test artifacts for CI/CD pipelines
- Creating screenshot archives

**Use screenshot instead when:**
- Working with AI vision models (Claude, GPT-4V)
- Need coordinate transformation metadata for UI automation
- Want immediate inline image analysis
- Token efficiency is important (half-size default)

## Parameters

All parameters are passed directly to \`simctl-io\`:

- **udid** (optional): Simulator UDID (auto-detects if not provided)
- **operation**: "screenshot" or "video"
- **appName** (optional): App name for semantic naming (e.g., "MyApp")
- **screenName** (optional): Screen/view name (e.g., "LoginScreen")
- **state** (optional): UI state (e.g., "Empty", "Filled", "Loading")
- **outputPath** (optional): Custom output file path
- **codec** (optional): Video codec for recordings (h264, hevc, prores)

## Examples

### Basic Screenshot
\`\`\`typescript
{
  "tool": "screenshot-save",
  "arguments": {
    "operation": "screenshot"
  }
}
\`\`\`

### Semantic Screenshot Naming
\`\`\`typescript
{
  "tool": "screenshot-save",
  "arguments": {
    "operation": "screenshot",
    "appName": "MyApp",
    "screenName": "LoginScreen",
    "state": "Empty"
  }
}
// Saves to: MyApp_LoginScreen_Empty_2025-01-24.png
\`\`\`

### Custom Output Path
\`\`\`typescript
{
  "tool": "screenshot-save",
  "arguments": {
    "operation": "screenshot",
    "outputPath": "/tmp/my-screenshot.png"
  }
}
\`\`\`

### Video Recording
\`\`\`typescript
{
  "tool": "screenshot-save",
  "arguments": {
    "operation": "video",
    "codec": "h264"
  }
}
\`\`\`

## Returns

File path to saved screenshot/video with success confirmation.

Example response:
\`\`\`json
{
  "success": true,
  "filePath": "/path/to/MyApp_LoginScreen_Empty_2025-01-24.png",
  "operation": "screenshot",
  "guidance": [
    "Screenshot saved successfully",
    "File: /path/to/MyApp_LoginScreen_Empty_2025-01-24.png",
    "Use 'screenshot' tool for inline base64 variant with coordinate metadata"
  ]
}
\`\`\`

## Related Tools

- **screenshot**: Inline base64 screenshots with vision model optimization
- **simctl-io**: Direct I/O operations (supports both screenshot and video)
- **simctl-addmedia**: Add images/videos to simulator photo library

## Implementation Note

This tool is registered as an alias in \`src/index.ts\` and delegates directly to the \`simctl-io\` tool implementation. It exists for clarity and convenience - the name makes the file-based behavior explicit.

## Notes

- Auto-detects booted simulator if udid not provided
- Semantic naming helps organize test artifacts
- Video recording runs until stopped (Ctrl+C)
- Screenshots saved as PNG by default
- File paths are absolute and returned in response
`;

export const RTFM_DOCS = `
# rtfm

📖 **Read The Manual** - Progressive disclosure documentation system for all XC-MCP tools.

## Overview

The rtfm tool provides access to comprehensive documentation for any of the discrete tools in this MCP server. This implements progressive disclosure: run the server with \`--mini\` to reduce every tool description to a one-liner, then call rtfm for full parameters, examples and related tools on demand.

**Version History:**
- v1.x: 51 individual tools; v1.3.2 introduced rtfm
- v2.0-v3.x: 28-30 tools behind operation-enum routers
- v4.x: routers dissolved; discrete tools with per-tool annotations and outputSchema

## Why rtfm?

**Problem Solved**: Tool documentation was originally stored in .md files within the src/ directory, which wouldn't be available in the published npm package (only dist/ is included in package.json "files" field).

**Solution**: Documentation is now embedded as TypeScript constants in each tool file, bundled into the compiled JavaScript, and accessible via this rtfm tool. This ensures documentation is always available, whether in development or in the published npm package.

## Parameters

- **toolName** (optional): Name of specific tool to get documentation for
  - Examples: "xcodebuild-build", "simctl-boot", "idb-ui-tap", "cache-get-stats"
  - Case-sensitive, must match exact tool registration name
- **categoryName** (optional): Browse tools in a specific category
  - Examples: "build", "simulator", "app", "idb", "cache", "system"
  - Omit both parameters to see all categories

## Examples

\`\`\`typescript
// Get documentation for a specific tool
rtfm({ toolName: "simctl-boot" })

// Removed router names still fuzzy-match to their replacements
rtfm({ toolName: "simctl-device" })

// Browse all tools in the cache category
rtfm({ categoryName: "cache" })

// View all categories (no parameters)
rtfm({})
\`\`\`

## Migration to v4.0 (routers removed)

**v2/v3 consolidated routers were dissolved back into discrete tools.** Annotations and
outputSchema are per-tool, so each operation is now its own tool. Drop the \`operation\` field and
call the matching tool name — operation-specific parameters are unchanged:

- **simctl-device**(operation) → \`simctl-boot\`, \`simctl-shutdown\`, \`simctl-create\`, \`simctl-delete\`, \`simctl-erase\`, \`simctl-clone\`, \`simctl-rename\`
- **simctl-app**(operation) → \`simctl-install\`, \`simctl-uninstall\`, \`simctl-launch\`, \`simctl-terminate\`
- **idb-app**(operation) → \`idb-install\`, \`idb-uninstall\`, \`idb-launch\`, \`idb-terminate\`
- **cache**(operation) → \`cache-get-stats\`, \`cache-get-config\`, \`cache-set-config\`, \`cache-clear\`
- **persistence**(operation) → \`persistence-enable\`, \`persistence-disable\`, \`persistence-status\`

\`idb-targets\` keeps its operation enum (list/describe/focus/connect/disconnect). Passing a removed
router name to this tool returns fuzzy suggestions for its replacements.

## Response Format

### Success Response
Returns full markdown documentation including:
- Tool description and purpose
- Advantages over direct CLI usage
- Parameter specifications with types and descriptions
- Usage examples
- Related tools
- Common patterns and best practices

### Tool Not Found Response
If toolName doesn't match any registered tool:
- Error message with the attempted tool name
- Suggestions based on partial matches (up to 5)
- Complete list of all available tools

Example:
\`\`\`
No documentation found for tool: "simctl-boo"

Did you mean one of these?
  - simctl-boot
  - simctl-shutdown

Available tools (28 total):
  - xcodebuild-*
  - simctl-*
  - idb-*
  - cache
  - persistence
  - rtfm
\`\`\`

## Available Tool Categories (v2.0)

**Xcodebuild Tools (7)**
- xcodebuild-version, xcodebuild-list, xcodebuild-showsdks
- xcodebuild-build, xcodebuild-clean, xcodebuild-test
- xcodebuild-get-details

**Simctl Lifecycle Tools**
- simctl-list, simctl-get-details, simctl-boot, simctl-shutdown, simctl-create, simctl-delete, simctl-erase, simctl-clone, simctl-rename
- simctl-suggest, simctl-health-check

**Simctl App Management Tools**
- simctl-install, simctl-uninstall, simctl-launch, simctl-terminate
- simctl-get-app-container, simctl-container, simctl-openurl

**Simctl I/O & Testing Tools (7)**
- simctl-io, simctl-addmedia, simctl-privacy, simctl-push
- simctl-pbcopy, simctl-status-bar, screenshot

**IDB Tools**
- idb-targets (list/describe/focus/connect/disconnect)
- idb-ui-tap, idb-ui-input, idb-ui-gesture, idb-ui-describe, idb-ui-find-element, idb-list-apps
- idb-install, idb-uninstall, idb-launch, idb-terminate

**Cache Management Tools (4)**
- cache-get-stats, cache-get-config, cache-set-config, cache-clear

**Persistence Tools (3)**
- persistence-enable, persistence-disable, persistence-status

**Documentation Tool (1)**
- rtfm (this tool!)

## Implementation Details

### Documentation Storage
Each tool file exports a \`TOOL_NAME_DOCS\` constant containing its full documentation in markdown format:

\`\`\`typescript
// Example from src/tools/simctl/boot.ts
export const SIMCTL_BOOT_DOCS = \`
# simctl-boot
...
\`;
\`\`\`

### Central Registry
All documentation constants are imported and mapped in \`src/tools/docs-registry.ts\`:

\`\`\`typescript
export const TOOL_DOCS: Record<string, string> = {
  'simctl-boot': SIMCTL_BOOT_DOCS,
  'xcodebuild-build': XCODEBUILD_BUILD_DOCS,
  // ... 49 more tools
};
\`\`\`

### Progressive Disclosure Pattern
1. Tool list shows concise descriptions (~300-400 tokens)
2. Each description ends with: "📖 Use rtfm with toolName: '{name}' for full documentation."
3. Full documentation accessed only when explicitly requested via rtfm
4. Prevents token overflow while maintaining comprehensive documentation access

## Benefits

✅ **Self-contained**: No external file dependencies
✅ **NPM package ready**: Documentation bundled in compiled JavaScript
✅ **Token efficient**: Progressive disclosure keeps default views concise
✅ **Always available**: Works in development and production
✅ **Type-safe**: TypeScript constants with proper typing
✅ **Searchable**: Fuzzy matching with suggestions for typos
✅ **Comprehensive**: Full documentation including examples and parameters

## Common Use Cases

**Explore available tools**:
\`\`\`typescript
// Intentionally use invalid tool name to see full list
rtfm({ toolName: "help" })
\`\`\`

**Learn specific tool usage**:
\`\`\`typescript
rtfm({ toolName: "simctl-boot" })
\`\`\`

**Understand tool parameters**:
\`\`\`typescript
rtfm({ toolName: "xcodebuild-build" })
\`\`\`

**Find related tools**:
\`\`\`typescript
// Search by category prefix
rtfm({ toolName: "simctl" })  // Shows simctl-* suggestions
\`\`\`

## Related Tools

- **cache-get-stats**: Monitor cache performance and usage

## Notes

- Tool names are case-sensitive and must match exact registration names
- Fuzzy matching provides suggestions for close matches
- Documentation format is consistent markdown across all tools
- Each tool's documentation is independently maintained in its source file
- The TOOL_DOCS registry is automatically updated when tools are added/removed
`;

export const RTFM_DOCS_MINI = 'Get tool documentation. Use rtfm({ toolName: "rtfm" }) for docs.';

export const SCREENSHOT_SAVE_DOCS_MINI =
  'Save screenshot to file. Use rtfm({ toolName: "screenshot-save" }) for docs.';

/**
 * Tool categories for progressive discovery
 */
export const TOOL_CATEGORIES: Record<string, string[]> = {
  build: [
    'xcodebuild-version',
    'xcodebuild-list',
    'xcodebuild-showsdks',
    'xcodebuild-build',
    'xcodebuild-clean',
    'xcodebuild-test',
    'xcodebuild-get-details',
    'xcodebuild-inspect-scheme',
    'xcodebuild-validate-capabilities',
  ],
  simulator: [
    'simctl-list',
    'simctl-get-details',
    'simctl-boot',
    'simctl-shutdown',
    'simctl-suggest',
    'simctl-create',
    'simctl-delete',
    'simctl-erase',
    'simctl-clone',
    'simctl-rename',
    'simctl-health-check',
  ],
  app: [
    'simctl-install',
    'simctl-uninstall',
    'simctl-get-app-container',
    'simctl-container',
    'simctl-launch',
    'simctl-terminate',
    'simctl-openurl',
  ],
  devicestate: ['simctl-appearance', 'simctl-location'],
  analysis: ['localization-audit', 'xcode-model-inspect', 'visual-diff'],
  idb: [
    // ============================================================================
    // DISCOVERY TOOLS (TRY THESE FIRST) - Accessibility-first automation
    // ============================================================================
    'accessibility-quality-check',
    'accessibility-audit',
    'idb-ui-describe',
    'idb-ui-find-element',
    // ============================================================================
    // INTERACTION TOOLS - Use coordinates from discovery tools
    // ============================================================================
    'idb-ui-tap',
    'idb-ui-input',
    'idb-ui-gesture',
    // ============================================================================
    // MANAGEMENT TOOLS - App and target management
    // ============================================================================
    'idb-targets',
    'idb-list-apps',
    'idb-install',
    'idb-launch',
    'idb-terminate',
    'idb-uninstall',
  ],
  io: ['simctl-io', 'simctl-addmedia', 'screenshot'],
  testing: [
    'simctl-privacy',
    'simctl-push',
    'simctl-pbcopy',
    'simctl-status-bar',
    'simctl-stream-logs',
  ],
  cache: ['cache-get-stats', 'cache-get-config', 'cache-set-config', 'cache-clear'],
  system: [
    'persistence-enable',
    'persistence-disable',
    'persistence-status',
    'rtfm',
    'screenshot-save',
  ],
  workflow: [
    'workflow-tap-element',
    'workflow-fresh-install',
    'workflow-build-and-run',
    'test-record-step',
    'test-record-report',
  ],
  diagnostics: ['idb-doctor', 'hang-start', 'hang-stop', 'hang-get-details', 'hang-list'],
};

export const CATEGORY_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
  build: {
    name: 'Build & Test Operations',
    description: 'Build, test, and manage Xcode projects with intelligent defaults',
  },
  simulator: {
    name: 'Simulator Lifecycle',
    description: 'Create, boot, manage, and configure iOS simulators',
  },
  app: {
    name: 'App Management',
    description: 'Install, launch, and control apps on simulators',
  },
  idb: {
    name: 'UI Automation',
    description: 'Programmatic UI interaction via IDB (tap, input, gestures, accessibility)',
  },
  io: {
    name: 'I/O & Media',
    description: 'Screenshots, videos, and photo library management',
  },
  testing: {
    name: 'Testing Features',
    description: 'Advanced testing capabilities (permissions, push notifications, status bar)',
  },
  cache: {
    name: 'Cache Management',
    description: 'Monitor and configure progressive disclosure caching',
  },
  system: {
    name: 'System & Documentation',
    description: 'Persistence, documentation, and utility tools',
  },
  workflow: {
    name: 'Workflow Orchestration',
    description: 'Multi-step automated workflows for common tasks (v3.0.0)',
  },
  devicestate: {
    name: 'Device State & Environment',
    description: 'Simulate appearance, Dynamic Type, locale/RTL, and GPS location',
  },
  analysis: {
    name: 'Static Analysis & Diffing',
    description:
      'Audit localization catalogs, inspect Core Data/SwiftData models, diff screenshots',
  },
  diagnostics: {
    name: 'Runtime Diagnostics',
    description: 'Diagnose the idb environment and capture/cluster main-thread hangs (HangBuster)',
  },
};

/**
 * Get all tools in a category
 */
export function getToolsByCategory(categoryKey: string): string[] | undefined {
  return TOOL_CATEGORIES[categoryKey];
}

/**
 * Get category key for a tool name
 */
export function getCategoryForTool(toolName: string): string | undefined {
  for (const [categoryKey, tools] of Object.entries(TOOL_CATEGORIES)) {
    if (tools.includes(toolName)) {
      return categoryKey;
    }
  }
  return undefined;
}

/**
 * Get all category keys
 */
export function getAllCategories(): string[] {
  return Object.keys(TOOL_CATEGORIES);
}

/**
 * Map of tool names to their full documentation.
 * Tool names match the MCP tool registration names.
 */
export const TOOL_DOCS: Record<string, string> = {
  // Xcodebuild tools
  'xcodebuild-build': XCODEBUILD_BUILD_DOCS,
  'xcodebuild-clean': XCODEBUILD_CLEAN_DOCS,
  'xcodebuild-list': XCODEBUILD_LIST_DOCS,
  'xcodebuild-showsdks': XCODEBUILD_SHOWSDKS_DOCS,
  'xcodebuild-version': XCODEBUILD_VERSION_DOCS,
  'xcodebuild-get-details': XCODEBUILD_GET_DETAILS_DOCS,
  'xcodebuild-test': XCODEBUILD_TEST_DOCS,
  'xcodebuild-inspect-scheme': XCODEBUILD_INSPECT_SCHEME_DOCS,
  'xcodebuild-validate-capabilities': XCODEBUILD_VALIDATE_CAPABILITIES_DOCS,

  // Simctl lifecycle tools (non-consolidated)
  'simctl-list': SIMCTL_LIST_DOCS,
  'simctl-get-details': SIMCTL_GET_DETAILS_DOCS,
  'simctl-suggest': SIMCTL_SUGGEST_DOCS,
  'simctl-health-check': SIMCTL_HEALTH_CHECK_DOCS,

  // Simctl app management tools (non-consolidated)
  'simctl-get-app-container': SIMCTL_GET_APP_CONTAINER_DOCS,
  'simctl-openurl': SIMCTL_OPENURL_DOCS,

  // Simctl I/O and testing tools
  'simctl-io': SIMCTL_IO_DOCS,
  'simctl-addmedia': SIMCTL_ADDMEDIA_DOCS,
  'simctl-privacy': SIMCTL_PRIVACY_DOCS,
  'simctl-push': SIMCTL_PUSH_DOCS,
  'simctl-pbcopy': SIMCTL_PBCOPY_DOCS,
  'simctl-status-bar': SIMCTL_STATUS_BAR_DOCS,
  screenshot: SIMCTL_SCREENSHOT_INLINE_DOCS,
  'simctl-stream-logs': SIMCTL_STREAM_LOGS_DOCS,
  'simctl-appearance': SIMCTL_APPEARANCE_DOCS,
  'simctl-location': SIMCTL_LOCATION_DOCS,
  'simctl-container': SIMCTL_CONTAINER_DOCS,

  // IDB tools (non-consolidated)
  'idb-targets': IDB_TARGETS_DOCS,
  'idb-ui-tap': IDB_UI_TAP_DOCS,
  'idb-ui-input': IDB_UI_INPUT_DOCS,
  'idb-ui-gesture': IDB_UI_GESTURE_DOCS,
  'idb-ui-describe': IDB_UI_DESCRIBE_DOCS,
  'idb-ui-find-element': IDB_UI_FIND_ELEMENT_DOCS,
  'accessibility-quality-check': ACCESSIBILITY_QUALITY_CHECK_DOCS,
  'accessibility-audit': ACCESSIBILITY_AUDIT_DOCS,
  'idb-list-apps': IDB_LIST_APPS_DOCS,
  'localization-audit': LOCALIZATION_AUDIT_DOCS,
  'xcode-model-inspect': XCODE_MODEL_INSPECT_DOCS,
  'visual-diff': VISUAL_DIFF_DOCS,

  // Cache tools (non-consolidated)

  // Documentation tool
  rtfm: RTFM_DOCS,

  // Workflow tools (v3.0.0)
  'workflow-tap-element': WORKFLOW_TAP_ELEMENT_DOCS,
  'workflow-fresh-install': WORKFLOW_FRESH_INSTALL_DOCS,
  'workflow-build-and-run': BUILD_AND_RUN_DOCS,
  'test-record-step': TEST_RECORD_STEP_DOCS,
  'test-record-report': TEST_RECORD_REPORT_DOCS,
  'hang-start': HANG_START_DOCS,
  'hang-stop': HANG_STOP_DOCS,
  'hang-get-details': HANG_GET_DETAILS_DOCS,
  'hang-list': HANG_LIST_DOCS,
  'idb-doctor': IDB_DOCTOR_DOCS,

  // Discrete tools (v4 — dissolved from v2/v3 routers, each documents its own usage)
  // Simctl device lifecycle
  'simctl-boot': SIMCTL_BOOT_DOCS,
  'simctl-shutdown': SIMCTL_SHUTDOWN_DOCS,
  'simctl-create': SIMCTL_CREATE_DOCS,
  'simctl-delete': SIMCTL_DELETE_DOCS,
  'simctl-erase': SIMCTL_ERASE_DOCS,
  'simctl-clone': SIMCTL_CLONE_DOCS,
  'simctl-rename': SIMCTL_RENAME_DOCS,

  // Simctl app lifecycle
  'simctl-install': SIMCTL_INSTALL_DOCS,
  'simctl-uninstall': SIMCTL_UNINSTALL_DOCS,
  'simctl-launch': SIMCTL_LAUNCH_DOCS,
  'simctl-terminate': SIMCTL_TERMINATE_DOCS,

  // IDB app lifecycle
  'idb-install': IDB_INSTALL_DOCS,
  'idb-uninstall': IDB_UNINSTALL_DOCS,
  'idb-launch': IDB_LAUNCH_DOCS,
  'idb-terminate': IDB_TERMINATE_DOCS,

  // Cache management
  'cache-get-stats': CACHE_GET_STATS_DOCS,
  'cache-get-config': CACHE_GET_CONFIG_DOCS,
  'cache-set-config': CACHE_SET_CONFIG_DOCS,
  'cache-clear': CACHE_CLEAR_DOCS,

  // Persistence
  'persistence-enable': PERSISTENCE_ENABLE_DOCS,
  'persistence-disable': PERSISTENCE_DISABLE_DOCS,
  'persistence-status': PERSISTENCE_STATUS_DOCS,

  // Tool aliases
  'screenshot-save': SCREENSHOT_SAVE_DOCS,
};
