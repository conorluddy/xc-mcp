# XC-MCP Code Style Guide

**Context engineering for MCP servers:** Write code that serves both human developers and AI agents. Optimize for clarity within finite attention budgets.

## Core Principle: Context is Finite

Every line of code, every comment, every structure either aids understanding or depletes attention budget. Be ruthlessly intentional with every token.

## The Law of Cognitive Economy

The optimal amount of code is the minimum necessary to solve the problem correctly. Before adding anything:
- **Code:** "Is this the simplest possible solution?"
- **Comments:** "Does this clarify something non-obvious?"
- **Structure:** "Does this reduce complexity or just relocate it?"

## 1. Structure Code for Progressive Disclosure

Organize so code can be understood layer by layer, discovering details as needed.

### File Organization

```typescript
// ============================================================================
// TYPES & INTERFACES
// ============================================================================

// Core types used by module

// ============================================================================
// PUBLIC API
// ============================================================================

export async function mainToolFunction(args: any) {
  // High-level orchestration, clear flow
}

// ============================================================================
// STAGE 1: CONFIGURATION
// ============================================================================

async function assembleConfiguration(args: any): Promise<Config> {
  // Clear purpose, self-contained
}

// ============================================================================
// STAGE 2: EXECUTION
// ============================================================================

async function executeOperation(config: Config): Promise<Result> {
  // Single responsibility
}

// ============================================================================
// STAGE 3: PROCESSING
// ============================================================================

function processResults(result: Result): Metrics {
  // Transform output
}
```

**Benefits:**
- Readers understand flow immediately
- AI agents can navigate by section
- Each section is a context boundary
- Can understand one stage without loading entire file

### Function Size

Keep functions small (20-30 lines ideal):
- Main orchestrator: ~15 lines
- Helpers: ~25 lines
- Never exceed 60 lines without refactoring

**Rule of thumb:** If you need vertical scrolling to see the function, it's too big.

## 2. Write Self-Documenting Code with Strategic Comments

Code should explain "what" through clear naming and structure. Comments explain "why."

### Bad: Explains What (Redundant)

```typescript
// Get the project path from arguments
const projectPath = args.projectPath;

// If no destination, use smart selection
const destination = args.destination || await getSmartDestination();
```

### Good: Explains Why (Useful)

```typescript
// Extract projectPath early for validation boundary
// Enables explicit error handling before expensive cache queries
const projectPath = args.projectPath;

// Use smart selection only when user didn't specify destination
// This preserves user intent while learning from history
const destination = args.destination || await getSmartDestination();
```

### Strategic Comment Guidelines

- **Document decisions:** Why did you choose this approach over alternatives?
- **Explain assumptions:** What conditions must be true for this to work?
- **Enumerate edge cases:** What unusual inputs could break this?
- **Reference constraints:** What external requirements drive this code?

### Example: Complex Logic

```typescript
/**
 * Determine simulator destination using precedence strategy.
 *
 * Precedence (highest to lowest):
 * 1. User-specified destination (explicit user intent)
 * 2. Cached successful destination (learned configuration)
 * 3. Preferred simulator (project history)
 * 4. Undefined (let xcodebuild choose)
 *
 * Why this order:
 * - User intent always wins (respects explicit choices)
 * - Cache only applies when user didn't override
 * - Learning from history reduces repeated configurations
 * - Fallback to xcodebuild default if nothing cached
 *
 * Edge case: Cache failures don't crash (graceful degradation)
 */
async function getSmartDestination(
  userDestination: string | undefined,
  cachedConfig: BuildConfig | null
): Promise<string | undefined> {
  if (userDestination) return userDestination;  // User wins
  if (cachedConfig?.destination) return cachedConfig.destination;  // Cache hit

  try {
    const preferred = await simulatorCache.getPreferred();
    if (preferred) return `platform=iOS Simulator,id=${preferred.udid}`;
  } catch {
    // Cache query failed, continue with default
  }

  return undefined;  // Let xcodebuild use defaults
}
```

## 3. Explicit Dependencies, No Hidden State

Every function should state all dependencies upfront.

### Bad: Hidden Global Dependencies

```typescript
// What does this depend on? Unclear!
function executeTest(config: TestConfig): Promise<Result> {
  const command = buildCommand(config);  // Where does buildCommand come from?
  const result = await executeCommand(command);  // Implicitly uses timeout constants?
  simulatorCache.recordUsage();  // Why does this know about simulator cache?
}
```

### Good: Explicit Dependencies

