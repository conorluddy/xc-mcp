# XC-MCP Tool Signatures Reference

**Purpose:** Document all current tool signatures and behaviors for migration reference.
**Usage:** Ensure zero regression when converting to `registerTool()` pattern.

## V3.0.0 Deferred Loading

Starting with v3.0.0, XC-MCP implements **progressive tool enablement** to reduce context overhead for agents:

- **By default:** Only `tool-search` and `rtfm` are registered
- **Discovery:** Use `tool-search` to find and enable other tools dynamically
- **Full registration:** Set `XC_MCP_DEFER_LOADING=false` to load all tools upfront
- **Benefits:**
  - Agents discover tools on-demand rather than facing full 28-tool list
  - Context usage reduced for typical workflows (search + few tools vs all tools)
  - Tool discovery integrated into agent reasoning loop
  - Backward compatible: all tools still available, just not all registered initially

## Tool Categories & Signatures

### 1. Xcodebuild Tools (6 tools)

#### `xcodebuild-list`
**Function:** `xcodebuildListTool(args)`  
**Input Schema:**
```typescript
{
  projectPath: string, // required - Path to .xcodeproj or .xcworkspace file
  outputFormat?: "json" | "text" // default: "json"  
}
```
**Key Behaviors:**
- 1-hour intelligent caching prevents expensive re-runs
- Validates Xcode installation and project path
- Returns structured project information (targets, schemes, configurations)
- Smart caching remembers results to avoid redundant operations

#### `xcodebuild-showsdks`
**Function:** `xcodebuildShowSDKsTool(args)`  
**Input Schema:**
```typescript
{
  outputFormat?: "json" | "text" // default: "json"
}
```
**Key Behaviors:**
- Smart caching prevents redundant SDK queries
- Returns available SDKs for iOS, macOS, watchOS, tvOS
- Structured JSON data vs parsing raw CLI text

#### `xcodebuild-version`
**Function:** `xcodebuildVersionTool(args)`  
**Input Schema:**
```typescript
{
  outputFormat?: "json" | "text", // default: "json"
  sdk?: string // optional - specific SDK to query
}
```
**Key Behaviors:**
- Cached results for faster subsequent queries
- Validates Xcode installation first
- Comprehensive Xcode and SDK version info

#### `xcodebuild-build`
**Function:** `xcodebuildBuildTool(args)`  
**Input Schema:**
```typescript
{
  projectPath: string, // required
  scheme: string, // required  
  configuration?: string, // default: "Debug"
  destination?: string, // optional - uses intelligent defaults
  sdk?: string, // optional
  derivedDataPath?: string // optional
}
```
**Key Behaviors:**
- **CRITICAL:** Intelligent building with learning and performance tracking
- Learns from successful builds and suggests optimal configurations
- Smart caching (1-hour default) dramatically speeds up workflows
- **Progressive disclosure:** Returns `buildId` for full logs via `xcodebuild-get-details`
- Records build times and optimization metrics
- Smart defaults based on usage history and available simulators
- Auto-suggests optimal simulators based on project history

#### `xcodebuild-clean`
**Function:** `xcodebuildCleanTool(args)`
**Input Schema:**
```typescript
{
  projectPath: string, // required
  scheme: string, // required
  configuration?: string // optional
}
```
**Key Behaviors:**
- Pre-validates project exists and Xcode is installed
- Structured JSON responses vs parsing CLI output
- Better error messages and troubleshooting context

#### `xcodebuild-get-details`
**Function:** `xcodebuildGetDetailsTool(args)`
**Input Schema:**
```typescript
{
  buildId: string, // required - from xcodebuild-build
  detailType: "full-log" | "errors-only" | "warnings-only" | "summary" | "command" | "metadata",
  maxLines?: number // default: 100
}
```
**Key Behaviors:**
- **CRITICAL:** Progressive disclosure prevents token overflow
- Gets detailed build information from cached results
- Essential for debugging build failures

### 2. Simctl Tools (4 tools)

