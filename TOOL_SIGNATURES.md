# XC-MCP Tool Reference

**77 tools**, generated from `src/registry/*.ts` for XC-MCP v4.1.0.

This file is an index: tool name, what it does, and its MCP annotations. **Parameter schemas live in the
server itself** — call `rtfm({ toolName: "xcodebuild-build" })` (or `rtfm({ categoryName: "build" })`)
for full, always-current documentation rather than trusting a hand-maintained copy here.

> **Grouping note:** sections below mirror the registry modules in `src/registry/`, which is where
> the tools are defined. `rtfm` groups by documentation category instead, so a few tools appear in a
> different bucket there — the crash tools live in `registry/idb.ts` but `rtfm` lists them under
> `diagnostics`. Same tools either way.

## Reading the table

- **Read-only** — declares `readOnlyHint: true`; makes no changes to the environment.
- **Destructive** — declares `destructiveHint: true`; deletes, erases, uninstalls or clears something. MCP
  clients may gate these behind confirmation.
- **Structured** — declares an `outputSchema` and returns validated `structuredContent` alongside text.

> [!WARNING]
> **`defer_loading` is currently a no-op.** Every tool is registered with `defer_loading: true`
> (unless `XC_MCP_DEFER_LOADING=false`), but `@modelcontextprotocol/sdk@1.29`'s `registerTool()`
> destructures only `{ title, description, inputSchema, outputSchema, annotations, _meta }` from the
> tool config and silently drops everything else — verified against a live `tools/list`, where 0 of 77
> tools carry the flag. Until that is resolved, assume all 77 descriptions load upfront and use
> `--mini` and/or `--build-only` to control baseline cost.

## Build & Test (9)

xcodebuild wrappers with progressive disclosure. Large logs are cached; drill down with `xcodebuild-get-details` or the `xcmcp://response/{cacheId}` resource.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `xcodebuild-version` | Xcode Version Info | ✓ |  |  |
| `xcodebuild-list` | List Xcode Schemes & Targets | ✓ |  |  |
| `xcodebuild-build` | Build Xcode Scheme |  |  | ✓ |
| `xcodebuild-clean` | Clean Xcode Build |  | ✓ |  |
| `xcodebuild-test` | Run Xcode Tests |  |  | ✓ |
| `xcodebuild-get-details` | Get Build/Test Details | ✓ |  |  |
| `xcodebuild-showsdks` | List Available SDKs | ✓ |  |  |
| `xcodebuild-inspect-scheme` | Inspect Xcode Scheme | ✓ |  |  |
| `xcodebuild-validate-capabilities` | Validate App Capabilities | ✓ |  |  |

## Simulator & App Lifecycle (26)

Device lifecycle, app management, I/O and device state via `simctl`.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `simctl-list` | List Simulators | ✓ |  |  |
| `simctl-get-details` | Get Simulator List Details | ✓ |  |  |
| `simctl-boot` | Boot Simulator |  |  |  |
| `simctl-shutdown` | Shutdown Simulator |  |  |  |
| `simctl-create` | Create Simulator |  |  |  |
| `simctl-delete` | Delete Simulator |  | ✓ |  |
| `simctl-erase` | Erase Simulator (Factory Reset) |  | ✓ |  |
| `simctl-clone` | Clone Simulator |  |  |  |
| `simctl-rename` | Rename Simulator |  |  |  |
| `simctl-health-check` | Simulator Environment Health Check | ✓ |  |  |
| `simctl-install` | Install App on Simulator |  |  |  |
| `simctl-uninstall` | Uninstall App from Simulator |  | ✓ |  |
| `simctl-launch` | Launch App on Simulator |  |  |  |
| `simctl-terminate` | Terminate App on Simulator |  |  |  |
| `simctl-get-app-container` | Get App Container Path | ✓ |  |  |
| `simctl-openurl` | Open URL on Simulator |  |  |  |
| `simctl-io` | Simulator Screenshot/Video Capture |  |  |  |
| `simctl-push` | Send Push Notification |  |  |  |
| `screenshot` | Inline Simulator Screenshot | ✓ |  |  |
| `simctl-addmedia` | Add Media to Simulator |  |  |  |
| `simctl-pbcopy` | Copy Text to Simulator Clipboard |  |  |  |
| `simctl-privacy` | Manage App Privacy Permissions |  |  |  |
| `simctl-status-bar` | Override Simulator Status Bar |  |  |  |
| `simctl-stream-logs` | Stream Simulator Logs | ✓ |  |  |
| `simctl-suggest` | Suggest Best Simulator | ✓ |  |  |
| `simctl-container` | Inspect App Sandbox Container | ✓ |  |  |

