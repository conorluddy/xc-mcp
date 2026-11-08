# Contributor guidance

XC-MCP is a TypeScript MCP server wrapping Xcode, simctl and idb. Read [CLAUDE.md](./CLAUDE.md)
for architecture, tool registration, output formats and simulator contracts. [README.md](./README.md)
describes installation and user workflows; [the parity audit](docs/simulator-skill-parity.md) records
capability mappings and live-verification limits.

## Changes and verification

- Keep implementations, Zod registrations, rtfm maps and tool-reference documentation consistent.
- Use argv-based command execution for new commands. MCP stdout is reserved for protocol messages;
  diagnostics belong on stderr.
- Preserve explicit destructive consent and target selection. Do not infer consent from a filter.
- Prefer accessibility discovery and semantic controls. Use captured idb fixtures and shared JSON/frame parsers.
- Run `npm run build`, relevant Jest tests and `npm run lint`. The commit hook formats/lints staged
  TypeScript and runs the full suite. `npm test -- --watchman=false --runInBand` avoids Watchman when
  it is unavailable in the environment.
- Update package.json and the root package-lock versions together for releases. v5.0.0 is a major
  upgrade from v4.2.0 because destructive tools now require explicit confirmation.

## Local package verification

Build before `npm pack --pack-destination /tmp`; install the resulting tarball with
`npm install --global /tmp/xc-mcp-5.1.0.tgz` when authorized. Check the active Node.js prefix and
`command -v xc-mcp`. Verify the installed command through MCP initialize, tools/list and a safe
tools/call. Check default, --mini and --build-only registration, and verify packaged documentation.
Restart connected clients after installing: existing processes retain the previous code in memory.
Do not change a user's MCP configuration merely to test an installation.

Use an explicitly selected simulator for live checks. Describe which operations were exercised;
keep destructive tests limited to disposable fixtures with explicit authorization.

## Duo controls

- `simctl-duo` requires an explicit booted Duo UDID. Verify observed state after pose
  and orientation changes; a successful command exit does not establish an effect.
- Keep `native/duo.m` packaged. The backend compiles and signs it with the selected
  Xcode, caches by source/toolchain/architecture, and uses argv-based execution.
- Explicit display captures omit unverified coordinate metadata. Do not route inner
  display screenshot coordinates into idb as though touch routing had been verified.
- For live checks, record Xcode/runtime, hinge readback, active display and rotation.
  Test paused and rapid sequences separately; record timeouts rather than assuming
  all orientations work. Restore the selected simulator's starting pose when practical.
- Preserve research attribution to hinge and duoctl. Replace the private backend when
  official headless equivalents are verified; an XCTest-only API is insufficient.
  Keep the MCP interface stable where practical and migrate fold/rotation separately.

## Publishing

`publish.yml` is the sole npm publisher for xc-mcp and its aliases. Publish a GitHub
release tagged `v<package.json version>` after merging the release changes. Package
and lockfile root versions must agree; the workflow rejects mismatches. Manual dispatch
defaults to dry run. A version bump or merge alone does not publish.
