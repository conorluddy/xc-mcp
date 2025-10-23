# iOS UI Tree Navigation Planning Document

**Status:** Research & Planning (Pre-Implementation)
**Date:** October 23, 2025
**Author:** Claude Code with Conor Luddy
**Version:** 1.0

---

## Executive Summary

This document captures detailed research and planning for implementing **accessibility-tree-based UI navigation** in xc-mcp as an advanced feature. The goal is to enable LLM agents to navigate iOS simulators intelligently using semantic UI information instead of expensive screenshot analysis.

**Vision:** Replace screenshot-based navigation with native iOS accessibility tree extraction, achieving **96% token reduction** (2,000-3,000 tokens per screen vs 57,000+ for raw screenshots).

**Constraint:** Use only native Apple tooling - no external dependencies like WebDriverAgent, Appium, or custom frameworks.

**Timeline:** Phase 1 (research/POC) for next development cycle; full integration in xc-mcp 2.0+

---

## Problem Statement

### Current Limitations

**Phase 4 UI Automation Tools** (currently implemented in xc-mcp):
- `simctl-launch` - Launch app
- `simctl-io` - Screenshots/videos
- `simctl-query-ui` - Find UI elements
- `simctl-tap`, `simctl-type-text` - Interactions
- `simctl-scroll`, `simctl-gesture` - Gestures

**The Issue:**
While these tools provide necessary automation capabilities, they rely on **coordinate-based navigation** and **screenshots for visual verification**. Screenshots are **extremely token-expensive** for LLM consumption:

| Format | Tokens | Cost (GPT-4) | Practicality |
|--------|--------|------------|--------------|
| Raw screenshot image | 40,000+ | ~$0.40/screen | Poor |
| Screenshot + context | 50,000+ | ~$0.50/screen | Impractical |
| Raw XML accessibility dump | 40,000+ | ~$0.40/screen | Verbose |
| Standard JSON (parsed) | 10,000 | ~$0.10/screen | Better |
| **Compact JSON (optimized)** | **2,000-3,000** | **~$0.02/screen** | **Excellent** ✅ |

For a 100-step agent interaction:
- Screenshot approach: 4,000,000 tokens, $40.00
- Compact tree approach: 200,000 tokens, $2.00
- **Savings: 95% tokens, 95% cost**

### Agent Decision-Making Challenge

LLM agents navigating apps without semantic understanding must:
1. Take screenshot
2. Use vision model to understand layout
3. Identify interactive elements
4. Decide next action

This is **slow, expensive, and brittle**. With semantic UI information:
1. Agent reads accessibility tree (2-3k tokens)
2. Understands interactive elements semantically
3. Makes smart decisions about navigation
4. Falls back to screenshot only for custom/canvas UIs

---

## Research Findings

### iOS Accessibility Architecture

iOS provides multiple layers for UI automation:

#### Public/Documented APIs
- **XCTest Framework** - Official testing framework with UI automation
- **XCUIApplication** - Query and interact with UI elements
- **UIAccessibility** - Accessibility protocol/properties
- **simctl commands** - Official simulator control

#### Private Frameworks (Available but undocumented)
- **XCTAutomationSupport.framework** - Powers Xcode's Accessibility Inspector
- **AXRuntime.framework** - Apple's accessibility runtime
- **AccessibilityAudit.framework** - Accessibility auditing
- **XCTestSupport.framework** - XCTest infrastructure
- **DTXConnectionServices.framework** - Debugger IPC

