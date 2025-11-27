# XC-MCP: Intelligent Xcode MCP Server

[![npm version](https://img.shields.io/npm/v/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![npm downloads](https://img.shields.io/npm/dm/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![Node.js version](https://img.shields.io/node/v/xc-mcp.svg)](https://nodejs.org)
[![codecov](https://codecov.io/gh/conorluddy/xc-mcp/graph/badge.svg?token=4CKBMDTENZ)](https://codecov.io/gh/conorluddy/xc-mcp)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/conorluddy/xc-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Production-grade MCP server for Xcode workflows — optimized for AI agents with accessibility-first iOS automation**

XC-MCP makes Xcode and iOS simulator tooling accessible to AI agents through intelligent context engineering. **V3.0.0 adds platform-native `defer_loading` support** — Claude's tool search automatically discovers tools on-demand, minimizing baseline context overhead while maintaining full 29-tool functionality.

<img width="807" height="727" alt="Screenshot 2025-11-07 at 08 37 00" src="https://github.com/user-attachments/assets/141de013-947e-458e-acaf-91c039f0f48e" />


---

## Why XC-MCP?

### The Problem: Token Overflow Breaks MCP Clients

Traditional Xcode CLI wrappers dump massive output that exceeds MCP protocol limits:
- `simctl list`: 57,000+ tokens (unusable in MCP context)
- Build logs: 135,000+ tokens (catastrophic overflow)
- Screenshot-first automation: 170 tokens per screen, 2000ms latency
- No state memory between operations

### The Solution: Progressive Disclosure + Accessibility-First

**V3.0.0 Architecture:**
```
Platform-native defer_loading on all 29 tools
├─ Claude's tool search discovers tools automatically
├─ Tools loaded on-demand (minimal baseline overhead)
├─ Accessibility-first workflow (50 tokens, 120ms vs 170 tokens, 2000ms)
└─ Workflow tools for common operations (fresh-install, tap-element)
```

**Token Efficiency Evolution:**

| Version | Baseline Tokens | Total Tools | Architecture | Context Available |
|---------|-----------------|-------------|--------------|-------------------|
| Pre-RTFM (v1.2.1) | ~45k | 51 | Individual tools | 3.9% (155k) |
| V1.3.2 (RTFM) | ~30k | 51 | Individual + RTFM | 1.5% (170k) |
| V2.0.0 | ~18.7k | 28 | Routers + Full Docs | 9.3% (181k) |
| **V3.0.0** | **~0** | **29** | **Platform defer_loading** | **100% (200k)** |

**Key Improvements (V3.0.0):**
- ✅ **Platform-native defer_loading** - All tools deferred; Claude discovers on-demand
- ✅ **Workflow tools** - High-level abstractions for common operations
- ✅ **Zero baseline overhead** - Platform handles tool discovery
- ✅ **Accessibility-first automation** (3-4x faster, 3-4x cheaper than screenshots)
- ✅ **Progressive disclosure** (summaries → cache IDs → full details on demand)
- ✅ **60% test coverage** with comprehensive error handling

---

## Quick Start

```bash
# Install globally
npm install -g xc-mcp

# Or run without installation
npx xc-mcp
```

**MCP Configuration** (Claude Desktop):

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "npx",
      "args": ["-y", "xc-mcp"]
    }
  }
}
```

**Minimal Mode** (for Claude Code and other clients that don't support `defer_loading`):
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "npx",
      "args": ["-y", "xc-mcp", "--mini"]
    }
  }
}
```
The `--mini` flag reduces tool descriptions from ~18.7k tokens to ~540 tokens (~97% reduction). Use `rtfm` for full documentation on-demand.

**Build-Only Mode** (for build-focused workflows without UI automation):
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "npx",
      "args": ["-y", "xc-mcp", "--build-only"]
    }
  }
}
```
The `--build-only` flag loads only 11 tools (vs 30): xcodebuild tools, simctl-list, cache, and system tools. Excludes IDB/UI automation and workflow tools. Combine with `--mini` for maximum reduction: `["--mini", "--build-only"]`.

---

## Token Optimization Architecture

### Progressive Disclosure Pattern

XC-MCP returns concise summaries first, with cache IDs for on-demand detail retrieval:

**Example: Simulator List** (96% token reduction)
```typescript
// 1. Get summary (2,000 tokens vs 57,000 raw)
simctl-list({ deviceType: "iPhone" })
// Returns:
{
  cacheId: "sim-abc123",
  summary: { totalDevices: 47, availableDevices: 31, bootedDevices: 1 },
  quickAccess: { bootedDevices: [...], recentlyUsed: [...] }
}

