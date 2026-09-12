# XC-MCP: Intelligent Xcode MCP Server

[![npm version](https://img.shields.io/npm/v/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![npm downloads](https://img.shields.io/npm/dm/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![Node.js version](https://img.shields.io/node/v/xc-mcp.svg)](https://nodejs.org)
[![codecov](https://codecov.io/gh/conorluddy/xc-mcp/graph/badge.svg?token=4CKBMDTENZ)](https://codecov.io/gh/conorluddy/xc-mcp)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/conorluddy/xc-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Production-grade MCP server for Xcode workflows — optimized for AI agents with accessibility-first iOS automation**

XC-MCP makes Xcode and iOS simulator tooling accessible to AI agents through intelligent context engineering. **V4 exposes 71 discrete tools** with MCP tool annotations, structured output and resources, all registered with platform-native `defer_loading` — the client discovers tools on demand, so the baseline context cost stays near zero.

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

**V4 Architecture:**
```
71 discrete tools, all registered with defer_loading
├─ Client tool search discovers tools on demand (near-zero baseline)
├─ Tool annotations (readOnly / destructive / idempotent) so clients can gate risky ops
├─ Structured output (outputSchema) on build, test and audit tools
├─ Resources: large cached output at xcmcp://response/{cacheId}
├─ Accessibility-first workflow (~50 tokens, ~120ms vs ~170 tokens, ~2000ms)
└─ Workflow tools for common sequences (fresh-install, build-and-run, tap-element)
```

**Architecture Evolution:**

| Version | Tools | Architecture |
|---------|-------|--------------|
| Pre-RTFM (v1.2.1) | 51 | Individual tools, full descriptions upfront |
| V1.3.2 (RTFM) | 51 | Individual tools + on-demand docs |
| V2.0.0 | 28 | Operation-enum routers + accessibility-first |
| V3.0.0 | 30 | Platform `defer_loading` + workflow tools |
| **V4.1.0 (current)** | **71** | **Discrete tools + MCP annotations / outputSchema / resources** |

The tool count went *up* in V4 while the baseline cost stayed flat: with `defer_loading`, the client
loads a tool's schema only when it needs it, so routers (which existed to shrink the upfront tool list)
cost more than they saved — a router can't carry per-operation annotations or an output schema.

**Key capabilities:**
- ✅ **Deferred loading** — tools discovered on demand, minimal baseline overhead
- ✅ **Tool annotations** — destructive operations (delete/erase/uninstall/clear) are declared as such
- ✅ **Structured output** — validated `structuredContent` on build, test, and audit tools
- ✅ **Resources** — cached output addressable as `xcmcp://response/{cacheId}`
- ✅ **Accessibility-first automation** (3-4x cheaper, ~16x faster than screenshots)
- ✅ **Progressive disclosure** (summaries → cache IDs → full details on demand)
- ✅ **1,456 tests** across 67 suites

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
The `--mini` flag replaces every tool description with a one-liner, cutting description tokens by roughly 97% for clients that load all of them upfront. Use `rtfm` for full documentation on demand.

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
The `--build-only` flag registers 18 tools instead of 71: the nine `xcodebuild-*` tools, `simctl-list`, cache and persistence tools, and `rtfm`. It excludes idb/UI automation, workflows, analysis, diagnostics and device state. Combine with `--mini` for maximum reduction: `["--mini", "--build-only"]`.

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

### Discrete Tools, Not Routers (V4)

V2 collapsed 21 tools into 6 operation-enum routers (`simctl-device({ operation: "boot" })`) to shrink the
upfront tool list. V4 undid that: `defer_loading` already keeps unused tools out of context, and the MCP
spec attaches `annotations` and `outputSchema` per tool — a router can only declare one set for every
operation it hides, so `simctl-erase` (destructive) and `simctl-boot` (not) would share a label.

```typescript
// V2/V3 (removed)                        // V4
simctl-device({ operation: "erase", ... })  →  simctl-erase({ ... })
simctl-app({ operation: "launch", ... })    →  simctl-launch({ ... })
cache({ operation: "clear" })               →  cache-clear({ ... })
```

Operation-specific parameters are unchanged — drop the `operation` field and call the matching tool.
`rtfm({ toolName: "simctl-device" })` still fuzzy-matches old names to their replacements. Full table in
[Breaking Changes & Migration Guide](#breaking-changes--migration-guide).

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

### Accessibility Tools (4 specialized)

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

**`accessibility-audit`**: WCAG-tiered audit of the current screen
- Returns: structured findings (missing labels, contrast, touch-target size) with severity tiers
- Use case: catching accessibility regressions in CI or before release
- Declares an `outputSchema`, so clients get validated `structuredContent`

---

## Deferred Tool Loading

### How It Works

Every tool is registered with `defer_loading: true`, so an MCP client that supports tool search:

1. **Discovers tools on demand** — no custom search tool needed (the V3 `tool-search` tool is gone)
2. **Loads a schema only when relevant** — based on conversation context
3. **Keeps baseline overhead minimal** — near-zero tokens at startup

For clients that don't support deferred loading, `--mini` shrinks every description to a one-liner and
`rtfm` supplies the detail on demand.

### RTFM: On-Demand Documentation

```typescript
// 1. Browse tool categories
rtfm({ categoryName: "build" })
// Returns all build-related tools with descriptions

// 2. Get comprehensive docs for a specific tool
rtfm({ toolName: "xcodebuild-build" })
// Returns full documentation with parameters, examples, related tools

// 3. Execute with discovered parameters
xcodebuild-build({ scheme: "MyApp", configuration: "Debug" })
```

### Environment Variable: Disable defer_loading

```bash
# Default: all tools deferred, client discovers them on demand

# Load all 71 tools at startup instead (testing, debugging, client compatibility)
export XC_MCP_DEFER_LOADING=false
```

---

## Workflow & Recording Tools

Five tools compose primitives into single steps: three workflows plus two test-recording tools.

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

### `workflow-build-and-run` — Build, Install, Launch

```typescript
workflow-build-and-run({
  projectPath: "./MyApp.xcworkspace",
  scheme: "MyApp",
  configuration: "Debug",         // optional, default "Debug"
  simulatorUdid: "...",           // optional: auto-detected
  launchArguments: ["--uiTest"],  // optional
  environmentVariables: {},       // optional
  takeScreenshot: true            // optional: capture after launch
})
```

Unlike `workflow-fresh-install`, this does **not** erase the simulator — use it for the normal
edit → build → look at it loop.

### `test-record-step` / `test-record-report` — Test Run Recording

```typescript
test-record-step({ sessionName: "checkout", label: "Tapped Pay", assertion: "Receipt shown" })
// ...more steps...
test-record-report({ sessionName: "checkout", testName: "Checkout happy path" })
// Writes a markdown report to ~/.xc-mcp/test-recordings (override with XC_MCP_RECORDINGS_DIR)
```

---

## Tool Reference

**71 tools across 9 categories.** The full index — with per-tool annotations and which tools return
structured output — is in [TOOL_SIGNATURES.md](./TOOL_SIGNATURES.md). Parameter schemas come from the
server itself: `rtfm({ toolName: "..." })`.

**Build & Test (9)** — `xcodebuild-version`, `-list`, `-build`, `-clean`, `-test`, `-get-details`,
`-showsdks`, `-inspect-scheme`, `-validate-capabilities`

**Simulator & App Lifecycle (26)** — discovery: `simctl-list`, `-get-details`, `-suggest`,
`-health-check` · lifecycle: `simctl-boot`, `-shutdown`, `-create`, `-delete`, `-erase`, `-clone`,
`-rename` · apps: `simctl-install`, `-uninstall`, `-launch`, `-terminate`, `-get-app-container`,
`-container`, `-openurl` · I/O and test fixtures: `simctl-io`, `screenshot`, `simctl-push`,
`-addmedia`, `-pbcopy`, `-privacy`, `-status-bar`, `-stream-logs`

**UI Automation & Accessibility (13)** — `idb-ui-describe`, `-find-element`, `-tap`, `-input`,
`-gesture`, `accessibility-quality-check`, `accessibility-audit`, `idb-targets`, `idb-list-apps`,
`idb-install`, `-uninstall`, `-launch`, `-terminate`

**Analysis (3)** — `localization-audit`, `xcode-model-inspect`, `visual-diff`

**Diagnostics (5)** — `idb-doctor`, `hang-start`, `hang-stop`, `hang-get-details`, `hang-list`

**Device State (2)** — `simctl-appearance` (theme, Dynamic Type, locale/RTL), `simctl-location`

**Workflows & Recording (5)** — `workflow-tap-element`, `workflow-fresh-install`,
`workflow-build-and-run`, `test-record-step`, `test-record-report`

**Cache & Persistence (7)** — `cache-get-stats`, `-get-config`, `-set-config`, `-clear`,
`persistence-enable`, `-disable`, `-status`

**System (1)** — `rtfm`

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
- **Call discrete tools** — `simctl-boot({ ... })`; the V2/V3 operation-enum routers no longer exist

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

| Requirement | Version | Needed for |
|---|---|---|
| macOS | 13+ | everything |
| Node.js | 18+ | running the server |
| Xcode + Command Line Tools | 15+ (26+ for iOS 26/27 simulators) | `xcodebuild`, `simctl` |
| `idb` (CLI + companion) | **1.5.1+** | every `idb-*` tool: tapping, swiping, typing, accessibility |

```bash
xcode-select --install

# idb — required for all UI automation tools
brew tap facebook/fb
brew install facebook/fb/idb-companion facebook/fb/idb-cli
```

> `brew install idb-companion` no longer works: idb-companion was removed from
> Homebrew core and now lives in Meta's `facebook/fb` tap.

Run the **`idb-doctor`** tool at any time to check the setup.

### Xcode 27 and idb

**On Xcode 27, `idb-companion` must be 1.5.1 or newer.** Xcode 27 moved
`SimulatorKit.framework`, and older companions only look in the old location. The
failure is silent in the worst way: the companion starts, the accessibility tree
reads correctly, and `idb ui tap`/`swipe`/`text` all report success — while every
HID event is dropped and nothing happens on screen.

`idb-ui-tap`, `idb-ui-gesture` and `idb-ui-input` detect this and fail with an
actionable error rather than pretending to succeed. To fix:

```bash
brew upgrade facebook/fb/idb-companion
brew list --versions idb-companion   # expect >= 1.5.1
```

Other Xcode 27 notes:

- **There is no `Simulator.app`** — it was replaced by `DeviceHub.app`. `simctl-boot`
  with `openGui` opens whichever this Xcode ships. Quitting DeviceHub shuts down the
  simulator it hosts.
- If every `idb` call starts failing with `Connection refused`, a dead companion is
  still registered in `/tmp/idb/state`. Fix with `idb disconnect <udid>`; `idb-doctor`
  detects it.

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
- `XC_MCP_DEFER_LOADING`: set to `false` to register all tools at startup (default: `true`)
- `XC_MCP_CACHE_DIR`: cache directory for disk persistence (default: `~/.xc-mcp`, honours `XDG_CACHE_HOME`)
- `XC_MCP_HANG_DIR`: HangBuster session directory (default: `~/.xc-mcp/hang-sessions`)
- `XC_MCP_RECORDINGS_DIR`: test-recording output directory (default: `~/.xc-mcp/test-recordings`)

---

## Breaking Changes & Migration Guide

### V4.0.0: Routers Removed, MCP Spec Modernization

The V2/V3 operation-enum routers are gone. Call the discrete tool directly — operation-specific
parameters are unchanged, so drop the `operation` field and use the matching tool name.

```
OLD (router)                                   NEW (discrete tool)
─────────────────────────────────────────────────────────────────
simctl-device({operation:"boot", ...})       → simctl-boot({...})
simctl-device({operation:"shutdown", ...})   → simctl-shutdown({...})
simctl-device({operation:"create", ...})     → simctl-create({...})
simctl-device({operation:"delete", ...})     → simctl-delete({...})
simctl-device({operation:"erase", ...})      → simctl-erase({...})
simctl-device({operation:"clone", ...})      → simctl-clone({...})
simctl-device({operation:"rename", ...})     → simctl-rename({...})
simctl-app({operation:"install", ...})       → simctl-install({...})
simctl-app({operation:"uninstall", ...})     → simctl-uninstall({...})
simctl-app({operation:"launch", ...})        → simctl-launch({...})
simctl-app({operation:"terminate", ...})     → simctl-terminate({...})
idb-app({operation:"install", ...})          → idb-install({...})
idb-app({operation:"uninstall", ...})        → idb-uninstall({...})
idb-app({operation:"launch", ...})           → idb-launch({...})
idb-app({operation:"terminate", ...})        → idb-terminate({...})
cache({operation:"get-stats"})               → cache-get-stats({...})
cache({operation:"get-config"})              → cache-get-config({...})
cache({operation:"set-config", ...})         → cache-set-config({...})
cache({operation:"clear", ...})              → cache-clear({...})
persistence({operation:"enable", ...})       → persistence-enable({...})
persistence({operation:"disable", ...})      → persistence-disable({...})
persistence({operation:"status"})            → persistence-status({...})
```

`idb-targets` keeps its `operation` enum (`list` | `describe` | `connect` | `disconnect`).
`rtfm({ toolName: "simctl-device" })` fuzzy-matches removed router names to their replacements.

**Also removed:** the custom `tool-search` tool — clients' own tool search handles discovery via
`defer_loading`. Use `rtfm` for documentation.

**Also new in V4:** tool annotations on every tool, `outputSchema` on the high-value tools, the
`resources` capability (`xcmcp://response/{cacheId}`), and feature parity with `ios-simulator-skill`
(`simctl-appearance`, `simctl-location`, `simctl-container`, `accessibility-audit`,
`localization-audit`, `xcode-model-inspect`, `visual-diff`, HangBuster, test recording).

### V4.1.0: Xcode 27 / idb-companion 1.5.1 floor

`idb-ui-tap`, `idb-ui-gesture` and `idb-ui-input` now refuse to run against an idb-companion older
than 1.5.1 on Xcode 27, where HID writes are silently dropped. See
[Xcode 27 and idb](#xcode-27-and-idb). Run `idb-doctor` to check your environment.

---

## Development

### Build Commands

```bash
npm run build             # Compile TypeScript to JavaScript
npm run dev               # Development mode with watch compilation
npm test                  # Run Jest test suite
npm test -- --coverage    # Generate coverage report
npm run lint              # ESLint
npm run lint:fix          # ESLint with auto-fix
npm run format            # Prettier code formatting
```

### Testing

- **Jest** with ESM support and TypeScript compilation
- **1,456 tests** across 67 suites, covering core functionality, edge cases, error handling
- **Coverage floors** enforced in `jest.config.js`: 50% statements / lines / functions, 35% branches
- **Pre-commit hooks** enforce code quality via Husky + lint-staged

### Architecture

**Core Components:**
- `src/index.ts` — MCP server with tool registration and routing
- `src/registry/` — per-category MCP tool registration (annotations, schemas, defer_loading)
- `src/tools/` — 71 tool implementations organized by category
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

> [!WARNING]
> I appreciate contributions, but please note that this repo and my other public repos are far down in the priority queue of what I'm working on, so I'll be slow to review anything. Your best bet is really just to fork the repo and customise it to your own needs.

PR requirements:
- Tests pass (`npm test`)
- Coverage stays above the floors in `jest.config.js` (`npm test -- --coverage`)
- Code passes linting (`npm run lint`)
- TypeScript compiles (`npm run build`)

See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines and architecture documentation.

---

## License

MIT License — See [LICENSE](./LICENSE) for details.

---

**XC-MCP: Production-grade Xcode automation for AI agents through progressive disclosure and accessibility-first workflows.**
