# XC-MCP: Intelligent Xcode MCP Server

[![npm version](https://img.shields.io/npm/v/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![npm downloads](https://img.shields.io/npm/dm/xc-mcp.svg)](https://www.npmjs.com/package/xc-mcp)
[![Node.js version](https://img.shields.io/node/v/xc-mcp.svg)](https://nodejs.org)
[![codecov](https://codecov.io/gh/conorluddy/xc-mcp/graph/badge.svg?token=4CKBMDTENZ)](https://codecov.io/gh/conorluddy/xc-mcp) 
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/conorluddy/xc-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Problem**: MCP clients can't effectively use Xcode CLI tools because the build and simulator listing commands return more than 50,000 tokens, exceeding MCP limits.  
**Solution**: Progressive disclosure with intelligent caching returns 2,000 tokens instead, achieving 96% reduction.  
**Result**: Full Xcode tooling functionality without token overflow, 90% faster workflows.

![gh-social](https://github.com/user-attachments/assets/dd23b1e5-ed8c-40c0-b44d-7c92f3b5d5aa)


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

### Complete Login Flow UI Automation
Automate login testing with UI automation tools:
```bash
# 1. Query for login button
simctl-query-ui udid: "device-123", bundleId: "com.example.app", predicate: 'type == "XCUIElementTypeButton" AND label == "Login"'

# 2. Tap email field and enter email
simctl-tap udid: "device-123", x: 100, y: 150
simctl-type-text udid: "device-123", text: "user@example.com", actionName: "Enter email"

# 3. Tap password field and enter password
simctl-tap udid: "device-123", x: 100, y: 200
simctl-type-text udid: "device-123", text: "password123", isSensitive: true, actionName: "Enter password"

# 4. Scroll to login button if needed
simctl-scroll udid: "device-123", direction: "down", actionName: "Scroll to login button"

# 5. Query and tap login button
simctl-query-ui udid: "device-123", bundleId: "com.example.app", predicate: 'label == "Login"', captureLocation: true
simctl-tap udid: "device-123", x: 100, y: 250, actionName: "Tap Login Button"

# 6. Verify success with screenshot
simctl-io udid: "device-123", operation: "screenshot", appName: "MyApp", screenName: "HomeView", state: "Success"
```

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

## Tool Reference (28+ Tools)

### Project Discovery (3 tools)
| Tool | Description |
|------|-------------|
| `xcodebuild-list` | List targets, schemes, configurations with smart caching |
| `xcodebuild-showsdks` | Discover available SDKs for iOS, macOS, watchOS, tvOS |
| `xcodebuild-version` | Get Xcode and SDK version information |

### Build Operations (3 tools)
| Tool | Description |
|------|-------------|
| `xcodebuild-build` | Build with smart defaults, progressive disclosure via buildId |
| `xcodebuild-clean` | Clean build artifacts |
| `xcodebuild-get-details` | Access cached build logs and error details |

### Test Operations (2 tools)
| Tool | Description |
|------|-------------|
| `xcodebuild-test` | Run tests with smart defaults, test plan support, filtering |
| `xcodebuild-test-without-building` | Run tests without rebuilding |

### Simulator Lifecycle (6 tools)
| Tool | Description |
|------|-------------|
| `simctl-create` | Create new iOS simulator with device type and runtime |
| `simctl-delete` | Delete simulator device |
| `simctl-erase` | Erase simulator to factory settings |
| `simctl-clone` | Clone simulator configuration and data |
| `simctl-rename` | Rename simulator |
| `simctl-health-check` | Validate Xcode, simulators, and environment |

### Simulator Control (4 tools)
| Tool | Description |
|------|-------------|
| `simctl-list` | List simulators with 96% token reduction via caching |
| `simctl-get-details` | Progressive access to full simulator data |
| `simctl-boot` | Boot simulator with performance tracking |
| `simctl-shutdown` | Shutdown one or all simulators |
| `simctl-suggest` | Get smart simulator recommendations with scoring |

### App Management (3 tools)
| Tool | Description |
|------|-------------|
| `simctl-install` | Install iOS app bundle to simulator |
| `simctl-uninstall` | Uninstall app by bundle ID |
| `simctl-get-app-container` | Get app container paths (bundle, data, group) |

### App Control (3 tools)
| Tool | Description |
|------|-------------|
| `simctl-launch` | Launch app with arguments and environment variables |
| `simctl-terminate` | Gracefully terminate running app |
| `simctl-openurl` | Open URLs and deep links (http, https, custom schemes) |

### I/O & Media (2 tools)
| Tool | Description |
|------|-------------|
| `simctl-io` | Capture screenshots and record videos with semantic naming |
| `simctl-addmedia` | Add images and videos to simulator photo library |

### Advanced Testing (4 tools)
| Tool | Description |
|------|-------------|
| `simctl-privacy` | Manage app privacy permissions with audit trails |
| `simctl-push` | Send simulated push notifications with delivery tracking |
| `simctl-pbcopy` | Copy text to simulator clipboard (UIPasteboard) |
| `simctl-status-bar` | Override status bar (time, network, battery) |

### UI Automation (5 tools) - Phase 4
| Tool | Description |
|------|-------------|
| `simctl-query-ui` | Find UI elements using XCUITest predicates |
| `simctl-tap` | Tap screen (single, double, long press) |
| `simctl-type-text` | Type text into focused fields with keyboard support |
| `simctl-scroll` | Scroll content in any direction |
| `simctl-gesture` | Perform complex gestures (swipe, pinch, rotate, multi-touch) |

### Cache Management (5 tools)
| Tool | Description |
|------|-------------|
| `cache-get-stats` | View cache performance metrics and health |
| `cache-set-config` | Configure cache timeouts per layer |
| `cache-get-config` | Get current cache configuration |
| `cache-clear` | Clear cache (simulator, project, response) |
| `list-cached-responses` | View recent cached build/test results |

## Advanced Features

### LLM Optimization Patterns
XC-MCP implements context engineering patterns specifically optimized for AI agent usage:

**Semantic Screenshot Naming** (simctl-io)
- Automatic naming: `{appName}_{screenName}_{state}_{date}.png`
- Example: `MyApp_LoginScreen_Empty_2025-01-23.png`
- Enables agents to reason about screen context and state progression

**Structured Test Context** (simctl-push)
- Delivery tracking with `deliveryInfo` (sent/sentAt)
- Test context with `testName`, `expectedBehavior`, `actualBehavior`
- Enables agents to verify push delivery and validate app behavior

**Permission Audit Trails** (simctl-privacy)
- Audit entries with timestamp, action, service, success
- Test context with scenario and step tracking
- Enables agents to track permission changes across test scenarios

**Interaction Sequence Tracking**
- All UI automation tools support `actionName` parameter
- Timestamp tracking for verification with screenshots
- Guidance suggests next steps for agents

See `docs/LLM_OPTIMIZATION.md` for comprehensive patterns and future phases.

### UI Automation Workflows
Chain multiple UI tools for complete app testing:
```json
[
  {"tool": "simctl-query-ui", "args": {"udid": "...", "bundleId": "...", "predicate": "type == \"Button\" AND label == \"Login\""}},
  {"tool": "simctl-tap", "args": {"udid": "...", "x": 100, "y": 200, "actionName": "Tap Login Button"}},
  {"tool": "simctl-io", "args": {"udid": "...", "operation": "screenshot", "appName": "MyApp", "screenName": "LoginScreen", "state": "Success"}},
  {"tool": "simctl-query-ui", "args": {"udid": "...", "bundleId": "...", "predicate": "type == \"TextField\" AND identifier == \"emailInput\""}}
]
```

### Performance Optimization
- **90% fewer repeated calls** through intelligent caching
- **Boot time tracking** for simulator performance optimization
- **Build trend analysis** tracks success rates and timing
- **Usage pattern learning** improves recommendations over time
- **Smart simulator selection** based on usage history and performance

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
