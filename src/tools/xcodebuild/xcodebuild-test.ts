import { validateProjectPath, validateScheme } from '../../utils/validation.js';
import { executeCommand, buildXcodebuildCommand } from '../../utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { responseCache } from '../../utils/response-cache.js';
import { projectCache, type BuildConfig } from '../../state/project-cache.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { createConfigManager } from '../../utils/config.js';

// ============================================================================
// TYPES
// ============================================================================

interface TestToolArgs {
  projectPath: string;
  scheme: string;
  configuration?: string;
  destination?: string;
  sdk?: string;
  derivedDataPath?: string;
  testPlan?: string;
  onlyTesting?: string[];
  skipTesting?: string[];
  testWithoutBuilding?: boolean;
}

interface TestConfig {
  projectPath: string;
  scheme: string;
  configuration: string;
  destination?: string;
  sdk?: string;
  derivedDataPath?: string;
  testPlan?: string;
  onlyTesting?: string[];
  skipTesting?: string[];
  testWithoutBuilding: boolean;
  appliedCachedDestination: boolean;
  appliedFallbackConfiguration: boolean;
  hadCachedPreferences: boolean;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
  duration: number;
}

interface TestMetrics {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  failedTestsList: string[];
  parseWarnings: string[];
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Run Xcode tests with intelligent defaults and progressive disclosure
 *
 * **What it does:**
 * Executes unit and UI tests for Xcode projects with advanced learning that remembers successful
 * test configurations and suggests optimal simulators per project. Provides detailed test metrics
 * (passed/failed/skipped) with progressive disclosure to prevent token overflow. Supports test
 * filtering (-only-testing, -skip-testing), test plans, and test-without-building mode for faster
 * iteration. Learns from successful test runs to improve future suggestions.
 *
 * **Why you'd use it:**
 * - Automatic smart defaults: remembers which simulator and config worked for tests
 * - Detailed test metrics: structured pass/fail/skip counts instead of raw output
 * - Progressive disclosure: concise summaries with full logs available via testId
 * - Test filtering: run specific tests or skip problematic ones with -only-testing/-skip-testing
 *
 * **Parameters:**
 * - projectPath (string, required): Path to .xcodeproj or .xcworkspace file
 * - scheme (string, required): Test scheme name (use xcodebuild-list to discover)
 * - configuration (string, optional): Build configuration (Debug/Release, defaults to cached or "Debug")
 * - destination (string, optional): Test destination (e.g., "platform=iOS Simulator,id=<UDID>")
 * - sdk (string, optional): SDK to test against (e.g., "iphonesimulator")
 * - derivedDataPath (string, optional): Custom derived data path
 * - testPlan (string, optional): Test plan name to execute
 * - onlyTesting (string[], optional): Array of test identifiers to run exclusively
 * - skipTesting (string[], optional): Array of test identifiers to skip
 * - testWithoutBuilding (boolean, optional): Run tests without building (requires prior build)
 *
 * **Returns:**
 * Structured JSON with testId (for progressive disclosure), success status, test summary
 * (total/passed/failed/skipped counts), failure details (first 3 failures), and cache metadata
 * showing which smart defaults were applied. Use xcodebuild-get-details with testId for full logs.
 *
 * **Example:**
 * ```typescript
 * // Run all tests with smart defaults
 * const result = await xcodebuildTestTool({
 *   projectPath: "/path/to/MyApp.xcodeproj",
 *   scheme: "MyApp"
 * });
 *
 * // Run specific tests only
 * const filtered = await xcodebuildTestTool({
 *   projectPath: "/path/to/MyApp.xcworkspace",
 *   scheme: "MyApp",
 *   onlyTesting: ["MyAppTests/testLogin", "MyAppTests/testLogout"]
 * });
 *
 * // Fast iteration with test-without-building
 * const quick = await xcodebuildTestTool({
 *   projectPath: "/path/to/MyApp.xcodeproj",
 *   scheme: "MyApp",
 *   testWithoutBuilding: true
 * });
 * ```
 *
 * **Full documentation:** See src/tools/xcodebuild/test.md for detailed parameters
 *
 * @param args Tool arguments containing projectPath, scheme, and optional test configuration
 * @returns Tool result with test metrics and testId for progressive disclosure
 */
export async function xcodebuildTestTool(args: any) {
  try {
    const config = await assembleTestConfiguration(args);
    const result = await executeTestCommand(config);
    const metrics = parseTestMetrics(result);
    const cacheId = await recordTestExecution(config, result, metrics);
    return formatTestResponse(config, result, metrics, cacheId);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `xcodebuild-test failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// CONFIGURATION STAGE
// ============================================================================

/**
 * Assemble final test configuration from user inputs and cached preferences.
 *
 * Applies precedence:
 * 1. User-provided parameters (highest priority)
 * 2. Cached configuration from previous successful test runs
 * 3. Smart simulator selection based on project history
 * 4. Xcodebuild defaults (lowest priority)
 */
async function assembleTestConfiguration(args: any): Promise<TestConfig> {
  const {
    projectPath,
    scheme,
    configuration,
    destination,
    sdk,
    derivedDataPath,
    testPlan,
    onlyTesting,
    skipTesting,
    testWithoutBuilding = false,
  } = args as TestToolArgs;

  // Validate core inputs early
  await validateProjectPath(projectPath);
  validateScheme(scheme);

  // Query cached preferences from previous successful runs
  const preferredConfig = await projectCache.getPreferredBuildConfig(projectPath);

  // Determine destination: use explicit > cached > smart selection > undefined
  const smartDestination = destination || (await getSmartDestination(preferredConfig));
  const appliedCachedDestination = !destination && smartDestination !== undefined;

  // Determine configuration: use explicit > cached > 'Debug' default
  const appliedFallbackConfiguration = !configuration && preferredConfig?.configuration !== 'Debug';
  const finalConfiguration = configuration || preferredConfig?.configuration || 'Debug';

  return {
    projectPath,
    scheme,
    configuration: finalConfiguration,
    destination: smartDestination,
    sdk: sdk || preferredConfig?.sdk,
    derivedDataPath: derivedDataPath || preferredConfig?.derivedDataPath,
    testPlan,
    onlyTesting,
    skipTesting,
    testWithoutBuilding,
    appliedCachedDestination,
    appliedFallbackConfiguration,
    hadCachedPreferences: preferredConfig !== null,
  };
}

/**
 * Determine optimal simulator destination for test execution.
 *
 * Applies precedence:
 * 1. Previous successful destination from build config (highest confidence)
 * 2. Most-used simulator for any project (learning from history)
 * 3. Undefined, letting xcodebuild choose default (fallback)
 *
 * Returns xcodebuild destination string or undefined for default behavior.
 * Never throws - failures gracefully degrade to undefined.
 */
async function getSmartDestination(
  preferredConfig: BuildConfig | null
): Promise<string | undefined> {
  // Priority 1: Use previous successful destination if available
  if (preferredConfig?.destination) {
    return preferredConfig.destination;
  }

  // Priority 2: Try to get most-used simulator from cache
  try {
    const preferredSim = await simulatorCache.getPreferredSimulator();
    if (preferredSim) {
      // Format per xcodebuild documentation:
      // https://developer.apple.com/documentation/xcode/running-custom-executables
      return `platform=iOS Simulator,id=${preferredSim.udid}`;
    }
  } catch {
    // Simulator cache query failed, but that's non-critical
    // Let xcodebuild use its own defaults rather than crashing
  }

  // Priority 3: No smart destination available, let xcodebuild choose
  return undefined;
}

// ============================================================================
// EXECUTION STAGE
// ============================================================================

/**
 * Execute the test command with appropriate timeouts and buffer limits.
 *
 * Tests typically take longer than builds and generate verbose output:
 * - Timeout: 15 minutes (tests can be slow, especially on CI)
 * - Buffer: 50MB (test logs are verbose with individual test results)
 */
async function executeTestCommand(config: TestConfig): Promise<CommandResult> {
  const action = config.testWithoutBuilding ? 'test-without-building' : 'test';
  const command = buildTestCommand(action, config);

  console.error(`[xcodebuild-test] Executing: ${command}`);

  const startTime = Date.now();
  const result = await executeCommand(command, {
    timeout: 900000, // 15 minutes - tests longer than builds
    maxBuffer: 50 * 1024 * 1024, // 50MB - test logs are verbose
  });
  const duration = Date.now() - startTime;

  return { ...result, duration };
}

/**
 * Build xcodebuild test command with all configuration options.
 */
function buildTestCommand(action: string, config: TestConfig): string {
  // Start with base xcodebuild command
  let command = buildXcodebuildCommand(action, config.projectPath, config as any);

  // Add test plan if specified
  if (config.testPlan) {
    command += ` -testPlan "${config.testPlan}"`;
  }

  // Add test filters - these narrow test execution to specific test cases
  if (config.onlyTesting && config.onlyTesting.length > 0) {
    config.onlyTesting.forEach(test => {
      command += ` -only-testing:"${test}"`;
    });
  }

  if (config.skipTesting && config.skipTesting.length > 0) {
    config.skipTesting.forEach(test => {
      command += ` -skip-testing:"${test}"`;
    });
  }

  return command;
}

// ============================================================================
// METRICS STAGE
// ============================================================================

/**
 * Parse xcodebuild test output to extract test metrics.
 *
 * Uses dual parsing strategy:
 * 1. Parse individual test case lines for accurate pass/fail/skip counts
 * 2. Validate against Xcode summary line if present
 * Falls back to calculated totals if summary is missing (graceful degradation)
 *
 * Assumptions:
 * - Expects xcodebuild test output format from Xcode 12+
 * - Test case format: "Test Case '-[ClassName testName]' passed/failed (X.XXX seconds)"
 * - Summary format: "Executed N tests, with M failures (L unexpected) in X.XXX seconds"
 *
 * Edge cases:
 * - Empty test suite: Returns all zeros with warning
 * - Malformed summary: Uses calculated counts with warning
 * - Mixed output: Searches both stdout and stderr for patterns
 */
function parseTestMetrics(result: CommandResult): TestMetrics {
  // Parse detailed test results from output
  const details = parseTestResults(result.stdout, result.stderr);

  return {
    totalTests: details.totalTests,
    passedTests: details.passedTests,
    failedTests: details.failedTests,
    skippedTests: details.skippedTests,
    failedTestsList: details.failedTestsList,
    parseWarnings: details.parseWarnings,
  };
}

/**
 * Parse individual test results from xcodebuild output.
 *
 * Handles output format variations gracefully with fallback logic.
 * Records warnings when parsing encounters unexpected formats.
 */
function parseTestResults(
  stdout: string,
  stderr: string
): Omit<TestMetrics, 'parseWarnings'> & { parseWarnings: string[] } {
  const results = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    failedTestsList: [] as string[],
    parseWarnings: [] as string[],
  };

  const output = stdout + '\n' + stderr;
  const lines = output.split('\n');

  // Strategy 1: Count individual test results from per-test lines
  for (const line of lines) {
    // Match: Test Case '-[ClassName testName]' passed/failed/skipped
    if (line.includes("Test Case '-[")) {
      if (line.includes(' passed ')) {
        results.passedTests++;
      } else if (line.includes(' failed ')) {
        results.failedTests++;
        // Extract and store failed test name for debugging
        const match = line.match(/Test Case '-\[(.+?)\]'/);
        if (match) {
          results.failedTestsList.push(match[1]);
        }
      } else if (line.includes(' skipped ')) {
        results.skippedTests++;
      }
    }
  }

  // Strategy 2: Validate/adjust using summary line if present
  // This line appears in xcodebuild output: "Executed N tests, with M failures (L unexpected)"
  for (const line of lines) {
    const summaryMatch = line.match(/Executed (\d+) tests?, with (\d+) failures?/);
    if (summaryMatch) {
      const executedFromSummary = parseInt(summaryMatch[1], 10);

      // Sanity check: if individual count doesn't match summary, log warning but use counted values
      // This helps catch output format changes in future Xcode versions
      const countedTotal = results.passedTests + results.failedTests + results.skippedTests;
      if (countedTotal !== executedFromSummary) {
        results.parseWarnings.push(
          `Summary reports ${executedFromSummary} tests but counted ${countedTotal} individually - may indicate format change`
        );
      } else {
        // Counts match, use summary totals
        results.totalTests = executedFromSummary;
      }
      break;
    }
  }

  // Fallback: calculate total from counted tests if summary line not found
  if (results.totalTests === 0) {
    results.totalTests = results.passedTests + results.failedTests + results.skippedTests;
    if (results.totalTests === 0) {
      results.parseWarnings.push(
        'No test cases found in output - may indicate test compilation or setup failure'
      );
    }
  }

  return results;
}

// ============================================================================
// RECORDING STAGE
// ============================================================================

/**
 * Record test execution in caches for future learning.
 *
 * Stores:
 * 1. Test configuration in project cache (for future smart defaults)
 * 2. Simulator usage in simulator cache (for future device selection)
 * 3. Full output in response cache (for progressive disclosure)
 */
async function recordTestExecution(
  config: TestConfig,
  result: CommandResult,
  metrics: TestMetrics
): Promise<string> {
  // Store in project cache for configuration learning
  // Map test results to build result schema for unified learning
  // We use errorCount for test failures so failed configurations aren't reused
  projectCache.recordBuildResult(config.projectPath, config as any, {
    timestamp: new Date(),
    success: metrics.failedTests === 0,
    duration: result.duration,
    // Map test failures to errorCount so failed test configs aren't cached as preferences
    errorCount: metrics.failedTests,
    // Tests produce pass/fail results, not warnings
    warningCount: 0,
    // Total output size helps estimate test suite complexity
    buildSizeBytes: result.stdout.length + result.stderr.length,
  });

  // Record simulator usage if a simulator destination was used
  // This helps simulatorCache learn which devices are most productive for this project
  if (config.destination && config.destination.includes('Simulator')) {
    const udidMatch = config.destination.match(/id=([A-F0-9-]+)/);
    if (udidMatch) {
      simulatorCache.recordSimulatorUsage(udidMatch[1], config.projectPath);

      // Save simulator preference to project config if tests passed
      if (metrics.failedTests === 0) {
        try {
          const configManager = createConfigManager(config.projectPath);
          const simulator = await simulatorCache.findSimulatorByUdid(udidMatch[1]);
          await configManager.recordSuccessfulBuild(
            config.projectPath,
            udidMatch[1],
            simulator?.name
          );
        } catch (configError) {
          console.warn('Failed to save simulator preference:', configError);
          // Continue - config is optional
        }
      }
    }
  }

  // Store full output in cache for progressive disclosure
  // Clients can use xcodebuild-get-details to retrieve full logs on demand
  const cacheId = responseCache.store({
    tool: 'xcodebuild-test',
    fullOutput: result.stdout,
    stderr: result.stderr,
    exitCode: result.code,
    command: buildTestCommand(
      config.testWithoutBuilding ? 'test-without-building' : 'test',
      config
    ),
    metadata: {
      projectPath: config.projectPath,
      scheme: config.scheme,
      configuration: config.configuration,
      destination: config.destination,
      sdk: config.sdk,
      testPlan: config.testPlan,
      duration: result.duration,
      success: metrics.failedTests === 0,
      totalTests: metrics.totalTests,
      passedTests: metrics.passedTests,
      failedTests: metrics.failedTests,
      skippedTests: metrics.skippedTests,
      testWithoutBuilding: config.testWithoutBuilding,
      appliedCachedDestination: config.appliedCachedDestination,
      appliedFallbackConfiguration: config.appliedFallbackConfiguration,
    },
  });

  return cacheId;
}

// ============================================================================
// RESPONSE STAGE
// ============================================================================

/**
 * Format test execution results as MCP response.
 *
 * Response structure:
 * - testId: Cache ID for progressive disclosure via xcodebuild-get-details
 * - success: Boolean indicating all tests passed
 * - summary: Concise test metrics and configuration used
 * - cacheDetails: How to retrieve full logs (non-redundant, documented once)
 * - failureDetails: First N failed tests (only if failures exist)
 * - cacheMetadata: Transparency into which smart defaults were applied
 */
function formatTestResponse(
  config: TestConfig,
  result: CommandResult,
  metrics: TestMetrics,
  cacheId: string
) {
  const testsPassed = metrics.failedTests === 0;

  const responseData = {
    testId: cacheId,
    success: testsPassed,
    summary: {
      totalTests: metrics.totalTests,
      passed: metrics.passedTests,
      failed: metrics.failedTests,
      skipped: metrics.skippedTests,
      duration: result.duration,
      scheme: config.scheme,
      configuration: config.configuration,
      destination: config.destination,
      testPlan: config.testPlan,
    },
    // Only include failure details if tests actually failed
    ...(metrics.failedTests > 0 && {
      failureDetails: {
        count: metrics.failedTests,
        // Show first 3 for brevity, full list in cache
        examples: metrics.failedTestsList.slice(0, 3),
        message:
          metrics.failedTests > 3
            ? `...and ${metrics.failedTests - 3} more. Use xcodebuild-get-details for full list.`
            : undefined,
      },
    }),
    // Document how to access detailed information
    cacheDetails: {
      note: 'Use xcodebuild-get-details with testId for full logs',
      availableTypes: ['full-log', 'errors-only', 'summary', 'command'],
    },
    // Transparency into which smart defaults were applied
    cacheMetadata: {
      appliedCachedDestination: config.appliedCachedDestination,
      appliedFallbackConfiguration: config.appliedFallbackConfiguration,
      hadCachedPreferences: config.hadCachedPreferences,
      willLearnConfiguration: testsPassed, // Only learn from successful runs
    },
    // Provide guidance without cluttering response
    guidance: testsPassed
      ? [
          `All tests passed (${metrics.passedTests}/${metrics.totalTests}) in ${result.duration}ms`,
          ...(config.appliedCachedDestination
            ? [`Used cached simulator: ${config.destination}`]
            : []),
          ...(config.hadCachedPreferences ? ['Applied cached project preferences'] : []),
          `Successful configuration cached for future test runs`,
        ]
      : [
          `Tests failed: ${metrics.failedTests} of ${metrics.totalTests} tests failed`,
          ...(metrics.failedTestsList.length > 0
            ? [`First failures: ${metrics.failedTestsList.slice(0, 3).join(', ')}`]
            : []),
          `Use xcodebuild-get-details with testId '${cacheId}' for full logs`,
          ...(config.appliedCachedDestination
            ? ['Try simctl-list to see other available simulators']
            : []),
        ],
  };

  const responseText = JSON.stringify(responseData, null, 2);

  return {
    content: [
      {
        type: 'text' as const,
        text: responseText,
      },
    ],
    isError: !testsPassed,
  };
}

export const XCODEBUILD_TEST_DOCS = `
# xcodebuild-test

⚡ **Run Xcode tests** with intelligent defaults and progressive disclosure

## What it does

Executes unit and UI tests for Xcode projects with advanced learning that remembers successful test configurations and suggests optimal simulators per project. Provides detailed test metrics (passed/failed/skipped) with progressive disclosure to prevent token overflow. Supports test filtering (-only-testing, -skip-testing), test plans, and test-without-building mode for faster iteration. Learns from successful test runs to improve future suggestions.

## Why you'd use it

- Automatic smart defaults: remembers which simulator and config worked for tests
- Detailed test metrics: structured pass/fail/skip counts instead of raw output
- Progressive disclosure: concise summaries with full logs available via testId
- Test filtering: run specific tests or skip problematic ones with -only-testing/-skip-testing

## Parameters

### Required
- **projectPath** (string): Path to .xcodeproj or .xcworkspace file
- **scheme** (string): Test scheme name (use xcodebuild-list to discover)

### Optional
- **configuration** (string, default: 'Debug'): Build configuration (Debug/Release, defaults to cached or "Debug")
- **destination** (string): Test destination (e.g., "platform=iOS Simulator,id=<UDID>")
- **sdk** (string): SDK to test against (e.g., "iphonesimulator")
- **derivedDataPath** (string): Custom derived data path
- **testPlan** (string): Test plan name to execute
- **onlyTesting** (string[]): Array of test identifiers to run exclusively
- **skipTesting** (string[]): Array of test identifiers to skip
- **testWithoutBuilding** (boolean): Run tests without building (requires prior build)

## Returns

Structured JSON with testId (for progressive disclosure), success status, test summary (total/passed/failed/skipped counts), failure details (first 3 failures), and cache metadata showing which smart defaults were applied. Use xcodebuild-get-details with testId for full logs.

## Examples

### Run all tests with smart defaults
\`\`\`typescript
const result = await xcodebuildTestTool({
  projectPath: "/path/to/MyApp.xcodeproj",
  scheme: "MyApp"
});
\`\`\`

### Run specific tests only
\`\`\`typescript
const filtered = await xcodebuildTestTool({
  projectPath: "/path/to/MyApp.xcworkspace",
  scheme: "MyApp",
  onlyTesting: ["MyAppTests/testLogin", "MyAppTests/testLogout"]
});
\`\`\`

### Fast iteration with test-without-building
\`\`\`typescript
const quick = await xcodebuildTestTool({
  projectPath: "/path/to/MyApp.xcodeproj",
  scheme: "MyApp",
  testWithoutBuilding: true
});
\`\`\`

## Related Tools

- xcodebuild-build: Build before testing
- xcodebuild-get-details: Get full test logs (use with testId)
- simctl-list: See available test simulators
`;
