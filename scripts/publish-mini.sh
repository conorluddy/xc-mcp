#!/bin/bash
#
# Publish xc-mini-mcp to npm from the same repository
#
# This script:
# 1. Backs up the original package.json
# 2. Modifies package metadata for mini variant
# 3. Builds the mini version
# 4. Publishes to npm as "xc-mini-mcp"
# 5. Restores original package.json and build artifacts
#
# Why this approach:
# - Single repository, dual packages
# - No monorepo complexity
# - Shared codebase for both variants
# - Clean separation in npm registry

set -e  # Exit on error

echo "🔧 Publishing xc-mini-mcp variant..."

# ============================================================================
# STEP 1: Backup original package.json
# ============================================================================

if [ -f "package.json.backup" ]; then
  echo "❌ Backup file already exists. Previous publish may have failed."
  echo "   Run 'mv package.json.backup package.json' to restore, then retry."
  exit 1
fi

cp package.json package.json.backup
echo "✅ Backed up package.json"

# ============================================================================
# STEP 2: Modify package.json for mini variant
# ============================================================================

# Use jq if available, otherwise use sed
if command -v jq &> /dev/null; then
  jq '.name = "xc-mini-mcp" |
      .version = "1.0.0" |
      .description = "Minimal iOS build/test MCP server - 3 core tools optimized for AI agents" |
      .main = "dist/index.js" |
      .bin."xc-mini-mcp" = "./dist/index.js" |
      del(.bin."xc-mcp") |
      .keywords += ["minimal", "agent-optimized", "context-efficient"]' \
    package.json > package.json.tmp
  mv package.json.tmp package.json
  echo "✅ Modified package.json (using jq)"
else
  # Fallback to sed for systems without jq
  sed -i.tmp 's/"name": "xc-mcp"/"name": "xc-mini-mcp"/' package.json
  sed -i.tmp 's/"version": "1.2.0"/"version": "1.0.0"/' package.json
  sed -i.tmp 's/"xc-mcp": ".\/dist\/index.js"/"xc-mini-mcp": ".\/dist\/index.js"/' package.json
  rm -f package.json.tmp
  echo "✅ Modified package.json (using sed)"
fi

# ============================================================================
# STEP 3: Build mini variant
# ============================================================================

echo "🔨 Building mini variant..."
npm run build:mini

# Move dist-mini to dist for publishing
if [ -d "dist" ]; then
  mv dist dist-full-backup
fi
mv dist-mini dist

# Make the entry point executable
chmod +x dist/index-mini.js

# Update package.json to point to mini entry point
if command -v jq &> /dev/null; then
  jq '.main = "dist/index-mini.js" |
      .bin."xc-mini-mcp" = "./dist/index-mini.js"' \
    package.json > package.json.tmp
  mv package.json.tmp package.json
else
  sed -i.tmp 's/"main": "dist\/index.js"/"main": "dist\/index-mini.js"/' package.json
  sed -i.tmp 's/"xc-mini-mcp": ".\/dist\/index.js"/"xc-mini-mcp": ".\/dist\/index-mini.js"/' package.json
  rm -f package.json.tmp
fi

echo "✅ Built mini variant"

# ============================================================================
# STEP 4: Publish to npm
# ============================================================================

echo "📦 Publishing xc-mini-mcp to npm..."
npm publish

echo "✅ Published xc-mini-mcp successfully!"

# ============================================================================
# STEP 5: Restore original state
# ============================================================================

echo "🔄 Restoring original package.json and dist..."

# Restore package.json
mv package.json.backup package.json

# Restore dist directory
rm -rf dist
if [ -d "dist-full-backup" ]; then
  mv dist-full-backup dist
else
  # Rebuild full version
  npm run build
fi

echo "✅ Restored original state"
echo ""
echo "🎉 xc-mini-mcp published successfully!"
echo "   Users can now: npm install xc-mini-mcp"
echo ""
echo "📝 Next steps:"
echo "   - Test installation: npm install -g xc-mini-mcp"
echo "   - Verify 3 tools registered"
echo "   - Update documentation with new version number"