#### `simctl-list`
**Function:** `simctlListTool(args)`
**Input Schema:**
```typescript
{
  concise?: boolean, // default: true
  deviceType?: string, // e.g. "iPhone", "iPad"
  runtime?: string, // e.g. "17", "iOS 17.0"
  availability?: "available" | "unavailable" | "all", // default: "available"
  outputFormat?: "json" | "text" // default: "json"
}
```
**Key Behaviors:**
- **CRITICAL:** Progressive disclosure - 57k→2k token reduction!
- Smart recommendations with recently used simulators first
- 1-hour caching dramatically faster than repeated simctl calls
- Usage tracking learns which simulators work best
- Returns concise summaries by default, full details via cache ID

#### `simctl-get-details`
**Function:** `simctlGetDetailsTool(args)`
**Input Schema:**
```typescript
{
  cacheId: string, // required - from simctl-list
  detailType: "full-list" | "devices-only" | "runtimes-only" | "available-only",
  deviceType?: string,
  maxDevices?: number, // default: 20
  runtime?: string
}
```
**Key Behaviors:**
- Progressive access to full simulator data
- Prevents token overflow with filtered results

#### `simctl-boot`
**Function:** `simctlBootTool(args)`
**Input Schema:**
```typescript
{
  deviceId: string, // required - UDID from simctl-list or "booted"
  waitForBoot?: boolean // default: true
}
```
**Key Behaviors:**
- Performance tracking records boot times
- Learning system tracks which devices work best for projects  
- Intelligent waiting for complete boot vs guessing
- Automatically tracks usage patterns for optimization

#### `simctl-shutdown`
**Function:** `simctlShutdownTool(args)`
**Input Schema:**
```typescript
{
  deviceId: string // required - UDID, "booted", or "all"
}
```
**Key Behaviors:**
- Smart device targeting with "booted" and "all" options
- Updates internal device state for better recommendations
- Efficient batch operations for multiple devices

### 3. Cache Management Tools (5 tools)

#### `cache-get-stats`
**Function:** `getCacheStatsTool(args)`
**Input Schema:** `{}` (no parameters)
**Key Behaviors:**
- Comprehensive cache statistics across all caching layers
- Cache hit rates, expiry times, storage usage, performance metrics
- Essential for monitoring cache effectiveness

#### `cache-get-config`
**Function:** `getCacheConfigTool(args)`
**Input Schema:**
```typescript
{
  cacheType?: "simulator" | "project" | "response" | "all" // default: "all"
}
```
**Key Behaviors:**
- Current cache configuration settings
- Shows cache timeouts and policies

#### `cache-set-config`
**Function:** `setCacheConfigTool(args)`
**Input Schema:**
```typescript
{
  cacheType: "simulator" | "project" | "response" | "all", // required
  maxAgeMs?: number,
  maxAgeMinutes?: number,
  maxAgeHours?: number
}
```
**Key Behaviors:**
- Fine-tune XC-MCP's intelligent caching for workflows
- Performance tuning: longer caches = faster repeated operations
- Fresh data control: shorter caches = more up-to-date information

#### `cache-clear`
**Function:** `clearCacheTool(args)`
**Input Schema:**
```typescript
{
  cacheType: "simulator" | "project" | "response" | "all" // required
}
```
**Key Behaviors:**
- Clear cached data to force fresh data retrieval
- Selective cache clearing by type

#### `list-cached-responses`
**Function:** `listCachedResponsesTool(args)`
**Input Schema:**
```typescript
{
  limit?: number, // default: 10
  tool?: string // optional filter
}
```
**Key Behaviors:**
- List recent cached build/test results for progressive disclosure
- Essential for accessing full logs via buildId/cacheId

### 4. Persistence Tools (3 tools)

#### `persistence-enable`
**Function:** `persistenceEnableTool(args)`
**Input Schema:**
```typescript
{
  cacheDir?: string // optional custom directory
}
```
**Key Behaviors:**
- Opt-in file-based persistence for cache data
- Privacy first: disabled by default, only usage patterns stored
- Learns over time with persistent build configurations

#### `persistence-disable`
**Function:** `persistenceDisableTool(args)`
**Input Schema:**
```typescript
{
  clearData?: boolean // default: false
}
```
**Key Behaviors:**
- Return to in-memory caching only
- Optionally clears existing cache data files

