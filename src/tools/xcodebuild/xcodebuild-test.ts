import { validateProjectPath, validateScheme } from '../../utils/validation.js';
import { executeCommand, buildXcodebuildCommand } from '../../utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { responseCache, extractTestSummary } from '../../utils/response-cache.js';
import { projectCache, type BuildConfig } from '../../state/project-cache.js';
import { simulatorCache } from '../../state/simulator-cache.js';

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

export async function xcodebuildTestTool(args: any) {
  const {
    projectPath,
    scheme,
    configuration = 'Debug',
    destination,
    sdk,
    derivedDataPath,
    testPlan,
    onlyTesting,
    skipTesting,
    testWithoutBuilding = false,
  } = args as TestToolArgs;

  try {
    // Validate inputs
    await validateProjectPath(projectPath);
    validateScheme(scheme);

    // Get smart defaults from cache (reuse build configuration intelligence)
    const preferredConfig = await projectCache.getPreferredBuildConfig(projectPath);
    const smartDestination =
      destination || (await getSmartDestination(preferredConfig, projectPath));

    // Build final configuration
    const finalConfig: BuildConfig & { testPlan?: string } = {
      scheme,
      configuration: configuration || preferredConfig?.configuration || 'Debug',
      destination: smartDestination,
      sdk: sdk || preferredConfig?.sdk,
      derivedDataPath: derivedDataPath || preferredConfig?.derivedDataPath,
      testPlan,
    };

    // Build test command
    const action = testWithoutBuilding ? 'test-without-building' : 'test';
    const command = buildTestCommand(action, projectPath, finalConfig, {
      onlyTesting,
      skipTesting,
    });

    console.error(`[xcodebuild-test] Executing: ${command}`);

    // Execute command with extended timeout for tests
    const startTime = Date.now();
    const result = await executeCommand(command, {
      timeout: 900000, // 15 minutes for tests (longer than builds)
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for test logs
    });
    const duration = Date.now() - startTime;

    // Extract test summary
    const summary = extractTestSummary(result.stdout, result.stderr, result.code);

    // Parse detailed test results
    const testDetails = parseTestResults(result.stdout, result.stderr);

    // Record test result in project cache (similar to build)
    projectCache.recordBuildResult(projectPath, finalConfig, {
      timestamp: new Date(),
      success: summary.success,
      duration,
      errorCount: testDetails.failedTests,
      warningCount: 0, // Tests don't typically have warnings
      buildSizeBytes: result.stdout.length + result.stderr.length,
    });

    // Record simulator usage if destination was used
    if (finalConfig.destination && finalConfig.destination.includes('Simulator')) {
      const udidMatch = finalConfig.destination.match(/id=([A-F0-9-]+)/);
      if (udidMatch) {
        simulatorCache.recordSimulatorUsage(udidMatch[1], projectPath);
      }
    }

    // Store full output in cache for progressive disclosure
    const cacheId = responseCache.store({
      tool: 'xcodebuild-test',
      fullOutput: result.stdout,
      stderr: result.stderr,
      exitCode: result.code,
      command,
      metadata: {
        projectPath,
        scheme: finalConfig.scheme,
        configuration: finalConfig.configuration,
        destination: finalConfig.destination,
        sdk: finalConfig.sdk,
        testPlan: finalConfig.testPlan,
        duration,
        success: summary.success,
        totalTests: testDetails.totalTests,
        passedTests: testDetails.passedTests,
        failedTests: testDetails.failedTests,
        skippedTests: testDetails.skippedTests,
        testWithoutBuilding,
        smartDestinationUsed: !destination && smartDestination !== destination,
        smartConfigurationUsed: !args.configuration && finalConfig.configuration !== 'Debug',
      },
    });

    // Create concise response with smart defaults transparency
    const usedSmartDestination = !destination && smartDestination;
    const usedSmartConfiguration = !configuration && finalConfig.configuration !== 'Debug';
    const hasPreferredConfig = !!preferredConfig;

    const responseData = {
      testId: cacheId,
      success: summary.success,
      summary: {
        totalTests: testDetails.totalTests,
        passed: testDetails.passedTests,
        failed: testDetails.failedTests,
        skipped: testDetails.skippedTests,
        duration,
        scheme: finalConfig.scheme,
        configuration: finalConfig.configuration,
        destination: finalConfig.destination,
        testPlan: finalConfig.testPlan,
      },
      failedTests: testDetails.failedTestsList.slice(0, 5), // Show first 5 failures
      intelligence: {
        usedSmartDestination,
        usedSmartConfiguration,
        hasPreferredConfig,
        simulatorUsageRecorded: !!(
          finalConfig.destination && finalConfig.destination.includes('Simulator')
        ),
        configurationLearned: summary.success,
      },
      nextSteps: summary.success
        ? [
            `✅ All tests passed (${testDetails.passedTests}/${testDetails.totalTests}) in ${duration}ms`,
            ...(usedSmartDestination
              ? [`🧠 Used smart simulator: ${finalConfig.destination}`]
              : []),
            ...(hasPreferredConfig ? [`📊 Applied cached project preferences`] : []),
            `Use 'xcodebuild-get-details' with testId '${cacheId}' for full test logs`,
            `Tip: This successful configuration is now cached for future test runs`,
          ]
        : [
            `❌ Tests failed: ${testDetails.failedTests} of ${testDetails.totalTests} tests failed`,
            `Failed tests: ${testDetails.failedTestsList.slice(0, 3).join(', ')}${testDetails.failedTestsList.length > 3 ? '...' : ''}`,
            `Use 'xcodebuild-get-details' with testId '${cacheId}' for full test logs and failures`,
            ...(usedSmartDestination
              ? [`💡 Try 'simctl-list' to see other available simulators`]
              : []),
          ],
      availableDetails: ['full-log', 'errors-only', 'summary', 'command'],
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: !summary.success,
    };
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

async function getSmartDestination(
  preferredConfig: BuildConfig | null,
  projectPath: string
): Promise<string | undefined> {
  // If preferred config has a destination, use it
  if (preferredConfig?.destination) {
    return preferredConfig.destination;
  }

  // Try to get a smart simulator destination with project-specific preference
  try {
    const preferredSim = await simulatorCache.getPreferredSimulator(projectPath);
    if (preferredSim) {
      return `platform=iOS Simulator,id=${preferredSim.udid}`;
    }
  } catch {
    // Fallback to no destination if simulator cache fails
  }

  // Return undefined to let xcodebuild use its own defaults
  return undefined;
}

function buildTestCommand(
  action: string,
  projectPath: string,
  config: BuildConfig & { testPlan?: string },
  filters: { onlyTesting?: string[]; skipTesting?: string[] }
): string {
  // Start with base xcodebuild command
  let command = buildXcodebuildCommand(action, projectPath, config as any);

  // Add test plan if specified
  if (config.testPlan) {
    command += ` -testPlan "${config.testPlan}"`;
  }

  // Add test filters
  if (filters.onlyTesting && filters.onlyTesting.length > 0) {
    filters.onlyTesting.forEach(test => {
      command += ` -only-testing:"${test}"`;
    });
  }

  if (filters.skipTesting && filters.skipTesting.length > 0) {
    filters.skipTesting.forEach(test => {
      command += ` -skip-testing:"${test}"`;
    });
  }

  return command;
}

interface TestResults {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  failedTestsList: string[];
}

function parseTestResults(stdout: string, stderr: string): TestResults {
  const output = stdout + '\n' + stderr;
  const lines = output.split('\n');

  const results: TestResults = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    failedTestsList: [],
  };

  // Parse xcodebuild test output format
  // Look for patterns like:
  // "Test Case '-[MyAppTests testExample]' passed (0.001 seconds)"
  // "Test Case '-[MyAppTests testFailing]' failed (0.002 seconds)"
  // "Executed 10 tests, with 2 failures (0 unexpected) in 0.123 (0.125) seconds"

  for (const line of lines) {
    // Count individual test results
    if (line.includes("Test Case '-[") || line.includes("Test Case '-[")) {
      if (line.includes(' passed ')) {
        results.passedTests++;
      } else if (line.includes(' failed ')) {
        results.failedTests++;
        // Extract test name
        const match = line.match(/Test Case '-\[(.+?)\]'/);
        if (match) {
          results.failedTestsList.push(match[1]);
        }
      } else if (line.includes(' skipped ')) {
        results.skippedTests++;
      }
    }

    // Look for summary line: "Executed X tests, with Y failures..."
    const summaryMatch = line.match(/Executed (\d+) tests?, with (\d+) failures?/);
    if (summaryMatch) {
      const executed = parseInt(summaryMatch[1], 10);
      const failures = parseInt(summaryMatch[2], 10);
      results.totalTests = Math.max(results.totalTests, executed);
      results.failedTests = Math.max(results.failedTests, failures);
      results.passedTests = Math.max(results.passedTests, executed - failures);
    }
  }

  // Fallback: if we didn't find the summary, calculate from counted tests
  if (results.totalTests === 0) {
    results.totalTests = results.passedTests + results.failedTests + results.skippedTests;
  }

  return results;
}
