# XC-MCP Improvement Tickets

Remaining improvement tickets for xc-mcp development. Previously implemented tickets have been archived to keep this README focused on active work.

## Overview

6 improvement tickets organized by priority and impact. Each ticket includes problem statement, proposed solution with code examples, implementation checklist, and testing requirements.

## Status Summary

| Priority | Status | Count | Total Impact |
|----------|--------|-------|--------------|
| Priority 1 (Core) | Pending | 1 | High |
| Priority 2 (Workflow) | Pending | 2 | Medium |
| Priority 3 (Future) | Pending | 3 | Low |

## ✅ Recently Completed

The following tickets were implemented and archived:

- ✅ **PRIORITY-1-BUILD-SETTINGS-CACHE** - Auto-discover bundle IDs, app paths, deployment targets
- ✅ **PRIORITY-1-SMART-SIMULATOR-SELECTION** - Smart device selection with scoring
- ✅ **PRIORITY-1-PRE-OPERATION-VALIDATION** - Health checks via `simctl-health-check`
- ✅ **PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY** - Bundle ID extraction from Info.plist
- ✅ **PRIORITY-2-TEST-PLAN-DISCOVERY** - Test plan discovery and selection

## Priority 1: Core Integration (High Impact)

Critical workflow features that complete the core integration story.

- [ ] [PRIORITY-1-AUTO-INSTALL-AFTER-BUILD.md](./PRIORITY-1-AUTO-INSTALL-AFTER-BUILD.md) - Optional post-build installation to simulator

## Priority 2: Workflow Tools (Developer Experience)

Developer-facing workflow tools that reduce multi-step operations to single commands.

- [ ] [PRIORITY-2-BUILD-AND-RUN-WORKFLOW.md](./PRIORITY-2-BUILD-AND-RUN-WORKFLOW.md) - Single command for build → install → launch
- [ ] [PRIORITY-2-SCHEME-INSPECTOR.md](./PRIORITY-2-SCHEME-INSPECTOR.md) - Parse `.xcscheme` configuration files

## Priority 3: Advanced Features (Future Enhancements)

Advanced capabilities for specialized workflows and monitoring.

- [ ] [PRIORITY-3-CONSOLE-LOG-STREAMING.md](./PRIORITY-3-CONSOLE-LOG-STREAMING.md) - Real-time console output from simulators
- [ ] [PRIORITY-3-CAPABILITIES-VALIDATOR.md](./PRIORITY-3-CAPABILITIES-VALIDATOR.md) - Check project permissions against Info.plist
- [ ] [PRIORITY-3-SIMULATOR-LIFECYCLE-STATE.md](./PRIORITY-3-SIMULATOR-LIFECYCLE-STATE.md) - Prevent race conditions in simulator lifecycle

## Dependencies

```
PRIORITY-1-AUTO-INSTALL-AFTER-BUILD
  (Foundation: build-settings-cache already implemented)

PRIORITY-2-BUILD-AND-RUN-WORKFLOW
  (Foundation: build-settings-cache and smart-simulator-selection already implemented)

PRIORITY-3-CAPABILITIES-VALIDATOR
  (Foundation: build-settings-cache already implemented)
```

## How to Use These Tickets

1. Read the ticket to understand the problem and proposed solution
2. Review the code examples and implementation guidance
3. Check the implementation checklist
4. Follow testing requirements before marking complete
5. Update this README with status

## Implementation Order

Recommended order for remaining tickets (foundations already implemented):

1. **PRIORITY-1-AUTO-INSTALL-AFTER-BUILD** (completes core integration)
2. **PRIORITY-2-BUILD-AND-RUN-WORKFLOW** (high-value user-facing feature)
3. **PRIORITY-2-SCHEME-INSPECTOR** (workflow enhancement)
4. **PRIORITY-3-CAPABILITIES-VALIDATOR** (uses settings cache for validation)
5. **PRIORITY-3-SIMULATOR-LIFECYCLE-STATE** (stability improvement)
6. **PRIORITY-3-CONSOLE-LOG-STREAMING** (monitoring feature)

## Context

These tickets were generated from a detailed comparison of the `feat/ios-simulator-tooling` branch against `main` using the xcode-agent analyzer. The analysis identified gaps in:

- **Xcode project integration** - Missing awareness of build settings, deployment targets, capabilities
- **Build system integration** - Disconnected build and install workflows
- **Developer workflow** - No orchestration for multi-step operations
- **Performance & reliability** - Potential race conditions and missing state validation
- **LLM/Agent usability** - Missing workflow context and chaining guidance
- **Missing features** - Log streaming, permission validation, scheme inspection

For full analysis, see the xcode-agent recommendations in commit messages or related documentation.
