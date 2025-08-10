# XC-MCP Migration Checklist

**Purpose:** Track migration progress and ensure zero regression  
**Status:** 🏗️ In Progress

## Phase 1: Planning & Documentation ✅

- [x] **MIGRATION_PLAN.md created** - Comprehensive migration strategy
- [x] **TOOL_SIGNATURES.md created** - All 18 tools documented with signatures  
- [x] **MIGRATION_CHECKLIST.md created** - This tracking document
- [ ] **Migration branch created** - `feature/migrate-to-mcpserver`

## Phase 2: Core Infrastructure

- [ ] **Update imports**
  - [ ] `Server` → `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
  - [ ] Remove unused low-level imports
  - [ ] Add Zod import for schema validation

- [ ] **Replace server instantiation**
  - [ ] `new Server()` → `new McpServer()`
  - [ ] Preserve server name and version
  - [ ] Remove manual capabilities declaration (auto-handled)

- [ ] **Remove manual request handlers**
  - [ ] Remove `ListToolsRequestSchema` handler
  - [ ] Remove `CallToolRequestSchema` handler  
  - [ ] Remove `ListPromptsRequestSchema` handler
  - [ ] Remove `GetPromptRequestSchema` handler
  - [ ] Remove `setupToolHandlers()` method
  - [ ] Remove `setupPromptHandlers()` method

- [ ] **Basic connectivity test**
  - [ ] Server starts without errors
  - [ ] Connects to stdio transport
  - [ ] No tools registered yet (empty server)

## Phase 3: Tool Registration Migration

### 3.1 Start Simple - Xcodebuild Version
- [ ] **Convert `xcodebuild-version`** (lowest risk)
  - [ ] Create Zod schema for input validation
  - [ ] Register with `server.registerTool()`
  - [ ] Test functionality matches exactly
  - [ ] Verify caching still works
  - [ ] Verify error handling preserved

### 3.2 Xcodebuild Tools (6 total)
- [ ] **`xcodebuild-list`**
  - [ ] Schema: `{ projectPath: string, outputFormat?: "json"|"text" }`
  - [ ] Preserve 1-hour intelligent caching
  - [ ] Test structured project information output
  
- [ ] **`xcodebuild-showsdks`**
  - [ ] Schema: `{ outputFormat?: "json"|"text" }`
  - [ ] Preserve smart caching for SDK queries
  - [ ] Test structured JSON vs CLI text output

- [ ] **`xcodebuild-build`** ⚠️ **HIGH RISK - CRITICAL TOOL**
  - [ ] Schema: `{ projectPath: string, scheme: string, configuration?: string, destination?: string, sdk?: string, derivedDataPath?: string }`
  - [ ] **CRITICAL:** Preserve intelligent building with learning
  - [ ] **CRITICAL:** Preserve progressive disclosure (`buildId` system)
  - [ ] **CRITICAL:** Preserve smart defaults and suggestions
  - [ ] Test build time tracking and optimization metrics
  - [ ] Test auto-suggestion of optimal simulators
  - [ ] Test successful config caching

- [ ] **`xcodebuild-clean`**
  - [ ] Schema: `{ projectPath: string, scheme: string, configuration?: string }`
  - [ ] Preserve pre-validation and error messages
  - [ ] Test structured JSON responses

- [ ] **`xcodebuild-get-details`** ⚠️ **HIGH RISK - PROGRESSIVE DISCLOSURE**
  - [ ] Schema: `{ buildId: string, detailType: enum, maxLines?: number }`
  - [ ] **CRITICAL:** Preserve progressive disclosure functionality
  - [ ] Test cache ID retrieval system
  - [ ] Test different detail types (full-log, errors-only, etc.)

### 3.3 Simctl Tools (4 total) 
- [ ] **`simctl-list`** ⚠️ **HIGHEST RISK - TOKEN OVERFLOW PREVENTION**
  - [ ] Schema: `{ concise?: boolean, deviceType?: string, runtime?: string, availability?: enum, outputFormat?: "json"|"text" }`
  - [ ] **CRITICAL:** Preserve 57k→2k token reduction
  - [ ] **CRITICAL:** Preserve progressive disclosure with cache IDs
  - [ ] **CRITICAL:** Preserve smart recommendations and usage tracking
  - [ ] Test concise summaries by default
  - [ ] Test full details access via cache ID
  - [ ] Test recently used simulators prioritization

- [ ] **`simctl-get-details`**
  - [ ] Schema: `{ cacheId: string, detailType: enum, deviceType?: string, maxDevices?: number, runtime?: string }`
  - [ ] Preserve progressive access to simulator data
  - [ ] Test filtered results to prevent token overflow

- [ ] **`simctl-boot`**
  - [ ] Schema: `{ deviceId: string, waitForBoot?: boolean }`
  - [ ] Preserve performance tracking (boot times)
  - [ ] Preserve learning system (device preferences)
  - [ ] Test usage pattern tracking

- [ ] **`simctl-shutdown`**
  - [ ] Schema: `{ deviceId: string }`
  - [ ] Preserve smart device targeting ("booted", "all")
  - [ ] Test batch operations

### 3.4 Cache Management Tools (5 total)
- [ ] **`cache-get-stats`**
  - [ ] Schema: `{}` (no parameters)
  - [ ] Test comprehensive cache statistics
  - [ ] Test all caching layers reporting

- [ ] **`cache-get-config`**
  - [ ] Schema: `{ cacheType?: enum }`
  - [ ] Test current configuration retrieval

- [ ] **`cache-set-config`** 
  - [ ] Schema: `{ cacheType: enum, maxAgeMs?: number, maxAgeMinutes?: number, maxAgeHours?: number }`
  - [ ] Test cache tuning functionality
  - [ ] Verify mutual exclusion of time parameters

- [ ] **`cache-clear`**
  - [ ] Schema: `{ cacheType: enum }`
  - [ ] Test selective cache clearing
  - [ ] Test "all" option

- [ ] **`list-cached-responses`**
  - [ ] Schema: `{ limit?: number, tool?: string }`
  - [ ] Test progressive disclosure list functionality
  - [ ] Test filtering by tool

### 3.5 Persistence Tools (3 total)
- [ ] **`persistence-enable`**
  - [ ] Schema: `{ cacheDir?: string }`
  - [ ] Test opt-in file-based persistence
  - [ ] Test custom directory selection

- [ ] **`persistence-disable`**
  - [ ] Schema: `{ clearData?: boolean }`
  - [ ] Test return to in-memory caching
  - [ ] Test optional data clearing

- [ ] **`persistence-status`**
  - [ ] Schema: `{ includeStorageInfo?: boolean }`
  - [ ] Test detailed status information
  - [ ] Test storage info inclusion/exclusion

### 3.6 Final Switch Statement Removal
- [ ] **Remove giant switch statement** once all tools converted
- [ ] **Remove `CallToolRequestSchema` handler** completely
- [ ] **Clean up imports** of old tool functions if no longer needed

## Phase 4: Prompt Integration

- [ ] **Convert debug-workflow prompt**
  - [ ] Schema: `{ projectPath: string, scheme: string, simulator?: string }`
  - [ ] Use `server.registerPrompt()` instead of manual handlers
  - [ ] Preserve exact same message content and formatting
  - [ ] Test prompt discovery in Claude Code

- [ ] **Remove manual prompt handlers**
  - [ ] Remove `ListPromptsRequestSchema` handler
  - [ ] Remove `GetPromptRequestSchema` handler  
  - [ ] Remove `setupPromptHandlers()` method

## Phase 5: Testing & Validation

### 5.1 Functional Testing
- [ ] **All 18 tools work identically** to current implementation
  - [ ] Each tool produces identical outputs
  - [ ] All parameter validation works
  - [ ] All default values preserved
  - [ ] All error conditions handled properly

### 5.2 Critical Feature Testing
- [ ] **Progressive Disclosure System**
  - [ ] `simctl-list` returns cache IDs for large outputs
  - [ ] `xcodebuild-build` returns build IDs  
  - [ ] `simctl-get-details` works with cache IDs
  - [ ] `xcodebuild-get-details` works with build IDs
  - [ ] Token limits respected (57k→2k reduction maintained)

- [ ] **Intelligent Caching System**
  - [ ] Simulator cache (1-hour retention, usage tracking)
  - [ ] Project cache (build configs, preferences)
  - [ ] Response cache (progressive disclosure)
  - [ ] Cache hit rates maintained
  - [ ] Cache statistics accurate

- [ ] **Learning System**
  - [ ] Build configurations remembered per project
  - [ ] Simulator preferences tracked
  - [ ] Performance metrics recorded (boot times, build durations)
  - [ ] Smart defaults improve over time

- [ ] **Performance Tracking**
  - [ ] Build time tracking preserved
  - [ ] Boot time metrics recorded
  - [ ] Usage pattern analysis functional
  - [ ] Optimization recommendations work

### 5.3 Integration Testing  
- [ ] **Real-world workflow test**
  - [ ] Build Grapla project successfully  
  - [ ] List simulators (test token reduction)
  - [ ] Boot simulator (test performance tracking)
  - [ ] Test debug workflow prompt end-to-end

- [ ] **Error handling test**
  - [ ] Invalid Xcode installation detection
  - [ ] Missing project file errors
  - [ ] Invalid simulator IDs
  - [ ] Network/system errors

### 5.4 Prompt Discovery Test
- [ ] **Claude Code integration**
  - [ ] Disconnect and reconnect to XC-MCP
  - [ ] Verify `debug-workflow` shows in prompt listings
  - [ ] Test prompt execution with real project data
  - [ ] Verify prompt message content unchanged

### 5.5 Regression Testing
- [ ] **Run existing test suite**
  - [ ] All 281 tests pass
  - [ ] No new test failures introduced
  - [ ] Coverage maintained or improved

- [ ] **Build and deployment**
  - [ ] `npm run build` succeeds
  - [ ] `npm run lint` passes
  - [ ] `npm test` passes
  - [ ] Server starts without errors

## Phase 6: Cleanup & Documentation

- [ ] **Code cleanup**
  - [ ] Remove unused imports
  - [ ] Remove old handler methods
  - [ ] Clean up console.error debug statements
  - [ ] Ensure consistent code formatting

- [ ] **Documentation updates**
  - [ ] Update `CLAUDE.md` with new architecture notes
  - [ ] Update `README.md` if needed
  - [ ] Add migration notes to docs
  - [ ] Update any architecture diagrams

- [ ] **Version and release**
  - [ ] Update version to 2.0.0 (major architectural change)
  - [ ] Update package.json description if needed
  - [ ] Update CHANGELOG.md with migration details

## Success Verification Checklist

### ✅ Zero Regression Criteria
- [ ] All 18 tools function exactly as before migration
- [ ] Progressive disclosure prevents token overflow (57k→2k for simctl-list)
- [ ] Intelligent caching speeds up workflows (1-hour defaults)
- [ ] Learning system remembers preferences and configs
- [ ] Performance tracking records metrics accurately
- [ ] Error handling maintains proper McpError responses
- [ ] Xcode validation works for all tools

### ✅ New Functionality Criteria  
- [ ] `debug-workflow` prompt discoverable in Claude Code
- [ ] Prompt execution matches current manual implementation
- [ ] Modern architecture ready for additional prompts/tools

### ✅ Technical Quality Criteria
- [ ] Cleaner, more maintainable codebase
- [ ] Following current MCP SDK best practices  
- [ ] All tests pass with no regressions
- [ ] Build and deployment pipeline unchanged

### ✅ Business Continuity Criteria
- [ ] No disruption to existing users
- [ ] Rollback plan available if needed
- [ ] Performance unchanged or improved

---

## Migration Status: 🏗️ Phase 1 Complete

**Next Phase:** Begin Phase 2 - Core Infrastructure Migration

**Estimated Remaining:** 7-9 hours across Phases 2-6