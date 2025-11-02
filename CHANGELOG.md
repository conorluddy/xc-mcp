# Changelog

All notable changes to XC-MCP are documented in this file. This project adheres to [Semantic Versioning](https://semver.org).

## [Unreleased]

### 🚀 Major Features

#### xc-mini-mcp Package Variant
New minimal package with 3 core build/test tools optimized for AI agent workflows:

**What's Included:**
- `xcodebuild-build` — Build projects with smart defaults and auto-simulator selection
- `xcodebuild-test` — Run tests with intelligent caching
- `xcodebuild-get-details` — Progressive disclosure for error investigation

**Why Mini Variant?**
- **94% smaller context footprint** (3 tools vs 51)
- **Covers 95% of typical development workflows** (build, test, debug cycles)
- **Build and test tools auto-invoke simulator management internally** (no manual setup needed)
- **Faster agent response times** due to reduced tool discovery overhead
- **Optimized for TDD cycles, CI pipelines, and focused coding sessions**

**Publishing Infrastructure:**
- Entry point: `src/index-mini.ts`
- Build script: `npm run build:mini` compiles mini variant to `dist-mini/`
- Publish script: `npm run publish:mini` automates mini package publishing
- Full documentation: `docs/PUBLISHING.md` with complete publishing guide

**Architecture:**
- Both packages share identical tool implementations from `src/tools/`
- Mini variant only registers 3 tools in MCP server constructor
- Zero code duplication, single codebase maintenance
- Script-based publishing avoids monorepo complexity

### ✨ Enhancements

#### Documentation
- **README.md**: Added prominent info box explaining dual package approach
  - Clear comparison table of mini vs full variant
  - Installation and MCP configuration examples for both
  - Guidance on when to choose each variant

- **CLAUDE.md**: Added Dual Package Architecture section
  - Explains mini variant purpose and design decisions
  - Documents publishing workflow for both packages
  - Notes shared tool implementations

- **docs/PUBLISHING.md**: Comprehensive publishing guide
  - Step-by-step instructions for both variants
  - Version management strategy (independent versioning)
  - Troubleshooting common publishing issues
  - Architecture decision documentation

### 🔄 Changes

#### Build System
- Added `build:mini` script to compile mini variant
- Updated `clean` script to remove both `dist/` and `dist-mini/`
- Added `publish:mini` and `publish:full` publishing scripts

#### CI/CD Automation
- **Automated dual-package publishing** — GitHub Actions workflow publishes both packages in parallel
- Workflow triggers on GitHub releases (e.g., creating `v1.3.0` tag)
- Publishes 4 packages automatically:
  - `xc-mcp@<version>` (full variant - primary)
  - `xcmcp@<version>` (alias)
  - `xcode-mcp@<version>` (alias)
  - `xc-mini-mcp@<version>` (mini variant)
- Uses npm provenance for secure, verified packages
- Supports dry-run mode for testing without publishing
- See `.github/workflows/publish.yml` for implementation

### 📚 Technical Details

**Script-Based Publishing Rationale:**
- Avoids monorepo complexity (overkill for 2 packages)
- Single codebase with zero code duplication
- Clean separation in npm registry for discoverability
- Simple rollback via `package.json` restore
- Works with standard npm tooling

**Implementation Approach:**
- Created `src/index-mini.ts` with only 3 tool registrations
- Added `scripts/publish-mini.sh` to automate mini package publishing
- Script backs up, modifies, publishes, and restores `package.json`
- Both variants use same caching, validation, and command execution layers
- Following CODESTYLE.md: progressive disclosure, strategic comments, context engineering

**Version Management:**
- Mini variant starts at 1.0.0 with independent versioning
- Full variant continues at 1.2.0+
- See `docs/PUBLISHING.md` for version strategy

---

## [1.2.0] - 2025-10-25

### 🚀 Major Features

#### IDB Integration (11 new tools)
Complete iOS Development Bridge integration enabling UI automation on simulators and physical devices:

**Target Management**
- `idb-targets`: List and describe iOS targets (simulators + devices)
- `idb-connect`: Manage persistent IDB companion connections

**App Management**
- `idb-list-apps`: List installed apps with running status and architecture info
- `idb-install`: Deploy .app bundles or .ipa archives to targets
- `idb-launch`: Start apps with stdout/stderr streaming support
- `idb-terminate`: Force-quit running applications
- `idb-uninstall`: Remove apps and clean up data/preferences

**UI Automation**
- `idb-ui-tap`: Tap interactions with auto-retry on nearby coordinates (±5px fallback)
- `idb-ui-input`: Type text and keyboard commands with sensitive data handling
- `idb-ui-gesture`: Complex gestures (swipe with auto-direction→coordinate conversion, pinch, rotate)
- `idb-ui-describe`: Query accessibility tree to find UI elements programmatically

**Key IDB Features**
- Auto-UDID detection: Automatically finds booted simulator or optimal device
- Coordinate transform: Converts screen percentages to pixel coordinates automatically
- Screen dimension fetching: Auto-fetches dimensions from idb describe when missing
- NDJSON parsing: Correctly handles IDB's line-delimited JSON output format
- Intelligent caching: 5-second TTL balances freshness with performance
- Works with physical devices via idb_companion

#### Build Settings Cache
New intelligent caching layer that auto-discovers Xcode project metadata:
- Auto-discovers bundle IDs from Xcode build settings
- Extracts deployment targets (iOS, macOS minimum versions)
- Identifies supported device families (iPhone, iPad, Mac Catalyst)
- Extracts app capabilities from build configuration
- 1-hour TTL prevents repeated expensive xcodebuild operations
- Graceful degradation with fallback handling

#### Screenshot Enhancements
Vision-optimized screenshots with interactive element metadata:
- Base64-encoded inline screenshots (no file I/O required)
- Automatic element extraction from accessibility tree
- Interactive element coordinates in response (x, y, width, height)
- Element types and labels for context
- Screen dimensions included for coordinate validation
- Semantic naming support: `{appName}_{screenName}_{state}_{timestamp}.png`
- Graceful degradation if elements unavailable

#### View Coordinate Cache Foundation
Intelligent view caching system for repeated interactions:
- Element structure hashing via SHA256 fingerprinting
- Confidence tracking with age decay algorithm
- Auto-disables on low hit rate (<60%)
- LRU eviction (50 views, 5 coordinates per view)
- Opt-in via `enableCoordinateCaching` parameter
- Integration with persistence system for cross-session caching

### ✨ Enhancements

#### Tool Improvements
- **Auto-UDID Detection**: 7 core tools now auto-detect booted simulators when UDID not specified
- **Tool Aliases**: Shorter invocation names for better agent ergonomics:
  - `query` → `simctl-query-ui`
  - `tap` → `simctl-tap`
  - `type` → `simctl-type-text`
  - `scroll` → `simctl-scroll`
  - `swipe`, `pinch`, `rotate` → `simctl-gesture`
  - `screenshot` → `simctl-io` / `idb-ui-describe`
  - `screenshot-save` → file-based variant

#### Simulator Tooling
- Guidance warnings for 9 tools when simulators shutdown or unavailable
- Input validation for enum parameters (dataNetwork, wifiMode, batteryState)
- Enhanced error messages with troubleshooting steps
- Coordinate retry mechanism: Automatic ±5px fallback on tap failures
- Fixed empty response handling in `simctl-get-app-container`

#### LLM Optimization Patterns
Comprehensive patterns for AI-agent optimization:
- **Semantic metadata**: appName, screenName, state for context understanding
- **Structured test context**: testName, expectedBehavior, actualBehavior tracking
- **Permission audit trails**: scenario, step, timestamp for test validation
- **Interaction sequence tracking**: actionName for workflow reconstruction
- Progressive disclosure: Large outputs cached with IDs instead of inline

#### Documentation System
- 53 documentation sidecar files (.md) for all tools
- Tool-specific examples and usage patterns
- Parameter descriptions with type information
- Common error scenarios and solutions
- Progressive disclosure pattern enables detailed help

#### Error Messages
- **Enhanced tap error guidance**: 4 common failure reasons with solutions
- **Improved query-ui guidance**: Predicate syntax help and troubleshooting
- **Better coordinate feedback**: Recommends query-ui → tap workflow
- **Actionable error messages**: Clear next steps instead of opaque codes

#### Code Quality
- Refactored build.ts and xcodebuild-test.ts for clarity
- Removed emoji from responses (token efficiency)
- Unified response structure across similar tools
- 25-35% more efficient responses (size reduction)
- Clear section markers for AI-friendly navigation

### 🐛 Fixes

#### Critical Fixes
- **IDB Cache TTL**: Reduced from 60s to 5s to prevent stale boot state
- **Float Precision**: Implemented IntCoordinate type system to prevent CLI parsing errors
- **Swipe Direction**: Auto-converts direction strings to screen-relative coordinates
- **NDJSON Parsing**: Fixed line-by-line parsing for IDB multi-object output
- **Screen Dimensions**: Auto-fetches dimensions when missing from idb list-targets

#### Test Fixes
- Fixed 140+ failing tests across simulator tooling
- Updated error handling patterns to match McpError behavior
- Removed path module mock that broke file operations
- Fixed tmpdir initialization for proper test isolation

### 📊 Project Metrics

#### Tooling Expansion
- **Total tools**: 52 (up from ~28 in v1.1.0)
- **Tool categories**: 9 (Xcode, Simulator, IDB, Simulator Control, App Management, UI Automation, I/O, Advanced Testing, Cache Management)
- **Tool aliases**: 8 shorter names for better agent ergonomics

#### Test Coverage
- **Total tests**: 1000+ across 44 test suites
- **Coverage threshold**: 80% minimum (maintained)
- **Test suite categories**:
  - State management (cache, config, build settings)
  - Utility functions (command execution, validation)
  - Tool tests (all 52 tools fully tested)
  - Integration patterns (MCP protocol compliance)

#### Code Quality
- TypeScript: 0 compilation errors
- ESLint: Pre-existing warnings only (unrelated to features)
- Code style: Prettier formatting enforced
- Architecture: Progressive disclosure throughout

### 🔄 Changes & Migration

#### API Changes
- `simctl-io` now returns `screenshotInfo` object instead of flat response
- Screenshots include `interactiveElements` metadata when available
- All coordinate responses now use `IntCoordinate` type system
- IDB tools return `targetInfo`, `appInfo`, `interactionInfo` consistently

#### Breaking Changes
- None for stable APIs
- Internal response structures simplified but backward compatible at MCP level

#### Configuration Changes
- New cache configuration for BuildSettingsCache (1-hour default TTL)
- New coordinate cache configuration (opt-in via enableCoordinateCaching)
- Persistence system supports new cache types automatically

### 📚 Documentation

#### New Documentation
- `docs/LLM_OPTIMIZATION.md`: Comprehensive LLM optimization patterns guide
- Updated `CLAUDE.md`: Tool categories and architecture documentation
- Updated `README.md`: 52 tools, workflows, comprehensive examples
- Generated 53 tool documentation sidecar files
- `CODESTYLE.md`: Code style guide from v1.1.0 (applicable to v1.2.0)

#### Documentation Examples
- IDB workflow examples: app install → launch → tap interactions
- Build settings usage: permission validation, auto-configuration
- Screenshot + query-ui workflow: deterministic UI element discovery
- Coordinate caching: usage patterns and performance implications

### 🎯 Use Cases Enabled

#### Complete iOS Testing Workflows
1. **Build & Deploy**: Build app, extract bundle ID from settings cache, install via IDB
2. **UI Automation**: Launch app, take screenshot with elements, tap discovered coordinates
3. **Permission Testing**: Verify permissions from build cache, grant via simctl-privacy, test behavior
4. **State Validation**: Take screenshots, verify expected UI state, repeat workflow steps

#### Multi-Device Testing
- Device recommendations based on build settings (device families)
- Parallel testing on multiple simulators with performance tracking
- Automatic device selection based on app capabilities

#### Debugging & Diagnostics
- Health checks across Xcode, simulators, runtimes, disk space
- Build settings discovery for configuration validation
- Cache statistics for performance optimization

### 🙏 Acknowledgments

**Key Contributions**
- IDB integration: Solves physical device testing limitation
- Build settings cache: Enables permission validation and auto-configuration
- UI coordinate system: Makes UI automation reliable instead of trial-and-error
- Element extraction: Bridges screenshot vision and programmatic interaction

**Special Thanks**
- Claude Code for MCP server scaffolding and tool generation
- Xcode command-line team for stable APIs
- iOS Development Bridge developers for powerful automation capabilities

---

## [1.1.0] - 2025-10-21

### Added
- `xcodebuild-test` tool with progressive disclosure and smart defaults
- Test plan execution support with test filtering
- Test-without-building for faster iteration
- Comprehensive code style guide (CODESTYLE.md)
- Support for test result retrieval via `xcodebuild-get-details`

### Changed
- Refactored `xcodebuild-build` response structure for consistency
- Token efficiency improvements: 25-35% smaller responses
- Improved error message clarity across build tools

### Fixed
- Test configuration caching per project
- Performance metrics for test execution

---

## [1.0.5] - Previous

See git history for earlier releases.

---

## Upgrade Guide

### From v1.1.0 to v1.2.0

#### For Users
1. **New IDB Tools**: If you have physical iOS devices, the 11 new IDB tools enable testing on real devices
2. **Build Settings Cache**: No configuration needed—auto-discovery happens transparently
3. **Screenshot Changes**: Screenshots now include interactive elements; existing code continues to work
4. **Tool Aliases**: Use shorter names (e.g., `tap` instead of `simctl-tap`) if preferred

#### For Developers
1. **Import Changes**: IDB tools now available in `src/tools/idb/`
2. **Cache System**: BuildSettingsCache available via caching manager
3. **Type System**: New `IntCoordinate` type for coordinate safety
4. **Error Handling**: All tools follow consistent McpError pattern

#### Potential Issues
- If idb_companion not installed, IDB tools will fail gracefully
- Ensure Xcode 15+ for Build Settings Cache support
- First build settings discovery may take 5-10 seconds (cached after)

---

## Compatibility

### Minimum Requirements
- macOS 12+
- Xcode 15+
- Node.js 18+
- iOS simulators or physical devices via idb_companion

### Tested With
- Xcode 15.0 through latest
- macOS 13-15
- iOS 17-18
- iPhone and iPad simulators
- Physical iOS devices (via idb_companion)

---

## Performance Notes

### Token Efficiency
- Progressive disclosure reduces average response size by 96%
- Build settings caching prevents repeated 500ms+ operations
- Screenshot element extraction adds <200ms overhead

### Caching Performance
- Simulator cache: 1-hour retention, <5s lookup time
- Build settings cache: 1-hour retention, auto-discovery on miss
- Response cache: 30-minute retention for progressive disclosure
- View coordinate cache: LRU (50 views × 5 coordinates)

### Benchmarks (v1.2.0)
- App installation: 3-8 seconds
- UI automation tap: 200-500ms
- Screenshot capture: 500-1500ms
- Build settings discovery: 2-5 seconds (cached)
- Device boot (cold): 20-40 seconds

---

## Security & Privacy

### Data Handling
- No data leaves the local machine
- Build settings cached locally only
- Screenshots stored in memory by default
- File-based caching requires explicit persistence enablement

### Permissions
- Respects Xcode security restrictions
- iOS simulator privacy controls work as expected
- Permission grants logged with audit trails (simctl-privacy)

---

## Known Limitations

### IDB Tools
- Require idb_companion for physical device support
- Physical device debugging may require Xcode pairing first
- Some advanced gestures not supported on all iOS versions

### Build Settings Cache
- Requires Xcode 15+ for reliable extraction
- Some dynamic build settings not captured
- App entitlements may differ from final signed app

### UI Automation
- Accessibility server must be enabled on device/simulator
- Some third-party frameworks override accessibility
- View coordinate caching works best with stable UI layouts

---

## Future Roadmap

### Phase 3 (v1.3.0 - Planning)
- Advanced debugging tools (crash logs, system logs)
- Performance profiling integration
- Network request monitoring
- Memory and CPU tracking

### Phase 4 (v1.4.0 - Planning)
- Advanced gesture recognition
- Multi-touch gesture support
- Video recording with scene markers
- AI-powered test generation

---

