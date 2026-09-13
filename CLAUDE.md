# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XC-MCP is a Model Context Protocol (MCP) server that provides intelligent access to Xcode command-line tools with advanced caching and progressive disclosure features. It wraps `xcodebuild`, `simctl`, and `idb` commands to solve token overflow issues while maintaining full functionality.

### Architecture (V4.1.0)

**77 discrete tools, MCP-spec-modernized. Clients with tool search load schemas on demand.**

Current release: **4.1.0**. The authoritative tool list is `src/registry/*.ts`; the generated index is
[TOOL_SIGNATURES.md](./TOOL_SIGNATURES.md); per-tool parameter docs come from `rtfm`.

**Evolution:**
| Version | Tools | Architecture |
|---------|-------|--------------|
| Pre-RTFM (v1.2.1) | 51 | Individual tools (~7,850 tokens) |
| V1.3.2 (RTFM) | 51 | Individual + RTFM (~3,000 tokens) |
| V2.0.0 | 28 | Operation-enum routers + accessibility-first |
| V3.0.0 | 30 | Client-side tool discovery + workflows |
| V4.0.0 | 70 | Discrete tools + MCP spec (annotations / outputSchema / resources) + skill feature parity |
| V4.1.0 | 71 | Adds `idb-doctor`; idb-companion 1.5.1 floor for Xcode 27 HID writes |
| **V4.1.0+ (Current)** | **77** | **Crash tools, element visibility, test-isolation primitives, xctest listing** |

V4.0 modernizes the MCP layer and reaches feature parity with the `ios-simulator-skill`:
- **SDK**: `@modelcontextprotocol/sdk@^1.29`, protocol `2025-06-18`. Zod v4.
- **Routers dissolved → discrete tools**: the v2 operation-enum routers are gone. Annotations and `outputSchema` are per-tool, so each operation is now its own tool (deferred loading already covers the token cost). See the Migration Guide below.
- **Tool annotations**: every tool declares `title` + `readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint` so clients can gate destructive ops (delete/erase/uninstall/clear).
- **Structured output**: high-value tools (xcodebuild-build/-test, accessibility-audit, localization-audit, xcode-model-inspect, visual-diff) declare `outputSchema` and return validated `structuredContent`.
- **Resources**: large cached output is exposed via the `resources` capability at `xcmcp://response/{cacheId}`; build/test/list/ui-describe emit `resource_link` blocks (cache IDs retained for back-compat).
- **listChanged** capability declared for deferred/dynamic tool loading.
- **Tool discovery** is client-side; `rtfm` provides progressive docs; old router names still fuzzy-match in `rtfm`.

> **`defer_loading` was removed in favour of client-side deferral (do not re-add it).**
> v3.0.0 set `defer_loading: true` on every tool registration on the theory that it produced a
> near-zero baseline. It never did. `defer_loading` is a **Messages API** field, set on tool
> definitions sent to the API alongside the `tool_search_tool_*` server tools — an MCP server cannot
> set it. And `@modelcontextprotocol/sdk` destructures only
> `{ title, description, inputSchema, outputSchema, annotations, _meta }` from the `registerTool`
> config (`server/mcp.js:703`), dropping unknown keys, so it never reached `tools/list` — confirmed
> against a live server: 0 of 77 tools carried it.
>
> Deferral works anyway, because the **client** does it: Claude Code lists tool names and fetches a
> schema only when a tool is used. The flag, its `XC_MCP_DEFER_LOADING` env var, and all 98
> occurrences were deleted. Removing code no client ever saw changed no behaviour.
>
> For clients without tool search, the working levers are `--mini` and `--build-only`.

