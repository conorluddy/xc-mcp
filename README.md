# XC-MCP: Intelligent Xcode MCP Server

[![npm version](https://img.shields.io/npm/v/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![npm downloads](https://img.shields.io/npm/dm/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![Node.js version](https://img.shields.io/node/v/xc-mcp.svg)](https://nodejs.org)
[![codecov](https://codecov.io/gh/conorluddy/xc-mcp/graph/badge.svg?token=4CKBMDTENZ)](https://codecov.io/gh/conorluddy/xc-mcp) 
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/conorluddy/xc-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Problem**: MCP clients can't use Xcode CLI tools because `simctl list` returns 57,000+ tokens, exceeding MCP limits.  
**Solution**: Progressive disclosure with intelligent caching returns 2,000 tokens instead, achieving 96% reduction.  
**Result**: Full Xcode tooling functionality without token overflow, 90% faster workflows.

## Quick Start

```bash
# Install and run
npm install -g xc-mcp
xc-mcp

# Or use without installation
npx xc-mcp
```

**MCP Configuration** (Claude Desktop):
```bash
claude mcp add xc-mcp -s user "npx xc-mcp"
```

## Why This Exists

Raw Xcode CLI tools break MCP clients due to massive output:
- `simctl list`: 57,000+ tokens (exceeds MCP limits)
- `xcodebuild` logs: 135,000+ tokens (unusable)
- No state memory between operations

XC-MCP solves this with progressive disclosure: return concise summaries first, full data on demand via cache IDs. This maintains complete functionality while respecting MCP token constraints.

## Core Features

### Progressive Disclosure System
- **Concise summaries by default**: 96% token reduction for simulator lists
- **Full details on demand**: Use cache IDs to access complete data
- **Smart filtering**: Return only relevant information upfront
- **Token-efficient responses**: Never exceed MCP client limits

### Three-Layer Intelligent Cache
- **Simulator Cache**: 1-hour retention with usage tracking and performance metrics
- **Project Cache**: Remembers successful build configurations per project  
- **Response Cache**: 30-minute retention for progressive disclosure access

### Smart Defaults & Learning
- **Build configuration memory**: Learns successful settings per project
- **Simulator recommendations**: Prioritizes recently used and optimal devices
- **Performance tracking**: Records boot times, build success rates, optimization metrics
- **Adaptive intelligence**: Improves suggestions based on usage patterns

## Usage Examples

### Progressive Simulator Management
Get instant simulator summary (2k tokens vs 57k):
```json
{
  "tool": "simctl-list",
  "arguments": {"deviceType": "iPhone"}
}
```

Returns concise summary with cache ID for detailed access:
```json
{
  "cacheId": "sim-abc123",
  "summary": {
    "totalDevices": 47,
    "availableDevices": 31,
    "bootedDevices": 1
  },
  "quickAccess": {
    "bootedDevices": [{"name": "iPhone 16", "udid": "ABC-123"}],
    "recentlyUsed": [...],
    "recommendedForBuild": [...]
  }
}
```

Access full details when needed:
```json
{
  "tool": "simctl-get-details",
  "arguments": {
    "cacheId": "sim-abc123",
    "detailType": "available-only",
    "maxDevices": 10
  }
}
```

### Smart Building with Configuration Memory
Build with automatic smart defaults:
```json
{
  "tool": "xcodebuild-build",
  "arguments": {
    "projectPath": "./MyApp.xcworkspace",
    "scheme": "MyApp"
  }
}
```

Returns build summary with cache ID for full logs:
```json
{
  "buildId": "build-xyz789",
  "success": true,
  "summary": {
    "duration": 7075,
    "errorCount": 0,
    "warningCount": 1
  },
  "nextSteps": [
    "Build completed successfully",
    "Smart defaults used: optimal simulator auto-selected",
    "Use 'xcodebuild-get-details' with buildId for full logs"
  ]
}
```

### Cache Management
Monitor cache performance:
```json
{"tool": "cache-get-stats", "arguments": {}}
```

Configure cache timeouts:
```json
{
  "tool": "cache-set-config",
  "arguments": {"cacheType": "simulator", "maxAgeMinutes": 30}
}
```

## Installation & Configuration

### Prerequisites
- macOS with Xcode command-line tools
- Node.js 18+
- Xcode 15+ recommended

Install Xcode CLI tools:
```bash
xcode-select --install
```

### Installation Options
```bash
# Global install (recommended)
npm install -g xc-mcp

# Local development
git clone https://github.com/conorluddy/xc-mcp.git
cd xc-mcp && npm install && npm run build
```

### MCP Client Configuration
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "npx",
      "args": ["xc-mcp"],
      "cwd": "/path/to/your/ios/project"
    }
  }
}
```

## Tool Reference

| Category | Tool | Description | Progressive Disclosure |
|----------|------|-------------|----------------------|
| **Project Discovery** | `xcodebuild-list` | List targets, schemes, configurations | ✓ |
| | `xcodebuild-showsdks` | Available SDKs | - |
| | `xcodebuild-version` | Xcode version info | - |
| **Build Operations** | `xcodebuild-build` | Build with smart defaults | ✓ (via buildId) |
| | `xcodebuild-clean` | Clean build artifacts | - |
| | `xcodebuild-get-details` | Access cached build logs | - |
| **Simulator Management** | `simctl-list` | Simulator list with 96% token reduction | ✓ (via cacheId) |
| | `simctl-get-details` | Progressive access to full simulator data | - |
| | `simctl-boot` | Boot with performance tracking | - |
| | `simctl-shutdown` | Graceful shutdown | - |
| **Cache Management** | `cache-get-stats` | Cache performance metrics | - |
| | `cache-set-config` | Configure cache timeouts | - |
| | `cache-clear` | Clear cached data | - |
| | `list-cached-responses` | View cached build/test results | - |

## Advanced Features

### Performance Optimization
- **90% fewer repeated calls** through intelligent caching
- **Boot time tracking** for simulator performance optimization
- **Build trend analysis** tracks success rates and timing
- **Usage pattern learning** improves recommendations over time

### Persistent State Management (Optional)
Enable file-based persistence for cache data across server restarts:
```json
{"tool": "persistence-enable", "arguments": {}}
```

### Environment Variables
- `XCODE_CLI_MCP_TIMEOUT`: Operation timeout (default: 300s)
- `XCODE_CLI_MCP_LOG_LEVEL`: Logging verbosity
- `XCODE_CLI_MCP_CACHE_DIR`: Custom cache directory

## Development

### Build Commands
```bash
npm run build      # Compile TypeScript
npm run dev        # Development mode with watch
npm test           # Run test suite (80% coverage required)
npm run lint       # Code linting with auto-fix
```

### Testing
- Jest with ESM support
- 80% coverage threshold enforced
- Pre-commit hooks ensure code quality

## License & Support

MIT License. For issues and questions, open a GitHub issue.

---

**XC-MCP solves MCP token overflow for Xcode tooling through progressive disclosure and intelligent caching.**