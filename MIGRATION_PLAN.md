# XC-MCP Modern Architecture Migration Plan

**Migration Date:** August 10, 2025  
**Target:** Migrate from low-level `Server` to modern `McpServer` architecture  
**Goal:** Enable proper prompt discovery while preserving all existing functionality  

## 🎯 Overview

XC-MCP currently uses the low-level `Server` class with manual request handlers. While this works perfectly for the 18 tools, it doesn't provide automatic prompt discovery. This migration will modernize the architecture using the recommended `McpServer` approach.

## 📊 Current State Audit

### Architecture
- **Server Class:** Low-level `Server` from `@modelcontextprotocol/sdk/server/index.js`
- **Tool Registration:** Manual `setRequestHandler()` with giant switch statement
- **Prompt Registration:** Manual `ListPromptsRequestSchema` and `GetPromptRequestSchema` handlers
- **Total Tools:** 18 working tools across 4 categories
- **Total Prompts:** 1 prompt (debug-workflow)

### Tools Inventory
**Xcodebuild Tools (6):**
1. `xcodebuild-list` - Project structure with intelligent caching
2. `xcodebuild-showsdks` - Available SDKs with structured output  
3. `xcodebuild-version` - Xcode version with caching
4. `xcodebuild-build` - Intelligent building with learning
5. `xcodebuild-clean` - Clean with validation
6. `xcodebuild-get-details` - Progressive disclosure for build logs

**Simctl Tools (4):**
7. `simctl-list` - Simulator list with progressive disclosure (critical: 57k→2k tokens)
8. `simctl-get-details` - Progressive access to simulator data
9. `simctl-boot` - Boot with performance tracking
10. `simctl-shutdown` - Intelligent shutdown

**Cache Management Tools (5):**
11. `cache-get-stats` - Cache statistics
12. `cache-get-config` - Current cache config
13. `cache-set-config` - Configure cache timeouts
14. `cache-clear` - Clear specific/all caches
15. `list-cached-responses` - List cached build/test results

**Persistence Tools (3):**
16. `persistence-enable` - Enable file-based persistence
17. `persistence-disable` - Disable persistence  
18. `persistence-status` - Persistence system status

### Critical Features to Preserve
- ✅ **Progressive Disclosure:** Cache IDs for large outputs (simctl-list, xcodebuild-build)
- ✅ **Intelligent Caching:** 3-layer system (simulator, project, response)
- ✅ **Learning System:** Build configs, simulator preferences, performance tracking  
- ✅ **Performance Metrics:** Boot times, build durations, usage patterns
- ✅ **Error Handling:** Structured McpError responses
- ✅ **Xcode Validation:** All tools validate installation

## 🚀 Migration Phases

### Phase 1: Planning & Documentation ✅
**Duration:** 1 hour  
**Status:** In Progress

- [x] Create MIGRATION_PLAN.md in repo root
- [ ] Document current tool signatures and expected behaviors  
- [ ] Create migration checklist with success criteria
- [ ] Create migration branch `feature/migrate-to-mcpserver`

### Phase 2: Core Infrastructure 
**Duration:** 2-3 hours  
**Goal:** Replace Server with McpServer, preserve existing functionality

**Tasks:**
- [ ] Update imports: `Server` → `McpServer`
- [ ] Replace `new Server()` with `new McpServer()`
- [ ] Remove manual request handlers:
  - [ ] `ListToolsRequestSchema` handler
  - [ ] `CallToolRequestSchema` handler  
  - [ ] `ListPromptsRequestSchema` handler
  - [ ] `GetPromptRequestSchema` handler
- [ ] Keep all tool implementations unchanged initially
- [ ] Ensure server starts and connects properly
- [ ] Test basic connectivity with one simple tool

### Phase 3: Tool Registration Migration
**Duration:** 3-4 hours  
**Goal:** Convert 18 tools from switch statement to `registerTool()`

**Migration Pattern:**
```typescript
// Old (manual)
case 'tool-name':
  return await toolFunction(args);

// New (automatic)  
server.registerTool(
  "tool-name",
  {
    title: "Tool Title",
    description: "Tool description...", 
    inputSchema: { /* zod schema */ }
  },
  async (args) => await toolFunction(args)
);
```

**Tool Migration Order:**
1. **Start Simple:** `xcodebuild-version` (simple, low-risk)
2. **Xcodebuild Tools:** Complete remaining 5 xcodebuild tools
3. **Simctl Tools:** 4 simctl tools (test progressive disclosure)
4. **Cache Tools:** 5 cache management tools  
5. **Persistence Tools:** 3 persistence tools
6. **Remove Switch Statement:** Once all tools migrated