// 2. Get full details only if needed
simctl-get-details({
  cacheId: "sim-abc123",
  detailType: "available-only",
  maxDevices: 10
})
```

**Example: Build Operations**
```typescript
// 1. Build returns summary + buildId
xcodebuild-build({ projectPath: "./MyApp.xcworkspace", scheme: "MyApp" })
// Returns:
{
  buildId: "build-xyz789",
  success: true,
  summary: { duration: 7075, errorCount: 0, warningCount: 1 }
}

// 2. Access full logs only when debugging
xcodebuild-get-details({ buildId: "build-xyz789", detailType: "full-log" })
```

### RTFM On-Demand Documentation

**Discovery Workflow:**
```typescript
// 1. Browse tool categories
rtfm({ categoryName: "build" })
// Returns: List of build tools with brief descriptions

// 2. Get comprehensive docs for specific tool
rtfm({ toolName: "xcodebuild-build" })
// Returns: Full documentation with parameters, examples, related tools

// 3. Execute with consolidated operations
xcodebuild-build({ scheme: "MyApp", configuration: "Debug" })
```

**Why RTFM?**
- Tool descriptions: <10 words + "See rtfm for details"
- Full docs retrieved only when needed
- 80% token savings vs traditional verbose MCP servers

### Operation Enum Consolidation

**Before V2.0:** 21 individual tools
```typescript
simctl-boot, simctl-shutdown, simctl-create, simctl-delete,
simctl-erase, simctl-clone, simctl-rename, simctl-install,
simctl-uninstall, simctl-launch, simctl-terminate...
```

**V2.0:** 6 consolidated routers
```typescript
simctl-device({ operation: "boot" | "shutdown" | "create" | "delete" | "erase" | "clone" | "rename" })
simctl-app({ operation: "install" | "uninstall" | "launch" | "terminate" })
idb-app({ operation: "install" | "uninstall" | "launch" | "terminate" })
cache({ operation: "get-stats" | "get-config" | "set-config" | "clear" })
persistence({ operation: "enable" | "disable" | "status" })
idb-targets({ operation: "list" | "describe" | "connect" | "disconnect" })
```

**Result:** 40% token reduction through shared parameter schemas and unified documentation.

---

## Accessibility-First iOS Automation

### Our Philosophy

XC-MCP promotes **accessibility-first** automation because it:

1. **Encourages better apps**: Developers building accessible UIs benefit all users (screen readers, voice control, assistive technologies)
2. **Enables precise AI interaction**: Semantic element discovery via accessibility tree vs visual guesswork from screenshots
3. **Improves efficiency**: 3-4x faster execution, 3-4x cheaper token cost
4. **Reduces energy usage**: Skip computationally expensive image processing entirely

### Objective Performance Data

| Approach | Tokens | Latency | Use Case |
|----------|--------|---------|----------|
| **Accessibility Tree** | ~50 | ~120ms | Rich UIs with >3 tappable elements |
| **Screenshot Analysis** | ~170 | ~2000ms | Minimal UIs with ≤1 tappable element |
| **Efficiency Gain** | **3.4x cheaper** | **16x faster** | When accessibility sufficient |

### Accessibility-First Workflow

```typescript
// 1. ALWAYS assess quality first
accessibility-quality-check({ screenContext: "LoginScreen" })
// Returns:
{
  quality: "rich" | "moderate" | "minimal",
  recommendation: "accessibility-ready" | "consider-screenshot",
  elementCounts: { total: 12, tappable: 8, textFields: 2 }
}

