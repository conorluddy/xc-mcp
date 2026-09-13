# CLAUDE.md

XC-MCP is an MCP server exposing `xcodebuild`, `simctl` and `idb` as 77 tools, built to keep Xcode's
enormous output inside a model's context. Published to npm as `xc-mcp`. For what it does and why,
read [README.md](./README.md) — including the version history, which explains most design choices.

## Commands

```bash
npm run build        # tsc → dist/  (postbuild chmods dist/index.js)
npm test             # jest, ESM via ts-jest
npm test -- tests/__tests__/tools/idb-crash.test.ts   # one file
npm run lint         # eslint (lint:fix to autofix)
npm run format       # prettier
```

`prepublishOnly` runs clean → build → test → lint. Coverage floors live in `jest.config.js`.

## Layout

```
src/index.ts            server bootstrap, capabilities, instructions, version from package.json
src/config.ts           CLI flags: --mini, --build-only
src/registry/*.ts       one file per area; registers tools with schemas + annotations
src/registry/index.ts   wires the areas together; --build-only gate lives here
src/registry/resources.ts   generic xcmcp://response/{cacheId} resource — never edit per tool
src/tools/<area>/*.ts   implementations: xxxTool(), XXX_DOCS, XXX_DOCS_MINI
src/tools/docs-registry.ts  rtfm's tool → docs and category maps
src/state/              caches: simulator, project, build settings, idb targets
src/utils/              command execution, parsing, response cache, idb environment
tests/__tests__/        mirrors src/; tests/fixtures/ holds captured real output
```

## Adding a tool

1. **Implementation** — `src/tools/<area>/<name>.ts` exporting `nameTool(args)`, `NAME_DOCS` and
   `NAME_DOCS_MINI`. Line 3 of `NAME_DOCS` must be the one-sentence description: `rtfm` category
   listings render it.
2. **Registration** — `server.registerTool(name, config, handler)` in `src/registry/<area>.ts`.
   `inputSchema` and `outputSchema` are raw zod *shapes*, not `z.object(...)`. Always set `title`
   and all four annotations: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.
3. **Docs registry** — three edits in `src/tools/docs-registry.ts`: import `NAME_DOCS`, add to
   `TOOL_DOCS`, add the name to a `TOOL_CATEGORIES` array. Miss any and `rtfm` can't find the tool.
4. **idb tools** — open with `resolveIdbUdid(udid)` then `validateTargetBooted(resolvedUdid)`, and
   call `IDBTargetCache.recordSuccess(resolvedUdid)` on success.
5. **Large output** — `responseCache.store(...)`, then add `responseResourceLink(cacheId, ...)` as a
   second content block. Keep the raw id in the JSON payload too.
6. **Tests** — `tests/__tests__/tools/<name>.test.ts` mocking `utils/command.js` and
   `state/idb-target-cache.js`. Build fixtures from captured output, never by hand (see below).
7. **Regenerate** `TOOL_SIGNATURES.md` and update the tool count in README.

Error convention: an expected failure (non-zero exit, no match) returns
`{ success: false, error, guidance }` with `isError: true`. Throw `McpError` only for invalid input
or unexpected faults. `executeCommand` does **not** throw on a non-zero exit — branch on
`result.code`.

## Rules learned the hard way

Each of these cost real debugging. Don't relearn them.

### Test against real output, not a mock of it

Four bugs once passed 1,456 tests because every idb fixture described a format idb never emits. The
tools returned plausible, well-formed JSON while being completely broken. **Capture real command
output and build fixtures from it**: `tests/fixtures/idb-describe-all.ts` provides `axElement()`
and `describeAllOutput()` for exactly this. Before claiming a tool works, run it against a booted
simulator.

### The idb wire format

`idb ui describe-all` returns **one line holding a JSON array**. Each element uses `AXLabel` and
`AXUniqueId` (not `label`/`identifier`), plus `frame` as an object *and* `AXFrame` as a
`"{{x, y}, {w, h}}"` string.

- Parse with `parseFlexibleJson` (`src/utils/json-parser.ts`). Never write a new NDJSON parser — three
  hand-rolled copies caused the bugs above.
- Parse frames with `parseAXFrame` (`src/utils/ax-frame.ts`), which accepts both forms.
- Frames are in **scrolled-content space**: elements can sit below the fold. Use `isFrameVisible`
  before offering coordinates as tappable.

`idb crash show` returns an `.ips`: **two concatenated JSON documents**, a header line then a body.
`parseFlexibleJson` cannot handle it; `summarizeCrashReport` in `src/tools/idb/crash.ts` splits on
the first newline.

### Screen dimensions are points

`idb describe` reports `width`/`height` in **pixels** and `width_points`/`height_points` in points.
Every UI tool works in points. `toPointDimensions` in `src/state/idb-target-cache.ts` prefers the
point fields; storing pixels once made bounds checks ~3× too permissive, so off-screen taps passed
validation and silently vanished.

### HID writes need the preflight; reads must not have it

Tools that send taps, swipes or text call `assertHidWritesSupported()` first. An idb-companion older
than 1.5.1 on Xcode 27 drops those events while reporting success. Read-only tools must **not** call
it — reads work fine on old companions and must never be blocked.

### Don't add `defer_loading`

It is a Messages API field, not an MCP one, and the SDK's `registerTool` keeps only `title`,
`description`, `inputSchema`, `outputSchema`, `annotations` and `_meta` — anything else is silently
dropped. v3 shipped it on every tool and it never reached a client. Tool deferral is the client's
job; for clients without it, `--mini` and `--build-only` are the levers.

### A running server holds `dist/` in memory

After `npm run build`, an already-connected MCP client keeps running the old code until its session
restarts. To verify a fix without restarting, import the built module directly:

```bash
node --input-type=module -e "
const { idbCrashListTool } = await import('./dist/tools/idb/crash.js');
console.log((await idbCrashListTool({ udid: '<booted-udid>' })).content[0].text);
"
```

### TypeScript and test config

`module`/`moduleResolution` are `nodenext`: keep explicit `.js` extensions on relative imports.
Tests compile with `tsconfig.test.json`, which adds jest types the production build deliberately
excludes. Jest maps `@modelcontextprotocol/sdk/types.js` to `tests/mocks/mcp-types.ts`, so
`McpError` in tests is the mock.

### CI

The `claude-review` check fails on every PR, including ones that merge cleanly — it can't obtain an
OIDC token. It says nothing about the code. The signal is `Test & Build`, `test`, and
`Xcode Compatibility Check`.

## Conventions

- Tool names are kebab-case and prefixed by area: `simctl-*`, `idb-*`, `xcodebuild-*`.
- Return JSON with `null, 2` indentation; include a `guidance` array of actionable next steps.
- Log to **stderr** only — stdout is the MCP transport.
- Destructive operations must set `destructiveHint: true` and should require an unambiguous
  selector rather than guessing (see `idb-crash-delete`).
- Prettier: 100-column lines, single quotes. Prefix unused variables with `_`.
