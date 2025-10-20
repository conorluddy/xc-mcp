import { jest } from '@jest/globals';
import { xcodebuildTestTool } from '../../../src/tools/xcodebuild/xcodebuild-test.js';
import { validateProjectPath, validateScheme } from '../../../src/utils/validation.js';
import { executeCommand } from '../../../src/utils/command.js';
import { responseCache, extractTestSummary } from '../../../src/utils/response-cache.js';
import { projectCache } from '../../../src/state/project-cache.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/utils/validation.js', () => ({
  validateProjectPath: jest.fn(),
  validateScheme: jest.fn(),
}));

jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
  buildXcodebuildCommand: jest.fn((action: string) => `xcodebuild ${action}`),
}));

jest.mock('../../../src/utils/response-cache.js', () => ({
  responseCache: {
    store: jest.fn(() => 'test-cache-id-123'),
  },
  extractTestSummary: jest.fn(() => ({
    success: true,
    exitCode: 0,
    testsRun: 10,
    passed: true,
    resultSummary: ['Test Suite passed'],
  })),
}));

jest.mock('../../../src/state/project-cache.js', () => ({
  projectCache: {
    getPreferredBuildConfig: jest.fn(),
    recordBuildResult: jest.fn(),
  },
}));

jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    getPreferredSimulator: jest.fn(),
    recordSimulatorUsage: jest.fn(),
  },
}));

const mockValidateProjectPath = validateProjectPath as jest.MockedFunction<
  typeof validateProjectPath
>;
const mockValidateScheme = validateScheme as jest.MockedFunction<typeof validateScheme>;
const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockExtractTestSummary = extractTestSummary as jest.MockedFunction<typeof extractTestSummary>;

