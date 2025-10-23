# XC-MCP Improvement Tickets

Local improvement tickets based on comparative analysis between `feat/ios-simulator-tooling` branch and main branch.

## Overview

11 improvement tickets organized by priority and impact. Each ticket includes problem statement, proposed solution with code examples, implementation checklist, and testing requirements.

## Status Summary

| Priority | Status | Count | Total Impact |
|----------|--------|-------|--------------|
| Priority 1 (Core) | Pending | 5 | High |
| Priority 2 (Workflow) | Pending | 3 | Medium |
| Priority 3 (Future) | Pending | 3 | Low |

## Priority 1: Core Integration (High Impact)

These features address critical gaps in project awareness and simulator management. They significantly improve developer experience and enable better AI agent workflows.

- [ ] [PRIORITY-1-BUILD-SETTINGS-CACHE.md](./PRIORITY-1-BUILD-SETTINGS-CACHE.md) - Auto-discover bundle IDs, app paths, deployment targets
- [ ] [PRIORITY-1-SMART-SIMULATOR-SELECTION.md](./PRIORITY-1-SMART-SIMULATOR-SELECTION.md) - Consider project deployment targets when suggesting simulators
- [ ] [PRIORITY-1-PRE-OPERATION-VALIDATION.md](./PRIORITY-1-PRE-OPERATION-VALIDATION.md) - Health checks before simulator operations
- [ ] [PRIORITY-1-AUTO-INSTALL-AFTER-BUILD.md](./PRIORITY-1-AUTO-INSTALL-AFTER-BUILD.md) - Optional post-build installation to simulator
- [ ] [PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY.md](./PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY.md) - Extract bundle ID from Info.plist automatically

## Priority 2: Workflow Tools (Developer Experience)

Developer-facing workflow tools that reduce multi-step operations to single commands.

- [ ] [PRIORITY-2-BUILD-AND-RUN-WORKFLOW.md](./PRIORITY-2-BUILD-AND-RUN-WORKFLOW.md) - Single command for build → install → launch
- [ ] [PRIORITY-2-TEST-PLAN-DISCOVERY.md](./PRIORITY-2-TEST-PLAN-DISCOVERY.md) - List and analyze `.xctestplan` files
- [ ] [PRIORITY-2-SCHEME-INSPECTOR.md](./PRIORITY-2-SCHEME-INSPECTOR.md) - Parse `.xcscheme` configuration files

## Priority 3: Advanced Features (Future Enhancements)

Advanced capabilities for specialized workflows and monitoring.

- [ ] [PRIORITY-3-CONSOLE-LOG-STREAMING.md](./PRIORITY-3-CONSOLE-LOG-STREAMING.md) - Real-time console output from simulators
- [ ] [PRIORITY-3-CAPABILITIES-VALIDATOR.md](./PRIORITY-3-CAPABILITIES-VALIDATOR.md) - Check project permissions against Info.plist
- [ ] [PRIORITY-3-SIMULATOR-LIFECYCLE-STATE.md](./PRIORITY-3-SIMULATOR-LIFECYCLE-STATE.md) - Prevent race conditions in simulator lifecycle

## Dependencies

```
PRIORITY-1-BUILD-SETTINGS-CACHE
  ├── PRIORITY-1-SMART-SIMULATOR-SELECTION
  ├── PRIORITY-1-AUTO-INSTALL-AFTER-BUILD
  ├── PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY
  └── PRIORITY-2-BUILD-AND-RUN-WORKFLOW

PRIORITY-1-PRE-OPERATION-VALIDATION
  └── PRIORITY-3-SIMULATOR-LIFECYCLE-STATE

PRIORITY-2-BUILD-AND-RUN-WORKFLOW
  ├── PRIORITY-1-BUILD-SETTINGS-CACHE
  └── PRIORITY-1-SMART-SIMULATOR-SELECTION

PRIORITY-3-CAPABILITIES-VALIDATOR
  └── PRIORITY-1-BUILD-SETTINGS-CACHE
```

## How to Use These Tickets

1. Read the ticket to understand the problem and proposed solution
2. Review the code examples and implementation guidance
3. Check the implementation checklist
4. Follow testing requirements before marking complete
5. Update this README with status

## Implementation Order

Recommended order for maximum efficiency and value:

1. **PRIORITY-1-BUILD-SETTINGS-CACHE** (foundation)
2. **PRIORITY-1-SMART-SIMULATOR-SELECTION** (uses settings cache)
3. **PRIORITY-1-PRE-OPERATION-VALIDATION** (stability)
4. **PRIORITY-1-BUNDLE-ID-AUTO-DISCOVERY** (improves usability)
5. **PRIORITY-1-AUTO-INSTALL-AFTER-BUILD** (workflow enhancement)
6. **PRIORITY-2-BUILD-AND-RUN-WORKFLOW** (user-facing feature)
7. **PRIORITY-2-TEST-PLAN-DISCOVERY** (workflow enhancement)
8. **PRIORITY-2-SCHEME-INSPECTOR** (workflow enhancement)
9. **PRIORITY-3-SIMULATOR-LIFECYCLE-STATE** (stability)
10. **PRIORITY-3-CAPABILITIES-VALIDATOR** (uses settings cache)
11. **PRIORITY-3-CONSOLE-LOG-STREAMING** (monitoring)

## Context

These tickets were generated from a detailed comparison of the `feat/ios-simulator-tooling` branch against `main` using the xcode-agent analyzer. The analysis identified gaps in:

- **Xcode project integration** - Missing awareness of build settings, deployment targets, capabilities
- **Build system integration** - Disconnected build and install workflows
- **Developer workflow** - No orchestration for multi-step operations
- **Performance & reliability** - Potential race conditions and missing state validation
- **LLM/Agent usability** - Missing workflow context and chaining guidance
- **Missing features** - Log streaming, permission validation, scheme inspection

For full analysis, see the xcode-agent recommendations in commit messages or related documentation.