#### `persistence-status`
**Function:** `persistenceStatusTool(args)`
**Input Schema:**
```typescript
{
  includeStorageInfo?: boolean // default: true
}
```
**Key Behaviors:**
- Detailed information about persistent state management
- Current state, cache directory, disk usage, timestamps
- Privacy and security information

### 5. V3.0.0 Tools (3 tools)

#### `tool-search`
**Function:** `toolSearchTool(args)`
**Input Schema:**
```typescript
{
  query?: string,                // optional - search term (name, description, keywords)
  category?: 'build' | 'simulator' | 'app' | 'idb' | 'io' | 'cache' | 'system' | 'workflow',  // optional
  limit?: number,                // default: 10 - max results
  showAll?: boolean              // default: false - show all tools
}
```
**Key Behaviors:**
- **CRITICAL:** Discovery tool for v3.0.0 deferred loading
- Searches tool names, descriptions, and keywords to find relevant tools
- Returns matching tools with key metadata (name, category, description, synopsis)
- When match found, returns instructions for enabling tool
- Progressive disclosure: use with specific query for fast discovery
- Cache results for frequently searched tools

#### `workflow-tap-element`
**Function:** `workflowTapElementTool(args)`
**Input Schema:**
```typescript
{
  elementQuery: string,          // required - element search term (e.g., "Login", "Submit")
  inputText?: string,            // optional - text to type after tapping
  verifyResult?: boolean,        // default: false - screenshot after action
  udid?: string,                 // optional - target device (default: "booted")
  screenContext?: string         // optional - screen name for tracking
}
```
**Key Behaviors:**
- High-level semantic UI automation combining discovery + interaction
- Uses accessibility tree for semantic element search vs visual matching
- Simplifies common pattern: find element → tap → optionally type → optionally verify
- Reduces context by combining multiple steps into single action
- Returns success/failure with coordinates tapped and optional verification screenshot
- Ideal for test automation and UI workflows

#### `workflow-fresh-install`
**Function:** `workflowFreshInstallTool(args)`
**Input Schema:**
```typescript
{
  projectPath: string,                            // required
  scheme: string,                                 // required
  simulatorUdid?: string,                         // optional - target simulator
  eraseSimulator?: boolean,                       // default: false - wipe simulator data
  configuration?: 'Debug' | 'Release',            // default: "Debug"
  launchArguments?: string[],                     // optional - app launch args
  environmentVariables?: Record<string, string>   // optional - app env vars
}
```
**Key Behaviors:**
- **CRITICAL:** Orchestration workflow combining 5+ tool operations into single action
- Handles complete clean installation: erase simulator (optional) → build → install → launch
- Configurable simulator erasure to reset app state
- Supports launch arguments and environment variables for testing
- Returns comprehensive status: erase status, build success, install success, launch success
- Essential for reproducible test scenarios with clean state
- Single-step alternative to manually chaining erase → build → install → launch

## Critical Migration Notes

### Must Preserve
1. **Progressive Disclosure:** `simctl-list` (57k→2k), `xcodebuild-build` (buildId system)
2. **Intelligent Caching:** 3-layer cache system with 1-hour defaults
3. **Learning System:** Build configs, simulator preferences, performance metrics
4. **Smart Defaults:** Auto-suggestion based on usage history
5. **Error Handling:** Structured McpError responses with proper codes
6. **Xcode Validation:** All tools validate installation before execution
7. **V3.0.0 Features:**
   - **Deferred Loading:** `tool-search` + `rtfm` enable discovery-driven agent workflows
   - **Workflow Orchestration:** `workflow-tap-element` and `workflow-fresh-install` combine multiple operations
   - **Dynamic Tool Registration:** Tools enabled on-demand via `tool-search` results
   - **Environment Control:** `XC_MCP_DEFER_LOADING` flag for backward compatibility

### Schema Conversion Notes
- All current schemas use plain objects, need conversion to Zod schemas
- Optional parameters have defaults that must be preserved
- Enum values must be maintained exactly (e.g., outputFormat, cacheType)
- Required vs optional parameter patterns must match exactly

### Performance Considerations
- Tool registration should not impact performance
- Cache systems must remain intact during migration
- Progressive disclosure cache IDs must continue working
- Build time tracking and metrics must be preserved