# XC-MCP

[![npm version](https://img.shields.io/npm/v/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![npm downloads](https://img.shields.io/npm/dm/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![codecov](https://codecov.io/gh/conorluddy/xc-mcp/graph/badge.svg?token=4CKBMDTENZ)](https://codecov.io/gh/conorluddy/xc-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**An MCP server that lets AI agents build, run and drive iOS apps — without drowning in Xcode's output.**

XC-MCP wraps `xcodebuild`, `simctl` and `idb` as 77 tools. Its job is not just to expose those
commands but to make their output fit in a model's context: summaries first, full detail on demand,
and the accessibility tree instead of screenshots wherever the app allows it.


---

## Why it exists

Xcode tooling produces output at a scale no context window survives. Measured against a real app
(Grapla, Xcode 27, iPhone 17 Pro simulator):

| Operation | Raw output | XC-MCP response | Reduction |
|---|---|---|---|
| One incremental `xcodebuild build` | 1.67 MB · ~419,000 tokens | 1.1 KB · ~285 tokens | **~1,470×** |
| `xcrun simctl list --json` | 131 KB · ~32,800 tokens | 1.5 KB · ~370 tokens | **~90×** |
| One crash report (`.ips`) | 10.7 KB | 1.4 KB summary | **~7.5×** |

A single raw build log would overflow a 200k-token context on its own. The full output is never
thrown away: it is cached and returned as an MCP resource link, so an agent can drill into the
exact errors it needs.

---

## Quick start

**Claude Code:**
```bash
claude mcp add xc-mcp -- npx -y xc-mcp
```

**Codex CLI:**

```bash
codex mcp add xc-mcp -- npx -y xc-mcp
```

or add it to `~/.codex/config.toml` directly:

```toml
[mcp_servers.xc-mcp]
command = "npx"
args = ["-y", "xc-mcp"]
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "xc-mcp": { "command": "npx", "args": ["-y", "xc-mcp"] }
  }
}
```

Then ask your agent to build and run your app. `rtfm({})` lists the tool categories.

---

## Requirements

| Requirement | Version | Needed for |
|---|---|---|
| macOS | 13+ | everything |
| Node.js | 20+ (CI tests 22 and 24) | running the server |
| Xcode + Command Line Tools | 15+ (26+ for iOS 26/27 simulators) | `xcodebuild`, `simctl` |
| `idb` CLI + companion | **1.5.1+** | every `idb-*` tool: tapping, typing, accessibility |

```bash
xcode-select --install

# idb — required for all UI automation
brew tap facebook/fb
brew install facebook/fb/idb-companion facebook/fb/idb-cli
```

> `brew install idb-companion` no longer works — it moved from Homebrew core to Meta's
> `facebook/fb` tap.

**Run `idb-doctor` whenever UI automation misbehaves.** It checks the CLI, the companion version,
the Xcode framework layout, and stale companion registrations.

### Xcode 27

**`idb-companion` must be 1.5.1 or newer.** Xcode 27 moved `SimulatorKit.framework`, and older
companions fail silently: the accessibility tree reads correctly and every tap reports success,
while the simulator discards the events. `idb-ui-tap`, `idb-ui-gesture` and `idb-ui-input` detect
this and refuse to run rather than pretend.

```bash
brew upgrade facebook/fb/idb-companion
brew list --versions idb-companion   # expect >= 1.5.1
```

- **There is no `Simulator.app`** — Xcode 27 replaced it with `DeviceHub.app`. `simctl-boot` with
  `openGui` opens whichever this Xcode ships.
- If every `idb` call fails with `Connection refused`, a dead companion is still registered in
  `/tmp/idb/state`. Run `idb disconnect <udid>`; `idb-doctor` detects this.

---

## How it works

### Summaries first, detail on demand

Tools that produce large output return a summary plus an ID. The full output stays in a 30-minute
cache and is exposed two ways: an MCP resource at `xcmcp://response/{id}`, and the matching
`*-get-details` tool for clients without resource support.

```typescript
xcodebuild-build({ projectPath: "./MyApp.xcodeproj", scheme: "MyApp" })
// → { buildId, success: false, errorCount: 3, warningCount: 1, durationMs: 18000 }

xcodebuild-get-details({ buildId, detailType: "errors-only" })
// → the three errors, not the 419k-token log
```

### The accessibility tree before screenshots

For UI automation, reading the accessibility tree is cheaper and faster than sending an image, and
it gives exact coordinates instead of visual estimates. Measured on the same screen:

| Approach | Response | Latency |
|---|---|---|
| `idb-ui-find-element` | ~450 tokens of JSON | ~270 ms |
| `screenshot` (half size) | ~22.5 KB image | ~1,700 ms |

The first idb call in a session takes several seconds while the target cache warms.

This only works when the app is accessible — which is the point. An app VoiceOver can navigate is
an app an agent can navigate. `accessibility-quality-check` says which path to take;
`accessibility-audit` says what to fix.

```typescript
idb-ui-find-element({ query: "Sign In" })
// → { centerX: 201, centerY: 572, visible: true }

idb-ui-tap({ x: 201, y: 572 })
```

**Coordinates are not always tappable.** The tree reports frames in scrolled-content space, so an
element can sit below the fold. Every match carries `visible` and, when off-screen, an
`offscreenReason` naming the gesture that brings it into view.

### Tools that declare their risk

Every tool carries MCP annotations — `readOnlyHint`, `destructiveHint`, `idempotentHint` — so a
client can ask before running `simctl-erase`, `idb-crash-delete` or `idb-clear-keychain`, and run
`simctl-list` freely. Build, test, audit and crash tools also declare an `outputSchema` and return
validated `structuredContent`.

---

## Tools

**77 tools.** [TOOL_SIGNATURES.md](./TOOL_SIGNATURES.md) indexes every tool with its annotations;
parameters come from the server itself via `rtfm({ toolName: "..." })`.

| Area | Tools |
|---|---|
| **Build & test** | `xcodebuild-build`, `-test`, `-clean`, `-list`, `-version`, `-showsdks`, `-get-details`, `-inspect-scheme`, `-validate-capabilities` |
| **Simulators** | `simctl-list`, `-get-details`, `-suggest`, `-health-check`, `-boot`, `-shutdown`, `-create`, `-delete`, `-erase`, `-clone`, `-rename` |
| **Apps** | `simctl-install`, `-uninstall`, `-launch`, `-terminate`, `-openurl`, `-get-app-container`, `-container` |
| **UI automation** | `idb-ui-describe`, `-find-element`, `-tap`, `-input`, `-gesture`, `idb-targets`, `idb-list-apps`, `idb-install`, `-uninstall`, `-launch`, `-terminate` |
| **Accessibility** | `accessibility-quality-check`, `accessibility-audit` |
| **Diagnostics** | `idb-doctor`, `idb-crash-list`, `-show`, `-delete`, `hang-start`, `-stop`, `-get-details`, `-list` |
| **Test setup** | `simctl-privacy`, `-push`, `-pbcopy`, `-addmedia`, `-status-bar`, `-stream-logs`, `-appearance`, `-location`, `idb-simulate-memory-warning`, `idb-clear-keychain`, `idb-xctest-list` |
| **Capture & analysis** | `screenshot`, `simctl-io`, `visual-diff`, `localization-audit`, `xcode-model-inspect` |
| **Workflows** | `workflow-build-and-run`, `workflow-fresh-install`, `workflow-tap-element`, `test-record-step`, `test-record-report` |
| **Cache & docs** | `cache-get-stats`, `-get-config`, `-set-config`, `-clear`, `persistence-enable`, `-disable`, `-status`, `rtfm` |

---

## Configuration

| Flag | Effect |
|---|---|
| `--mini`, `-m` | One-line tool descriptions; `rtfm` supplies the detail |
| `--build-only`, `-b` | Registers 18 build-focused tools instead of 77 |

Flags combine: `["-y", "xc-mcp", "--mini", "--build-only"]` — the same `args` array works in Claude Desktop and Codex's `config.toml`. Both matter mainly for clients that
load every tool description upfront; see the history below.

| Environment variable | Default | Controls |
|---|---|---|
| `XC_MCP_CACHE_DIR` | `~/.xc-mcp` (honours `XDG_CACHE_HOME`) | Disk persistence for caches |
| `XC_MCP_HANG_DIR` | `~/.xc-mcp/hang-sessions` | HangBuster capture sessions |
| `XC_MCP_RECORDINGS_DIR` | `~/.xc-mcp/test-recordings` | Test recording reports |

---

## How context cost shaped this server

XC-MCP has been rebuilt three times, and each rebuild answered the same question — *what does a tool
cost in context?* — differently, because the answer kept changing underneath it. The tool count
went 51 → 28 → 77, and each time the right number was set by what clients and the protocol could do.

### v1 · Aug 2025 — 51 tools, every description paid upfront

MCP clients of the time loaded every tool's name, description and input schema when they connected,
and kept them in context for the whole session. Tool count was a tax on context, paid before the
agent did any work.

v1.3.2 cut the tax per tool: descriptions shrank to a few words and the real documentation moved
behind `rtfm`, fetched only when asked for. A separate, smaller `xc-mini-mcp` package was also
published — and reverted shortly after.

### v2 · Nov 2025 — 28 tools, consolidated into routers

If the count is the tax, cut the count. v2 folded 21 tools into six operation-enum routers —
`simctl-device({ operation: "boot" })` instead of `simctl-boot` — sharing one schema per router.

That bought a debt nobody could see yet. A router is a single tool, so it carries a single
description and a single set of properties for every operation behind it. That cost nothing while
tools had no per-tool properties worth losing.

### v3 · Nov 2025 — betting on deferred loading

v3 set `defer_loading: true` on every tool, expecting tools to load on demand and baseline cost to
fall toward zero. The goal was right; the mechanism could not work.

`defer_loading` is a field of the **Messages API**. It belongs on tool definitions sent to the model,
alongside the tool-search server tools, and an MCP server has no way to set it. The MCP SDK also
drops unrecognised keys from a tool's registration, so the flag never reached a client — a live
`tools/list` later showed 0 of 77 tools carrying it.

Deferral did arrive, **on the client side**. Clients with tool search, Claude Code among them, began
listing only tool names at startup and fetching a tool's schema when it is first used. No server
flag was involved.

### v4 · Jun 2026 — 70 tools, routers dissolved

Two developments reversed the v2 trade-off.

- **Client-side tool search made tool count cheap.** With schemas deferred, 77 tools cost roughly
  what their names cost — about 1,240 tokens at startup, server instructions included.
- **The protocol gained per-tool metadata.** Revision `2025-03-26` added tool annotations
  ([#185](https://github.com/modelcontextprotocol/specification/pull/185)). Revision `2025-06-18`
  added structured tool output
  ([#371](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/371)), resource links in
  tool results ([#603](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/603)), and
  a human-readable `title` ([#663](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/663)).

Annotations are precisely what a router cannot express. `simctl-device` hid both `boot`, which is
harmless, and `erase`, which destroys a simulator, behind one tool — so no client could tell them
apart. The routers were dissolved into discrete tools that each declare their own risk and output
shape, and resource links replaced ad-hoc cache IDs as the way to return large output. The server
negotiates protocol `2025-06-18`.

### v4.1 · Sep 2026 — 71 tools, Xcode 27 readiness

Xcode 27 broke idb in a way that failed silently: older companions read the accessibility tree
correctly but dropped every tap while reporting success. v4.1 added `idb-doctor`, a 1.5.1 companion
floor, and a preflight that makes HID-writing tools refuse to run rather than pretend.

### v4.2 · Sep 2026 — 77 tools, tested against a real app

Driving a real app end-to-end found four bugs that had passed 1,456 tests, all in parsing idb's
output. The tests mocked a format idb never emits — newline-delimited objects with `label` fields —
where idb really returns one JSON array using `AXLabel`. So `accessibility-quality-check` rated every
screen unusable and `idb-ui-find-element` never matched anything, each while returning well-formed,
plausible JSON. Fixtures now use captured idb output, and reintroducing one of those bugs fails ten
tests.

The same pass added crash reporting, element visibility and test-isolation tools, and removed the
inert `defer_loading` flag.

### The trade-off, version by version

| Version | Tools | What set the context cost |
|---|---|---|
| v1.0 | 51 | Every description loaded at connect |
| v1.3.2 | 51 | Descriptions trimmed; documentation moved behind `rtfm` |
| v2.0 | 28 | Tool count cut by consolidating into routers |
| v3.0 | 30 | A server-side deferral flag that never took effect |
| v4.0 | 70 | Client-side deferral; routers dissolved for per-tool annotations |
| v4.1 | 71 | Unchanged model; Xcode 27 support |
| v4.2 | 77 | Unchanged model, verified against real idb output |

Two lessons carried forward. **Context cost is the client's call** — a server should describe its
tools honestly and let the client decide how to spend context on them. And **a structured response
can hide a broken tool** — test against the real command, not a mock of it.

Release detail is in [CHANGELOG.md](./CHANGELOG.md).

### Migrating from v2/v3 routers

Drop the `operation` field and call the matching tool. Operation-specific parameters are unchanged.

| Removed router | Replacement tools |
|---|---|
| `simctl-device` | `simctl-boot`, `-shutdown`, `-create`, `-delete`, `-erase`, `-clone`, `-rename` |
| `simctl-app` | `simctl-install`, `-uninstall`, `-launch`, `-terminate` |
| `idb-app` | `idb-install`, `-uninstall`, `-launch`, `-terminate` |
| `cache` | `cache-get-stats`, `-get-config`, `-set-config`, `-clear` |
| `persistence` | `persistence-enable`, `-disable`, `-status` |

`idb-targets` keeps its `operation` enum. `rtfm({ toolName: "simctl-device" })` still suggests the
replacements.

---

## Development

```bash
git clone https://github.com/conorluddy/xc-mcp.git
cd xc-mcp && npm install
npm run build     # compile to dist/
npm test          # jest
npm run lint      # eslint
```

Point any MCP client at a local build with `node /path/to/xc-mcp/dist/index.js`. **A running server
holds `dist/` in memory**, so restart the client session after rebuilding.

[CLAUDE.md](./CLAUDE.md) covers the architecture, how to add a tool, and the rules learned the hard
way.

## Contributing

> [!WARNING]
> Contributions are welcome but reviewed slowly — this repo sits well down my priority list. Forking
> and adapting it is usually the faster route.

Pull requests need a passing build, tests and lint.

## License

MIT, as declared in [`package.json`](./package.json).
