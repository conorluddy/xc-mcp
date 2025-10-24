# IDB Integration Planning for XC-MCP

**Document Version:** 1.0
**Date:** 2025-01-23
**Status:** Approved for Implementation

---

## Executive Summary

This document provides a comprehensive plan for integrating **IDB (iOS Development Bridge)** into XC-MCP to replace the fabricated UI automation tools. IDB is a CLI-based tool from Facebook/Meta that provides real UI automation, app management, file operations, debugging, and testing capabilities for iOS simulators and devices.

### Key Benefits
- ✅ **Real commands** - All IDB commands actually exist (verified against official docs)
- ✅ **CLI-based** - Perfect match for MCP server architecture
- ✅ **Rich feature set** - 40+ commands across 9 categories
- ✅ **Simulator + Device support** - More capable than simctl alone
- ✅ **Production-ready** - Used by Facebook/Meta for iOS automation at scale

---

## Table of Contents

1. [Research Findings](#research-findings)
2. [Command Categorization](#command-categorization)
3. [Proposed MCP Tool Suite](#proposed-mcp-tool-suite)
4. [Integration with Existing Tools](#integration-with-existing-xc-mcp-tools)
5. [CODESTYLE.md Compliance](#codestylemd-compliance)
6. [LLM Optimization Patterns](#llm-optimization-patterns)
7. [Implementation Strategy](#implementation-strategy)
8. [Testing Strategy](#testing-strategy)
9. [Risk Mitigation](#risk-mitigation)
10. [Success Metrics](#success-metrics)

---

## Research Findings

### IDB Architecture

**Companion Server Model:**
- `idb_companion` - Native Objective-C++ executable running on macOS
- Python client - Communicates via gRPC protocol
- Per-target companions - Each simulator/device has dedicated companion
- Auto-management - IDB CLI auto-starts/stops companions when needed

**Key Characteristics:**
- **Target-agnostic design** - Unified interface for simulators and physical devices
- **Protocol-based abstraction** - Objective-C protocols define operations
- **Async I/O** - Efficient streaming for app output, logs, video
- **gRPC streaming** - Bidirectional communication for long-running operations

### Command Reference Sources

- **Official Documentation:** https://fbidb.io/docs/commands/
- **GitHub Repository:** https://github.com/facebook/idb
- **Architecture Details:** https://fbidb.io/docs/architecture/
- **Accessibility Automation:** https://fbidb.io/docs/accessibility/

---

## Command Categorization

### Category 1: Target Management

**Available Commands:**
```bash
idb connect --udid <UDID>          # Register companion for persistent access
idb disconnect --udid <UDID>       # Unregister target companion
idb list-targets                    # Display available targets
idb describe --udid <UDID>          # Get target metadata (dimensions, OS version)
idb boot <UDID>                     # Start simulator (overlaps with simctl)
idb focus --udid <UDID>             # Bring simulator window to foreground
```

**MCP Tool Mapping:** **2 tools**

#### `idb-targets`
Combines: list-targets, describe, focus

**Purpose:** Query and manage available iOS targets

**Parameters:**
```typescript
interface IdbTargetsArgs {
  operation: 'list' | 'describe' | 'focus';
  udid?: string;  // Required for describe/focus
}
```

**Response:**
```typescript
{
  success: true,
  operation: 'list',
  targets: [
    {
      udid: 'ABC-123',
      name: 'iPhone 16 Pro',
      state: 'Booted',
      osVersion: '18.0',
      architecture: 'x86_64',
      screenDimensions: { width: 1179, height: 2556 },
      type: 'simulator'
    }
  ],
  guidance: [
    "Found 3 available targets",
    "Use idb-connect to establish persistent connection",
    "Use udid ABC-123 for subsequent IDB commands"
  ]
}
```

#### `idb-connect`
Combines: connect, disconnect

**Purpose:** Manage persistent IDB connections

**Parameters:**
```typescript
interface IdbConnectArgs {
  operation: 'connect' | 'disconnect';
  udid: string;
  companionHost?: string;    // Default: localhost
  companionPort?: number;    // Default: auto
}
```

---

### Category 2: App Lifecycle Management

**Available Commands:**
```bash
idb list-apps --udid <UDID>                           # Show installed apps
idb install --udid <UDID> <path.app|path.ipa>         # Deploy application
idb launch --udid <UDID> <bundle_id> [args...]        # Start app
idb terminate --udid <UDID> <bundle_id>               # Kill running app
idb uninstall --udid <UDID> <bundle_id>               # Remove app
```

**MCP Tool Mapping:** **5 individual tools** (1:1 mapping)

#### `idb-list-apps`

**Purpose:** List all installed applications with metadata

**Parameters:**
```typescript
interface IdbListAppsArgs {
  udid?: string;  // Auto-detect if omitted
}
```

**Response with Progressive Disclosure:**
```typescript
{
  success: true,
  appsListId: "cache-abc123",  // For detailed info later
  summary: {
    totalApps: 127,
    userApps: 15,
    systemApps: 112
  },
  userApps: [  // Only user-installed apps by default
    {
      bundleId: 'com.example.MyApp',
      name: 'MyApp',
      version: '1.2.3',
      installType: 'user'
    }
  ],
  guidance: [
    "Found 15 user-installed apps",
    "Use idb-get-app-details with appsListId for full list including system apps",
    "Use bundle ID for launch, terminate, or uninstall operations"
  ]
}
```

#### `idb-install`

**Purpose:** Install .app or .ipa package to target

**Parameters:**
```typescript
interface IdbInstallArgs {
  udid?: string;
  appPath: string;  // Path to .app or .ipa
  // LLM optimization
  appPurpose?: string;  // "Test build" | "Release candidate"
  installContext?: string;  // "CI/CD pipeline" | "Local development"
}
```

**Response:**
```typescript
{
  success: true,
  bundleId: 'com.example.MyApp',
  appName: 'MyApp',
  version: '1.2.3',
  installPath: '/path/on/device',
  installDuration: 3200,  // ms

  // LLM optimization metadata
  installContext: {
    purpose: "Test build",
    installedAt: "2025-01-23T10:30:00Z"
  },

  guidance: [
    "✅ MyApp (1.2.3) installed successfully",
    "→ Use idb-launch to start: idb-launch --bundle-id com.example.MyApp",
    "→ Use idb-ui-describe to inspect initial UI state"
  ]
}
```

#### `idb-launch`

**Purpose:** Launch application with arguments and environment variables

**Key Features:**
- Environment variables: Prefix with `IDB_` (auto-stripped before passing to app)
- Launch arguments: Pass as array
- Wait-for streaming: Use `-w`/`--wait-for` flag to stream app output
- Foreground control: Use `-f`/`--foreground-if-running` to relaunch if running

**Parameters:**
```typescript
interface IdbLaunchArgs {
  udid?: string;
  bundleId: string;
  arguments?: string[];  // App launch arguments
  environment?: Record<string, string>;  // IDB_ prefix added automatically
  waitFor?: boolean;  // Stream output until app exits
  foregroundIfRunning?: boolean;  // Restart if already running

  // LLM optimization
  testScenario?: string;  // "Happy Path Login"
  expectedBehavior?: string;  // "App should show HomeScreen"
  launchContext?: string;  // "Automated UI test"
}
```

**Response:**
```typescript
{
  success: true,
  bundleId: 'com.example.MyApp',
  processId: 12345,
  launchedAt: "2025-01-23T10:30:00Z",

  // If waitFor: true
  output?: {
    stdout: "App launched successfully...",
    stderr: "",
    exitCode: 0
  },

  // LLM optimization
  launchContext: {
    scenario: "Happy Path Login",
    expectedBehavior: "App should show HomeScreen"
  },

  guidance: [
    "✅ MyApp launched with PID 12345",
    "→ Use idb-ui-describe to verify initial screen",
    "→ Use screenshot-inline to capture current state",
    "→ Use idb-terminate when test completes"
  ]
}
```

**Environment Variable Handling:**
```bash
# IDB automatically strips IDB_ prefix before passing to app
IDB_DEBUG="1" IDB_TEST_MODE="true" idb launch com.example.app

# App receives:
# DEBUG="1"
# TEST_MODE="true"
```

#### `idb-terminate`

**Purpose:** Kill running application

**Parameters:**
```typescript
interface IdbTerminateArgs {
  udid?: string;
  bundleId: string;
  // LLM optimization
  terminationReason?: string;  // "Test completed" | "Cleanup"
}
```

#### `idb-uninstall`

**Purpose:** Remove application from device

**Parameters:**
```typescript
interface IdbUninstallArgs {
  udid?: string;
  bundleId: string;
  // LLM optimization
  uninstallReason?: string;  // "Test cleanup" | "Replacing with new build"
}
```

---

### Category 3: UI Automation ⭐ **PRIMARY FOCUS**

**Available Commands:**
```bash
# Touch interactions
idb ui tap <x> <y> [--duration <seconds>]             # Tap at coordinates
idb ui swipe <x1> <y1> <x2> <y2>                       # Swipe gesture

# Hardware buttons
idb ui button <BUTTON_NAME>                            # Simulate physical buttons
# Available buttons: APPLE_PAY, HOME, LOCK, SIDE_BUTTON, SIRI

# Keyboard input
idb ui text '<string>'                                 # Type text
idb ui key <KEYCODE>                                   # Single key press
idb ui key-sequence <KEYCODE> <KEYCODE> ...            # Multiple keys

# UI querying
idb ui describe-all                                    # Full UI hierarchy JSON
idb ui describe-point <x> <y>                          # Hit-test at coordinates
```

**MCP Tool Mapping:** **4 tools** (logical grouping)

#### `idb-ui-tap`

**Purpose:** Perform tap interactions at screen coordinates

**Tap Types:**
- Single tap (default)
- Double tap (numberOfTaps: 2)
- Long press (duration > 0)

**Coordinate System Integration:**
- IDB uses **absolute device coordinates**
- Screenshots may be resized for token efficiency
- Tool supports automatic coordinate transformation

**Parameters:**
```typescript
interface IdbUiTapArgs {
  udid?: string;
  x: number;  // X coordinate (screenshot or device)
  y: number;  // Y coordinate (screenshot or device)
  numberOfTaps?: number;  // Default: 1
  duration?: number;  // Seconds (for long press)

  // Coordinate transformation (from screenshot-inline)
  applyScreenshotScale?: boolean;  // Auto-transform coordinates
  screenshotScaleX?: number;  // From screenshot coordinateTransform
  screenshotScaleY?: number;  // From screenshot coordinateTransform

  // LLM optimization
  actionName?: string;  // "Login Button Tap"
  screenContext?: string;  // "LoginScreen"
  expectedOutcome?: string;  // "Navigate to HomeScreen"
  testScenario?: string;  // "Happy Path Login"
  step?: number;  // 3 (in multi-step flow)
}
```

**Response:**
```typescript
{
  success: true,
  tappedAt: { x: 200, y: 400 },  // Device coordinates (after transform)
  screenshotCoordinates: { x: 100, y: 200 },  // Original if transformed
  transformApplied: true,
  scaleFactors: { x: 2.0, y: 2.0 },

  // LLM optimization
  actionContext: {
    actionName: "Login Button Tap",
    screenContext: "LoginScreen",
    expectedOutcome: "Navigate to HomeScreen",
    timestamp: "2025-01-23T10:30:05Z"
  },

  guidance: [
    "✅ Tapped at device coordinates (200, 400)",
    "Transformed from screenshot coordinates (100, 200) using 2.0× scale",
    "→ Use screenshot-inline to verify navigation occurred",
    "→ Use idb-ui-describe to confirm new screen loaded"
  ]
}
```

**Coordinate Transform Example:**
```typescript
// 1. Take screenshot
const screenshot = await screenshotInline({ size: 'half' });
// Returns: { coordinateTransform: { scaleX: 2.0, scaleY: 2.0 } }

// 2. User identifies element at (100, 200) in screenshot

// 3. Tap with automatic transformation
await idbUiTap({
  x: 100,
  y: 200,
  applyScreenshotScale: true,
  screenshotScaleX: 2.0,
  screenshotScaleY: 2.0,
  actionName: "Login Button"
});
// Tool automatically taps at device coordinates (200, 400)
```

#### `idb-ui-input`

**Purpose:** Text and keyboard input operations

**Combines:**
- `idb ui text` - Type full strings
- `idb ui key` - Single key press
- `idb ui key-sequence` - Multiple keys

**Parameters:**
```typescript
interface IdbUiInputArgs {
  udid?: string;
  operation: 'text' | 'key' | 'key-sequence';

  // For 'text' operation
  text?: string;
  isSensitive?: boolean;  // Redact in logs

  // For 'key' and 'key-sequence'
  keyCodes?: string[];  // e.g., ["return", "tab", "backspace"]

  // LLM optimization
  actionName?: string;  // "Enter email address"
  inputPurpose?: string;  // "Login credentials"
  expectedValidation?: string;  // "Email format validated"
}
```

**Available Key Codes:**
```typescript
type KeyCode =
  | 'return' | 'enter'
  | 'tab'
  | 'backspace' | 'delete'
  | 'escape'
  | 'space'
  | 'up' | 'down' | 'left' | 'right'
  | 'home' | 'end'
  | 'pageup' | 'pagedown';
```

**Response:**
```typescript
{
  success: true,
  operation: 'text',
  inputLength: 24,  // Characters typed
  isSensitive: true,
  redactedValue: "********",  // If sensitive

  actionContext: {
    actionName: "Enter email address",
    inputPurpose: "Login credentials",
    timestamp: "2025-01-23T10:30:10Z"
  },

  guidance: [
    "✅ Text input completed (24 characters)",
    "Sensitive data redacted from logs",
    "→ Use idb-ui-input with keyCodes: ['return'] to submit",
    "→ Use idb-ui-describe to verify input accepted"
  ]
}
```

#### `idb-ui-gesture`

**Purpose:** Swipe gestures and hardware button simulation

**Combines:**
- `idb ui swipe` - Directional swipe
- `idb ui button` - Hardware button press

**Parameters:**
```typescript
interface IdbUiGestureArgs {
  udid?: string;
  type: 'swipe' | 'button';

  // For swipe
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  direction?: 'up' | 'down' | 'left' | 'right';  // Alternative to coordinates

  // For button
  button?: 'HOME' | 'LOCK' | 'SIDE_BUTTON' | 'SIRI' | 'APPLE_PAY';

  // Coordinate transformation (for swipe)
  applyScreenshotScale?: boolean;
  screenshotScaleX?: number;
  screenshotScaleY?: number;

  // LLM optimization
  actionName?: string;  // "Swipe to next page"
  expectedOutcome?: string;  // "Show page 2"
}
```

**Response:**
```typescript
{
  success: true,
  gestureType: 'swipe',
  coordinates: {
    start: { x: 200, y: 800 },
    end: { x: 200, y: 200 }
  },
  direction: 'up',

  actionContext: {
    actionName: "Swipe to next page",
    expectedOutcome: "Show page 2"
  },

  guidance: [
    "✅ Swipe gesture completed: up direction",
    "Start: (200, 800) → End: (200, 200)",
    "→ Use screenshot-inline to verify page changed",
    "→ Use idb-ui-describe to confirm new content visible"
  ]
}
```

**Hardware Buttons:**
- `HOME` - Return to home screen
- `LOCK` - Lock device / sleep
- `SIDE_BUTTON` - Side button press (varies by device)
- `SIRI` - Activate Siri
- `APPLE_PAY` - Simulate Apple Pay activation

#### `idb-ui-describe`

**Purpose:** Query UI element hierarchy and hit-test at coordinates

**Combines:**
- `idb ui describe-all` - Full UI tree (large output)
- `idb ui describe-point` - Element at specific coordinates

**Progressive Disclosure Strategy:**
- `describe-all` returns ~10k+ lines of JSON
- Cache full output, return summary + cache ID
- Provide detail retrieval tool for drilling down

**Parameters:**
```typescript
interface IdbUiDescribeArgs {
  udid?: string;
  operation: 'all' | 'point';

  // For 'point' operation
  x?: number;
  y?: number;

  // Coordinate transformation
  applyScreenshotScale?: boolean;
  screenshotScaleX?: number;
  screenshotScaleY?: number;

  // LLM optimization
  queryPurpose?: string;  // "Find login button"
  expectedElement?: string;  // "Button with label 'Sign In'"
}
```

**Response (describe-all):**
```typescript
{
  success: true,
  operation: 'describe-all',

  // Progressive disclosure
  uiTreeId: "cache-xyz789",  // For full details later

  summary: {
    totalElements: 247,
    interactiveElements: 45,
    buttons: 12,
    textFields: 5,
    labels: 156,
    images: 23
  },

  // Key interactive elements (first 10)
  interactivePreview: [
    {
      type: 'Button',
      label: 'Sign In',
      identifier: 'loginButton',
      frame: { x: 100, y: 400, width: 200, height: 44 },
      hittable: true
    },
    // ... 9 more
  ],

  guidance: [
    "✅ UI hierarchy captured: 247 elements",
    "Found 45 interactive elements (12 buttons, 5 text fields)",
    "→ Use idb-ui-get-details with uiTreeId for full hierarchy",
    "→ Use idb-ui-describe --operation point to query specific coordinates",
    "→ Tap interactive elements using their frame coordinates"
  ]
}
```

**Response (describe-point):**
```typescript
{
  success: true,
  operation: 'describe-point',
  coordinates: { x: 200, y: 400 },  // Device coords (after transform)

  element: {
    type: 'Button',
    label: 'Sign In',
    identifier: 'loginButton',
    value: null,
    frame: { x: 100, y: 400, width: 200, height: 44 },
    hittable: true,
    enabled: true,
    focused: false,
    accessibilityTraits: ['Button'],
    customActions: []
  },

  guidance: [
    "✅ Found Button at (200, 400)",
    "Label: 'Sign In'",
    "Identifier: loginButton",
    "→ Use idb-ui-tap to interact: x=200, y=400",
    "→ Element is hittable and enabled"
  ]
}
```

**Detail Retrieval Tool:**
```typescript
// idb-ui-get-details (separate tool for progressive disclosure)
interface IdbUiGetDetailsArgs {
  uiTreeId: string;  // From describe-all response
  filterType?: 'buttons' | 'textFields' | 'all';  // Default: all
  maxElements?: number;  // Limit output size
}
```

---

### Category 4: File Operations

**Available Commands:**
```bash
idb file ls <path> --bundle-id <id>                    # List directory
idb file push <src> <dest> --bundle-id <id>            # Upload file
idb file pull <src> <dest> --bundle-id <id>            # Download file
idb file mkdir <path> --bundle-id <id>                 # Create directory
idb file mv <src> <dest> --bundle-id <id>              # Move file
idb file rm <path> --bundle-id <id>                    # Delete file/directory
```

**Container Types:**
- `--application` / `--bundle-id` - App's data container
- `--data` - Shared data container
- `--group` - App group container

**MCP Tool Mapping:** **1 unified tool**

#### `idb-file`

**Purpose:** Unified file operations within app containers

**Parameters:**
```typescript
interface IdbFileArgs {
  udid?: string;
  operation: 'ls' | 'push' | 'pull' | 'mkdir' | 'mv' | 'rm';
  bundleId: string;  // App context

  // Operation-specific
  path?: string;  // For ls, mkdir, rm
  sourcePath?: string;  // For push, mv
  destPath?: string;  // For push, pull, mv

  // Container type (default: application)
  containerType?: 'application' | 'data' | 'group';

  // LLM optimization
  purpose?: string;  // "Extract test data" | "Inject fixture"
  fileContext?: string;  // "Screenshot for bug report"
}
```

**Response Examples:**

**ls operation:**
```typescript
{
  success: true,
  operation: 'ls',
  path: '/Documents',
  files: [
    { name: 'test.db', size: 1024, type: 'file', modified: '2025-01-23T10:00:00Z' },
    { name: 'images', size: 0, type: 'directory', modified: '2025-01-23T09:00:00Z' }
  ],
  totalSize: 1024,
  fileCount: 2,

  guidance: [
    "Found 2 items in /Documents",
    "→ Use idb-file --operation pull to download files",
    "→ Use idb-file --operation rm to delete files"
  ]
}
```

**push operation:**
```typescript
{
  success: true,
  operation: 'push',
  sourcePath: '/local/fixture.json',
  destPath: '/Documents/fixture.json',
  bytesTransferred: 2048,

  fileContext: {
    purpose: "Inject test fixture",
    pushedAt: "2025-01-23T10:30:00Z"
  },

  guidance: [
    "✅ Uploaded fixture.json (2048 bytes)",
    "Destination: /Documents/fixture.json",
    "→ App can now access fixture at Documents/fixture.json",
    "→ Use idb-launch to restart app and load fixture"
  ]
}
```

---

### Category 5: Testing (XCTest Integration)

**Available Commands:**
```bash
idb xctest install <path.xctest|path.xctestrun>        # Load test bundle
idb xctest list                                         # Show installed bundles
idb xctest list-bundle <bundle_id>                      # List tests in bundle
idb xctest run <bundle_id> [--test-to-run <name>]      # Execute tests
```

**MCP Tool Mapping:** **2 tools**

#### `idb-xctest-install`

**Purpose:** Install XCTest bundles to target

**Parameters:**
```typescript
interface IdbXctestInstallArgs {
  udid?: string;
  testBundlePath: string;  // .xctest or .xctestrun file

  // LLM optimization
  testSuite?: string;  // "Regression Tests"
  testCategory?: 'unit' | 'integration' | 'ui';
}
```

**Response:**
```typescript
{
  success: true,
  bundleId: 'com.example.MyAppTests',
  testCount: 45,
  testBundlePath: '/path/to/MyAppTests.xctest',

  testContext: {
    testSuite: "Regression Tests",
    testCategory: "ui",
    installedAt: "2025-01-23T10:30:00Z"
  },

  guidance: [
    "✅ Installed MyAppTests with 45 tests",
    "→ Use idb-xctest-run to execute tests",
    "→ Use --tests-to-run to filter specific tests"
  ]
}
```

#### `idb-xctest-run`

**Purpose:** Execute XCTest bundles with comprehensive configuration

**Key Parameters:**
- `timeout` - Maximum execution time
- `testsToRun` - Specific tests to execute (filter)
- `testsToSkip` - Tests to exclude
- `resultBundlePath` - Output location for .xcresult
- `reportActivities` - Include test activities
- `reportAttachments` - Include test attachments
- Coverage options

**Parameters:**
```typescript
interface IdbXctestRunArgs {
  udid?: string;
  testBundleId: string;

  // Test filtering
  testsToRun?: string[];  // e.g., ["MyAppTests/testLogin"]
  testsToSkip?: string[];  // e.g., ["MyAppTests/testSlowOperation"]

  // Execution config
  timeout?: number;  // Seconds (default: 600)
  resultBundlePath?: string;  // Where to save .xcresult

  // Output verbosity
  reportActivities?: boolean;
  reportAttachments?: boolean;

  // Code coverage
  enableCodeCoverage?: boolean;
  coverageFormat?: 'json' | 'lcov';

  // LLM optimization
  testPlanName?: string;  // "Smoke Tests"
  testCategory?: 'unit' | 'integration' | 'ui';
  criticalTests?: string[];  // Tests that must pass
  expectedPassRate?: number;  // 0.0 - 1.0
}
```

**Response with Progressive Disclosure:**
```typescript
{
  success: true,

  // Progressive disclosure
  testRunId: "test-run-abc123",  // For detailed results

  summary: {
    totalTests: 50,
    passed: 45,
    failed: 5,
    skipped: 0,
    duration: 125000,  // ms
    passRate: 0.90
  },

  // First 3 failures for preview
  failurePreview: [
    {
      test: "MyAppTests/testLogin",
      failure: "Expected 'Welcome' but got 'Error'",
      duration: 3200
    },
    {
      test: "MyAppTests/testPayment",
      failure: "Timeout waiting for payment confirmation",
      duration: 60000
    },
    {
      test: "MyAppTests/testProfile",
      failure: "Element not found: profileButton",
      duration: 1500
    }
  ],

  // Test plan context
  testContext: {
    planName: "Smoke Tests",
    category: "ui",
    criticalTests: ["testLogin", "testPayment"],
    criticalTestsPassed: false,  // Failed critical test
    passRate: 0.90,
    expectedPassRate: 0.95,
    metExpectations: false
  },

  resultBundlePath: "/tmp/test-results.xcresult",

  guidance: [
    "⚠️ 5 tests failed (90% pass rate)",
    "❌ Critical test failed: testLogin",
    "Expected pass rate: 95%, actual: 90%",
    "→ Use idb-xctest-get-details with testRunId for full results",
    "→ Use idb-crash list --bundle-id to check for crashes",
    "→ Use idb-log to review app output during tests"
  ]
}
```

**Detail Retrieval:**
```typescript
// idb-xctest-get-details (separate tool)
interface IdbXctestGetDetailsArgs {
  testRunId: string;
  detailType: 'failures-only' | 'full-log' | 'summary' | 'coverage';
  maxLines?: number;  // Limit output size
}
```

---

### Category 6: Debugging

**Available Commands:**
```bash
idb debugserver start <bundle_id>                      # Launch debug session
idb debugserver stop                                    # Terminate debug session
idb debugserver status                                  # Query running session
```

**Debug Session Workflow:**
1. Start debugserver → Returns port/connection info
2. Connect with lldb → `platform select remote-ios; process connect connect://IP:PORT`
3. Debug application
4. Stop debugserver when done

**MCP Tool Mapping:** **1 unified tool**

#### `idb-debugserver`

**Purpose:** Manage LLDB debug sessions

**Parameters:**
```typescript
interface IdbDebugserverArgs {
  udid?: string;
  operation: 'start' | 'stop' | 'status';

  // For start operation
  bundleId?: string;

  // LLM optimization
  debugContext?: string;  // "Investigating crash in payment flow"
  breakpoints?: string[];  // File:line references
}
```

**Response (start):**
```typescript
{
  success: true,
  operation: 'start',
  bundleId: 'com.example.MyApp',

  connection: {
    host: '192.168.1.100',
    port: 1234,
    processId: 12345,
    connectionString: 'connect://192.168.1.100:1234'
  },

  lldbCommands: [
    'platform select remote-ios',
    'process connect connect://192.168.1.100:1234',
    'breakpoint set --file ViewController.swift --line 42'
  ],

  debugContext: {
    context: "Investigating crash in payment flow",
    startedAt: "2025-01-23T10:30:00Z"
  },

  guidance: [
    "✅ Debug server started on port 1234",
    "Process ID: 12345",
    "Connect with lldb:",
    "  platform select remote-ios",
    "  process connect connect://192.168.1.100:1234",
    "→ Use idb-debugserver --operation stop when done"
  ]
}
```

---

### Category 7: Media & System

**Available Commands:**
```bash
# Video recording
idb record video <path> [--fps 30] [--format h264] [--compression-quality 1.0]

# Media management
idb screenshot <dest_path>                             # Capture screenshot
idb add-media <path1> [path2...]                       # Import to camera roll

# System control
idb set_location <lat> <long>                          # Override GPS
idb approve <bundle_id> <service>                      # Grant permissions
idb open <url>                                         # Launch URL/scheme
idb clear_keychain                                     # Wipe keychain (simulator only)
```

**MCP Tool Mapping:** **4 tools**

#### `idb-record-video`

**Purpose:** Record simulator screen to video file

**Parameters:**
```typescript
interface IdbRecordVideoArgs {
  udid?: string;
  outputPath: string;

  // Video configuration
  fps?: number;  // Default: 30
  format?: 'h264' | 'hevc' | 'minicap' | 'rgba';  // Default: h264
  compressionQuality?: number;  // 0.0 - 1.0, default: 1.0

  // LLM optimization
  sceneName?: string;  // "Onboarding Flow"
  recordingPurpose?: string;  // "Bug reproduction"
  expectedDuration?: number;  // Seconds (for guidance)
}
```

**Response:**
```typescript
{
  success: true,
  videoId: "video-abc123",  // For stopping/retrieving later
  outputPath: '/tmp/recording.mp4',
  format: 'h264',
  fps: 30,
  compressionQuality: 1.0,

  recordingContext: {
    sceneName: "Onboarding Flow",
    purpose: "Bug reproduction",
    startedAt: "2025-01-23T10:30:00Z"
  },

  guidance: [
    "✅ Video recording started",
    "Output: /tmp/recording.mp4",
    "Format: H.264 @ 30fps, quality 1.0",
    "→ Perform actions to record",
    "→ Use idb-record-video-stop with videoId to finish",
    "→ Expected duration: ~60 seconds"
  ]
}
```

#### `idb-media`

**Purpose:** Media operations (screenshots, camera roll)

**Combines:**
- `idb screenshot` - Capture screen
- `idb add-media` - Import to camera roll

**Parameters:**
```typescript
interface IdbMediaArgs {
  udid?: string;
  operation: 'screenshot' | 'add-media';

  // For screenshot
  outputPath?: string;  // Or '-' for stdout

  // For add-media
  mediaPaths?: string[];  // Images/videos to import

  // LLM optimization
  mediaPurpose?: string;  // "Test photo picker"
  mediaContext?: string;  // "Profile picture upload test"
}
```

#### `idb-permissions`

**Purpose:** Permission management and location spoofing

**Combines:**
- `idb approve` - Grant app permissions
- `idb set_location` - Override GPS coordinates

**Available Services for approve:**
- `photos` - Photo library access
- `camera` - Camera access
- `contacts` - Contacts access
- `location` - Location services
- `microphone` - Microphone access
- `calendar` - Calendar access
- `reminders` - Reminders access

**Parameters:**
```typescript
interface IdbPermissionsArgs {
  udid?: string;
  operation: 'approve' | 'set-location';

  // For approve
  bundleId?: string;
  service?: 'photos' | 'camera' | 'contacts' | 'location' | 'microphone';

  // For set-location
  latitude?: number;
  longitude?: number;

  // LLM optimization
  testScenario?: string;  // "Location-based feature test"
  step?: number;  // Step in test flow
  expectedBehavior?: string;  // "App should show nearby restaurants"
}
```

**Response (approve):**
```typescript
{
  success: true,
  operation: 'approve',
  bundleId: 'com.example.MyApp',
  service: 'camera',

  auditEntry: {
    timestamp: "2025-01-23T10:30:00Z",
    testScenario: "Camera permission test",
    step: 1,
    permissionState: 'granted'
  },

  guidance: [
    "✅ Camera permission granted for com.example.MyApp",
    "→ Use idb-launch to start app and verify permission granted",
    "→ Use idb-ui-describe to check no permission dialog shown"
  ]
}
```

**Response (set-location):**
```typescript
{
  success: true,
  operation: 'set-location',
  location: {
    latitude: 37.7749,
    longitude: -122.4194,
    name: "San Francisco, CA"  // Reverse geocoded
  },

  testContext: {
    scenario: "Location-based feature test",
    expectedBehavior: "App should show nearby restaurants"
  },

  guidance: [
    "✅ Location set to San Francisco, CA",
    "Coordinates: 37.7749, -122.4194",
    "→ Launch app to test location-based features",
    "→ Verify app detects location correctly"
  ]
}
```

#### `idb-system`

**Purpose:** System operations (URL opening, keychain)

**Combines:**
- `idb open` - Launch URLs
- `idb clear_keychain` - Wipe keychain

**Parameters:**
```typescript
interface IdbSystemArgs {
  udid?: string;
  operation: 'open-url' | 'clear-keychain';

  // For open-url
  url?: string;  // http://, custom-scheme://, etc.

  // LLM optimization
  urlPurpose?: string;  // "Deep link test"
  expectedBehavior?: string;  // "App should open to ProductDetail"
}
```

---

### Category 8: Logging & Diagnostics

**Available Commands:**
```bash
idb log [--bundle-id <id>]                             # Stream logs
idb crash list [--bundle-id <id>] [--since <date>]    # List crashes
idb crash show <name>                                   # Show crash report
idb crash delete <name|--all>                           # Delete crashes
idb instruments                                         # Profiler integration
```

**MCP Tool Mapping:** **3 tools**

#### `idb-log`

**Purpose:** Stream device/simulator logs with filtering

**Parameters:**
```typescript
interface IdbLogArgs {
  udid?: string;
  bundleId?: string;  // Filter to specific app
  duration?: number;  // Stream for N seconds

  // Filtering
  level?: 'debug' | 'info' | 'warning' | 'error';
  contains?: string;  // Filter lines containing string

  // LLM optimization
  logPurpose?: string;  // "Debugging payment flow"
  expectedPatterns?: string[];  // ["Payment success", "Transaction ID"]
}
```

**Response:**
```typescript
{
  success: true,
  logStreamId: "log-stream-xyz",
  duration: 30,  // seconds streamed
  lineCount: 547,

  // First 20 lines for preview
  logPreview: [
    "[2025-01-23 10:30:00] [INFO] App launched",
    "[2025-01-23 10:30:01] [DEBUG] Network request: GET /api/products",
    // ...
  ],

  // Pattern matching results
  patterns: {
    found: ["Payment success"],
    missing: ["Transaction ID"]
  },

  guidance: [
    "✅ Captured 547 log lines in 30 seconds",
    "Found pattern: 'Payment success'",
    "⚠️ Missing pattern: 'Transaction ID'",
    "→ Use idb-log-get-details with logStreamId for full output",
    "→ Use --level error to filter error messages only"
  ]
}
```

#### `idb-crash`

**Purpose:** Crash log management

**Operations:**
- `list` - Enumerate crashes with filters
- `show` - Display specific crash report
- `delete` - Remove crash logs

**Parameters:**
```typescript
interface IdbCrashArgs {
  udid?: string;
  operation: 'list' | 'show' | 'delete';

  // Filtering (for list/delete)
  bundleId?: string;
  since?: string;  // ISO date
  before?: string;  // ISO date

  // For show/delete specific crash
  crashName?: string;

  // For delete all
  deleteAll?: boolean;

  // LLM optimization
  investigationContext?: string;  // "Payment flow crash"
  severity?: 'high' | 'medium' | 'low';
}
```

**Response (list with progressive disclosure):**
```typescript
{
  success: true,
  operation: 'list',

  crashListId: "crash-list-abc",  // For detailed reports

  summary: {
    totalCrashes: 12,
    uniqueCrashes: 5,  // By crash signature
    dateRange: {
      earliest: "2025-01-20T08:00:00Z",
      latest: "2025-01-23T10:25:00Z"
    }
  },

  // Preview: Most recent 3 crashes
  crashPreview: [
    {
      name: "MyApp-2025-01-23-102500.crash",
      bundleId: "com.example.MyApp",
      timestamp: "2025-01-23T10:25:00Z",
      exceptionType: "EXC_BAD_ACCESS",
      crashedThread: 0,
      signature: "PaymentViewController.processPayment"
    },
    // ... 2 more
  ],

  investigationContext: {
    context: "Payment flow crash",
    severity: "high"
  },

  guidance: [
    "Found 12 crash logs (5 unique signatures)",
    "Most recent: MyApp-2025-01-23-102500.crash",
    "→ Use idb-crash --operation show --crash-name to view details",
    "→ Use idb-crash-get-details with crashListId for all crashes",
    "→ Use --delete-all to clear after investigation"
  ]
}
```

#### `idb-instruments`

**Purpose:** Instruments profiler integration

**Note:** Advanced tool for performance profiling (memory, CPU, network)

**Parameters:**
```typescript
interface IdbInstrumentsArgs {
  udid?: string;
  template: 'Time Profiler' | 'Allocations' | 'Leaks' | 'Network' | 'Energy';
  duration?: number;  // Seconds to profile
  outputPath?: string;  // .trace file destination
}
```

---

### Category 9: Utility & Advanced

**Available Commands:**
```bash
idb dylib install <path>                               # Load dynamic library
idb contacts update <path.db>                          # Replace contacts DB
idb focus --udid <UDID>                                # Bring window to front
idb kill                                               # Reset IDB state
idb boot <UDID>                                        # Start simulator
```

**MCP Tool Mapping:**
- `boot` - **Skip** (already have `simctl-boot`)
- `focus` - **Integrated into `idb-targets`**
- `kill`, `dylib install`, `contacts update` - **Phase 2** (advanced/rare use)

---

## Proposed MCP Tool Suite (Phase 1)

### Summary: 17 Core Tools

**Target & Connection (2)**
1. ✅ `idb-targets` - List, describe, focus targets
2. ✅ `idb-connect` - Connect/disconnect management

**App Management (5)**
3. ✅ `idb-list-apps` - List installed applications
4. ✅ `idb-install` - Install .app/.ipa packages
5. ✅ `idb-launch` - Launch with args/env/wait
6. ✅ `idb-terminate` - Terminate running app
7. ✅ `idb-uninstall` - Remove application

**UI Automation ⭐ (4)**
8. ✅ `idb-ui-tap` - Tap interactions
9. ✅ `idb-ui-input` - Text and keyboard input
10. ✅ `idb-ui-gesture` - Swipe and hardware buttons
11. ✅ `idb-ui-describe` - Query UI elements

**File Operations (1)**
12. ✅ `idb-file` - Unified file management

**Testing (2)**
13. ✅ `idb-xctest-install` - Install test bundles
14. ✅ `idb-xctest-run` - Execute tests

**Debugging (1)**
15. ✅ `idb-debugserver` - Debug session control

**Media & System (2)**
16. ✅ `idb-record-video` - Screen recording
17. ✅ `idb-permissions` - Approve permissions, set location

**Progressive Disclosure (5 support tools)**
- `idb-ui-get-details` - Full UI hierarchy
- `idb-xctest-get-details` - Complete test results
- `idb-crash-get-details` - All crash reports
- `idb-log-get-details` - Full log output
- `idb-apps-get-details` - All apps including system

---

## Integration with Existing XC-MCP Tools

### Natural Workflow Chains

#### Workflow 1: Initial Setup
```
1. simctl-boot → Boot simulator
   ↓ Suggests: Use idb-connect to establish IDB connection

2. idb-connect → Connect IDB
   ↓ Suggests: Use idb-targets to verify connection

3. idb-targets → Confirm target visible
   ↓ Ready for app operations
```

#### Workflow 2: App Installation & Launch
```
1. idb-install → Install app package
   ✓ App installed: com.example.MyApp
   ↓ Suggests: Use idb-launch to start

2. idb-launch → Launch application
   ✓ App launched with PID 12345
   ↓ Suggests: Use idb-ui-describe to inspect UI

3. idb-ui-describe → Query UI hierarchy
   ✓ Found 247 elements
   ↓ Suggests: Use idb-ui-tap to interact
```

#### Workflow 3: UI Interaction Testing
```
1. screenshot-inline → Capture initial state
   ✓ Screenshot saved, coordinateTransform: { scaleX: 2.0, scaleY: 2.0 }
   ↓ Identifies element at (100, 200)

2. idb-ui-tap → Tap login button
   ✓ Tapped at device coords (200, 400)
   ↓ Suggests: Take screenshot to verify navigation

3. screenshot-inline → Capture new state
   ✓ Screenshot shows HomeScreen
   ↓ Suggests: Use idb-ui-describe to confirm screen
```

#### Workflow 4: Test Execution & Debugging
```
1. idb-xctest-install → Install test bundle
   ✓ Installed 50 tests
   ↓ Suggests: Use idb-xctest-run

2. idb-xctest-run → Execute tests
   ⚠️ 5 tests failed
   ↓ Suggests: Check crash logs

3. idb-crash → List recent crashes
   ✓ Found 2 crashes during tests
   ↓ Suggests: Use idb-crash show for details

4. idb-log → Stream app logs
   ✓ Captured error messages
   ↓ Investigation data collected
```

### Coordinate System Integration

**Challenge:** IDB uses absolute device coordinates, screenshots may be resized.

**Solution:** Leverage existing `coordinateTransform` system:

```typescript
// Step 1: Take screenshot with size optimization
const screenshot = await screenshotInline({ size: 'half' });

// Response includes:
{
  coordinateTransform: {
    scaleX: 2.0,
    scaleY: 2.0,
    originalDimensions: { width: 1179, height: 2556 },
    displayDimensions: { width: 256, height: 512 }
  }
}

// Step 2: User identifies element at (100, 200) in screenshot

// Step 3: Tap with automatic transformation
await idbUiTap({
  x: 100,
  y: 200,
  applyScreenshotScale: true,
  screenshotScaleX: 2.0,  // From screenshot
  screenshotScaleY: 2.0,  // From screenshot
  actionName: "Login Button"
});

// Tool automatically calculates:
// deviceX = 100 × 2.0 = 200
// deviceY = 200 × 2.0 = 400
// Taps at (200, 400) on actual device
```

**Validation:**
```typescript
// Tool response includes validation
{
  tappedAt: { x: 200, y: 400 },  // Device coordinates
  screenshotCoordinates: { x: 100, y: 200 },  // Original
  transformApplied: true,
  scaleFactors: { x: 2.0, y: 2.0 },

  guidance: [
    "✅ Tapped at device coordinates (200, 400)",
    "Transformed from screenshot coordinates (100, 200)",
    "Screenshot was scaled by 2.0× for token efficiency"
  ]
}
```

### Cross-Tool Suggestions

Each tool's `guidance` array includes contextual next steps:

**After simctl-boot:**
```typescript
guidance: [
  "✅ Simulator booted successfully",
  "UDID: ABC-123",
  "→ Use idb-connect to establish IDB connection",
  "→ Use idb-targets to verify IDB can see simulator"
]
```

**After idb-install:**
```typescript
guidance: [
  "✅ MyApp installed successfully",
  "Bundle ID: com.example.MyApp",
  "→ Use idb-launch to start the app",
  "→ Use idb-ui-describe to inspect initial UI"
]
```

**After idb-ui-tap:**
```typescript
guidance: [
  "✅ Tapped at (200, 400)",
  "Action: Login Button Tap",
  "→ Use screenshot-inline to verify navigation",
  "→ Use idb-ui-describe to confirm screen changed"
]
```

---

## CODESTYLE.md Compliance

### 1. Progressive Disclosure Pattern

All tools with large outputs use cache IDs for detail retrieval:

```typescript
// Tool returns summary + cache ID
{
  success: true,
  uiTreeId: "cache-abc123",
  summary: { totalElements: 247, buttons: 12 },
  interactivePreview: [/* first 10 elements */],

  guidance: [
    "→ Use idb-ui-get-details with uiTreeId for full hierarchy"
  ]
}

// Follow-up tool retrieves details
idbUiGetDetails({
  uiTreeId: "cache-abc123",
  filterType: "buttons",  // Optional filtering
  maxElements: 50  // Limit output
});
```

### 2. Function Organization (15-line orchestration)

Every IDB tool follows this structure:

```typescript
// tools/idb/ui/tap.ts

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface IdbUiTapArgs {
  // ... parameter definitions
}

// ============================================================================
// PUBLIC API
// ============================================================================

export async function idbUiTapTool(args: IdbUiTapArgs) {
  // Main orchestration (~15 lines)
  const validated = await validateAndPrepareArgs(args);
  const result = await executeTapCommand(validated);
  return formatTapResponse(result, args);
}

// ============================================================================
// STAGE 1: VALIDATION & PREPARATION
// ============================================================================

async function validateAndPrepareArgs(args: IdbUiTapArgs): Promise<ValidatedArgs> {
  // Validate IDB installation
  await validateIdbInstallation();

  // Resolve UDID (auto-detect if needed)
  const udid = await resolveUdid(args.udid);

  // Apply coordinate transformation if requested
  const coordinates = applyCoordinateTransform(args);

  return { udid, coordinates, ...args };
}

// ============================================================================
// STAGE 2: COMMAND EXECUTION
// ============================================================================

async function executeTapCommand(validated: ValidatedArgs): Promise<CommandResult> {
  // Build IDB command
  const command = buildTapCommand(validated);

  // Execute with timeout
  return await executeCommand(command, { timeout: 30000 });
}

// ============================================================================
// STAGE 3: RESPONSE FORMATTING
// ============================================================================

function formatTapResponse(
  result: CommandResult,
  originalArgs: IdbUiTapArgs
): ToolResponse {
  // Parse command output
  const success = result.code === 0;

  // Build structured response
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        success,
        tappedAt: originalArgs.coordinates,
        actionContext: buildActionContext(originalArgs),
        guidance: buildGuidance(success, originalArgs)
      }, null, 2)
    }],
    isError: !success
  };
}
```

### 3. Strategic Comments (Why, Not What)

```typescript
// Build IDB tap command with coordinate transformation
// Why: IDB requires absolute device coordinates, not screenshot pixels
// Screenshot may be resized for token efficiency (see screenshot-sizing.ts)
// If user provides scale factors, transform before tapping
const deviceX = args.applyScreenshotScale
  ? args.x * (args.screenshotScaleX || 1.0)
  : args.x;

// Why: This ensures tap hits correct location on actual device
// even when working from a resized screenshot (e.g., 256×512 from 1179×2556)
```

### 4. Explicit Dependencies

```typescript
/**
 * Execute tap command on iOS target via IDB
 *
 * Dependencies:
 * - validateIdbInstallation: Checks IDB CLI is available
 * - resolveUdid: Auto-detects booted simulator if not specified
 * - executeCommand: Shell execution with timeout
 * - coordinateTransform: Maps screenshot coords to device coords
 *
 * Environment:
 * - Requires IDB installed: brew install idb-companion
 * - Requires idb_companion running (auto-started by IDB CLI)
 */
async function executeTapCommand(
  args: ValidatedArgs,
  timeout: number = 30000
): Promise<CommandResult> {
  // ...
}
```

### 5. Clear Input/Output Contracts

```typescript
interface IdbUiTapArgs {
  udid?: string;  // Auto-detect booted simulator if omitted
  x: number;  // X coordinate (screenshot or device)
  y: number;  // Y coordinate (screenshot or device)
  numberOfTaps?: number;  // Default: 1
  duration?: number;  // Seconds (for long press)

  // Coordinate transformation (from screenshot-inline)
  applyScreenshotScale?: boolean;
  screenshotScaleX?: number;
  screenshotScaleY?: number;

  // LLM optimization
  actionName?: string;  // "Login Button Tap"
  expectedOutcome?: string;  // "Navigate to HomeScreen"
}

interface IdbUiTapResponse {
  success: boolean;
  tappedAt: { x: number; y: number };  // Device coordinates
  screenshotCoordinates?: { x: number; y: number };  // If transformed
  transformApplied: boolean;
  actionContext?: {
    actionName?: string;
    expectedOutcome?: string;
    timestamp: string;
  };
  guidance: string[];
}
```

### 6. Token-Efficient Responses

```typescript
// ❌ BAD: Redundant fields
{
  success: true,
  tapped: true,  // Redundant with success
  coordinates: { x: 200, y: 400 },
  x: 200,  // Redundant with coordinates
  y: 400,  // Redundant with coordinates
  deviceX: 200,  // Redundant
  deviceY: 400,  // Redundant
  wasTransformed: true,
  transformationApplied: true,  // Redundant
}

// ✅ GOOD: Focused, minimal
{
  success: true,
  tappedAt: { x: 200, y: 400 },  // Device coordinates
  ...(transformApplied && {  // Conditional inclusion
    screenshotCoordinates: { x: 100, y: 200 },
    scaleFactors: { x: 2.0, y: 2.0 }
  }),
  guidance: [/* actionable next steps */]
}
```

---

## LLM Optimization Patterns

### Pattern 1: Semantic Action Tracking

**Purpose:** Enable agents to track multi-step workflows and create test documentation

**Implementation:** All UI automation tools accept optional metadata fields:

```typescript
interface UiActionMetadata {
  actionName?: string;  // "Login Button Tap"
  screenContext?: string;  // "LoginScreen"
  expectedOutcome?: string;  // "Navigate to HomeScreen"
  testScenario?: string;  // "Happy Path Login"
  step?: number;  // 3 (in multi-step test)
}
```

**Example Workflow:**
```typescript
// Step 1: Enter username
await idbUiInput({
  text: "user@example.com",
  actionName: "Enter username",
  screenContext: "LoginScreen",
  testScenario: "Happy Path Login",
  step: 1
});

// Step 2: Enter password
await idbUiInput({
  text: "password123",
  isSensitive: true,
  actionName: "Enter password",
  screenContext: "LoginScreen",
  testScenario: "Happy Path Login",
  step: 2
});

// Step 3: Tap login button
await idbUiTap({
  x: 200, y: 400,
  actionName: "Tap Login Button",
  screenContext: "LoginScreen",
  expectedOutcome: "Navigate to HomeScreen",
  testScenario: "Happy Path Login",
  step: 3
});
```

**Agent Benefit:**
- Clear audit trail of test actions
- Easy to reconstruct what went wrong at which step
- Natural language test documentation

### Pattern 2: Permission Audit Trail

**Purpose:** Track permission grants for compliance and debugging

```typescript
// Request permission
await idbPermissions({
  operation: 'approve',
  bundleId: 'com.example.MyApp',
  service: 'camera',
  testScenario: "Camera Onboarding",
  step: 1,
  expectedBehavior: "App shows camera preview"
});

// Response includes audit entry
{
  success: true,
  auditEntry: {
    timestamp: "2025-01-23T10:30:00Z",
    testScenario: "Camera Onboarding",
    step: 1,
    service: "camera",
    permissionState: "granted"
  }
}
```

**Agent Benefit:**
- Know exactly when permissions were granted
- Correlate permission state with test failures
- Reproduce permission-dependent flows

### Pattern 3: Test Execution Context

**Purpose:** Provide rich context for test runs to validate expectations

```typescript
await idbXctestRun({
  testBundleId: 'com.example.MyAppTests',
  testsToRun: ['testLogin', 'testPayment', 'testProfile'],

  // LLM optimization
  testPlanName: "Critical Path Tests",
  testCategory: "ui",
  criticalTests: ["testLogin", "testPayment"],
  expectedPassRate: 1.0  // All must pass
});

// Response validates expectations
{
  success: true,
  testContext: {
    planName: "Critical Path Tests",
    criticalTestsPassed: false,  // testPayment failed
    passRate: 0.67,  // 2/3 passed
    expectedPassRate: 1.0,
    metExpectations: false  // Failed to meet criteria
  },

  guidance: [
    "❌ Critical test failed: testPayment",
    "Pass rate: 67% (expected 100%)",
    "→ Investigate payment flow immediately"
  ]
}
```

**Agent Benefit:**
- Automatic validation of test expectations
- Clear signals when critical tests fail
- Prioritized investigation guidance

### Pattern 4: Crash Investigation Context

**Purpose:** Structured crash analysis workflow

```typescript
await idbCrash({
  operation: 'list',
  bundleId: 'com.example.MyApp',
  since: '2025-01-23',
  investigationContext: "Payment flow crash",
  severity: "high"
});

// Response groups crashes intelligently
{
  summary: {
    totalCrashes: 12,
    uniqueSignatures: 5,
    mostCommon: "PaymentViewController.processPayment"
  },

  investigationContext: {
    context: "Payment flow crash",
    severity: "high",
    suggestedAction: "Review PaymentViewController"
  }
}
```

**Agent Benefit:**
- Understand crash patterns
- Focus investigation on root causes
- Track severity for prioritization

---

## Implementation Strategy

### Critical Implementation Requirements (From xcode-agent Review)

**Review Date:** 2025-01-23
**Status:** ✅ All critical issues addressed

#### 1. Device vs Simulator Separation ⚠️ HIGH PRIORITY

**Implementation:** `src/utils/idb-device-detection.ts`

Physical devices require explicit validation:
- USB connection + idb_companion daemon
- Different failure modes than simulators
- Must provide actionable error messages

```typescript
// Validate device readiness before operations
await validateDeviceReady(udid);

// For devices: checks companion connectivity
// For simulators: no-op (simctl handles this)
```

**Decision:** Unified API with explicit validation (no separate device/simulator tools)

#### 2. Coordinate Transformation System ⚠️ HIGH PRIORITY

**Implementation:** `src/utils/coordinate-transform.ts`

Screenshots resized for token efficiency require coordinate transformation:

```typescript
// Example: 256×512 screenshot from 1179×2556 device
const transform = createCoordinateTransform(1179, 2556, 256, 512);

// Agent identifies button at (100, 200) in screenshot
const deviceCoords = transformToDevice({
  screenshotX: 100,
  screenshotY: 200,
  transform
});
// Result: { x: 460, y: 1000 } - ready for IDB tap

// Validate before tapping
validateDeviceCoordinates(deviceCoords.x, deviceCoords.y, {
  width: 1179,
  height: 2556
});
```

**Integration with tools:**
- `idb-ui-tap` accepts `applyScreenshotScale` flag
- Automatically transforms coordinates if scale factors provided
- Validates transformed coords are within device bounds

#### 3. IDBTargetCache State Management ⚠️ MEDIUM PRIORITY

**Implementation:** `src/state/idb-target-cache.ts`

Caches IDB target information to avoid repeated `idb list-targets` calls:

```typescript
// Get target with auto-refresh
const target = await IDBTargetCache.getTarget(udid);

// Access screen dimensions for validation
validateDeviceCoordinates(x, y, target.screenDimensions);

// Auto-detect last used target
const lastUsed = await IDBTargetCache.getLastUsedTarget();

// Record successful operation for usage tracking
IDBTargetCache.recordSuccess(udid);
```

**Cache characteristics:**
- 1-minute TTL (configurable)
- Tracks screen dimensions for coordinate validation
- Records last used target for auto-detection
- Preserves usage statistics across refreshes

#### 4. UDID Auto-Detection Fallback Strategy

**Decision:** Prefer simulator over device (Option C)

Fallback order:
1. Explicit UDID if provided
2. Last used booted simulator (safer default)
3. First booted device (if no simulators)
4. Error if no booted targets

**Rationale:** Simulators more common for development, safer default than physical devices.

#### 5. Minor Improvements (Non-Blocking)

✅ **Enhanced Guidance:** Add example commands to all tool responses
✅ **Semantic Cache IDs:** Format `{operation}-{context}-{timestamp}` (e.g., `ui-tree-MyApp-20250123103000`)
✅ **Operation Timing:** Include `duration` field in all responses for performance tracking

---

### Phase 1: Core UI Automation (Week 1) ⭐ **START HERE**

**Goal:** Replace fabricated tools with working IDB equivalents

**Prerequisites:**
- ✅ IDB installed: `brew tap facebook/fb && brew install idb-companion`
- ✅ Simulator booted (via existing `simctl-boot`)
- ✅ IDB companion auto-started by CLI

**Tools to Implement:**
1. ✅ `idb-targets` - Foundation (list, describe, focus)
2. ✅ `idb-connect` - Connection management
3. ✅ `idb-ui-tap` - Tap interactions (PRIMARY)
4. ✅ `idb-ui-input` - Text/keyboard (PRIMARY)
5. ✅ `idb-ui-gesture` - Swipe/buttons (PRIMARY)
6. ✅ `idb-ui-describe` - UI querying (PRIMARY)

**Deliverables:**
- [ ] All 6 tools implemented with tests
- [ ] Coordinate transform integration verified
- [ ] Progressive disclosure for describe-all
- [ ] Health check utility (`validateIdbInstallation`)
- [ ] Documentation in CLAUDE.md
- [ ] Integration tests with real simulator

**Success Criteria:**
- ✅ Can tap, type, swipe on simulator via IDB
- ✅ Coordinate transformation works with screenshots
- ✅ UI element querying returns accurate results
- ✅ 80%+ test coverage
- ✅ Zero fabricated commands

**Testing Approach:**
```typescript
describe('Phase 1: UI Automation', () => {
  it('should complete full interaction workflow', async () => {
    // 1. Boot simulator
    await simctlBoot({ udid: 'test-device' });

    // 2. Connect IDB
    await idbConnect({ udid: 'test-device' });

    // 3. Query UI
    const ui = await idbUiDescribe({ operation: 'all' });
    expect(ui.summary.totalElements).toBeGreaterThan(0);

    // 4. Tap element
    const tap = await idbUiTap({ x: 200, y: 400 });
    expect(tap.success).toBe(true);

    // 5. Type text
    const input = await idbUiInput({
      operation: 'text',
      text: 'test@example.com'
    });
    expect(input.success).toBe(true);
  });
});
```

---

### Phase 2: App Management (Week 2)

**Goal:** Complete app lifecycle control

**Tools to Implement:**
7. ✅ `idb-list-apps`
8. ✅ `idb-install`
9. ✅ `idb-launch`
10. ✅ `idb-terminate`
11. ✅ `idb-uninstall`

**Deliverables:**
- [ ] All 5 tools with tests
- [ ] Environment variable handling (`IDB_` prefix)
- [ ] Launch with wait-for streaming
- [ ] Progressive disclosure for app lists
- [ ] Integration with Phase 1 UI tools

**Success Criteria:**
- ✅ Can install .app and .ipa files
- ✅ Launch with custom args and env vars
- ✅ Stream app output during launch
- ✅ Clean app lifecycle management

**Key Feature: Environment Variables**
```typescript
await idbLaunch({
  bundleId: 'com.example.MyApp',
  environment: {
    DEBUG: "1",  // IDB adds IDB_ prefix automatically
    TEST_MODE: "true"
  }
});
// App receives: IDB_DEBUG="1" IDB_TEST_MODE="true"
// IDB strips prefix before passing to app
```

---

### Phase 3: Testing & Debugging (Week 3)

**Goal:** Professional testing workflows

**Tools to Implement:**
12. ✅ `idb-xctest-install`
13. ✅ `idb-xctest-run`
14. ✅ `idb-debugserver`
15. ✅ `idb-file`

**Deliverables:**
- [ ] XCTest integration complete
- [ ] Test filtering (tests-to-run, tests-to-skip)
- [ ] Result bundle generation
- [ ] Debug session management
- [ ] File operations for test data

**Success Criteria:**
- ✅ Run XCTest bundles with filters
- ✅ Progressive disclosure for test results
- ✅ Debug sessions connectable via lldb
- ✅ File push/pull for test fixtures

---

### Phase 4: Media & Polish (Week 4)

**Goal:** Complete feature set and production readiness

**Tools to Implement:**
16. ✅ `idb-record-video`
17. ✅ `idb-permissions`
18. ✅ `idb-log` (bonus)
19. ✅ `idb-crash` (bonus)

**Deliverables:**
- [ ] Video recording with format options
- [ ] Permission approval automation
- [ ] Location spoofing
- [ ] Log streaming (if time)
- [ ] Crash log analysis (if time)
- [ ] Complete documentation
- [ ] Example workflows

**Success Criteria:**
- ✅ Record screen to MP4
- ✅ Grant permissions programmatically
- ✅ Override GPS coordinates
- ✅ Full CLAUDE.md update
- ✅ Production-ready error handling

---

## Testing Strategy

### Unit Tests (Per Tool)

Follow CODESTYLE.md pattern: tests document expected behavior

```typescript
describe('idbUiTapTool', () => {
  it('should tap at device coordinates without transformation', async () => {
    /**
     * When user provides device coordinates directly:
     * - Tool should use coordinates as-is
     * - No transformation applied
     * - Response indicates no transform
     */
    const result = await idbUiTapTool({
      udid: 'test-device',
      x: 200,
      y: 400,
      actionName: 'Direct tap'
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.tappedAt).toEqual({ x: 200, y: 400 });
    expect(response.transformApplied).toBe(false);
  });

  it('should apply coordinate transformation when requested', async () => {
    /**
     * When user provides screenshot scale factors:
     * - Tool should multiply coordinates by scale
     * - Tap at transformed device coordinates
     * - Response documents transformation
     */
    const result = await idbUiTapTool({
      udid: 'test-device',
      x: 100,
      y: 200,
      applyScreenshotScale: true,
      screenshotScaleX: 2.0,
      screenshotScaleY: 2.0,
      actionName: 'Transformed tap'
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.tappedAt).toEqual({ x: 200, y: 400 });
    expect(response.screenshotCoordinates).toEqual({ x: 100, y: 200 });
    expect(response.transformApplied).toBe(true);
    expect(response.scaleFactors).toEqual({ x: 2.0, y: 2.0 });
  });

  it('should handle long press with duration', async () => {
    /**
     * When duration is specified:
     * - IDB should perform long press
     * - Duration passed to IDB --duration flag
     */
    const result = await idbUiTapTool({
      udid: 'test-device',
      x: 200,
      y: 400,
      duration: 2.0,
      actionName: 'Long press'
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.duration).toBe(2.0);
  });
});
```

### Integration Tests

**Test against real simulator:**

```typescript
describe('IDB Integration Tests', () => {
  beforeAll(async () => {
    // Boot simulator
    await simctlBoot({ udid: TEST_DEVICE_UDID });

    // Wait for boot
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify IDB can connect
    const targets = await idbTargets({ operation: 'list' });
    expect(targets.targets.length).toBeGreaterThan(0);
  });

  it('should complete full UI automation workflow', async () => {
    // Install test app
    await idbInstall({
      udid: TEST_DEVICE_UDID,
      appPath: '/path/to/TestApp.app'
    });

    // Launch app
    await idbLaunch({
      bundleId: 'com.test.TestApp'
    });

    // Query UI
    const ui = await idbUiDescribe({
      operation: 'point',
      x: 200,
      y: 400
    });
    expect(ui.element.type).toBe('Button');

    // Tap button
    const tap = await idbUiTap({
      x: 200,
      y: 400,
      actionName: 'Test button tap'
    });
    expect(tap.success).toBe(true);
  });

  afterAll(async () => {
    // Cleanup
    await simctlShutdown({ udid: TEST_DEVICE_UDID });
  });
});
```

### Health Check Tests

```typescript
describe('IDB Prerequisites', () => {
  it('should detect IDB installation', async () => {
    const check = await validateIdbInstallation();
    expect(check.installed).toBe(true);
    expect(check.version).toMatch(/\d+\.\d+\.\d+/);
  });

  it('should detect idb_companion running', async () => {
    const companionCheck = await checkCompanionStatus();
    expect(companionCheck.running).toBe(true);
  });
});
```

---

## Risk Mitigation

### Risk 1: IDB Not Installed

**Impact:** All IDB tools fail immediately

**Mitigation:**

```typescript
async function validateIdbInstallation(): Promise<void> {
  const idbCheck = await executeCommand('which idb', { timeout: 5000 });

  if (idbCheck.code !== 0) {
    throw new McpError(
      ErrorCode.InternalError,
      `IDB (iOS Development Bridge) is not installed.

      Installation options:

      1. Homebrew (recommended):
         brew tap facebook/fb
         brew install idb-companion

      2. From source:
         Visit https://fbidb.io/docs/installation

      IDB is required for UI automation, app management, and advanced iOS testing.`
    );
  }

  // Verify version
  const versionCheck = await executeCommand('idb --version', { timeout: 5000 });
  if (versionCheck.code === 0) {
    console.log(`[idb] Found IDB version: ${versionCheck.stdout.trim()}`);
  }
}
```

**User Guidance:**
```typescript
// In tool responses when IDB missing
guidance: [
  "❌ IDB is not installed",
  "Install with Homebrew:",
  "  brew tap facebook/fb",
  "  brew install idb-companion",
  "",
  "Or visit https://fbidb.io for alternative methods"
]
```

---

### Risk 2: Companion Server Not Running

**Impact:** Commands fail with connection errors

**Mitigation:** IDB CLI auto-starts companions, but check status:

```typescript
async function checkCompanionStatus(): Promise<CompanionStatus> {
  // Check if companion process running
  const companionCheck = await executeCommand('pgrep idb_companion');

  if (companionCheck.code !== 0) {
    return {
      running: false,
      guidance: [
        "⚠️ IDB companion not running",
        "IDB CLI will auto-start companion when needed",
        "Or manually start: idb_companion --udid {DEVICE_UDID}"
      ]
    };
  }

  return {
    running: true,
    processId: parseInt(companionCheck.stdout.trim(), 10)
  };
}
```

**Auto-start approach:**
```typescript
// IDB CLI automatically manages companions
// We just use: idb <command> --udid <UDID>
// IDB handles companion lifecycle internally
```

---

### Risk 3: Coordinate Mismatch

**Impact:** Taps miss target elements

**Mitigation:** Clear documentation and validation:

```typescript
function validateCoordinateTransform(args: IdbUiTapArgs): void {
  // Warn if scale factors provided but not applied
  const hasScaleFactors = args.screenshotScaleX || args.screenshotScaleY;
  const shouldTransform = args.applyScreenshotScale === true;

  if (hasScaleFactors && !shouldTransform) {
    console.warn(
      '[idb-ui-tap] Screenshot scale factors provided but applyScreenshotScale is false. ' +
      'Coordinates will be used as-is without transformation. ' +
      'Set applyScreenshotScale: true to auto-transform.'
    );
  }
}
```

**Response warnings:**
```typescript
// If scale factors provided but not applied
guidance: [
  "⚠️ Screenshot scale factors provided but not applied",
  "Tapped using raw coordinates without transformation",
  "Set applyScreenshotScale: true to auto-transform",
  "Or manually calculate: deviceX = screenshotX × " + screenshotScaleX
]
```

---

### Risk 4: Target Not Found

**Impact:** Commands fail when UDID is invalid or simulator not booted

**Mitigation:** Auto-detection and clear errors:

```typescript
async function resolveUdid(udid?: string): Promise<string> {
  // If UDID provided, validate it exists
  if (udid) {
    const targets = await executeCommand(`idb list-targets --json`);
    const targetList = JSON.parse(targets.stdout);

    const found = targetList.find((t: any) => t.udid === udid);
    if (!found) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Target with UDID "${udid}" not found.

        Available targets:
        ${targetList.map((t: any) => `  - ${t.name} (${t.udid})`).join('\n')}

        Use idb-targets to list available targets.`
      );
    }

    return udid;
  }

  // Auto-detect: find first booted simulator
  const targets = await executeCommand(`idb list-targets --json`);
  const targetList = JSON.parse(targets.stdout);

  const booted = targetList.find((t: any) => t.state === 'Booted');
  if (!booted) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `No booted simulator found.

      Boot a simulator first:
        simctl-boot --udid <UDID>

      Or specify UDID explicitly:
        --udid <DEVICE_UDID>`
    );
  }

  return booted.udid;
}
```

---

### Risk 5: IDB Version Compatibility

**Impact:** Commands may have different syntax across IDB versions

**Mitigation:** Version detection and feature checks:

```typescript
async function checkIdbVersion(): Promise<IdbVersion> {
  const result = await executeCommand('idb --version');

  if (result.code !== 0) {
    throw new McpError(ErrorCode.InternalError, 'Could not determine IDB version');
  }

  // Parse version (e.g., "1.2.3")
  const versionMatch = result.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!versionMatch) {
    console.warn('[idb] Could not parse IDB version, assuming latest');
    return { major: 999, minor: 0, patch: 0 };
  }

  const [_, major, minor, patch] = versionMatch;
  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10)
  };
}

// Use in feature detection
async function supportsFeature(feature: string): Promise<boolean> {
  const version = await checkIdbVersion();

  switch (feature) {
    case 'ui-describe-all':
      return version.major >= 1;  // Available in 1.0+
    case 'xctest-run':
      return version.major >= 1 && version.minor >= 1;  // 1.1+
    default:
      return true;
  }
}
```

---

## Success Metrics

### Phase 1 Success Criteria (Week 1)

**Functional Requirements:**
- ✅ All 6 UI automation tools implemented
- ✅ Can tap, type, swipe on real simulator
- ✅ UI element querying returns accurate data
- ✅ Coordinate transformation verified with screenshots

**Quality Requirements:**
- ✅ 80%+ test coverage
- ✅ All tests pass (unit + integration)
- ✅ Zero fabricated commands
- ✅ CODESTYLE.md compliance verified

**Documentation Requirements:**
- ✅ CLAUDE.md updated with IDB tools
- ✅ Usage examples for each tool
- ✅ Coordinate transform guide
- ✅ Workflow integration documented

**Performance Requirements:**
- ✅ Tool responses < 5 seconds (normal operations)
- ✅ UI queries < 3 seconds
- ✅ Tap operations < 2 seconds

---

### Overall Success Criteria (End of Phase 4)

**Tool Suite Completeness:**
- ✅ 17+ IDB tools implemented
- ✅ All tools with progressive disclosure
- ✅ Health check utility complete
- ✅ Integration with simctl tools seamless

**Workflow Coverage:**
- ✅ Complete UI automation workflow (describe → tap → verify)
- ✅ Full app lifecycle (install → launch → interact → terminate)
- ✅ Testing workflow (install tests → run → analyze results)
- ✅ Debugging workflow (debugserver → lldb connection)

**Production Readiness:**
- ✅ Error handling covers all edge cases
- ✅ Clear installation instructions
- ✅ Auto-detection of targets works
- ✅ Coordinate transform proven reliable

**Developer Experience:**
- ✅ Clear agent guidance for follow-up actions
- ✅ Structured responses for easy parsing
- ✅ Semantic metadata enables test documentation
- ✅ Progressive disclosure prevents token overflow

---

## Open Questions for User Approval

### Q1: IDB Installation Strategy

**Question:** Should we auto-install IDB via Homebrew if missing, or just provide instructions?

**Option A:** Auto-install
```typescript
// Detect IDB missing, offer to install
if (!idbInstalled) {
  const shouldInstall = await askUser("IDB not found. Install now? (y/n)");
  if (shouldInstall) {
    await executeCommand('brew tap facebook/fb && brew install idb-companion');
  }
}
```

**Option B:** Instructions only (RECOMMENDED)
```typescript
// Just throw helpful error with installation steps
throw new McpError(
  ErrorCode.InternalError,
  "IDB not installed. Install with: brew tap facebook/fb && brew install idb-companion"
);
```

**Recommendation:** Option B - Let user control installations

---

### Q2: Companion Management

**Question:** Should tools auto-start idb_companion, or require manual startup?

**Answer:** IDB CLI auto-manages companions, so we don't need to handle this. IDB starts/stops companions automatically.

---

### Q3: Tool Naming Convention

**Question:** Prefer `idb-ui-tap` or just `idb-tap`?

**Option A:** Prefix with category: `idb-ui-tap`, `idb-ui-input`
**Option B:** Flat namespace: `idb-tap`, `idb-input`

**Recommendation:** Option A - Category prefixes improve clarity and organization

---

### Q4: Phase 1 Scope

**Question:** Agree with focusing on UI automation first (tools 1-6)?

**Scope:**
1. idb-targets
2. idb-connect
3. idb-ui-tap ⭐
4. idb-ui-input ⭐
5. idb-ui-gesture ⭐
6. idb-ui-describe ⭐

**Recommendation:** Yes - this replaces fabricated tools with working equivalents immediately

---

### Q5: Coordinate Transform Strategy

**Question:** Should we auto-detect last screenshot's scale factors, or require explicit passing?

**Option A:** Auto-detect from context
```typescript
// Remember last screenshot's coordinateTransform
let lastScreenshotTransform = { scaleX: 2.0, scaleY: 2.0 };

// Apply automatically if not provided
await idbUiTap({ x: 100, y: 200 });
// Uses lastScreenshotTransform automatically
```

**Option B:** Explicit passing (RECOMMENDED)
```typescript
// User must explicitly provide scale factors
await idbUiTap({
  x: 100, y: 200,
  applyScreenshotScale: true,
  screenshotScaleX: 2.0,
  screenshotScaleY: 2.0
});
```

**Recommendation:** Option B - Explicit is safer, prevents subtle bugs

---

## Next Steps After Approval

1. ✅ **Plan approved** - Proceed with implementation
2. ✅ Create directory structure: `src/tools/idb/`
3. ✅ Implement health check utility: `src/utils/idb-validation.ts`
4. ✅ Implement Phase 1 Tool #1: `idb-targets`
5. ✅ Implement Phase 1 Tool #2: `idb-connect`
6. ✅ Implement Phase 1 Tool #3: `idb-ui-tap` (PRIMARY)
7. ✅ Create test infrastructure for IDB tools
8. ✅ Update CLAUDE.md with IDB documentation

---

## Conclusion

This plan provides a complete, production-ready roadmap for IDB integration that:

✅ **Replaces fabricated tools** with real, working commands
✅ **Aligns with CODESTYLE.md** (progressive disclosure, 15-line orchestration, strategic comments)
✅ **Optimizes for LLM/agents** (semantic metadata, audit trails, clear guidance)
✅ **Integrates seamlessly** with existing simctl tools
✅ **Provides comprehensive testing** (unit, integration, health checks)
✅ **Mitigates risks** (installation, connection, coordinate transform)

The implementation is phased to deliver immediate value (UI automation) while building toward a complete iOS automation solution.

**Ready to proceed with Phase 1 implementation.**