```typescript
/**
 * Execute test command for given configuration.
 *
 * Dependencies:
 * - executeCommand: Shell execution with timeouts
 * - projectCache: For recording results
 * - simulatorCache: For usage tracking
 */
async function executeTest(
  config: TestConfig,
  timeout: number = 900000,
  bufferSize: number = 50 * 1024 * 1024
): Promise<CommandResult> {
  const command = buildTestCommand(config);

  // Explicit timeout/buffer for test execution (15min, 50MB)
  // Tests longer than builds, generate verbose output
  const result = await executeCommand(command, { timeout, bufferSize });

  // Record simulator usage if device was used
  if (config.destination?.includes('Simulator')) {
    const udidMatch = config.destination.match(/id=([A-F0-9-]+)/);
    if (udidMatch) simulatorCache.recordSimulatorUsage(udidMatch[1]);
  }

  return result;
}
```

## 4. Clear Input/Output Contracts

Use TypeScript interfaces and clear naming to make function intent obvious.

### Bad: Vague Types

```typescript
export async function tool(args: any) {
  const config = { ...args };
  const result = await execute(config);
  return process(result);
}
```

### Good: Explicit Contracts

```typescript
interface TestToolArgs {
  projectPath: string;
  scheme: string;
  configuration?: string;
  destination?: string;
}

interface TestResult {
  success: boolean;
  totalTests: number;
  failedTests: number;
  duration: number;
}

/**
 * Run xcodebuild tests with smart configuration.
 *
 * @param args Test configuration (requires projectPath, scheme)
 * @returns TestResult with metrics and caching metadata
 * @throws McpError for validation or execution failures
 */
export async function xcodebuildTestTool(args: TestToolArgs): Promise<TestResult> {
  const config = await assembleConfiguration(args);
  const result = await executeTests(config);
  return formatResult(result);
}
```

## 5. Token-Efficient Responses

Return only the information needed. Avoid redundancy and bloat.

### Bad: Redundant Fields

```typescript
{
  testId: "cache-id",
  success: true,
  summary: { totalTests: 10, failed: 0 },
  failedTests: [],  // REDUNDANT - same as summary.failed
  intelligence: { ... },  // Unclear naming
  nextSteps: [...],  // Mixed concerns
  availableDetails: [...],  // Static, shouldn't repeat
}
```

### Good: Focused Response

```typescript
{
  // Cache reference for progressive disclosure
  testId: "cache-id",
  success: true,

  // Core metrics (all essential info here)
  summary: {
    totalTests: 10,
    passed: 10,
    failed: 0,
    skipped: 0,
    duration: 15000,
    scheme: "MyApp",
    configuration: "Debug",
    destination: "platform=iOS Simulator,id=ABC-123"
  },

  // Failure details only when needed
  ...(failed > 0 && {
    failureDetails: {
      count: failed,
      examples: ["TestA", "TestB"],
      message: failed > 3 ? `...and ${failed - 3} more` : undefined
    }
  }),

  // Cache interaction metadata
  cacheDetails: {
    note: "Use xcodebuild-get-details with testId for full logs",
    availableTypes: ["full-log", "errors-only", "summary", "command"]
  },

  // Cache decision transparency
  cacheMetadata: {
    appliedCachedDestination: true,
    appliedFallbackConfiguration: false,
    hadCachedPreferences: true,
    willLearnConfiguration: true
  },

  // Actionable guidance for user
  guidance: [
    "All tests passed (10/10) in 15000ms",
    "Used cached simulator: platform=iOS Simulator,id=ABC-123",
    "Successful configuration cached for future test runs"
  ]
}
```

## 6. Design Functions as Self-Contained Units

Each function should be understandable without reading the entire codebase.

### Single Responsibility

```typescript
// ✅ Clear responsibility: determine destination for test execution
async function getSmartDestination(config: BuildConfig | null): Promise<string | undefined> {
  // ... implementation ...
}

// ✅ Clear responsibility: build xcodebuild command string
function buildTestCommand(action: string, config: TestConfig): string {
  // ... implementation ...
}

// ✗ Multiple responsibilities: shouldn't combine determination + building
async function determineAndBuildCommand(config: BuildConfig): Promise<string> {
  const destination = await getSmartDestination(config);
  return buildTestCommand("test", { ...config, destination });
}
```

### Descriptive Names

```typescript
// ✗ Ambiguous
function process(data, config)

// ✓ Specific and clear
function validateAndAssembleTestConfiguration(userArgs: TestToolArgs, projectPath: string): TestConfig
```

## 7. Error Handling and Edge Cases

Document assumptions. Handle edge cases explicitly.

### Bad: Assumes Happy Path

```typescript
function parseResults(output: string): TestMetrics {
  const match = output.match(/Executed (\d+) tests/);
  const count = parseInt(match[1], 10);  // Crashes if no match!
  return { totalTests: count, ... };
}
```

### Good: Explicit Assumptions and Fallbacks

