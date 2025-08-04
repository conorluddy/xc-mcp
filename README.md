# XC-MCP: Intelligent Xcode CLI MCP Server

[![codecov](https://codecov.io/gh/conorluddy/xc-mcp/graph/badge.svg?token=4CKBMDTENZ)](https://codecov.io/gh/conorluddy/xc-mcp) 
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/conorluddy/xc-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server that provides intelligent, stateful access to Xcode command-line tools with **revolutionary progressive disclosure** that solves token overflow issues while maintaining full functionality through smart caching and adaptive intelligence.

## 🚀 Performance Excellence

**Real-world results solving critical MCP token limits:**
- ✅ **96% Token Reduction**: 57,827 tokens → 2,000 tokens for simulator listing  
- ✅ **99.6% Build Log Reduction**: 135,229 tokens → 500 tokens for build results
- ⚡ **90% Faster Operations**: Intelligent caching eliminates repeated expensive calls
- 🧠 **Smart Learning**: Remembers successful configurations and suggests optimal settings
- 📊 **Progressive Disclosure**: Full details available on-demand via cache IDs
- 🎯 **Instant Recommendations**: Booted devices and recently used simulators prioritized

## 🧠 Intelligent Features

### Adaptive Caching System
- **Simulator Cache**: 1-hour retention with performance tracking and boot optimization
- **Project Cache**: Remembers successful build configurations and performance trends  
- **Response Cache**: 30-minute retention for progressive disclosure
- **Smart Invalidation**: Automatic cache refresh based on file modifications

### Context-Aware Intelligence
- **Build Memory**: Learns your successful build configurations per project
- **Simulator Intelligence**: Tracks usage patterns and boot performance metrics
- **Smart Defaults**: Automatically suggests optimal destinations and configurations
- **Performance Trends**: Monitors build times and success rates for optimization

### Advanced Cache Management
- **cache-get-stats**: Monitor cache effectiveness and performance metrics
- **cache-set-config**: Customize cache timeouts (minutes/hours/milliseconds)
- **cache-get-config**: View current cache settings across all systems
- **cache-clear**: Selective or full cache clearing with granular control

## 📊 Core Tools

### Project Discovery & Information
- **xcodebuild-list**: Discover project structure, targets, schemes, and configurations
- **xcodebuild-showsdks**: List all available SDKs for development
- **xcodebuild-version**: Get Xcode and SDK version information

### Intelligent Build & Compilation
- **xcodebuild-build**: Build with smart defaults, configuration memory, and performance tracking
- **xcodebuild-clean**: Clean build artifacts and derived data
- **xcodebuild-get-details**: Retrieve cached build logs, errors, warnings, or metadata

### Smart iOS Simulator Management with Progressive Disclosure
- **simctl-list**: **NEW!** Revolutionary progressive disclosure - concise summaries by default (96% token reduction)
- **simctl-get-details**: Progressive access to full simulator data with intelligent filtering
- **simctl-boot**: Boot tracking with performance metrics and intelligent recommendations  
- **simctl-shutdown**: Graceful simulator shutdown

### Enhanced Cache & Progressive Disclosure
- **list-cached-responses**: View recent build/test results with summaries
- **Smart Response Caching**: Large outputs automatically cached with unique IDs
- **Token-Efficient Responses**: Concise summaries prevent MCP token limits
- **Drill-Down Pattern**: Progressive disclosure for detailed information

## 🎯 Key Benefits

### Before XC-MCP
- ❌ **simctl list exceeded 57k+ tokens** - unusable due to MCP limits
- ❌ Build logs exceeded MCP token limits (135k+ tokens)
- ❌ Repeated expensive `simctl list` calls
- ❌ No build configuration memory
- ❌ Manual simulator selection and configuration
- ❌ All-or-nothing verbose output

### After XC-MCP  
- ✅ **96% simulator token reduction** (57k → 2k) with progressive disclosure
- ✅ **99.6% build log reduction** (135k → 500) with smart summaries
- ✅ **90% fewer repeated calls** through intelligent caching
- ✅ **Smart build defaults** that learn from successful builds
- ✅ **Instant simulator recommendations** - booted devices and recently used first
- ✅ **Performance optimization** through usage tracking and metrics
- ✅ **Progressive access** to full details when needed

## 📈 Performance Metrics

### Caching Performance
- **Simulator List Cache**: 5-minute retention, 90% hit rate in typical workflows
- **Project Configuration Cache**: 1-hour retention, learns from successful builds
- **Build Response Cache**: 30-minute retention with progressive disclosure

### Intelligent Optimization
- **Boot Time Tracking**: Records and optimizes simulator boot performance
- **Configuration Memory**: Remembers last successful build settings per project
- **Usage Pattern Learning**: Prioritizes frequently used simulators and configurations
- **Build Trend Analysis**: Tracks performance improvements and regressions

## Installation

### Prerequisites
- macOS with Xcode command-line tools installed
- Node.js 18+ and npm
- Xcode 15+ recommended

### Install Xcode Command Line Tools
```bash
xcode-select --install
```

### Option 1: Install from NPM (Recommended)
```bash
# Install globally for CLI usage
npm install -g xc-mcp

# Or use with NPX (no installation required)
npx xc-mcp
```

### Option 2: Local Development Install
```bash
git clone https://github.com/conorluddy/xc-mcp.git
cd xc-mcp
npm install
npm run build
```

## Usage

### Running the Server

#### From NPM/NPX Install
```bash
# If installed globally
xc-mcp

# Or with NPX
npx xc-mcp
```

#### From Local Development
```bash
npm start
```

### Development Mode
```bash
npm run dev
```

## Intelligent Tool Usage Examples

### Cache Management

#### Check Cache Status
```json
{
  "tool": "cache-get-stats",
  "arguments": {}
}
```

**Response shows comprehensive cache metrics:**
```json
{
  "simulator": {
    "isCached": true,
    "deviceCount": 45,
    "recentlyUsedCount": 8,
    "cacheMaxAgeHuman": "1h"
  },
  "project": {
    "projectCount": 3,
    "buildHistoryCount": 12,
    "cacheMaxAgeHuman": "1h"
  },
  "response": {
    "totalEntries": 15,
    "byTool": {"xcodebuild-build": 8, "simctl-list": 7}
  }
}
```

#### Configure Cache Settings
```json
{
  "tool": "cache-set-config",
  "arguments": {
    "cacheType": "simulator",
    "maxAgeMinutes": 30
  }
}
```

#### Clear Caches When Needed
```json
{
  "tool": "cache-clear",
  "arguments": {
    "cacheType": "all"
  }
}
```

### Smart Building with Intelligent Defaults

#### Basic Build (Uses Smart Defaults)
```json
{
  "tool": "xcodebuild-build",
  "arguments": {
    "projectPath": "/path/to/MyApp.xcworkspace",
    "scheme": "MyApp"
  }
}
```

*Automatically uses cached project preferences and optimal simulator selection*

#### Override with Specific Configuration
```json
{
  "tool": "xcodebuild-build",
  "arguments": {
    "projectPath": "/path/to/MyApp.xcworkspace",
    "scheme": "MyApp",
    "configuration": "Release",
    "destination": "platform=iOS Simulator,name=iPhone 15 Pro"
  }
}
```

**Smart Build Response:**
```json
{
  "buildId": "fff6ec25-b5ad-4e0f-9c47-4c71819e51bd",
  "success": true,
  "summary": {
    "success": true,
    "errorCount": 0,
    "warningCount": 1,
    "duration": 7075,
    "scheme": "MyApp",
    "configuration": "Debug",
    "destination": "platform=iOS Simulator,id=ABC-123"
  },
  "nextSteps": [
    "✅ Build completed successfully in 7075ms",
    "💡 Smart defaults used: optimal simulator auto-selected",
    "Use 'xcodebuild-get-details' with buildId for full logs"
  ]
}
```

### Progressive Simulator Management (NEW!)

#### Revolutionary Progressive Disclosure - Instant Summaries
```json
{
  "tool": "simctl-list",
  "arguments": {
    "deviceType": "iPhone"
  }
}
```

**Progressive Response (96% Token Reduction: 57k → 2k tokens):**
```json
{
  "cacheId": "sim-abc123-def456",
  "summary": {
    "totalDevices": 47,
    "availableDevices": 31,
    "bootedDevices": 1,
    "deviceTypes": ["iPhone", "iPad"],
    "commonRuntimes": ["iOS 18.5", "iOS 26.0"],
    "lastUpdated": "2025-08-03T10:25:22.938Z"
  },
  "quickAccess": {
    "bootedDevices": [
      {
        "name": "iPhone 16 - iOS 26",
        "udid": "A33571BC-B564-41E8-9661-03E1356A4739",
        "state": "Booted",
        "runtime": "iOS 26.0"
      }
    ],
    "recentlyUsed": [...],
    "recommendedForBuild": [...]
  },
  "nextSteps": [
    "✅ Found 31 available simulators",
    "Use 'simctl-get-details' with cacheId for full device list",
    "Use filters: deviceType=iPhone, runtime=iOS 18.5"
  ],
  "smartFilters": {
    "suggestedFilters": "deviceType=iPhone runtime='iOS 18.5'"
  }
}
```

#### Progressive Detail Access - Get Full Information When Needed
```json
{
  "tool": "simctl-get-details", 
  "arguments": {
    "cacheId": "sim-abc123-def456",
    "detailType": "available-only",
    "deviceType": "iPhone",
    "maxDevices": 10
  }
}
```

**Full Detail Response:**
```json
{
  "summary": {
    "totalAvailable": 23,
    "showing": 10,
    "bootedCount": 1
  },
  "devices": [
    {
      "name": "iPhone 16 Pro",
      "udid": "ABC-123-DEF-456", 
      "state": "Booted",
      "runtime": "iOS 26.0",
      "lastUsed": "2025-08-03T10:30:00Z"
    }
  ],
  "recommendations": {
    "preferredForBuild": [...],
    "bootedDevices": [...]
  }
}
```

#### Smart Simulator Boot with Performance Tracking
```json
{
  "tool": "simctl-boot",
  "arguments": {
    "deviceId": "ABCD1234-5678-90EF-GHIJ-KLMNOPQRSTUV"
  }
}
```

**Boot Response with Performance Metrics:**
```json
{
  "success": true,
  "bootTime": 4500,
  "deviceId": "ABCD1234-5678-90EF-GHIJ-KLMNOPQRSTUV",
  "performance": {
    "avgBootTime": 4200,
    "reliability": 0.95,
    "recentUsage": "2024-08-03T10:30:00Z"
  }
}
```

### Progressive Build Analysis

#### Get Detailed Build Information
```json
{
  "tool": "xcodebuild-get-details",
  "arguments": {
    "buildId": "fff6ec25-b5ad-4e0f-9c47-4c71819e51bd",
    "detailType": "warnings-only",
    "maxLines": 50
  }
}
```

## Configuration

### Cache Configuration
```json
{
  "tool": "cache-set-config",
  "arguments": {
    "cacheType": "all",
    "maxAgeHours": 2
  }
}
```

### Environment Variables
- `XCODE_CLI_MCP_TIMEOUT`: Default timeout for operations (default: 300s)
- `XCODE_CLI_MCP_LOG_LEVEL`: Logging verbosity (error|warn|info|debug)
- `XCODE_CLI_MCP_CACHE_DIR`: Custom cache directory (default: in-memory)

### MCP Client Configuration

Quick add: `claude mcp add xc-mcp -s user "npx xc-mcp"`

For Claude Desktop, add to `~/Library/Application Support/Claude/claude_desktop_config.json`,

or for Claude Code, add to `~/.claude.json` for global user, or `.mcp.json` for project level usage:

#### Option 1: Using NPX (Recommended)
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "npx",
      "args": ["xc-mcp"],
      "cwd": "/path/to/your/ios/project",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Option 2: Using NPM Global Install
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "xc-mcp",
      "cwd": "/path/to/your/ios/project",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Option 3: Local Development Setup
```json
{
  "mcpServers": {
    "xc-mcp": {
      "command": "node",
      "args": ["/path/to/xc-mcp/dist/index.js"],
      "cwd": "/path/to/your/ios/project",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

Note: Set the `cwd` (current working directory) to your iOS project directory for proper Xcode project discovery.

## Intelligent Workflows

### Typical Development Workflow (Progressive Disclosure)
1. **`cache-get-stats`** → Check cache status and performance
2. **`simctl-list`** → Get simulator summary (2k tokens vs 57k - instant response!)
3. **`simctl-get-details`** → Progressive access to full simulator details when needed
4. **`xcodebuild-build`** → Build with smart defaults (learns from success)
5. **`xcodebuild-get-details`** → Drill down into specific build issues if needed

### Progressive Disclosure Workflow (NEW!)
1. **Quick Overview** → `simctl-list` returns concise summary with booted devices
2. **Smart Recommendations** → Get immediate access to recently used simulators
3. **Drill Down** → Use `simctl-get-details` with cacheId for full device lists
4. **Intelligent Filtering** → Apply deviceType/runtime filters for targeted results

### Performance Optimization Workflow
1. **`cache-set-config`** → Customize cache timeouts for your workflow
2. **Monitor build trends** → System automatically tracks performance
3. **`cache-clear`** → Refresh when Xcode configuration changes
4. **Automatic learning** → System adapts to your usage patterns

### Project Onboarding Workflow
1. **First build** → System learns project structure and preferences
2. **Subsequent builds** → Automatic smart defaults based on history
3. **Simulator optimization** → Boot time tracking and recommendations
4. **Configuration memory** → Successful settings remembered per project

## Advanced Features

### Performance Analytics
- Build time trend tracking per project
- Simulator boot performance monitoring  
- Cache hit rate optimization
- Configuration success rate analysis

### Smart Recommendations
- Optimal simulator suggestions based on usage patterns
- Build configuration recommendations from successful history
- Performance regression detection and alerting
- Cache optimization suggestions

### Context Awareness
- Project-specific preference learning
- Cross-session state persistence (planned)
- Team preference sharing (roadmap)
- Multi-workspace intelligence (roadmap)

## Security

- Input validation prevents path traversal attacks
- Command injection prevention through proper argument escaping
- File system permission validation
- Sandbox compatibility
- Cache isolation per project context

## Development

### Project Structure
```
src/
├── index.ts                    # Main MCP server entry
├── tools/
│   ├── xcodebuild/            # Build-related tools
│   ├── simctl/                # Simulator tools  
│   └── cache/                 # Cache management tools
├── state/                     # Intelligent caching system
│   ├── simulator-cache.ts     # Simulator state management
│   └── project-cache.ts       # Project context awareness
├── utils/                     # Common utilities
├── validators/                # Input validation
└── types/                     # TypeScript type definitions
```

### Development Commands
```bash
npm run build      # Build TypeScript
npm run dev        # Development mode with watch
npm test           # Run test suite
npm run lint       # Code linting
npm run clean      # Clean build artifacts
```

## Roadmap

### Phase 2: Advanced Intelligence (Planned)
- Cross-session state persistence
- Predictive caching and pre-warming
- Advanced error prediction
- Team preference synchronization

### Phase 3: Ecosystem Integration (Future)
- CI/CD pipeline optimization
- Performance benchmark comparisons
- Multi-project workspace awareness
- Automated optimization suggestions

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with intelligent caching in mind
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- Open an issue on GitHub
- Review implementation details in the source code
- Check the progressive disclosure implementation in `src/tools/simctl/`

---

**XC-MCP: Where iOS development meets intelligent automation** 🚀