// 2. Decision branch based on quality
if (quality === "rich" || quality === "moderate") {
  // Use accessibility tree (faster, cheaper)
  idb-ui-find-element({ query: "login" })
  // Returns: { centerX: 200, centerY: 400, label: "Login" }

  idb-ui-tap({ x: 200, y: 400 })
  // Precise coordinate-based interaction

} else if (quality === "minimal") {
  // Fall back to screenshot (last resort)
  screenshot({ size: "half", screenName: "LoginScreen" })
  // Visual analysis when accessibility insufficient
}
```

**Why This Matters:**

- **For Users**: Encourages inclusive app development benefiting everyone
- **For AI Agents**: Precise semantic targeting vs visual pattern matching
- **For Efficiency**: 50 tokens (accessibility) vs 170 tokens (screenshot)
- **For Speed**: 120ms (accessibility) vs 2000ms (screenshot)
- **For Energy**: Skip image encoding/decoding/analysis entirely

### Accessibility Tools (3 specialized)

**`accessibility-quality-check`**: Rapid assessment without full tree query
- Returns: `rich` (>3 tappable) | `moderate` (2-3) | `minimal` (≤1)
- Use case: Decision point before screenshot vs accessibility
- Cost: ~30 tokens, ~80ms

**`idb-ui-find-element`**: Semantic element search by label/identifier
- Returns: Tap-ready coordinates (centerX, centerY) with frame boundaries
- Use case: Find specific button, field, or cell without visual analysis
- Cost: ~40 tokens, ~120ms

**`idb-ui-describe`**: Full accessibility tree with progressive disclosure
- Operation `all`: Summary + uiTreeId for full tree retrieval
- Operation `point`: Element details at specific coordinates
- Use case: Discover all interactive elements, validate tap coordinates
- Cost: ~50 tokens for summary, ~500 tokens for full tree

---

## Platform defer_loading (V3.0.0 Feature)

### How It Works

XC-MCP V3.0 adds the `defer_loading: true` flag to all 29 tool registrations. Claude's platform-native tool search automatically:

1. **Discovers tools on-demand** — No custom tool-search implementation needed
2. **Loads tools when relevant** — Based on conversation context
3. **Minimizes baseline overhead** — Zero tokens at startup

### RTFM: On-Demand Documentation

Use `rtfm` to get comprehensive documentation for any tool:

```typescript
// 1. Browse tool categories
rtfm({ categoryName: "build" })
// Returns all build-related tools with descriptions

// 2. Get comprehensive docs for specific tool
rtfm({ toolName: "xcodebuild-build" })
// Returns full documentation with parameters, examples, related tools

// 3. Execute with discovered parameters
xcodebuild-build({ scheme: "MyApp", configuration: "Debug" })
```

### Environment Variable: Disable defer_loading

**Default (V3.0.0)**: All tools have defer_loading enabled
```bash
# Platform discovers and loads tools automatically
# Zero baseline token overhead
```

**Disable defer_loading** (for debugging/testing):
```bash
# Set environment variable to load all tools at startup
export XC_MCP_DEFER_LOADING=false

