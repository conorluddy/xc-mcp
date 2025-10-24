# IDB Commands Deep Dive: Screen Content Parsing & Debugging

**Analysis Date:** 2025-01-24
**Purpose:** Identify IDB commands useful for understanding screen content, app state, and debugging

---

## Executive Summary

IDB provides **40+ commands** across 9 categories. For screen content parsing and understanding, the most valuable are:

### 🌟 **TOP TIER** (Essential for screen understanding)
1. `idb ui describe-all` - Complete accessibility tree with bounds and metadata
2. `idb ui describe-point X Y` - Element identification at coordinates
3. `idb list-apps` - App state (running, debuggable)
4. `idb log` - Live log streaming for behavior analysis

### ⭐ **HIGH VALUE** (Useful for debugging)
5. `idb crash list` - Crash history analysis
6. `idb crash show CRASH_NAME` - Detailed crash reports
7. `idb debugserver status` - Debug session info
8. `idb describe` - Target metadata (screen dimensions, iOS version)

### ✅ **SUPPORTING** (Workflow enablers)
9. `idb record video` - Visual regression testing
10. `idb xctest list` - Available tests for validation

---

## Category 1: Target Management

### Commands
```bash
idb list-targets                   # Show all available devices/simulators
idb describe --udid UDID            # Get target metadata
idb connect UDID                    # Register companion
idb disconnect UDID                 # Deregister companion
idb --boot UDID                     # Start simulator
idb focus --udid UDID               # Bring simulator to foreground
```

### Output Format: Text/JSON

**`idb list-targets` Example:**
```
UDID | Name | Screen Dimensions | State | Type | OS Version | Architecture
ABC-123 | iPhone 16 Pro | 1179x2556 | Booted | simulator | iOS 17.2 | arm64
```

**`idb describe` Example:**
```json
{
  "udid": "ABC-123",
  "name": "iPhone 16 Pro",
  "screen_dimensions": {
    "width": 1179,
    "height": 2556,
    "density": 3.0,
    "width_points": 393,
    "height_points": 852
  },
  "state": "Booted",
  "type": "simulator",
  "os_version": "iOS 17.2",
  "architecture": "arm64",
  "model": "iPhone 16,2"
}
```

### **Screen Parsing Value:** ⭐⭐⭐ (3/5)

**Why useful:**
- Screen dimensions are CRITICAL for coordinate transformation
- State validation (Booted vs Shutdown)
- OS version affects UI availability

**Recommended MCP Tool:** ✅ Already implemented as `idb-targets`

**Missing features to add:**
- Expose `screen_dimensions.density` for retina scaling
- Expose `width_points` / `height_points` for proper coordinate math

---

## Category 2: Accessibility & UI Inspection 🌟🌟🌟

### Commands
```bash
idb ui describe-all --udid UDID                    # Full UI tree
idb ui describe-point --udid UDID X Y              # Element at coords
```

### Output Format: JSON

**`idb ui describe-all` Structure:**
```json
[
  {
    "AXFrame": "{{50, 100}, {300, 44}}",
    "frame": {
      "x": 50,
      "y": 100,
      "width": 300,
      "height": 44
    },
    "AXUniqueId": "4A3B...",
    "role": "AXButton",
    "role_description": "button",
    "type": "Button",
    "AXLabel": "Login",
    "AXValue": null,
    "enabled": true,
    "content_required": false,
    "custom_actions": [
      {
        "name": "activate",
        "uuid": "..."
      }
    ],
    "children": []
  },
  {
    "AXFrame": "{{50, 200}, {300, 44}}",
    "frame": {
      "x": 50,
      "y": 200,
      "width": 300,
      "height": 44
    },
    "AXUniqueId": "5B4C...",
    "role": "AXTextField",
    "role_description": "text field",
    "type": "TextField",
    "AXLabel": "Email",
    "AXValue": "",
    "AXPlaceholder": "Enter your email",
    "enabled": true,
    "focused": false,
    "content_required": true,
    "children": []
  }
]
```

