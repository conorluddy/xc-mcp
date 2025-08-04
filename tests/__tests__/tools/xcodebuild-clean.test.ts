import { jest } from '@jest/globals';
import { xcodebuildCleanTool } from '../../../src/tools/xcodebuild/clean.js';
import { validateProjectPath, validateScheme } from '../../../src/utils/validation.js';
import { executeCommand, buildXcodebuildCommand } from '../../../src/utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/utils/validation.js', () => ({
  validateProjectPath: jest.fn(),
  validateScheme: jest.fn(),
}));

jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
  buildXcodebuildCommand: jest.fn(),
}));

const mockValidateProjectPath = validateProjectPath as jest.MockedFunction<
  typeof validateProjectPath
>;
const mockValidateScheme = validateScheme as jest.MockedFunction<typeof validateScheme>;
const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockBuildXcodebuildCommand = buildXcodebuildCommand as jest.MockedFunction<
  typeof buildXcodebuildCommand
>;

// Mock console.error to suppress output during tests
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('xcodebuildCleanTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  it('should clean project successfully', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
      configuration: 'Debug',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild clean -project "/path/to/MyApp.xcodeproj" -scheme "MyApp" -configuration Debug'
    );

    // Mock Date.now for consistent timing
    const mockStartTime = 1640995200000;
    const mockEndTime = mockStartTime + 5000; // 5 seconds
    jest.spyOn(Date, 'now').mockReturnValueOnce(mockStartTime).mockReturnValueOnce(mockEndTime);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Clean succeeded',
      stderr: '',
    });

    const result = await xcodebuildCleanTool(args);

    expect(mockValidateProjectPath).toHaveBeenCalledWith('/path/to/MyApp.xcodeproj');
    expect(mockValidateScheme).toHaveBeenCalledWith('MyApp');
    expect(mockBuildXcodebuildCommand).toHaveBeenCalledWith('clean', '/path/to/MyApp.xcodeproj', {
      scheme: 'MyApp',
      configuration: 'Debug',
    });
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'xcodebuild clean -project "/path/to/MyApp.xcodeproj" -scheme "MyApp" -configuration Debug',
      { timeout: 180000 }
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      '[xcodebuild-clean] Executing: xcodebuild clean -project "/path/to/MyApp.xcodeproj" -scheme "MyApp" -configuration Debug'
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBe(false);

    const response = JSON.parse(result.content[0].text);
    expect(response).toEqual({
      success: true,
      command:
        'xcodebuild clean -project "/path/to/MyApp.xcodeproj" -scheme "MyApp" -configuration Debug',
      duration: 5000,
      output: 'Clean succeeded',
      error: '',
      exitCode: 0,
    });
  });

  it('should clean project without configuration', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild clean -project "/path/to/MyApp.xcodeproj" -scheme "MyApp"'
    );

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995203000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Clean succeeded',
      stderr: '',
    });

    const result = await xcodebuildCleanTool(args);

    expect(mockBuildXcodebuildCommand).toHaveBeenCalledWith('clean', '/path/to/MyApp.xcodeproj', {
      scheme: 'MyApp',
      configuration: undefined,
    });

    expect(result.isError).toBe(false);

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.duration).toBe(3000);
  });

  it('should handle project path validation errors', async () => {
    const args = {
      projectPath: '/invalid/path',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockRejectedValue(
      new McpError(ErrorCode.InvalidParams, 'Project path does not exist')
    );

    await expect(xcodebuildCleanTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildCleanTool(args)).rejects.toThrow('Project path does not exist');

    expect(mockValidateScheme).not.toHaveBeenCalled();
    expect(mockBuildXcodebuildCommand).not.toHaveBeenCalled();
    expect(mockExecuteCommand).not.toHaveBeenCalled();
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

    await expect(xcodebuildCleanTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildCleanTool(args)).rejects.toThrow('Scheme is required');

    expect(mockBuildXcodebuildCommand).not.toHaveBeenCalled();
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it('should handle clean command failures', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild clean -project "/path/to/MyApp.xcodeproj" -scheme "MyApp"'
    );

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995210000);

    mockExecuteCommand.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Clean failed: Scheme "MyApp" not found',
    });

    const result = await xcodebuildCleanTool(args);

    expect(result.isError).toBe(true);

    const response = JSON.parse(result.content[0].text);
    expect(response).toEqual({
      success: false,
      command: 'xcodebuild clean -project "/path/to/MyApp.xcodeproj" -scheme "MyApp"',
      duration: 10000,
      output: '',
      error: 'Clean failed: Scheme "MyApp" not found',
      exitCode: 1,
    });
  });

  it('should handle executeCommand throwing errors', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue('xcodebuild clean');
    mockExecuteCommand.mockRejectedValue(new Error('Command execution failed'));

    await expect(xcodebuildCleanTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildCleanTool(args)).rejects.toThrow(
      'xcodebuild-clean failed: Command execution failed'
    );
  });

  it('should handle non-Error exceptions', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue('xcodebuild clean');
    mockExecuteCommand.mockRejectedValue('String error');

    await expect(xcodebuildCleanTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildCleanTool(args)).rejects.toThrow(
      'xcodebuild-clean failed: String error'
    );
  });

  it('should preserve McpError instances', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };
    const originalError = new McpError(ErrorCode.InvalidParams, 'Original error');

    mockValidateProjectPath.mockRejectedValue(originalError);

    await expect(xcodebuildCleanTool(args)).rejects.toBe(originalError);
  });

  it('should handle workspace files', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcworkspace',
      scheme: 'MyApp',
      configuration: 'Release',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild clean -workspace "/path/to/MyApp.xcworkspace" -scheme "MyApp" -configuration Release'
    );

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995202000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Clean succeeded',
      stderr: '',
    });

    const result = await xcodebuildCleanTool(args);

    expect(result.isError).toBe(false);
    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.command).toContain('workspace');
  });

  it('should handle partial clean with warnings', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue('xcodebuild clean');

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995208000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Clean succeeded',
      stderr: 'warning: some files could not be removed',
    });

    const result = await xcodebuildCleanTool(args);

    expect(result.isError).toBe(false);

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.error).toBe('warning: some files could not be removed');
    expect(response.duration).toBe(8000);
  });

  it('should handle timeout correctly', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue('xcodebuild clean');

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995260000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Clean succeeded',
      stderr: '',
    });

    await xcodebuildCleanTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith('xcodebuild clean', { timeout: 180000 }); // 3 minutes
  });

  it('should log command execution', async () => {
    const args = {
      projectPath: '/path/to/MyApp.xcodeproj',
      scheme: 'MyApp',
    };
    const expectedCommand = 'xcodebuild clean -project "/path/to/MyApp.xcodeproj" -scheme "MyApp"';

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockValidateScheme.mockReturnValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(expectedCommand);

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995201000);

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Clean succeeded',
      stderr: '',
    });

    await xcodebuildCleanTool(args);

    expect(mockConsoleError).toHaveBeenCalledWith(
      `[xcodebuild-clean] Executing: ${expectedCommand}`
    );
  });
});