# All 29 tools loaded immediately (~18.7k tokens)
# Useful for: Testing, debugging, MCP client compatibility
```

---

## Workflow Tools (New in V3.0.0)

XC-MCP provides 2 high-level **workflow tools** that combine common operations into single steps:

### `workflow-tap-element` — High-Level Semantic Tap

Combines accessibility quality check + element search + tap into one operation:

```typescript
workflow-tap-element({
  elementQuery: "Login",
  screenContext: "LoginScreen",
  inputText: "user@example.com",  // optional: type after tap
  verifyResult: true               // optional: screenshot after action
})
// Does:
// 1. Quality check screen accessibility
// 2. Find element by name/label
// 3. Tap coordinates
// 4. Optionally type text
// 5. Optionally take verification screenshot
// Returns: { success: true, tappedElement: {...}, screenshot?: {...} }
```

**Cost**: ~90 tokens (vs 130 tokens separately)
**Latency**: ~300ms (vs ~400ms separately)
**Use case**: User login, form submission, navigation flows

### `workflow-fresh-install` — Clean Install Workflow

Performs complete app refresh: shutdown → (erase) → boot → build → install → launch

```typescript
workflow-fresh-install({
  projectPath: "./MyApp.xcworkspace",
  scheme: "MyApp",
  simulatorUdid: "...",           // optional: auto-detects
  eraseSimulator: true,           // optional: wipe simulator data
  configuration: "Debug",
  launchArguments: ["--resetData"]
})
// Does:
// 1. Shutdown simulator if running
// 2. Erase simulator state (if requested)
// 3. Boot simulator fresh
// 4. Build app
// 5. Install app
// 6. Launch app with arguments
// Returns: { success: true, buildTime: 7000, bootTime: 3000, launchTime: 500 }
```

**Cost**: ~200 tokens (vs 300+ tokens separately)
**Latency**: ~20s (vs 25+ seconds separately)
**Use case**: CI/CD pipelines, clean state testing, fresh debugging sessions

---

## Tool Reference

### 6 Consolidated Router Tools

**`simctl-device`** — Simulator lifecycle (7 operations)
- `boot`, `shutdown`, `create`, `delete`, `erase`, `clone`, `rename`
- Auto-UDID detection, performance tracking, smart defaults

**`simctl-app`** — App management (4 operations)
- `install`, `uninstall`, `launch`, `terminate`
- Bundle ID resolution, launch arguments, environment variables

**`idb-app`** — IDB app operations (4 operations)
- `install`, `uninstall`, `launch`, `terminate`
- Physical device + simulator support via IDB

**`cache`** — Cache management (4 operations)
- `get-stats`, `get-config`, `set-config`, `clear`
- Multi-layer caching (simulator, project, response, build settings)

**`persistence`** — Persistence control (3 operations)
- `enable`, `disable`, `status`
- File-based cache across server restarts

**`idb-targets`** — Target management (2 operations)
- `list`, `describe`, `connect`, `disconnect`
- Physical device and simulator discovery

### 22 Individual Specialized Tools

**Build & Test (6 tools)**
- `xcodebuild-build`: Build with progressive disclosure via buildId
- `xcodebuild-test`: Test with filtering, test plans, cache IDs
- `xcodebuild-clean`: Clean build artifacts
- `xcodebuild-list`: List targets/schemes with smart caching
- `xcodebuild-version`: Get Xcode and SDK versions
- `xcodebuild-get-details`: Access cached build/test logs

**UI Automation (6 tools)**
- `idb-ui-describe`: Accessibility tree queries (all | point operations)
- `idb-ui-tap`: Coordinate-based tapping with percentage conversion
- `idb-ui-input`: Text input with keyboard control
- `idb-ui-gesture`: Swipes, pinches, rotations with coordinate transforms
- `idb-ui-find-element`: Semantic element search (NEW in v2.0)
- `accessibility-quality-check`: Rapid UI richness assessment (NEW in v2.0)

**I/O & Media (2 tools)**
- `simctl-io`: Screenshots and video recording with semantic naming
- `screenshot`: Vision-optimized base64 screenshots (inline, max 800px)

**Discovery & Health (3 tools)**
- `simctl-list`: Progressive disclosure simulator listing (96% token reduction)
- `simctl-get-details`: On-demand full simulator data retrieval
- `simctl-health-check`: Xcode environment validation

**Utilities (5 tools)**
- `simctl-openurl`: Open URLs and deep links
- `simctl-get-app-container`: Get app container paths (bundle, data, group)
- `simctl-push`: Simulate push notifications
- `rtfm`: On-demand comprehensive documentation

**Workflow Tools (2 high-level abstractions) - NEW in V3.0.0**
- `workflow-tap-element`: High-level semantic tap (find + tap in one call)
- `workflow-fresh-install`: Clean install workflow (shutdown → erase → boot → build → install → launch)

**Total: 29 active tools** (27 core + 2 workflow abstractions)

---

## Usage Examples

### Example 1: Accessibility-First Login Automation

```typescript
// 1. Quality check before choosing approach
accessibility-quality-check({ screenContext: "LoginScreen" })
// → { quality: "rich", tappableElements: 12, textFields: 2 }

// 2. Find email field semantically
idb-ui-find-element({ query: "email" })
// → { centerX: 200, centerY: 150, label: "Email", type: "TextField" }

// 3. Tap and input email
idb-ui-tap({ x: 200, y: 150 })
idb-ui-input({ operation: "text", text: "user@example.com" })

// 4. Find and tap login button
idb-ui-find-element({ query: "login" })
// → { centerX: 200, centerY: 400, label: "Login", type: "Button" }
idb-ui-tap({ x: 200, y: 400 })