**Key Fields:**
- **`frame`**: Exact bounds for tapping (x, y, width, height)
- **`type`**: Button, TextField, Switch, Slider, Image, StaticText, etc.
- **`AXLabel`**: User-visible text or accessibility label
- **`AXValue`**: Current value (important for TextField, Slider, Switch)
- **`AXPlaceholder`**: Placeholder text for empty fields
- **`enabled`**: Whether element is interactive
- **`focused`**: Whether element has keyboard focus
- **`custom_actions`**: Available actions (swipe, activate, increment, etc.)
- **`children`**: Nested elements (hierarchical tree)

**`idb ui describe-point 200 100` Example:**
```json
{
  "AXFrame": "{{50, 100}, {300, 44}}",
  "frame": {
    "x": 50,
    "y": 100,
    "width": 300,
    "height": 44
  },
  "role": "AXButton",
  "type": "Button",
  "AXLabel": "Login",
  "enabled": true
}
```

### **Screen Parsing Value:** 🌟🌟🌟🌟🌟 (5/5) **ESSENTIAL**

**Why this is the MOST valuable command:**
1. **Complete UI understanding** - Every element's position, type, label, value
2. **Actionable coordinates** - `frame.x`, `frame.y` for tapping
3. **State inspection** - `enabled`, `focused`, `AXValue` reveal UI state
4. **Semantic meaning** - `AXLabel` provides element purpose
5. **Hierarchy** - `children` array shows UI structure

**Recommended MCP Tool:** ✅ Already implemented as `idb-ui-describe`

**Enhancements to consider:**
1. **Smart element filtering**
   - Return only interactive elements (enabled=true)
   - Filter by type (all buttons, all text fields)
   - Search by label/value pattern

2. **Coordinate bounding box visualization**
   - Generate SVG overlay showing tappable regions
   - Return as base64 for inline display

3. **Semantic grouping**
   - Group related fields (e.g., "Login Form" = email + password + button)
   - Detect common patterns (forms, lists, navigation bars)

4. **Value extraction**
   - Extract all text values from screen
   - Build "screen snapshot" of current state
   - Compare snapshots for regression testing

---

## Category 3: App Management

### Commands
```bash
idb list-apps --udid UDID                          # All installed apps
idb install PATH_TO_APP --udid UDID                # Deploy app
idb launch BUNDLE_ID --udid UDID                   # Start app
idb launch -w BUNDLE_ID --udid UDID                # Launch and stream output
idb terminate BUNDLE_ID --udid UDID                # Kill app
idb uninstall BUNDLE_ID --udid UDID                # Remove app
```

### Output Format: Text (pipe-separated)

**`idb list-apps` Example:**
```
com.apple.Maps | Maps | system | arm64 | Not running | Not Debuggable
com.apple.MobileSMS | Messages | system | arm64 | Not running | Not Debuggable
com.example.MyApp | MyApp | user | arm64 | Running | Debuggable
com.example.TestApp | TestApp | user | arm64 | Not running | Debuggable
```

**Fields:**
1. **Bundle ID** - Unique app identifier
2. **App Name** - Display name
3. **Install Type** - `system`, `user`, or `internal`
4. **Architecture** - `arm64`, `x86_64`, or `universal`
5. **Running Status** - `Running` or `Not running`
6. **Debuggable Status** - `Debuggable` or `Not Debuggable`

**`idb launch -w BUNDLE_ID` Output:**
```
Launched com.example.MyApp with process ID 12345
[stdout] Application started
[stdout] Initializing database...
[stdout] Loading user preferences...
[stderr] Warning: Using cached data
```

### **Screen Parsing Value:** ⭐⭐⭐⭐ (4/5)

**Why useful:**
- **Running status** - Know which app is active
- **Debuggable status** - Whether LLDB can attach
- **Launch with `-w`** - Stream stdout/stderr for behavior analysis

**Recommended MCP Tool:** Should add to Phase 2