**Tool Categories (V4.1):**
- `build`: xcodebuild-version/-list/-build/-clean/-test/-get-details/-showsdks/-inspect-scheme/-validate-capabilities
- `simulator`: simctl-list/-get-details/-health-check/-suggest + lifecycle: simctl-boot/-shutdown/-create/-delete/-erase/-clone/-rename
- `app`: simctl-install/-uninstall/-launch/-terminate/-get-app-container/-container/-openurl
- `idb` (16): idb-ui-describe/-find-element/-tap/-input/-gesture, accessibility-quality-check, accessibility-audit, idb-targets, idb-list-apps, idb-install/-uninstall/-launch/-terminate, idb-simulate-memory-warning, idb-clear-keychain, idb-xctest-list
- `io`: simctl-io, screenshot
- `devicestate`: simctl-appearance, simctl-location
- `analysis`: localization-audit, xcode-model-inspect, visual-diff
- `diagnostics` (8): idb-doctor (idb environment check), idb-crash-list/-show/-delete (crash reports),
  hang-start/-stop/-get-details/-list (HangBuster)
- `cache`: cache-get-stats/-get-config/-set-config/-clear
- `workflow` (5): workflow-tap-element/-fresh-install/-build-and-run, test-record-step, test-record-report
- `system`: rtfm. Persistence (persistence-enable/-disable/-status) registers with the cache tools;
  simctl-push/-addmedia/-pbcopy/-privacy/-status-bar/-stream-logs register with simctl.

### V4.0 Migration Guide (breaking)

The v2/v3 operation-enum routers were removed. Call the discrete tool directly:

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

Operation-specific parameters are unchanged; just drop the `operation` field and use the matching tool name. `rtfm({ toolName: "simctl-device" })` still fuzzy-suggests the discrete tools.

**New in V4 (feature parity with ios-simulator-skill):**
- `simctl-appearance` (theme/Dynamic Type/locale+RTL), `simctl-location` (GPS/city/GPX/waypoints)
- `simctl-container` (app sandbox ls/cat/userdefaults/coredata-path)
- enhanced `simctl-stream-logs` (severity filter + dedup + statistics)
- `accessibility-audit` (WCAG-tier audit), `localization-audit` (.xcstrings), `xcode-model-inspect` (Core Data/SwiftData), `visual-diff` (PNG pixel diff)
- HangBuster: `hang-start`/`hang-stop`/`hang-get-details`/`hang-list` (main-thread hang capture + clustering)
- `test-record-step`/`test-record-report` (test recording + markdown report)

## Development Commands

### Build and Development
- **npm run build** - Compile TypeScript to JavaScript in `dist/`
- **npm run dev** - Development mode with TypeScript watch compilation
- **npm start** - Start the MCP server from compiled JavaScript
- **npm run clean** - Remove `dist/` build artifacts

