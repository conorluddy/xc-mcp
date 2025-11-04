# Publishing Guide: Dual Package Workflow

This document explains how to publish both `xc-mcp` (full) and `xc-mcp-mini` (mini) packages from the same repository.

## Overview

The xc-mcp repository uses a **dual-package architecture** to optimize for different use cases:

- **xc-mcp** (51 tools) — Comprehensive iOS development tooling
- **xc-mcp-mini** (3 tools) — Minimal build/test workflow optimization

Both packages are published from the same Git repository and share the same tool implementations. The only difference is which tools are registered in the MCP server.

## Automated Publishing (Recommended)

**The easiest way to publish both packages is to create a GitHub release.**

### Quick Start: Automated Publishing

1. **Bump version** in `package.json`:
   ```bash
   # Update version (e.g., 1.2.0 -> 1.3.0)
   npm version patch  # or minor, or major
   ```

2. **Commit and push** the version bump:
   ```bash
   git add package.json
   git commit -m "chore: bump version to $(node -p "require('./package.json').version")"
   git push
   ```

3. **Create a GitHub release**:
   - Go to https://github.com/conorluddy/xc-mcp/releases/new
   - Create a new tag matching the version (e.g., `v1.3.0`)
   - Write release notes
   - Publish the release

4. **GitHub Actions automatically publishes both packages in parallel**:
   - `xc-mcp@1.3.0` (full variant with aliases)
   - `xc-mcp-mini@1.3.0` (mini variant)

That's it! Both packages will be published to npm automatically.

### How the Automation Works

The `.github/workflows/publish.yml` workflow triggers on GitHub releases and:

1. **Runs tests** to ensure everything works
2. **Publishes in parallel**:
   - `publish-full` job: Publishes `xc-mcp`, `xcmcp`, and `xcode-mcp` aliases
   - `publish-mini` job: Builds mini variant and publishes `xc-mcp-mini`
3. **Uses npm provenance** for secure, verified packages
4. **Supports dry-run mode** for testing without actually publishing

### Monitoring the Workflow

After creating a release, you can monitor progress at:
https://github.com/conorluddy/xc-mcp/actions

You'll see:
- ✅ Test suite running
- ✅ Full variant publishing (3 aliases)
- ✅ Mini variant publishing

Both packages should appear on npm within 2-3 minutes.

---

## Manual Publishing (Advanced)

For manual control or local testing, you can publish packages manually.

## Why This Approach?

### Alternatives Considered

1. **Monorepo with workspaces** — Too complex for 2 packages, adds tooling overhead
2. **Separate repositories** — Duplication burden, version drift risk
3. **Environment variable mode** — Poor discoverability, always downloads full package
4. **Build-time variants** — Complex build configuration, unconventional

### Chosen Approach: Script-Based Publishing

**Advantages:**
- Single codebase, zero duplication
- Minimal complexity (one publish script)
- Clean npm registry separation
- Easy to maintain and understand
- No monorepo tooling required

**How it works:**
1. Backup `package.json`
2. Modify metadata for mini variant
3. Build mini entry point
4. Publish to npm as `xc-mcp-mini`
5. Restore original `package.json` and build artifacts

## Publishing Workflow

### Prerequisites

1. **Clean working directory**
   ```bash
   git status  # Should show no uncommitted changes
   ```

2. **All tests passing**
   ```bash
   npm test
   npm run lint
   ```

3. **npm authentication**
   ```bash
   npm whoami  # Verify you're logged in
   npm login   # If needed
   ```

4. **Version bump committed**
   - Update version in `package.json` for full variant
   - Update version in `scripts/publish-mini.sh` for mini variant
   - Commit version changes before publishing

### Publishing xc-mcp (Full Variant)

This is the standard npm publish workflow:

```bash
# 1. Ensure clean state
npm run clean
npm run build
npm test

# 2. Publish to npm
npm run publish:full

# Or directly:
npm publish
```

**What happens:**
- Uses existing `package.json` (name: "xc-mcp")
- Publishes `dist/index.js` (51 tools)
- `prepublishOnly` script runs tests and lint automatically
- Published as `xc-mcp@<version>` on npm

### Publishing xc-mcp-mini (Mini Variant)

This uses the automated script:

```bash
# 1. Ensure clean state
npm run clean
npm test

# 2. Run publish script
npm run publish:mini
```

**What happens (automated by `scripts/publish-mini.sh`):**

1. **Backup** — Saves current `package.json` to `package.json.backup`

2. **Modify package.json** — Changes:
   ```json
   {
     "name": "xc-mcp-mini",
     "version": "1.0.0",
     "main": "dist/index-mini.js",
     "bin": { "xc-mcp-mini": "./dist/index-mini.js" }
   }
   ```

3. **Build mini variant** — Compiles `src/index-mini.ts` to `dist-mini/`

4. **Publish** — Runs `npm publish` with modified package.json

5. **Restore** — Reverts `package.json` and rebuilds full variant

**Published as:** `xc-mcp-mini@<version>` on npm

### Manual Recovery

If the publish script fails mid-execution:

```bash
# Restore original package.json
mv package.json.backup package.json

# Restore dist directory
rm -rf dist
npm run build

# Check state
git status
```