#### Key Insight
XCTAutomationSupport.framework (which Xcode's Accessibility Inspector uses) depends on:
```
XCTAutomationSupport (1.5MB binary)
  ↓
AXRuntime.framework (Accessibility Runtime)
AccessibilityAudit.framework
XCTestSupport.framework
DTXConnectionServices.framework
```

This means the same accessibility tree that powers the Accessibility Inspector is theoretically accessible to us.

### Available Native Tools

#### 1. `xcrun simctl` - Official Simulator Control
```bash
# Already used by xc-mcp
# Supports: launch, terminate, install, boot, shutdown, etc.

# Attempted but not implemented:
xcrun simctl query <device> <bundleId> <predicate>  # ❌ Doesn't exist yet
```

#### 2. `xcrun instruments` - Profiling & Tracing
```bash
# Can profile accessibility events
# Could potentially dump accessibility tree during profiling
xcrun instruments -l
```

#### 3. `xcrun xctrace` - System Trace Recording
```bash
# Modern replacement for instruments
# Can capture accessibility framework activity
```

#### 4. XCTest CLI Tools
```bash
# Located at: /Applications/Xcode.app/Contents/Developer/usr/bin/
# Could be used to run accessibility dump tests
```

#### 5. `simctl spawn` - Process Execution
```bash
# Execute arbitrary process on simulator
xcrun simctl spawn <device> <executable> [args]

# Could run custom Swift tool to dump accessibility tree
```

### Framework Inventory

#### XCTest Framework (Public)
```swift
let app = XCUIApplication()
let snapshot = try app.snapshot()
let tree = app.windows.first?.elementTree
```
- ✅ Official public API
- ✅ Complete element hierarchy
- ✅ Accessibility properties available
- ❌ Requires test context to run
- ❌ Must run via xcodebuild test

#### XCTAutomationSupport.framework (Private)
```swift
// Available in: /Applications/Xcode.app/.../PrivateFrameworks/
// Used by Xcode's Accessibility Inspector
// Contains low-level accessibility tree querying
```
- ✅ Powerful, complete
- ✅ What Apple officially uses
- ❌ Private/undocumented
- ❌ Could change between Xcode versions

---

## Viable Implementation Options

### Option 1: XCTest-Based Approach ⭐ **RECOMMENDED**

**Concept:** Write a minimal UI test in the Grapla test target that dumps the accessibility tree.

**Implementation:**
```swift
// In graplaUIAccessibilityTests/AccessibilityTreeTests.swift
import XCTest

class AccessibilityTreeTests: XCTestCase {
  func testDumpAccessibilityTree() throws {
    let app = XCUIApplication()
    let tree = self.parseAccessibilityTree(app.windows.first)
    let jsonOutput = self.encodeAsCompactJSON(tree)
    print(jsonOutput)  // Captured by test runner
  }

  private func parseAccessibilityTree(_ element: XCUIElement?) -> TreeNode {
    // Recursively build tree from XCUIElement hierarchy
    // Include: accessibility identifier, label, role, bounds, actions
    // Calculate confidence scores
  }
}
```

**Execution Flow:**
```
xcodebuild test -scheme grapla -testTarget graplaUIAccessibilityTests
  ↓
Runs test that dumps tree
  ↓
Tree output captured in test logs
  ↓
xc-mcp parses and formats output
  ↓
Agent receives 2-3k token compact JSON
```

**Pros:**
- ✅ Uses only public XCTest API
- ✅ Already built into xcodebuild (xc-mcp supports this!)
- ✅ No external dependencies
- ✅ Works reliably across Xcode versions
- ✅ Can integrate into existing test suite
- ✅ Can run on real devices AND simulators

**Cons:**
- ⚠️ Requires test target in each project
- ⚠️ Only works with xcodebuild test, not standalone
- ⚠️ Slight overhead per app (need to add test class)
- ⚠️ Not ideal for rapid iteration

**Implementation Effort:** Low (1-2 days prototype, 3-4 days production)

---

### Option 2: Standalone Swift CLI Tool

**Concept:** Build a reusable command-line tool that uses private frameworks to dump accessibility trees.

**Architecture:**
```
ios-ui-tree-dumper/
├── Sources/
│   ├── main.swift
│   └── AccessibilityDumper.swift
│       └── Uses XCTAutomationSupport.framework
├── build.sh
└── Package.swift
```

**Installation & Usage:**
```bash
# Build once
swift build -c release

# Install
cp .build/release/ios-ui-tree-dumper /usr/local/bin/

# Use via simctl spawn
xcrun simctl spawn 9B031E3B-... ios-ui-tree-dumper --bundle-id com.grapla.grapla
```

**Pros:**
- ✅ Standalone, no project modifications needed
- ✅ Reusable across multiple projects
- ✅ Fast execution (no test runner overhead)
- ✅ Can use private frameworks directly
- ✅ Full control over output format

**Cons:**
- ⚠️ Uses private frameworks (AXRuntime, XCTAutomationSupport)
- ⚠️ Fragile - breaks on Xcode updates
- ⚠️ Requires compilation and installation
- ⚠️ Maintenance burden (Xcode version compatibility)
- ❌ May not work on real devices
- ❌ Sandbox/security concerns

**Implementation Effort:** Medium (2-3 days for basic POC, 1-2 weeks for production)

**Risk Level:** Medium-High (private API dependencies)

---

### Option 3: Accessibility Inspector Reverse-Engineering

**Concept:** Try to invoke Xcode's Accessibility Inspector directly via private XPC services.

**How it works:**
```bash
# Xcode's Accessibility Inspector likely uses:
# /usr/libexec/accessibility_inspector
# Or private XPC services

# We could potentially invoke these via xcrun or direct command
```

**Pros:**
- ✅ Uses what Apple officially uses
- ✅ Most stable (Apple maintains it)

**Cons:**
- ❌ Extremely fragile (private XPC APIs)
- ❌ Will definitely break between Xcode versions
- ❌ Security sandbox restrictions
- ❌ Undocumented behavior
- ❌ Not recommended for production

**Implementation Effort:** High (3-4 weeks of reverse-engineering)

**Risk Level:** Very High (fragile, likely to break)

**Recommendation:** ❌ **DO NOT PURSUE** - Too risky for production use.

---

## Recommended Approach: Phased Implementation

### Phase 1: Proof-of-Concept (Next Sprint)

**Goal:** Validate that accessibility tree extraction works and provides token savings.

**In Grapla:**
1. Add `graplaUIAccessibilityTests` target
2. Implement single test: `AccessibilityTreeTests.swift`
3. Write parser: convert XCUIElement tree → compact JSON
4. Measure: token count, capture time, accuracy

**Success Criteria:**
- ✅ Tree captured in <500ms
- ✅ Compact JSON <3,000 tokens
- ✅ All interactive elements identified
- ✅ Confidence scoring works

**Deliverable:** POC test, parsing logic, documentation of findings

**Effort:** 2-3 days

---

### Phase 2: xc-mcp Integration (1-2 Sprints)

**Goal:** Build xc-mcp tools to run accessibility tree extraction.

**New Tools:**
```
simctl-accessibility-tree
  --udid <device>
  --bundle-id <bundle>
  --compact [true|false]  # Output format
  --confidence-threshold [high|medium|low|all]
```

**Implementation:**
1. Create `src/tools/simctl/accessibility-tree.ts`
2. Implement test runner wrapper
3. Add semantic enrichment (role inference, confidence scoring)
4. Integrate with cache system
5. Add comprehensive error handling

**Output Format (Compact):**
```json
{
  "summary": {
    "elementCount": 47,
    "screenType": "list",
    "confidence": "high",
    "tokens": 2847,
    "format": "compact"
  },
  "tree": {
    "id": "root",
    "role": "container",
    "text": "",
    "bounds": [0, 0, 1080, 2400],
    "children": [
      {
        "id": "nav_back",
        "role": "button",
        "text": "Back",
        "bounds": [20, 50, 44, 24],
        "confidence": "high",
        "actions": ["tap"],
        "children": []
      },
      // ... more elements
    ]
  },
  "metadata": {
    "bundleId": "com.grapla.grapla",
    "testMethod": "XCTest",
    "captureTime": 342,
    "accessibility": "good"
  }
}
```

**Effort:** 1-2 weeks

---

### Phase 3: Real-World Testing (2+ Weeks)

**Goal:** Validate on diverse apps and refine implementation.

**Testing Plan:**
- Grapla itself
- Well-designed apps (accessibility-first)
- Moderately-accessible apps
- Poorly-accessible apps
- Custom UI / canvas-heavy apps
- Hybrid web/native apps

**Metrics:**
- Token efficiency (target: 90%+ reduction vs screenshots)
- Confidence accuracy (target: >80%)
- Capture time (target: <500ms)
- Error rate (target: <5%)
- Coverage (target: 40+ distinct app types)

**Refinements:**
- Improve semantic role inference
- Better handling of poor accessibility
- Graceful degradation strategies
- Performance optimization

**Effort:** 2-3 weeks

---

### Phase 4: Integration with Agent Framework (Future)

**Goal:** Enable agents to navigate using accessibility trees.

**Agent Workflow:**
```
1. Request accessibility tree from app
   simctl-accessibility-tree --udid <id> --bundle-id <bundle>

2. Agent reads tree (2-3k tokens)

3. Agent identifies target element
   "I need to tap the 'Login' button"

4. Agent executes action
   simctl-tap --udid <id> --accessibility-id "login_button"

5. Verify with new tree capture or light screenshot

6. Repeat until goal achieved
```

**Confidence Framework Integration:**
- High confidence: Use accessibility ID directly
- Medium confidence: Use coordinates with validation
- Low confidence: Request screenshot for visual confirmation

**Effort:** 1-2 weeks (after Phase 3)

---

## Semantic Enrichment Strategy

### Role Inference

**Direct Mapping:**
```typescript
const roleMap: Record<string, SemanticRole> = {
  'XCUIElementTypeButton': 'button',
  'XCUIElementTypeTextField': 'input',
  'XCUIElementTypeSecureTextField': 'input',
  'XCUIElementTypeStaticText': 'text',
  'XCUIElementTypeImage': 'image',
  'XCUIElementTypeSwitch': 'switch',
  'XCUIElementTypeSlider': 'slider',
  'XCUIElementTypeTable': 'list',
  'XCUIElementTypeTableCell': 'list_item',
  'XCUIElementTypeCollectionView': 'grid',
  // ...
};
```

**Behavioral Inference:**
```typescript
if (element.isAccessibilityElement && element.isEnabled && element.isHittable) {
  if (element.accessibilityTraits.contains('button')) {
    role = 'button';
    confidence = 'high';
  } else if (element.accessibilityLabel?.contains('back')) {
    role = 'navigation';
    confidence = 'medium';
    hints = ['top-left', 'likely back button'];
  }
}
```

### Confidence Scoring

**High Confidence (80-100%):**
- Clear accessibility identifier
- Standard element type (Button, TextField, etc.)
- Accessibility label present
- No custom styling
- Visible and enabled

**Medium Confidence (50-80%):**
- Behavioral hints (clickable element)
- Positional context (top-left = back)
- Partial accessibility info
- Standard appearance

**Low Confidence (<50%):**
- No accessibility info
- Custom views
- Canvas/drawn UI
- Complex interactions needed
- Poor accessibility implementation

### Action Mapping

```typescript
interface ActionMapping {
  role: SemanticRole;
  availableActions: InteractionAction[];
  preferredStrategy: InteractionStrategy;
  hints?: string[];
}

const actionMappings: Record<SemanticRole, ActionMapping> = {
  button: {
    availableActions: ['tap'],
    preferredStrategy: confidence === 'high' ? 'accessibility' : 'coordinates',
  },
  input: {
    availableActions: ['tap', 'type', 'clear'],
    preferredStrategy: 'accessibility',
  },
  list: {
    availableActions: ['tap', 'scroll'],
    preferredStrategy: 'coordinates',
  },
  // ...
};
```

---

## Token Efficiency Analysis

### Comparison Matrix

| Format | Example Output | Tokens | Compression | Use Case |
|--------|---|---|---|---|
| **Raw XML** | `<node text="Login" resource-id="..." clickable="true" ...>` | 40,000+ | Baseline | Never |
| **Standard JSON** | `{"text":"Login","resourceId":"...","clickable":true}` | 10,000 | 75% | Development |
| **Minified JSON** | `{"t":"Login","r":"...","c":true}` | 400,000 | 90% | Intermediate |
| **Compact + Compression** | `{i:"btn",r:"btn",t:"Login",a:1,c:"h"}` | 2,000-3,000 | 95% | Production ✅ |

### Cost Analysis (GPT-4 @ $0.03/1k input tokens)

**Scenario: 100-step agent interaction**

| Approach | Tokens/Step | Total | Cost | Time |
|---|---|---|---|---|
| Screenshot-based | 40,000 | 4,000,000 | $120.00 | 400s (4+ min) |
| Raw XML trees | 40,000 | 4,000,000 | $120.00 | 200s (3+ min) |
| Standard JSON | 10,000 | 1,000,000 | $30.00 | 100s (1+ min) |
| **Compact JSON** | **2,500** | **250,000** | **$7.50** | **25s** |

**ROI Breakeven:** ~15-20 agent interactions

---

## Architecture Overview

### Component Structure

```
xc-mcp (Core)
├── src/tools/simctl/
│   ├── accessibility-tree.ts          (NEW)
│   │   ├── executeTest()              # Run test
│   │   ├── parseXMLTree()             # Parse to JSON
│   │   ├── enrichTree()               # Add semantic info
│   │   └── compactSerialize()         # Token optimization
│   └── [existing tools]
│
├── src/tools/enrichers/              (NEW)
│   ├── semantic-enricher.ts           # Role inference
│   ├── confidence-scorer.ts           # Confidence calculation
│   └── action-mapper.ts               # Action capabilities
│
└── src/state/
    └── accessibility-cache.ts         (NEW - separate from response cache)
```

### Data Flow

```
1. Agent requests: simctl-accessibility-tree
   ↓
2. xc-mcp launches test:
   xcodebuild test -testOnly AccessibilityTreeTests
   ↓
3. Test runs, captures XCUIApplication tree
   ↓
4. Test outputs raw JSON
   ↓
5. xc-mcp parses and enriches:
   - Extract elements
   - Infer roles
   - Calculate confidence
   - Map actions
   ↓
6. Compact serialization:
   - Abbreviate field names
   - Encode actions as bitmap
   - Remove redundancy
   ↓
7. Return 2-3k token JSON
   ↓
8. Cache (with ID for drill-down)
```

---

## Implementation Details

### Test Template (Grapla)

```swift
// graplaUIAccessibilityTests/AccessibilityTreeTests.swift
import XCTest

class AccessibilityTreeTests: XCTestCase {

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  func testCaptureAccessibilityTree() throws {
    let app = XCUIApplication()
    app.launch()

    // Wait for app to fully load
    let _ = app.wait(for: .runningForeground, timeout: 5)

    // Capture tree
    let tree = try captureAccessibilityTree(from: app)

    // Encode as JSON
    let jsonData = try JSONEncoder().encode(tree)
    let jsonString = String(data: jsonData, encoding: .utf8)!

    // Output (captured by test runner)
    print("ACCESSIBILITY_TREE_JSON_START")
    print(jsonString)
    print("ACCESSIBILITY_TREE_JSON_END")
  }

  private func captureAccessibilityTree(from app: XCUIApplication) throws -> AccessibilityTreeNode {
    guard let window = app.windows.first else {
      throw NSError(domain: "No window found", code: 1)
    }

    return parseAccessibilityElement(window, depth: 0)
  }

  private func parseAccessibilityElement(
    _ element: XCUIElement,
    depth: Int
  ) -> AccessibilityTreeNode {
    let bounds = element.frame

    return AccessibilityTreeNode(
      id: element.identifier.isEmpty ? "elem_\(UUID().uuidString)" : element.identifier,
      elementType: String(describing: element.elementType),
      label: element.label,
      value: element.value as? String,
      placeholder: element.placeholderValue,
      isAccessibilityElement: element.isAccessibilityElement,
      isEnabled: element.isEnabled,
      isHittable: element.isHittable,
      isVisible: !element.frame.isEmpty,
      bounds: [
        Int(bounds.minX), Int(bounds.minY),
        Int(bounds.width), Int(bounds.height)
      ],
      children: element.children
        .prefix(10)  // Limit children for performance
        .map { parseAccessibilityElement($0, depth: depth + 1) }
    )
  }
}

// MARK: - Models

struct AccessibilityTreeNode: Codable {
  let id: String
  let elementType: String
  let label: String
  let value: String?
  let placeholder: String?
  let isAccessibilityElement: Bool
  let isEnabled: Bool
  let isHittable: Bool
  let isVisible: Bool
  let bounds: [Int]
  let children: [AccessibilityTreeNode]
}
```

### Parser (xc-mcp)

```typescript
interface RawAccessibilityTreeNode {
  id: string;
  elementType: string;
  label: string;
  value?: string;
  placeholder?: string;
  isAccessibilityElement: boolean;
  isEnabled: boolean;
  isHittable: boolean;
  isVisible: boolean;
  bounds: [number, number, number, number];
  children: RawAccessibilityTreeNode[];
}

function parseAccessibilityTree(json: string): EnrichedAccessibilityTree {
  const raw = JSON.parse(json) as RawAccessibilityTreeNode;

  const enriched = enrichNode(raw);
  const compacted = compactSerialize(enriched);

  return {
    summary: {
      elementCount: countElements(compacted),
      screenType: inferScreenType(compacted),
      confidence: calculateOverallConfidence(compacted),
      tokens: estimateTokens(compacted),
      format: 'compact'
    },
    tree: compacted,
    metadata: {
      captureTime: Date.now(),
      accessibility: assessAccessibility(raw)
    }
  };
}

function enrichNode(node: RawAccessibilityTreeNode): EnrichedNode {
  const role = inferRole(node);
  const confidence = scoreConfidence(node, role);
  const actions = mapActions(node, role);
  const hints = generateHints(node, role, confidence);

  return {
    ...node,
    role,
    confidence,
    actions,
    hints,
    interactionStrategy: selectStrategy(confidence),
    children: node.children.map(enrichNode)
  };
}

function compactSerialize(node: EnrichedNode): CompactNode {
  return {
    i: node.id,                           // id
    r: abbreviateRole(node.role),         // role
    t: node.label || node.value,          // text
    b: node.bounds,                       // bounds
    a: encodeActions(node.actions),       // actions (bitmap)
    c: node.confidence[0],                // confidence (first char)
    h: node.hints.length > 0 ? node.hints : undefined,
    ch: node.children.length > 0
      ? node.children.map(compactSerialize)
      : undefined
  };
}
```

---

## Challenges & Mitigation

### Challenge 1: XCTest Requires Test Target

**Problem:** XCTest only works in test context, requires test bundle

**Mitigation:**
- Add minimal test target to projects (low overhead)
- Provide template for projects to copy
- Document clear setup instructions
- Or proceed with standalone tool (Option 2)

### Challenge 2: Xcode Version Compatibility

**Problem:** Private frameworks could change between versions

**Mitigation:**
- Use only public XCTest APIs (Phase 1)
- For private APIs (future), add version detection
- Test against multiple Xcode versions
- Monitor Apple release notes
- Maintain compatibility matrix

### Challenge 3: Poor Accessibility Apps

**Problem:** Apps with no accessibility labels won't provide useful trees

**Mitigation:**
- Implement smart fallback to screenshots
- Add heuristic inference (positional, behavioral)
- Generate hints for LLM ("this might be a button")
- Confidence framework guides when to use screenshot
- Graceful degradation

### Challenge 4: Performance (Large Element Trees)

**Problem:** Apps with hundreds/thousands of elements = large trees

**Mitigation:**
- Implement element filtering (visible only)
- Limit depth traversal
- Deduplication for list/table cells
- Pagination support (first N elements)
- Cache for repeated queries

### Challenge 5: Real Device Support

**Problem:** XCTest works on simulators, may not work on real devices

**Mitigation:**
- Focus on simulator support initially
- Explore real device support in Phase 3
- May require enterprise development certificate
- Or separate approach for real devices

---

## Success Criteria

### Technical Metrics

- ✅ **Token Efficiency:** <3,000 tokens per screen (90%+ reduction)
- ✅ **Capture Time:** <500ms average
- ✅ **Confidence Accuracy:** >80% elements correctly identified
- ✅ **Coverage:** Works on 40+ distinct app types
- ✅ **Error Rate:** <5% failures

### Development Metrics

- ✅ **Code Quality:** 80%+ test coverage
- ✅ **Documentation:** Clear setup and usage guides
- ✅ **Compatibility:** Xcode 15+
- ✅ **Performance:** Capture + parse <1 second

### User Adoption Metrics

- ✅ **Adoption:** Used in 3+ real projects
- ✅ **Feedback:** Positive feedback on token savings
- ✅ **Stability:** <1% bug report rate

---

## Comparison to Andrai (Android)

### Similarities

| Aspect | Andrai (Android) | xc-mcp (iOS) |
|--------|---|---|
| **Approach** | UIAutomator XML → JSON | XCUITest tree → JSON |
| **Output** | 2,000-3,000 tokens | 2,000-3,000 tokens |
| **Confidence** | High/Medium/Low | High/Medium/Low |
| **Fallback** | Screenshot when needed | Screenshot when needed |
| **Philosophy** | Semantic > visual | Semantic > visual |
| **Native only** | Yes | Yes (Phase 1) |

### Differences

| Aspect | Andrai | xc-mcp |
|---|---|---|
| **Setup** | Pure ADB (no deps) | Requires test target |
| **Speed** | 300-900ms dumps | Similar (~300-500ms) |
| **Scope** | Production + debugging | Simulators + devices |
| **Maturity** | Research phase | Planning phase |
| **API** | Simple CLI | MCP protocol |

**Learning:** Andrai validates the token efficiency approach. We can follow a similar path but adapted to iOS constraints.

---

## Roadmap Timeline

```
Sprint 1 (Next): Research & POC
  ├─ Add test target to Grapla
  ├─ Implement AccessibilityTreeTests.swift
  ├─ Build parser + semantic enrichment
  └─ Measure token savings + performance

Sprint 2-3: xc-mcp Integration
  ├─ Create simctl-accessibility-tree tool
  ├─ Implement compact serialization
  ├─ Add to cache system
  └─ Comprehensive error handling

Sprint 4: Testing & Refinement
  ├─ Real-world app testing (40+ apps)
  ├─ Performance optimization
  ├─ Confidence scoring refinement
  └─ Documentation & examples

Sprint 5+: Advanced Features
  ├─ Agent framework integration
  ├─ Real device support
  ├─ Standalone tool (Option 2)
  └─ Full production release (xc-mcp 2.0)
```

---

## Appendix A: Framework Locations

### iOS SDK Accessibility Frameworks

```
/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneSimulator.platform/
├── Developer/Library/PrivateFrameworks/
│   ├── XCTAutomationSupport.framework/     (1.5MB binary)
│   ├── XCTestSupport.framework/
│   ├── XCTestCore.framework/
│   └── ...
├── Developer/SDKs/iPhoneSimulator.sdk/
│   └── System/Library/Frameworks/
│       ├── UIKit.framework/Headers/UIAccessibility*.h
│       ├── Accessibility.framework/
│       └── ...
```

### Key Headers

```
UIAccessibility.h
  - UIAccessibilityElement
  - UIAccessibilityContainer
  - UIAccessibilityIdentification

XCTest/XCUIApplication.h
  - XCUIApplication
  - XCUIElement
  - XCUIElementQuery
```

### CLI Tools

```
/Applications/Xcode.app/Contents/Developer/usr/bin/
├── simctl              (Simulator control)
├── xctrace             (Tracing)
└── xcrun               (Tool runner)
```

---

## Appendix B: References & Resources

### Andrai Documentation
- `/Users/conor/Development/Andrai/SPECS/00-ANDRAI-OVERVIEW.md`
- `/Users/conor/Development/Andrai/SPECS/20-CORE-PLANNING.md`

### xc-mcp Documentation
- `/Users/conor/Development/xc-mcp/README.md`
- `/Users/conor/Development/xc-mcp/CLAUDE.md`
- `/Users/conor/Development/xc-mcp/docs/LLM_OPTIMIZATION.md`

### Apple Documentation
- XCTest Framework (public)
- UIAccessibility (public)
- [Apple's Testing with Xcode](https://developer.apple.com/xcode/testing/)

### Research Projects
- **DroidBot-GPT** - Similar approach for Android
- **AutoDroid** - AI-driven app automation research
- **Andrai** - Latest research-validated approach

---

## Appendix C: Proof of Concept Code Structure

Minimal POC to validate approach:

```
grapla/
├── graplaUIAccessibilityTests/          (NEW)
│   ├── AccessibilityTreeTests.swift     (Test + dumper)
│   └── Model.swift                      (Data structures)
│
└── grapla/
    └── (existing code)

xc-mcp/
├── src/tools/simctl/
│   └── accessibility-tree.ts            (NEW)
│
├── src/tools/enrichers/                 (NEW)
│   ├── semantic-enricher.ts
│   └── confidence-scorer.ts
│
└── docs/
    └── IOS_UI_TREE_NAVIGATION_PLANNING.md (THIS FILE)
```

---

## Next Steps

**Decision Point:** Ready to proceed with Phase 1 POC?

**If YES:**
1. Schedule 2-3 day sprint for POC
2. Assign to person familiar with XCTest
3. Use Grapla as test subject
4. Validate token savings + performance
5. Review findings and decide on full implementation

**If deferring:**
- Keep this document as reference for future development
- Return to in xc-mcp 2.0 planning
- Use findings to inform broader navigation strategy

**If exploring Option 2 (Standalone Tool):**
- Would require separate research sprint
- Higher risk due to private APIs
- More flexible in deployment

---

**Document Status:** Complete ✅
**Last Updated:** October 23, 2025
**Next Review:** After Phase 1 POC completion