### Code Quality and Testing
- **npm run lint** - Run ESLint on TypeScript source files
- **npm run lint:fix** - Auto-fix ESLint issues where possible
- **npm run format** - Format code with Prettier
- **npm run format:check** - Check code formatting without making changes
- **npm test** - Run Jest test suite with ESM support
- **npm run test -- --watch** - Run tests in watch mode during development
- **npm test -- --coverage** - Run tests with coverage report (floors in `jest.config.js`)
- **npm run test -- tests/__tests__/utils/** - Run specific test directory
- **npm run test -- --testNamePattern="cache"** - Run tests matching pattern

### Git Hooks and Pre-commit
- **npm run precommit** - Run lint-staged (triggered automatically by Husky)
- **npm run prepare** - Set up Husky git hooks
- Lint-staged automatically runs prettier and eslint on staged TypeScript files

### MCP Server Testing
- **node dist/index.js** - Run the MCP server directly after building
- Use stdio transport for MCP client testing
- Validate Xcode installation is available before server operations

## Architecture Overview

### Core Components
- **src/index.ts** - Main MCP server with tool registration and request routing
- **src/tools/** - Tool implementations organized by command category:
  - `xcodebuild/` - Build, test, clean, list, version tools with intelligent defaults
  - `simctl/` - Simulator management with progressive disclosure
  - `cache/` - Cache management and statistics tools
- **src/state/** - Intelligent caching system:
  - `simulator-cache.ts` - Simulator state with usage tracking and performance metrics
  - `project-cache.ts` - Project configuration memory and build history
  - `build-settings-cache.ts` - Xcode build settings with auto-discovery of bundle IDs, deployment targets, and capabilities
- **src/utils/** - Shared utilities for command execution and validation
- **src/types/** - TypeScript definitions for Xcode data structures

### Key Architectural Features
- **Progressive Disclosure**: Returns concise summaries by default, full details on demand via cache IDs
- **Intelligent Caching**: 4-layer cache system (simulator, project, build settings, response) with smart invalidation
- **Performance Tracking**: Boot times, build metrics, and usage patterns for optimization
- **Smart Defaults**: Learns from successful builds and suggests optimal configurations

### Cache System Design
- **SimulatorCache**: 1-hour default retention, tracks device usage and boot performance
- **ProjectCache**: Remembers successful build configurations per project
- **BuildSettingsCache**: 1-hour default retention, auto-discovers bundle IDs, deployment targets, device families, and app capabilities from project build settings
- **ResponseCache**: 30-minute retention for progressive disclosure of large outputs
- All caches support configurable timeouts and selective clearing

### Tool Response Pattern
Tools return structured responses with:
- **Success indicators** and error handling
- **Cache IDs** for progressive disclosure when outputs exceed token limits
- **Smart recommendations** based on usage history
- **Performance metrics** for optimization insights

### Critical Tool Categories and Usage Patterns
- **xcodebuild-build**: Returns `buildId` for progressive access to full logs via `xcodebuild-get-details`
- **xcodebuild-test**: Returns `testId` for progressive access to full test logs via `xcodebuild-get-details`
- **simctl-list**: Returns `cacheId` for progressive access to full device data via `simctl-get-details`
- **simctl-\***: discrete lifecycle/app tools (`simctl-boot`, `-erase`, `-install`, `-launch`, …)
- **cache-\***: discrete cache tools (`cache-get-stats`, `-get-config`, `-set-config`, `-clear`)
- **Progressive Disclosure**: Large outputs (10k+ tokens) automatically cached to prevent MCP token overflow

### Accessibility-First Workflow

**Core Philosophy**: XC-MCP promotes accessibility-first automation to encourage inclusive app development while enabling faster, cheaper AI interaction.

**Workflow Pattern:**
1. **Assess Quality**: `accessibility-quality-check({ screenContext: "LoginScreen" })`
   - Returns: `rich` (>3 tappable) | `moderate` (2-3) | `minimal` (≤1)
   - Cost: ~30 tokens, ~80ms

2. **Decision Branch**:
   - IF `rich` or `moderate`: Use `idb-ui-find-element` + `idb-ui-tap` (semantic approach)
   - IF `minimal`: Fall back to `screenshot` (visual approach last resort)

3. **Semantic Element Search**: `idb-ui-find-element({ query: "login" })`
   - Returns: Tap-ready coordinates (centerX, centerY) with frame boundaries
   - Cost: ~40 tokens, ~120ms
   - 3-4x faster and cheaper than screenshot analysis

**Performance Comparison:**
| Approach | Tokens | Latency | When to Use |
|----------|--------|---------|-------------|
| Accessibility Tree | ~50 | ~120ms | Rich UIs (>3 tappable elements) |
| Screenshot Analysis | ~170 | ~2000ms | Minimal UIs (≤1 tappable element) |
| **Efficiency Gain** | **3.4x cheaper** | **16x faster** | When accessibility sufficient |

**Why This Matters:**
- Encourages developers to build accessible UIs benefiting all users
- Enables precise semantic targeting vs visual pattern matching
- Reduces token cost and execution time significantly
- Promotes inclusive app development practices

### Version History (context only — do not treat as current API)

- **V1.x**: 51 individual tools; v1.3.2 added `rtfm` for on-demand docs.
- **V2.0**: collapsed 21 tools into 6 operation-enum routers; added the accessibility-first tools
  (`idb-ui-find-element`, `accessibility-quality-check`).
- **V3.0**: added a `defer_loading` flag (inert — see the note above), a custom `tool-search` tool, and the first workflow tools.
- **V4.0**: routers dissolved back into discrete tools (see the Migration Guide above); `tool-search`
  **removed** — client-side tool search handles discovery. Added annotations, `outputSchema`, resources,
  and the ios-simulator-skill parity tools.
- **V4.1**: `idb-doctor` + HID write preflight; Xcode 27 `DeviceHub.app` support in `simctl-boot`.
- **V4.1+**: crash reporting (`idb-crash-*`), element `visible` flags on `idb-ui-describe` /
  `idb-ui-find-element`, test-isolation primitives (`idb-simulate-memory-warning`,
  `idb-clear-keychain`), `idb-xctest-list`.

**Do not reintroduce** router-style calls, `tool-search`, or `list-cached-responses` in docs or code —
none of them exist. Tools once described as removed (`xcodebuild-showsdks`, `simctl-suggest`,
`simctl-addmedia`, `simctl-privacy`, `simctl-pbcopy`, `simctl-status-bar`) are all registered again.

**For Claude Code:**
- Use `rtfm({ categoryName })` / `rtfm({ toolName })` to discover tools and their parameters.
- Prefer `accessibility-quality-check` + `idb-ui-find-element` over screenshots.
- Progressive disclosure via cache IDs (buildId, testId, cacheId, uiTreeId) or the
  `xcmcp://response/{cacheId}` resource.
- Run `idb-doctor` first when any `idb-*` interaction appears to succeed but nothing moves on screen.

**Environment Variables:**
- `XC_MCP_CACHE_DIR` — disk-persistence cache directory (default `~/.xc-mcp`, honours `XDG_CACHE_HOME`)
- `XC_MCP_HANG_DIR` — HangBuster sessions (default `~/.xc-mcp/hang-sessions`)
- `XC_MCP_RECORDINGS_DIR` — test recordings (default `~/.xc-mcp/test-recordings`)

**CLI flags:** `--mini` / `-m` (one-line tool descriptions), `--build-only` / `-b` (18 tools: the nine
`xcodebuild-*`, `simctl-list`, cache + persistence, `rtfm`). They combine.

## Development Guidelines

### Code Style and Quality Standards
- **ESLint Configuration**: TypeScript-specific rules with Prettier integration
- **Formatting**: 100-character line width, 2-space indentation, single quotes
- **Language Target**: ES2020+ with Node.js ESM modules (`"type": "module"`)
- **Coverage Floors** (`jest.config.js`): 50% statements / lines / functions, 35% branches
- **Pre-commit Validation**: Husky + lint-staged ensures code quality before commits
- **Unused Variables**: Prefix with underscore (`_unused`) to satisfy linting

### Error Handling
- All tools validate Xcode installation before execution
- Proper async/await patterns with comprehensive error catching
- MCP-compliant error responses with appropriate error codes

### Cache Management
- Cache validity checks based on file modification times
- Configurable cache timeouts via tool parameters
- Graceful degradation when caches are invalid or missing

### Progressive Disclosure Implementation
- Large command outputs (>token limits) automatically cached with unique IDs
- Summary responses provide key information upfront
- Detail retrieval tools allow drilling down into cached full outputs
- Smart filtering and pagination for large datasets

## Testing and Quality Assurance

### Test Architecture
- **Jest with ESM Support**: Uses `ts-jest` preset with ES module transformation
- **Test Structure**: Tests in `tests/__tests__/` mirror `src/` structure
- **Coverage Thresholds**: see `jest.config.js` — 50% statements / lines / functions, 35% branches
- **Mock Integration**: Custom MCP SDK mocks for testing tool responses
- **Test Categories**: State management, utility functions, command execution, and validation

### Running Tests
- **All Tests**: `npm test` (includes TypeScript compilation validation)
- **Specific Tests**: `npm test tests/__tests__/state/` (test specific modules)
- **Coverage Report**: `npm test -- --coverage` (generates HTML + LCOV reports; no `test:coverage` script exists)
- **Watch Mode**: `npm test -- --watch` (re-run tests on file changes)
- **Pattern Matching**: `npm test -- --testNamePattern="cache"` (test specific functionality)

### Pre-commit Requirements (Automated via Husky)
- **TypeScript Compilation**: Must compile without errors
- **ESLint Validation**: No errors (warnings acceptable, max 50 on staged files)
- **Prettier Formatting**: Automatically applied to staged files
- **Test Suite**: All tests must pass before commits
- **Git Hooks**: Husky enforces pre-commit validation automatically

### Environment Dependencies
- **macOS Required**: Xcode command-line tools must be installed
- **Xcode Validation**: Tools validate installation before execution
- **Compatibility**: Xcode 15+ and iOS simulators
- **Node.js**: Version 18+ required for ESM support

## MCP Integration

### Server Configuration
- Uses `@modelcontextprotocol/sdk` for MCP protocol compliance
- Stdio transport for Claude Desktop integration
- Tool schema definitions with comprehensive parameter validation

### Client Setup Example
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "node",
      "args": ["/path/to/xc-mcp/dist/index.js"]
    }
  }
}
```

### MCP Tool Implementation Architecture
- **Main Server**: `src/index.ts` - Tool registration, request routing, and MCP protocol handling
- **Tool Modules**: Organized by command category in `src/tools/` with consistent return patterns
- **Shared State**: Global caches in `src/state/` for cross-tool intelligence
- **Validation Layer**: `src/utils/validation.ts` validates Xcode installation before tool execution
- **Command Execution**: `src/utils/command.ts` handles secure subprocess execution with proper error handling

### Tool Categories

See **Tool Categories (V4.1)** above, or [TOOL_SIGNATURES.md](./TOOL_SIGNATURES.md) for the generated
index of all 71 tools with their MCP annotations. `rtfm` is the source of truth for parameters.

## LLM Optimization Patterns

XC-MCP implements context engineering patterns specifically optimized for LLM/AI agent usage. These patterns enable agents to reason effectively about simulator state and testing workflows.

### Implemented Patterns

#### 1. Semantic Screenshot Naming (simctl-io)
Screenshots can be named semantically to help agents understand screen context:
- **Parameters**: `appName`, `screenName`, `state`
- **Generated filename**: `{appName}_{screenName}_{state}_{date}.png`
- **Example**: `MyApp_LoginScreen_Empty_2025-01-23.png`
- **Agent benefit**: Agents can reason about which screen was captured and track state progression

#### 2. Structured Test Context (simctl-push)
Push notifications include structured test tracking:
- **Parameters**: `testName`, `expectedBehavior`
- **Response includes**: `deliveryInfo` (sent/sentAt) and `testContext` (testName, expectedBehavior, actualBehavior, passed)
- **Agent benefit**: Agents can verify push delivery and validate app behavior matches expectations

#### 3. Permission Audit Trails (simctl-privacy)
Permission changes are tracked with audit context:
- **Parameters**: `scenario`, `step`
- **Response includes**: `auditEntry` with timestamp, action, service, success, and test context
- **Agent benefit**: Agents can track permission state changes across test scenarios and verify permissions at each step

### Design Principles

All tools follow these LLM optimization principles:

1. **Semantic Metadata**: Include descriptive parameters that help agents reason about operations (e.g., appName, screenName, state)
2. **Structured Context**: Responses include context objects (semanticMetadata, deliveryInfo, auditEntry, testContext) for agent reasoning
3. **Progressive Disclosure**: Large outputs use cache IDs; summaries provide upfront value
4. **Verification Guidance**: Responses suggest next steps for agents to verify outcomes (e.g., "Take screenshot to confirm visual delivery")
5. **Consistent Naming**: Tool parameters and response fields follow consistent patterns for agent predictability

### Future Optimization Areas

See `docs/LLM_OPTIMIZATION.md` for comprehensive patterns including:
- Session logging with artifact indexing for workflow reconstruction
- Video recording with scene markers and metadata
- Test result summaries with structured comparison
- Media library with semantic indexing
- Status bar before/after snapshots
- Operation chaining with explicit dependencies