## Version Management

### Full Variant (xc-mcp)

Version is managed in root `package.json`:

```json
{
  "name": "xc-mcp",
  "version": "1.2.0"
}
```

**Versioning strategy:**
- Follow SemVer (semantic versioning)
- Bump version before publishing
- Tag releases in Git: `git tag v1.2.0`

### Mini Variant (xc-mcp-mini)

Version is managed in `scripts/publish-mini.sh`:

```bash
jq '.name = "xc-mcp-mini" |
    .version = "1.0.0" |
    ...
```

**Independent versioning:**
- Mini variant has its own version number
- Can be bumped independently of full variant
- Typically starts at 1.0.0 and increments separately

**When to bump:**
- Breaking changes to 3 core tools: MAJOR
- New features in core tools: MINOR
- Bug fixes: PATCH

## Publishing Checklist

### Before Publishing Full Variant

- [ ] All tests passing (`npm test`)
- [ ] Lint clean (`npm run lint`)
- [ ] Version bumped in `package.json`
- [ ] CHANGELOG.md updated
- [ ] Git working directory clean
- [ ] Committed and pushed to main branch

### Before Publishing Mini Variant

- [ ] All tests passing (`npm test`)
- [ ] Version bumped in `scripts/publish-mini.sh`
- [ ] Tested mini build: `npm run build:mini`
- [ ] Verified 3 tools registered in `src/index-mini.ts`
- [ ] CHANGELOG.md mentions mini variant changes (if any)

### After Publishing Both Variants

- [ ] Verify on npm: `npm info xc-mcp` and `npm info xc-mcp-mini`
- [ ] Test installation: `npm install -g xc-mcp` and `npm install -g xc-mcp-mini`
- [ ] Verify tool counts: Run both servers and check tool lists
- [ ] Update documentation with new version numbers if needed
- [ ] Create Git tag for release: `git tag v1.2.0 && git push --tags`

## Testing Published Packages

### Test xc-mcp (Full)

```bash
# Install globally
npm install -g xc-mcp

# Verify installation
xc-mcp --help

# Test in Claude Desktop
# Add to MCP config, verify 51 tools appear
```

### Test xc-mcp-mini (Mini)

```bash
# Install globally
npm install -g xc-mcp-mini

# Verify installation
xc-mcp-mini --help

# Test in Claude Desktop
# Add to MCP config, verify only 3 tools appear:
# - xcodebuild-build
# - xcodebuild-test
# - xcodebuild-get-details
```

## Troubleshooting

### "Backup file already exists" Error

**Problem:** Previous publish failed, leaving `package.json.backup`

**Solution:**
```bash
# Restore manually
mv package.json.backup package.json
rm -rf dist
npm run build

# Retry publish
npm run publish:mini
```

### Wrong Version Published

**Problem:** Forgot to bump version before publishing

**Solution:**
```bash
# Deprecate wrong version on npm
npm deprecate xc-mcp-mini@<version> "Accidental publish, use <correct-version>"

# Bump version and republish
# Edit scripts/publish-mini.sh
npm run publish:mini
```

### Mini Package Contains All Tools

**Problem:** `src/index-mini.ts` not used, published full variant instead

**Solution:**
- Check `scripts/publish-mini.sh` modifies `main` field correctly
- Verify `dist-mini/` contains `index-mini.js`
- Rebuild and republish

## Architecture Decisions

### Why Not Monorepo?

**Considered:** Lerna, npm workspaces, Turborepo

**Decision:** Too much complexity for 2 packages

- Shared code already well-organized in `src/tools/`
- No need for independent dependencies
- Single build process sufficient
- Minimal maintenance overhead preferred

### Why Script-Based?

**Considered:** Build-time configuration, environment variables

**Decision:** Scripts are explicit and debuggable

- Easy to understand what's happening
- Clear separation in npm registry
- Rollback is trivial (restore `package.json`)
- Works with standard npm tooling

### Why Independent Versions?

**Considered:** Lock-step versioning

**Decision:** Mini variant can evolve separately

- Full variant gets new tools frequently (major/minor bumps)
- Mini variant is stable (only patch updates expected)
- Independent versions avoid confusion about what changed

## Future Considerations

### If More Variants Needed

If we need 3+ variants:
- Consider migrating to monorepo (npm workspaces)
- Refactor `src/index.ts` to use modular tool registration
- Extract tool categories into separate registration functions

### If Tool Implementations Diverge

If mini and full need different tool implementations:
- Split shared tools into `src/tools/shared/`
- Create variant-specific tools in `src/tools/full/` and `src/tools/mini/`
- Update build process to include correct tools per variant

## References

- **npm publish docs**: https://docs.npmjs.com/cli/v10/commands/npm-publish
- **Semantic Versioning**: https://semver.org/
- **npm workspaces**: https://docs.npmjs.com/cli/v10/using-npm/workspaces
- **MCP Protocol**: https://modelcontextprotocol.io/

---

**Summary:** Publishing both packages is simple and automated. The script-based approach minimizes complexity while maintaining clean separation in the npm registry. Both packages share the same high-quality, tested codebase with zero duplication.