### Phase 4: Prompt Integration
**Duration:** 1 hour  
**Goal:** Convert debug-workflow to `registerPrompt()`

**Tasks:**
- [ ] Convert debug-workflow from manual handlers to `registerPrompt()`
- [ ] Use Zod schemas for prompt arguments
- [ ] Test prompt discovery in Claude Code
- [ ] Verify prompt functionality matches current implementation

### Phase 5: Testing & Validation  
**Duration:** 2 hours
**Goal:** Ensure zero regression in functionality

**Critical Tests:**
- [ ] **All 18 tools function identically** to current implementation
- [ ] **Progressive disclosure preserved:** Cache IDs work for simctl-list, xcodebuild-build
- [ ] **Intelligent caching intact:** Simulator cache, project cache, response cache
- [ ] **Learning system works:** Build configs remembered, simulator preferences
- [ ] **Performance tracking:** Boot times, build metrics recorded
- [ ] **Prompt discoverable:** Shows up in Claude Code prompt listing
- [ ] **Error handling:** McpError responses still proper
- [ ] **Xcode validation:** Installation checks still work

**Test Scenarios:**
1. Build Grapla project (test learning, caching, progressive disclosure)
2. List simulators (test 57k→2k token reduction)
3. Boot simulator (test performance tracking)
4. Cache management (test all cache operations)
5. Persistence system (test file-based state)
6. Debug workflow prompt (test prompt discovery and execution)

### Phase 6: Cleanup & Documentation
**Duration:** 1 hour  
**Goal:** Polish the new architecture

**Tasks:**
- [ ] Remove unused imports and old handler code
- [ ] Update CLAUDE.md with new architecture notes
- [ ] Update README.md if architecture sections need changes
- [ ] Version bump to 2.0.0 (major architectural change)
- [ ] Update package.json description if needed

## ✅ Success Criteria

### Functional Requirements
- ✅ **Zero Regression:** All 18 tools work exactly as before
- ✅ **Prompt Discovery:** debug-workflow shows in Claude Code
- ✅ **Performance:** Build times and response times unchanged
- ✅ **Intelligence:** Caching, learning, progressive disclosure preserved
- ✅ **Error Handling:** Proper McpError responses maintained

### Technical Requirements  
- ✅ **Code Quality:** Cleaner, more maintainable architecture
- ✅ **Test Coverage:** All existing tests pass
- ✅ **Documentation:** Updated to reflect new architecture
- ✅ **Version Control:** Clean commit history with meaningful messages

### Business Requirements
- ✅ **No Downtime:** Migration can be done without disrupting users
- ✅ **Rollback Ready:** Can revert to old implementation if needed
- ✅ **Future Proof:** Architecture ready for additional prompts/tools

## ⚠️ Risk Mitigation

### High-Risk Areas
1. **Progressive Disclosure:** simctl-list token reduction (57k→2k)
2. **Intelligent Caching:** 3-layer cache system 
3. **Learning System:** Build config memory, simulator preferences
4. **Performance Tracking:** Boot time metrics, build optimization

### Mitigation Strategies
- **Incremental Migration:** Convert tools one-by-one, test each
- **Preserve Core Logic:** Don't change tool implementations, only registration
- **Comprehensive Testing:** Test every critical feature before merging
- **Branch Safety:** Keep old implementation as fallback
- **Staged Rollout:** Can deploy with feature flags if needed

## 📅 Timeline

**Total Estimated Time:** 8-10 hours  
**Recommended Approach:** 2-3 focused sessions

**Session 1 (3-4 hours):** Phases 1-2 (Planning + Core Infrastructure)  
**Session 2 (4-5 hours):** Phase 3 (Tool Migration)  
**Session 3 (2-3 hours):** Phases 4-6 (Prompts + Testing + Cleanup)

## 🔄 Rollback Plan

If migration encounters critical issues:

1. **Immediate:** Switch back to `feature/add-debug-workflow-prompt` branch
2. **Investigate:** Analyze what broke vs old implementation  
3. **Fix Forward:** Correct issue in migration vs rollback permanently
4. **Document:** Update this plan with lessons learned

## 📝 Post-Migration Benefits

- ✅ **Modern Architecture:** Following current MCP SDK best practices
- ✅ **Prompt Discovery:** Full MCP prompt support
- ✅ **Maintainability:** Cleaner code, less boilerplate
- ✅ **Extensibility:** Easy to add new tools and prompts
- ✅ **SDK Alignment:** Ready for future MCP SDK updates

---

**Next Step:** Begin Phase 2 - Core Infrastructure Migration