```typescript
/**
 * Parse test results from xcodebuild output.
 *
 * Assumptions:
 * - Expects Xcode 12+ format
 * - Test line format: "Test Case '-[Class method]' passed/failed (X.XXX seconds)"
 * - Summary format: "Executed N tests, with M failures..."
 *
 * Edge cases:
 * - Empty test suite: Returns zeros with warning
 * - Malformed summary: Uses counted values with warning
 * - Mixed stdout/stderr: Searches both streams
 */
function parseResults(stdout: string, stderr: string): TestMetrics {
  const results = { totalTests: 0, passed: 0, failed: 0, warnings: [] as string[] };
  const output = stdout + '\n' + stderr;

  // Count individual test results
  for (const line of output.split('\n')) {
    if (line.includes("Test Case '-[")) {
      if (line.includes(' passed ')) results.passed++;
      else if (line.includes(' failed ')) results.failed++;
    }
  }

  // Validate against summary line if present
  const summaryMatch = output.match(/Executed (\d+) tests?, with (\d+) failures?/);
  if (summaryMatch) {
    const executedFromSummary = parseInt(summaryMatch[1], 10);
    const countedTotal = results.passed + results.failed;

    if (countedTotal !== executedFromSummary) {
      // Format may have changed in new Xcode version
      results.warnings.push('Test count mismatch: may indicate format change');
    }
    results.totalTests = executedFromSummary;
  } else if (results.passed + results.failed === 0) {
    results.warnings.push('No test results found - possible compilation failure');
  }

  return results;
}
```

## 8. Naming Conventions

### TypeScript Interfaces
```typescript
// Tool parameters
interface TestToolArgs { }

// Assembled configuration (all decisions made)
interface TestConfig { }

// Result from execution
interface CommandResult { }

// Parsed metrics
interface TestMetrics { }
```

### Functions
```typescript
// Declarative names showing exactly what happens
async function assembleTestConfiguration(args: any): Promise<TestConfig>
async function executeTestCommand(config: TestConfig): Promise<CommandResult>
function parseTestMetrics(result: CommandResult): TestMetrics
async function recordTestExecution(config: TestConfig, result: CommandResult): Promise<string>
function formatTestResponse(config: TestConfig, result: CommandResult, metrics: TestMetrics): Response
```

### Variables
```typescript
// Clear, specific names - not just "data"
const testMetrics = parseResults(output);
const appliedCachedDestination = !userDestination && smartDestination !== undefined;
const hadCachedPreferences = preferredConfig !== null;
```

## 9. Avoid Anti-Patterns

### ❌ Emoji in Production Code
Emoji in responses wastes tokens and provides no signal. Use clear text.

### ❌ Mixed Concerns
Don't combine unrelated logic in one function. Split stages.

### ❌ Magic Numbers
Always explain timeout/buffer choices via comments.

### ❌ Implicit Global State
Always pass dependencies explicitly as parameters.

### ❌ Vague Field Names
Use `cacheMetadata` not `intelligence`. Use `guidance` not `nextSteps`.

### ❌ Redundant Fields
Never duplicate information in response (e.g., `failedTests` when `summary.failed` exists).

## 10. Testing Approach

Tests should document expected behavior and serve as usage examples.

```typescript
describe('xcodebuildTestTool', () => {
  it('should run tests with smart defaults when user provides minimal config', async () => {
    /**
     * When user provides only projectPath and scheme:
     * - Tool should query cached preferences
     * - Apply smart simulator selection if available
     * - Record successful configuration for future use
     * - Return structured metrics
     */
    const result = await xcodebuildTestTool({
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp'
      // note: no destination or configuration
    });

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.cacheMetadata.appliedCachedDestination).toBe(false);  // No cache on first run
    expect(response.cacheMetadata.willLearnConfiguration).toBe(true);     // Successful run = learning
  });
});
```

## Checklist for New Tools

When adding a new tool to xc-mcp:

- [ ] Main function is ~15 lines (orchestration only)
- [ ] Functions organized into clear stages with section markers
- [ ] Each helper function: 20-30 lines, single responsibility
- [ ] All dependencies explicit (passed as parameters)
- [ ] Strategic comments explain "why" decisions
- [ ] TypeScript interfaces define all contracts
- [ ] Response removes redundancy, uses progressive disclosure
- [ ] No emoji in output
- [ ] Error handling documents assumptions
- [ ] Tests document behavior, not just verify correctness
- [ ] All tests passing before commit
- [ ] ESLint and Prettier clean

## Resources

- **Context Engineering:** https://github.com/anthropics/claude-cookbooks/blob/main/tool_use/memory_cookbook.ipynb
- **MCP Protocol:** https://modelcontextprotocol.io/
- **XC-MCP Documentation:** See CLAUDE.md for project structure

---

**Goal:** Code that's optimal for both human understanding and AI collaboration. Clear structure. Strategic documentation. Minimal token waste. Self-contained functions.

