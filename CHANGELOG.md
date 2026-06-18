# Changelog

All notable changes to XC-MCP are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

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