// Mock console.error to suppress output during tests
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('xcodebuildTestTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  it('should run tests successfully', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
      configuration: 'Debug',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    const mockStartTime = 1640995200000;
    const mockEndTime = mockStartTime + 15000; // 15 seconds
    jest.spyOn(Date, 'now').mockReturnValueOnce(mockStartTime).mockReturnValueOnce(mockEndTime);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: `Test Suite 'All tests' passed at 2024-01-01
Executed 10 tests, with 0 failures (0 unexpected) in 0.123 (0.125) seconds
Test Case '-[MyAppTests testExample]' passed (0.001 seconds)`,
      stderr: '',
    });

    const result = await xcodebuildTestTool(args);

    expect(mockValidateProjectPath).toHaveBeenCalledWith('/path/to/MyApp.xcodeproj');
    expect(mockValidateScheme).toHaveBeenCalledWith('MyApp');
    expect(mockExecuteCommand).toHaveBeenCalled();

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBe(false);

    const response = JSON.parse(result.content[0].text);
    expect(response.testId).toBe('test-cache-id-123');
    expect(response.success).toBe(true);
    expect(response.summary.totalTests).toBeGreaterThan(0);
  });

  it('should handle test failures', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    // Override the mock for this test to return failure
    mockExtractTestSummary.mockReturnValueOnce({
      success: false,
      exitCode: 1,
      testsRun: 10,
      passed: false,
      resultSummary: ['Test Suite failed'],
    });

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995220000);

    mockExecuteCommand.mockResolvedValue({
      code: 1,
      stdout: `Test Suite 'All tests' failed at 2024-01-01
Executed 10 tests, with 3 failures (0 unexpected) in 0.123 (0.125) seconds
Test Case '-[MyAppTests testExample]' passed (0.001 seconds)
Test Case '-[MyAppTests testFailure]' failed (0.002 seconds)
Test Case '-[MyAppTests testAnotherFailure]' failed (0.003 seconds)`,
      stderr: '',
    });

    const result = await xcodebuildTestTool(args);

    expect(result.isError).toBe(true);

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false); // Test failed
    expect(response.summary.failed).toBeGreaterThan(0);
  });

  it('should use test-without-building when specified', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
      testWithoutBuilding: true,
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995210000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Test Suite passed\nExecuted 5 tests, with 0 failures',
      stderr: '',
    });

    await xcodebuildTestTool(args);

    // Verify that the command includes 'test-without-building'
    const executedCommand = mockExecuteCommand.mock.calls[0][0];
    expect(executedCommand).toContain('test-without-building');
  });

  it('should support test filtering with onlyTesting', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
      onlyTesting: ['MyAppTests/testExample', 'MyAppTests/testAnother'],
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995205000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Test Suite passed\nExecuted 2 tests, with 0 failures',
      stderr: '',
    });

    await xcodebuildTestTool(args);

    const executedCommand = mockExecuteCommand.mock.calls[0][0];
    expect(executedCommand).toContain('-only-testing:"MyAppTests/testExample"');
    expect(executedCommand).toContain('-only-testing:"MyAppTests/testAnother"');
  });

  it('should support test filtering with skipTesting', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
      skipTesting: ['MyAppTests/testSlow'],
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995212000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Test Suite passed\nExecuted 8 tests, with 0 failures',
      stderr: '',
    });

    await xcodebuildTestTool(args);

    const executedCommand = mockExecuteCommand.mock.calls[0][0];
    expect(executedCommand).toContain('-skip-testing:"MyAppTests/testSlow"');
  });

  it('should support test plan execution', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
      testPlan: 'MyTestPlan',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995218000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Test Suite passed\nExecuted 15 tests, with 0 failures',
      stderr: '',
    });

    await xcodebuildTestTool(args);

    const executedCommand = mockExecuteCommand.mock.calls[0][0];
    expect(executedCommand).toContain('-testPlan "MyTestPlan"');
  });

  it('should use smart destination from cache', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue({
      scheme: 'MyApp',
      configuration: 'Debug',
      destination: 'platform=iOS Simulator,id=ABC-123',
    });

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995215000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Test Suite passed\nExecuted 10 tests, with 0 failures',
      stderr: '',
    });

    const result = await xcodebuildTestTool(args);

    const response = JSON.parse(result.content[0].text);
    expect(response.intelligence.hasPreferredConfig).toBe(true);
  });

  it('should record simulator usage', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
      destination: 'platform=iOS Simulator,id=DEF-456',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995220000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Test Suite passed\nExecuted 10 tests, with 0 failures',
      stderr: '',
    });

    await xcodebuildTestTool(args);

    expect(simulatorCache.recordSimulatorUsage).toHaveBeenCalledWith(
      'DEF-456',
      '/path/to/MyApp.xcodeproj'
    );
  });

  it('should handle project path validation errors', async () => {
    const args = {
      projectPath: '/invalid/path',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockRejectedValue(
      new McpError(ErrorCode.InvalidParams, 'Project path does not exist')
    );

    await expect(xcodebuildTestTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildTestTool(args)).rejects.toThrow('Project path does not exist');
  });

  it('should handle scheme validation errors', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: '',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockImplementation(() => {
      throw new McpError(ErrorCode.InvalidParams, 'Scheme is required');
    });

    await expect(xcodebuildTestTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildTestTool(args)).rejects.toThrow('Scheme is required');
  });

  it('should use extended timeout for tests', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995260000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Test Suite passed\nExecuted 10 tests, with 0 failures',
      stderr: '',
    });

    await xcodebuildTestTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        timeout: 900000, // 15 minutes for tests
        maxBuffer: 50 * 1024 * 1024, // 50MB
      })
    );
  });

  it('should store test results in response cache', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    (projectCache.getPreferredBuildConfig as jest.MockedFunction<any>).mockResolvedValue(null);

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995220000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Test Suite passed\nExecuted 10 tests, with 0 failures',
      stderr: '',
    });

    await xcodebuildTestTool(args);

    expect(responseCache.store).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'xcodebuild-test',
        exitCode: 0,
      })
    );
  });
});