**Suggested tool:** `idb-list-apps`
```typescript
interface IdbListAppsArgs {
  udid?: string;
  filterType?: 'system' | 'user' | 'internal';
  runningOnly?: boolean;
}

// Response includes:
// - Parsed app list (not raw text)
// - Running app highlighted
// - Debuggable apps flagged for LLDB
```

---

## Category 4: Crash Logs & Debugging 🔍

### Commands
```bash
idb crash list --udid UDID                         # All crash reports
idb crash list --since DATE --udid UDID            # Recent crashes
idb crash list --bundle-id BUNDLE_ID --udid UDID   # App-specific crashes
idb crash show CRASH_NAME --udid UDID              # Full crash report
idb crash delete CRASH_NAME --udid UDID            # Remove crash
idb crash delete --all --udid UDID                 # Clear all crashes

idb debugserver start BUNDLE_ID --udid UDID        # Start LLDB server
idb debugserver stop --udid UDID                   # Stop debug session
idb debugserver status --udid UDID                 # Active session info
```

### Output Format: Text

**`idb crash list` Example:**
```
MyApp_2025-01-24_103045.crash
MyApp_2025-01-24_092315.crash
com.apple.mobilesafari_2025-01-23_185622.crash
```

**`idb crash show MyApp_2025-01-24_103045.crash` Example:**
```
Incident Identifier: A1B2C3D4-E5F6-7890-ABCD-EF1234567890
CrashReporter Key:   XXXXXXXXXXXX
Hardware Model:      iPhone16,2
Process:             MyApp [12345]
Path:                /Users/.../MyApp.app/MyApp
Identifier:          com.example.MyApp
Version:             1.0.0 (1)
Code Type:           ARM-64
Parent Process:      launchd [1]

Date/Time:           2025-01-24 10:30:45.123 +0000
OS Version:          iOS 17.2 (21C5030d)

Exception Type:      EXC_BAD_ACCESS (SIGSEGV)
Exception Codes:     KERN_INVALID_ADDRESS at 0x0000000000000000
Crashed Thread:      0

Thread 0 Crashed:
0   MyApp                  0x0000000102e4c8b4 -[ViewController handleLogin:] + 180
1   UIKitCore              0x00000001a3f2b3d8 -[UIButton _sendActionsForEvents:] + 124
2   UIKitCore              0x00000001a3f2c1f0 -[UIControl touchesEnded:] + 400
...
```

**`idb debugserver status` Example:**
```
Debug server running for bundle ID: com.example.MyApp
Connection address: process connect connect://localhost:10881
Process ID: 12345
```

### **Screen Parsing Value:** ⭐⭐⭐⭐ (4/5)

**Why useful:**
- **Crash pattern analysis** - Identify recurring failures
- **Stack traces** - Understand where crashes occur
- **Debug server** - Enable LLDB for state inspection

**Recommended MCP Tool:** Should add to Phase 3

**Suggested tools:**

1. **`idb-crash-list`**
```typescript
interface IdbCrashListArgs {
  udid?: string;
  bundleId?: string;      // Filter by app
  since?: string;         // ISO date
  before?: string;        // ISO date
  limit?: number;         // Default: 10
}

// Returns structured crashes with:
// - Crash name + timestamp
// - Bundle ID
// - Exception type
// - Preview of stack trace (first 5 lines)
// - crashId for full retrieval
```

2. **`idb-crash-show`**
```typescript
interface IdbCrashShowArgs {
  crashName: string;
  udid?: string;
  // LLM optimization
  investigationContext?: string;  // e.g., "Payment flow crash"
  severity?: 'low' | 'medium' | 'high' | 'critical';
}

// Returns:
// - Full crash report
// - Parsed exception type
// - Thread backtraces
// - Suggested investigation steps
```

---

## Category 5: Logging & Diagnostics

### Commands
```bash
idb log --udid UDID                                # Stream all logs
idb log --predicate 'process == "MyApp"' --udid UDID  # Filter logs
idb log --style json --udid UDID                   # JSON format
```

### Output Format: Text stream (or JSON with `--style json`)

