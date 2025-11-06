# XC-MCP: Intelligent Xcode MCP Server

[![npm version](https://img.shields.io/npm/v/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![npm downloads](https://img.shields.io/npm/dm/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![Node.js version](https://img.shields.io/node/v/xc-mcp.svg)](https://nodejs.org)
[![codecov](https://codecov.io/gh/conorluddy/xc-mcp/graph/badge.svg?token=4CKBMDTENZ)](https://codecov.io/gh/conorluddy/xc-mcp)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/conorluddy/xc-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Production-grade MCP server for Xcode workflows — 75% token reduction, accessibility-first iOS automation**

XC-MCP makes Xcode and iOS simulator tooling accessible to AI agents through intelligent context engineering. **28 consolidated tools consuming just ~2,000 tokens** through progressive disclosure, operation-based routing, and accessibility-first automation patterns.

![gh-social](https://github.com/user-attachments/assets/dd23b1e5-ed8c-40c0-b44d-7c92f3b5d5aa)

---

## Why XC-MCP?

### The Problem: Token Overflow Breaks MCP Clients

Traditional Xcode CLI wrappers dump massive output that exceeds MCP protocol limits:
- `simctl list`: 57,000+ tokens (unusable in MCP context)
- Build logs: 135,000+ tokens (catastrophic overflow)
- Screenshot-first automation: 170 tokens per screen, 2000ms latency
- No state memory between operations

### The Solution: Progressive Disclosure + Accessibility-First

**V2.0.0 Architecture:**
```
28 consolidated tools, ~18.7k tokens (9.3% of 200k context)
├─ 6 router tools with operation enums (21 tools consolidated)
├─ 22 individual specialized tools
├─ Comprehensive tool documentation for optimal agent understanding
├─ RTFM for additional on-demand documentation
└─ Accessibility-first workflow (50 tokens, 120ms vs 170 tokens, 2000ms)
```

**Token Efficiency Evolution:**

| Version | Tools | Token Usage | Architecture | Context % |
|---------|-------|-------------|--------------|-----------|
| Pre-RTFM (v1.2.1) | 51 | ~7,850 tokens | Individual tools | 3.9% |
| V1.3.2 (RTFM) | 51 | ~3,000 tokens | Individual + RTFM | 1.5% |
| **V2.0.0** | **28** | **~18.7k tokens** | **Routers + Full Docs** | **9.3%** |

**Key Improvements:**
- ✅ **Tool consolidation** (28 vs 51 tools) - 45% reduction
- ✅ **Comprehensive documentation** in tool schemas for optimal agent reasoning
- ✅ **Accessibility-first automation** (3-4x faster, 3-4x cheaper than screenshots)
- ✅ **Progressive disclosure** (summaries → cache IDs → full details on demand)
- ✅ **60% test coverage** with comprehensive error handling
- ✅ **Context efficient** (9.3% usage, 180k+ tokens available for actual work)

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
- `rtfm`: On-demand comprehensive documentation
- `list-cached-responses`: View recent build/test cache IDs
- `workflow-build-and-run`: Complete build → boot → install → launch → screenshot

**Total: 28 active tools** (down from 51 in v1.3.2)

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
- `src/tools/` — 28 tools organized by category (xcodebuild, simctl, idb, cache)
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
