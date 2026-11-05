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
`npm install --global /tmp/xc-mcp-5.0.0.tgz` when authorized. Check the active Node.js prefix and
`command -v xc-mcp`. Verify the installed command through MCP initialize, tools/list and a safe
tools/call. Check default, --mini and --build-only registration, and verify packaged documentation.
Restart connected clients after installing: existing processes retain the previous code in memory.
Do not change a user's MCP configuration merely to test an installation.

Use an explicitly selected simulator for live checks. Describe which operations were exercised;
keep destructive tests limited to disposable fixtures with explicit authorization.