**`idb log` Example (text):**
```
2025-01-24 10:30:45.123456+0000  MyApp[12345]: [INFO] Application started
2025-01-24 10:30:45.456789+0000  MyApp[12345]: [DEBUG] Loading user preferences
2025-01-24 10:30:45.789012+0000  MyApp[12345]: [WARN] Using cached data
2025-01-24 10:30:46.012345+0000  MyApp[12345]: [ERROR] Failed to connect to server
```

**`idb log --style json` Example:**
```json
{
  "timestamp": "2025-01-24T10:30:45.123456Z",
  "process": "MyApp",
  "processID": 12345,
  "level": "INFO",
  "subsystem": "com.example.myapp",
  "category": "networking",
  "message": "Application started"
}
```

### **Screen Parsing Value:** ⭐⭐⭐⭐ (4/5)

**Why useful:**
- **Behavior analysis** - Understand what app is doing
- **Error tracking** - Catch errors not shown in UI
- **Performance** - Timing information

**Recommended MCP Tool:** Should add to Phase 3

**Suggested tool:** `idb-log`
```typescript
interface IdbLogArgs {
  udid?: string;
  predicate?: string;     // e.g., 'process == "MyApp"'
  level?: 'debug' | 'info' | 'default' | 'error' | 'fault';
  duration?: number;      // Stream for N seconds (default: 10)
  style?: 'text' | 'json';
}

// Returns:
// - Log entries (last N lines or duration)
// - Parsed by level
// - Errors/warnings highlighted
```

---

## Category 6: Recording & Media

### Commands
```bash
idb record video OUTPUT.mp4 --udid UDID            # Record screen (Ctrl+C to stop)
idb add-media photo.jpg video.mov --udid UDID      # Import to camera roll
```

### Output Format: Binary (MP4 video) or status confirmation

**Use cases:**
- Visual regression testing
- Record user workflows
- Populate test data (photos/videos)

### **Screen Parsing Value:** ⭐⭐⭐ (3/5)

**Why useful:**
- **Visual validation** - Screen recording for comparison
- **Test data** - Populate media library

**Recommended MCP Tool:** Should add to Phase 4

---

## Category 7: System Configuration

### Commands
```bash
idb set_location LAT LONG --udid UDID              # Override GPS
idb open URL --udid UDID                            # Launch URL/deep link
idb clear_keychain --udid UDID                      # Wipe credentials
idb approve BUNDLE_ID PERMISSION --udid UDID        # Grant permission
idb contacts update db.sqlite --udid UDID           # Replace contacts
```

**Permissions:** `photos`, `camera`, `contacts`, `location`, `microphone`, `notifications`

### **Screen Parsing Value:** ⭐⭐ (2/5)

**Why useful:**
- **Permission testing** - Grant permissions without UI interaction
- **Deep link testing** - Launch URL schemes
- **Location testing** - Override GPS for location-based features

**Recommended MCP Tool:** Phase 2 (permissions already in simctl)

---

## Category 8: File Operations

### Commands
```bash
idb file ls CONTAINER_TYPE BUNDLE_ID PATH --udid UDID
idb file pull CONTAINER_TYPE BUNDLE_ID SRC DST --udid UDID
idb file push SRC CONTAINER_TYPE BUNDLE_ID DST --udid UDID
idb file mkdir CONTAINER_TYPE BUNDLE_ID PATH --udid UDID
idb file mv CONTAINER_TYPE BUNDLE_ID SRC DST --udid UDID
idb file rm CONTAINER_TYPE BUNDLE_ID PATH --udid UDID
```

**Container Types:** `app`, `data`, `group`, `crash`, `root`

### **Screen Parsing Value:** ⭐⭐ (2/5)

**Why useful:**
- **State inspection** - Read app data/preferences
- **Test setup** - Inject test data files
- **Debugging** - Access logs, databases

**Recommended MCP Tool:** Phase 2-3

---

## Category 9: Testing (XCTest)