## UI Automation & Accessibility (19)

Accessibility-first UI automation via `idb`. Requires idb-companion 1.5.1+ — run `idb-doctor` if writes appear to do nothing.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `idb-targets` | Manage IDB Targets |  |  |  |
| `idb-ui-tap` | Tap UI Element |  |  |  |
| `idb-ui-input` | Send Text/Key Input |  |  |  |
| `idb-ui-gesture` | Perform Gesture / Button Press |  |  |  |
| `idb-ui-describe` | Describe Accessibility Tree | ✓ |  |  |
| `idb-ui-find-element` | Find UI Element | ✓ |  |  |
| `accessibility-quality-check` | Accessibility Quality Check | ✓ |  | ✓ |
| `accessibility-audit` | Accessibility (WCAG) Audit | ✓ |  | ✓ |
| `idb-list-apps` | List Installed Apps (IDB) | ✓ |  |  |
| `idb-crash-list` | List Crash Reports | ✓ |  | ✓ |
| `idb-crash-show` | Show Crash Report | ✓ |  |  |
| `idb-crash-delete` | Delete Crash Reports |  | ✓ |  |
| `idb-simulate-memory-warning` | Simulate Memory Warning |  |  |  |
| `idb-clear-keychain` | Clear Simulator Keychain |  | ✓ |  |
| `idb-xctest-list` | List XCTest Bundles | ✓ |  |  |
| `idb-install` | Install App (IDB) |  |  |  |
| `idb-uninstall` | Uninstall App (IDB) |  | ✓ |  |
| `idb-launch` | Launch App (IDB) |  |  |  |
| `idb-terminate` | Terminate App (IDB) |  |  |  |

## Analysis (3)

Static and visual analysis of projects and screenshots.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `localization-audit` | Audit Localization Catalog | ✓ |  | ✓ |
| `xcode-model-inspect` | Inspect Core Data / SwiftData Models | ✓ |  | ✓ |
| `visual-diff` | Compare Screenshots (Pixel Diff) |  |  | ✓ |

## Diagnostics (5)

Environment diagnosis, crash reports, and HangBuster main-thread hang capture.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `idb-doctor` | Diagnose idb Environment | ✓ |  |  |
| `hang-start` | Start Hang Capture |  |  |  |
| `hang-stop` | Stop & Analyze Hang Capture |  |  |  |
| `hang-get-details` | Get Hang Capture Details | ✓ |  |  |
| `hang-list` | List Hang Capture Sessions | ✓ |  |  |

## Device State (2)

Appearance, Dynamic Type, locale and simulated location.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `simctl-appearance` | Set Simulator Appearance/Locale |  |  |  |
| `simctl-location` | Simulate Location |  |  |  |

## Workflows & Test Recording (5)

High-level compositions of several primitive tools, plus test-run recording.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `workflow-tap-element` | Tap Element (Workflow) |  |  |  |
| `workflow-fresh-install` | Fresh Install (Workflow) |  | ✓ |  |
| `workflow-build-and-run` | Build & Run (Workflow) |  |  |  |
| `test-record-step` | Record Test Step |  |  |  |
| `test-record-report` | Generate Test Recording Report |  |  |  |

## Cache & Persistence (7)

Cache inspection, configuration, and on-disk persistence across restarts.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `cache-get-stats` | Get Cache Statistics | ✓ |  |  |
| `cache-get-config` | Get Cache Configuration | ✓ |  |  |
| `cache-set-config` | Set Cache Configuration |  |  |  |
| `cache-clear` | Clear Cache |  | ✓ |  |
| `persistence-enable` | Enable Disk Persistence |  |  |  |
| `persistence-disable` | Disable Disk Persistence |  |  |  |
| `persistence-status` | Persistence Status | ✓ |  |  |

## System (1)

Documentation access.

| Tool | Title | Read-only | Destructive | Structured |
|---|---|---|---|---|
| `rtfm` | Read The Manual (Tool Docs) | ✓ |  |  |

## Startup modes

| Flag | Tools registered | Use for |
|---|---|---|
| _(none)_ | 77 | Full functionality |
| `--build-only` / `-b` | 18 (xcodebuild, `simctl-list`, cache/persistence, `rtfm`) | Build-focused workflows without UI automation |
| `--mini` / `-m` | 77, with one-line descriptions | Clients that load all descriptions upfront; use `rtfm` for detail |

`--mini` and `--build-only` combine.

## Resources

Large cached output is also exposed through the MCP `resources` capability at
`xcmcp://response/{cacheId}`. Build, test, list and UI-describe responses emit `resource_link` blocks;
the cache IDs they also return remain valid for the `*-get-details` tools.