// 5. Verify (screenshot only for confirmation, not primary interaction)
screenshot({ screenName: "HomeScreen", state: "LoggedIn" })
```

**Efficiency Comparison:**
- **Accessibility approach**: 4 queries × 50 tokens = 200 tokens, ~500ms total
- **Screenshot approach**: 3 screenshots × 170 tokens = 510 tokens, ~6000ms total
- **Savings**: 2.5x cheaper, 12x faster

### Example 2: RTFM Discovery Workflow

```typescript
// 1. Browse tool categories
rtfm({ categoryName: "build" })
// Returns:
{
  category: "build",
  tools: [
    { name: "xcodebuild-build", description: "Build Xcode projects with smart defaults" },
    { name: "xcodebuild-test", description: "Run tests with filtering and test plans" },
    ...
  ]
}

// 2. Get comprehensive docs for specific tool
rtfm({ toolName: "xcodebuild-build" })
// Returns:
{
  tool: "xcodebuild-build",
  description: "Full comprehensive documentation...",
  parameters: { projectPath: "...", scheme: "...", configuration: "..." },
  examples: [...],
  relatedTools: ["xcodebuild-clean", "xcodebuild-get-details"]
}

// 3. Execute with discovered parameters
xcodebuild-build({
  projectPath: "./MyApp.xcworkspace",
  scheme: "MyApp",
  configuration: "Debug"
})
```

### Example 3: Progressive Disclosure Build Workflow

```typescript
// 1. Build returns summary + buildId
xcodebuild-build({
  projectPath: "./MyApp.xcworkspace",
  scheme: "MyApp"
})
// Returns:
{
  buildId: "build-abc123",
  success: true,
  summary: {
    duration: 7075,
    errorCount: 0,
    warningCount: 1,
    configuration: "Debug",
    sdk: "iphonesimulator"
  },
  nextSteps: [
    "Build completed successfully",
    "Use 'xcodebuild-get-details' with buildId for full logs"
  ]
}

// 2. Access full logs only when debugging
xcodebuild-get-details({
  buildId: "build-abc123",
  detailType: "full-log",
  maxLines: 100
})
// Returns: Full compiler output, warnings, errors
```

---

## CLAUDE.md Template for End Users

Copy this into your project's `CLAUDE.md` to guide AI agents toward optimal XC-MCP usage:

```markdown
# XC-MCP Optimal Usage Patterns

This project uses XC-MCP for iOS development automation. Follow these patterns for maximum efficiency.

## Tool Discovery

1. **Browse categories**: `rtfm({ categoryName: "build" })` — See all build-related tools
2. **Get tool docs**: `rtfm({ toolName: "xcodebuild-build" })` — Comprehensive documentation
3. **Execute**: Use discovered parameters and operations

## Accessibility-First Automation (MANDATORY)

**ALWAYS assess accessibility quality before taking screenshots:**

1. **Check quality**: `accessibility-quality-check({ screenContext: "LoginScreen" })`
   - Returns: `rich` | `moderate` | `minimal`

2. **Decision branch**:
   - IF `rich` or `moderate`: Use `idb-ui-find-element` + `idb-ui-tap` (faster, cheaper)
   - IF `minimal`: Fall back to `screenshot` (last resort)

3. **Why this matters**:
   - Accessibility: 50 tokens, 120ms per query
   - Screenshots: 170 tokens, 2000ms per capture
   - **3-4x cheaper, 16x faster when accessibility sufficient**
   - **Promotes inclusive app development**

## Progressive Disclosure

- Build/test tools return `buildId` or cache IDs
- Use `xcodebuild-get-details` or `simctl-get-details` to drill down
- **Never request full logs upfront** — get summaries first

## Best Practices

- **Let UDID auto-detect** — Don't prompt user for simulator UDIDs
- **Use semantic context** — Include `screenContext`, `appName`, `screenName` parameters
- **Prefer accessibility over screenshots** — Better for efficiency AND app quality
- **Use operation enums** — `simctl-device({ operation: "boot" })` instead of separate tools

## Example: Optimal Login Flow

\`\`\`typescript
// 1. Quality check (30 tokens, 80ms)
accessibility-quality-check({ screenContext: "LoginScreen" })

// 2. IF rich: Semantic search (40 tokens, 120ms)
idb-ui-find-element({ query: "email" })
idb-ui-tap({ x: 200, y: 150 })
idb-ui-input({ operation: "text", text: "user@example.com" })

idb-ui-find-element({ query: "login" })
idb-ui-tap({ x: 200, y: 400 })

// 3. Verify with screenshot only at end (170 tokens, 2000ms)
screenshot({ screenName: "HomeScreen", state: "LoggedIn" })

// Total: ~280 tokens, ~2400ms
// vs Screenshot-first: ~510 tokens, ~6000ms (2.5x slower, 1.8x more expensive)
\`\`\`
```