### Commands
```bash
idb xctest install TEST_BUNDLE --udid UDID         # Deploy tests
idb xctest list --udid UDID                         # Show all tests
idb xctest list-bundle BUNDLE_ID --udid UDID        # Tests in bundle
idb xctest run BUNDLE_ID --udid UDID                # Execute tests
```

### **Screen Parsing Value:** ⭐⭐⭐ (3/5)

**Why useful:**
- **Test discovery** - Know which tests are available
- **Test execution** - Run UI tests programmatically

**Recommended MCP Tool:** Phase 3

---

## Recommendations: Priority Order for Implementation

### Phase 2 (Current - App Management)
1. ✅ `idb-list-apps` - Essential for app state
2. ✅ `idb-launch` - Already planned
3. ✅ `idb-terminate` - Already planned
4. ✅ `idb-install` - Already planned
5. ✅ `idb-uninstall` - Already planned

### Phase 3 (Debugging & Diagnostics) **← HIGH VALUE FOR SCREEN UNDERSTANDING**
1. 🌟 `idb-crash-list` - Crash history with filters
2. 🌟 `idb-crash-show` - Detailed crash reports
3. 🌟 `idb-log` - Live log streaming (10sec bursts)
4. ⭐ `idb-debugserver-start` - LLDB integration
5. ⭐ `idb-debugserver-status` - Active debug sessions

### Phase 4 (Advanced)
6. `idb-record-video` - Visual regression
7. `idb-xctest-list` - Test discovery
8. `idb-file-ls` - File system inspection

---

## Enhanced Tool: `idb-ui-describe` Improvements

Our current implementation can be enhanced with:

### 1. Smart Element Filtering
```typescript
interface IdbUiDescribeArgs {
  // ... existing fields ...

  // NEW: Smart filtering
  filterByType?: 'Button' | 'TextField' | 'Switch' | 'Slider' | 'Image' | 'StaticText';
  onlyInteractive?: boolean;      // enabled=true only
  onlyFocused?: boolean;           // focused=true only
  searchLabel?: string;            // Regex match on AXLabel
  searchValue?: string;            // Regex match on AXValue
}
```

### 2. Semantic Extraction
```typescript
// In response:
semanticAnalysis: {
  forms: [
    {
      name: "Login Form",
      fields: [
        { type: "TextField", label: "Email", value: "", bounds: {...} },
        { type: "TextField", label: "Password", value: "", bounds: {...} },
        { type: "Button", label: "Login", bounds: {...} }
      ]
    }
  ],
  navigationBar: {
    title: "Login",
    leftButton: { label: "Back", bounds: {...} },
    rightButton: null
  },
  lists: [
    { itemCount: 5, firstItem: "Item 1", bounds: {...} }
  ]
}
```

### 3. State Snapshot
```typescript
// Extract all meaningful state
stateSnapshot: {
  textValues: [
    { label: "Email", value: "user@example.com" },
    { label: "Name", value: "John Doe" }
  ],
  switches: [
    { label: "Remember Me", value: true },
    { label: "Notifications", value: false }
  ],
  sliders: [
    { label: "Volume", value: 0.75, min: 0, max: 1 }
  ],
  focusedElement: { type: "TextField", label: "Email" }
}
```

---

## Conclusion

**Most Valuable Commands for Screen Understanding:**

1. 🌟🌟🌟 **`idb ui describe-all`** - Complete accessibility tree (ALREADY IMPLEMENTED ✅)
2. 🌟🌟🌟 **`idb ui describe-point`** - Element at coordinates (ALREADY IMPLEMENTED ✅)
3. 🌟🌟 **`idb list-apps`** - App running status (PHASE 2)
4. 🌟🌟 **`idb crash list`** - Crash history (PHASE 3)
5. 🌟🌟 **`idb log`** - Live logging (PHASE 3)
6. 🌟 **`idb crash show`** - Crash details (PHASE 3)

**The accessibility tree from `describe-all` is the MOST POWERFUL tool** for understanding screen content. Everything else is supporting data for debugging and validation.

**Next Priority:** Phase 3 (Crash + Log tools) provides the most value for understanding app behavior and debugging issues.
