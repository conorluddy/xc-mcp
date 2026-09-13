# Changelog

All notable changes to XC-MCP are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [4.1.0]

Xcode 27 readiness. idb-companion older than 1.5.1 cannot drive simulator UI on Xcode 27,
and it fails silently — the companion starts, the accessibility tree reads correctly, and
every `idb ui` write reports success while the events are dropped. For an agent that means
green results and a frozen app. This release detects that, refuses to pretend, and explains
the fix.

### Added

- **`idb-doctor` tool** — reports the idb environment with remediation: CLI and companion
  presence, companion version against the 1.5.1 floor, the Xcode framework layout, and
  stale companion registrations in `/tmp/idb/state`.
- **HID write preflight** — `idb-ui-tap`, `idb-ui-gesture` and `idb-ui-input` now check the
  environment and fail with an actionable error instead of reporting a success that never
  reached the simulator. Deliberately conservative: a version that cannot be determined
  (installed outside Homebrew) is treated as unknown rather than old, probes fall back to
  permissive if they throw, and reads are never blocked.
- `src/utils/idb-environment.ts`, the shared detection used by both.

### Fixed

- **`simctl-boot` with `openGui` could not open a simulator on Xcode 27.** It ran
  `open -a Simulator`, but Xcode 27 has no `Simulator.app` — `DeviceHub.app` replaced it.
  The call sits in a non-fatal try/catch, so this failed silently and the option simply did
  nothing. It now prefers DeviceHub and falls back for Xcode 26 and earlier.
- **Two wrong commands were being handed to users mid-failure** in `idb-connect` error
  guidance: `brew reinstall idb-companion` (the formula was removed from Homebrew core and
  now lives in Meta's `facebook/fb` tap) and `brew services start idb-companion` (that
  formula defines no service, so it never worked).

### Documentation

- README prerequisites now list idb, which was absent entirely despite every `idb-*` tool
  requiring it, with the `facebook/fb` tap install for both the companion and the CLI.
- New "Xcode 27 and idb" section covering the silent-tap failure, the missing
  `Simulator.app`, and recovering from a stale companion with `idb disconnect <udid>`.

### Tests

- 1456 tests pass. `idb-doctor` is fully covered, and `idb-ui-tap`, `idb-ui-gesture` and
  `idb-ui-input` gain their first tests.

## [4.0.1]

Maintenance release — development-dependency bumps only. No runtime changes; the shipped
artifact (`dist/`) is identical to 4.0.0.

### Changed

- Bumped dev/type dependencies to latest (consolidates Dependabot #129–#133): `@types/node`
  24 → 25 (moved to `devDependencies`), `@typescript-eslint/*` 8.48 → 8.61, `jest` 30.2 →
  30.4, `ts-jest` 29.4.5 → 29.4.11, `prettier` 3.6 → 3.8, `eslint-plugin-prettier` 5.5.4 →
  5.5.6, `lint-staged` 16 → 17.
- Held back `typescript` 6 and `eslint` 10 — both require config migrations
  (`moduleResolution=node10` deprecation; unbundled `@eslint/js` peer dep), tracked as
  separate follow-ups.

## [4.0.0]

A major release that modernizes the MCP layer to the current spec and reaches feature
parity with the sibling `ios-simulator-skill`. **Breaking** — the v2/v3 operation-enum
routers are removed in favor of discrete tools. Tool count: 30 → 70.

### Breaking changes

- **Operation-enum routers removed.** `simctl-device`, `simctl-app`, `idb-app`, `cache`,
  and `persistence` no longer exist as tools. Call the discrete tool directly, e.g.
  `simctl-device({operation:"boot"})` → `simctl-boot(...)`, `cache({operation:"clear"})` →
  `cache-clear(...)`. Operation-specific parameters are unchanged. See the Migration Guide
  in CLAUDE.md. (`rtfm` still fuzzy-matches the old names.)

### MCP spec modernization

- Upgraded `@modelcontextprotocol/sdk` to `^1.29` (from `^1.17`); pinned `zod@^4`. Fixed the
  Zod v4 `z.record()` breaking change that crashed `tools/list` on SDK ≥1.28.
- **Tool annotations**: every tool now declares `title` + `readOnlyHint`/`destructiveHint`/
  `idempotentHint`/`openWorldHint`.
- **Structured output**: `outputSchema` + validated `structuredContent` on `xcodebuild-build`,
  `xcodebuild-test`, `accessibility-audit`, `localization-audit`, `xcode-model-inspect`,
  `visual-diff`.
- **Resources**: new `resources` capability exposing cached output at
  `xcmcp://response/{cacheId}`; `xcodebuild-build`/`-test`, `simctl-list`, and
  `idb-ui-describe` emit `resource_link` blocks (opaque cache IDs retained for older clients).
- **`tools.listChanged`** capability declared for deferred/dynamic tool loading.

### New tools (feature parity with ios-simulator-skill)

- `simctl-appearance` — theme (light/dark), Dynamic Type (XS–AX5), locale/region with RTL.
- `simctl-location` — fixed coords, city presets, GPX scenarios, animated waypoint routes.
- `simctl-container` — app sandbox inspection (ls / cat / userdefaults / coredata-path).
- `accessibility-audit` — WCAG-tiered audit of the live accessibility tree (includes a
  working small-touch-target rule).
- `localization-audit` — `.xcstrings`/`.strings`/`.stringsdict` gaps, placeholder mismatches,
  and optional Swift source key cross-reference.
- `xcode-model-inspect` — Core Data `.xcdatamodeld` + SwiftData `@Model` inspection.
- `visual-diff` — PNG pixel comparison (pngjs + pixelmatch) with diff image + report.
- **HangBuster**: `hang-start` / `hang-stop` / `hang-get-details` / `hang-list` — main-thread
  hang capture with a clustering pipeline and L0/L1/L2 progressive disclosure.
- `test-record-step` / `test-record-report` — capture test steps (screenshot + a11y tree) and
  generate a markdown report.

### Enhanced

- `simctl-stream-logs` — severity classification + filter, deduplication, and a statistics
  summary.

### Fixed / cleanup

- Re-registered 10 implemented-but-unregistered tools that were dropped during the v2/v3
  consolidation (`simctl-privacy`, `simctl-status-bar`, `simctl-pbcopy`, `simctl-addmedia`,
  `simctl-suggest`, `simctl-stream-logs`, `xcodebuild-showsdks`, `xcodebuild-inspect-scheme`,
  `xcodebuild-validate-capabilities`, `workflow-build-and-run`).
- Reconciled the documentation registry; `rtfm` now resolves every registered tool.
- Removed dead router implementation files.

### Deferred (tracked follow-ups)

- HangBuster extras: atos symbolication, raw-capture NDJSON, cross-session diff,
  auto-sample/spindump.
- `structuredContent` for `simctl-list`, `xcodebuild-version`, `xcodebuild-list`.