---

## Installation & Configuration

### Prerequisites

- macOS with Xcode command-line tools
- Node.js 18+
- Xcode 15+ recommended

Install Xcode CLI tools:
```bash
xcode-select --install
```

### Installation Options

```bash
# Global install (recommended for MCP)
npm install -g xc-mcp

# Or run directly without installation
npx -y xc-mcp

# Local development
git clone https://github.com/conorluddy/xc-mcp.git
cd xc-mcp && npm install && npm run build
```

### MCP Client Configuration

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "npx",
      "args": ["-y", "xc-mcp"],
      "cwd": "/path/to/your/ios/project"
    }
  }
}
```

**Environment Variables** (optional):
- `XCODE_CLI_MCP_TIMEOUT`: Operation timeout in seconds (default: 300)
- `XCODE_CLI_MCP_LOG_LEVEL`: Logging verbosity (debug | info | warn | error)
- `XCODE_CLI_MCP_CACHE_DIR`: Custom cache directory path
- `XC_MCP_DEFER_LOADING`: Enable deferred tool loading (default: true for V3.0)

---

## Breaking Changes & Migration Guide

### V3.0.0: Platform defer_loading Support

**What Changed:**
- All 29 tools now have `defer_loading: true` flag
- Claude's platform tool search discovers tools automatically
- No custom tool-search implementation needed
- Tools loaded on-demand based on conversation context

**Migration Path:**

| Scenario | Action | Notes |
|----------|--------|-------|
| **New Projects** | No action needed | Platform handles discovery |
| **Existing Integrations** | No action needed | Compatible with V2.x usage |
| **Debugging/Testing** | Set env var | Use `XC_MCP_DEFER_LOADING=false` |

**Usage (same as V2.x):**

```typescript
// V3.0 - Platform discovers tools automatically
// Just use tools as before - Claude's tool search handles discovery
xcodebuild-build({ scheme: "MyApp" })

// Use RTFM for documentation discovery
rtfm({ categoryName: "build" })
rtfm({ toolName: "xcodebuild-build" })

// Disable defer_loading for debugging
export XC_MCP_DEFER_LOADING=false
```

**Token Impact:**

| Version | Startup | Discovery | Notes |
|---------|---------|-----------|-------|
| V2.0.x | ~18.7k | N/A | All tools loaded upfront |
| **V3.0.0** | **~0** | **Platform-managed** | Tools loaded on-demand |

---

## Development

### Build Commands

```bash
npm run build          # Compile TypeScript to JavaScript
npm run dev            # Development mode with watch compilation
npm test               # Run Jest test suite (60% coverage)
npm run test:coverage  # Generate coverage report
npm run lint           # ESLint with auto-fix
npm run format         # Prettier code formatting
```

### Testing

- **Jest** with ESM support and TypeScript compilation
- **60% coverage** across statements, branches, functions, lines
- **1136 tests** covering core functionality, edge cases, error handling
- **Pre-commit hooks** enforce code quality via Husky + lint-staged

### Architecture

**Core Components:**
- `src/index.ts` — MCP server with tool registration and routing
- `src/tools/` — 29 tools organized by category (xcodebuild, simctl, idb, cache, workflows)
- `src/state/` — Multi-layer intelligent caching (simulator, project, response, build settings)
- `src/utils/` — Shared utilities (command execution, validation, error formatting)
- `src/types/` — TypeScript definitions for Xcode data structures

**Cache Architecture:**
- **Simulator Cache**: 1-hour retention, usage tracking, performance metrics
- **Project Cache**: Remembers successful build configurations per project
- **Build Settings Cache**: Auto-discovers bundle IDs, deployment targets, capabilities
- **Response Cache**: 30-minute retention for progressive disclosure

---

## Contributing

Contributions welcome! Please ensure:
- Tests pass (`npm test`)
- Coverage remains ≥60% (`npm run test:coverage`)
- Code passes linting (`npm run lint`)
- TypeScript compiles (`npm run build`)

See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines and architecture documentation.

---

## License

MIT License — See [LICENSE](./LICENSE) for details.

---

**XC-MCP: Production-grade Xcode automation for AI agents through progressive disclosure and accessibility-first workflows.**
