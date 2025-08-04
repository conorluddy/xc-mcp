import { jest } from '@jest/globals';
import { xcodebuildListTool } from '../../../src/tools/xcodebuild/list.js';
import { validateProjectPath } from '../../../src/utils/validation.js';
import { executeCommand, buildXcodebuildCommand } from '../../../src/utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/utils/validation.js', () => ({
  validateProjectPath: jest.fn(),
}));

jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
  buildXcodebuildCommand: jest.fn(),
}));

const mockValidateProjectPath = validateProjectPath as jest.MockedFunction<
  typeof validateProjectPath
>;
const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockBuildXcodebuildCommand = buildXcodebuildCommand as jest.MockedFunction<
  typeof buildXcodebuildCommand
>;

describe('xcodebuildListTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProjectInfo = {
    project: {
      name: 'MyApp',
      targets: ['MyApp', 'MyAppTests'],
      schemes: ['MyApp', 'MyAppTests'],
      configurations: ['Debug', 'Release'],
    },
  };

  it('should list project information with JSON output format', async () => {
    const args = { projectPath: '/path/to/MyApp.xcodeproj' };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -project "/path/to/MyApp.xcodeproj" -json'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(mockProjectInfo),
      stderr: '',
    });

    const result = await xcodebuildListTool(args);

    expect(mockValidateProjectPath).toHaveBeenCalledWith('/path/to/MyApp.xcodeproj');
    expect(mockBuildXcodebuildCommand).toHaveBeenCalledWith('-list', '/path/to/MyApp.xcodeproj', {
      json: true,
    });
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'xcodebuild -list -project "/path/to/MyApp.xcodeproj" -json'
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual(mockProjectInfo);
  });

  it('should list project information with text output format', async () => {
    const args = { projectPath: '/path/to/MyApp.xcodeproj', outputFormat: 'text' as const };
    const textOutput = 'Targets:\n    MyApp\n    MyAppTests\n\nSchemes:\n    MyApp\n    MyAppTests';

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -project "/path/to/MyApp.xcodeproj"'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: textOutput,
      stderr: '',
    });

    const result = await xcodebuildListTool(args);

    expect(mockBuildXcodebuildCommand).toHaveBeenCalledWith('-list', '/path/to/MyApp.xcodeproj', {
      json: false,
    });

    expect(result.content[0].text).toBe(textOutput);
  });

  it('should default to JSON output format when not specified', async () => {
    const args = { projectPath: '/path/to/MyApp.xcodeproj' };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -project "/path/to/MyApp.xcodeproj" -json'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(mockProjectInfo),
      stderr: '',
    });

    await xcodebuildListTool(args);

    expect(mockBuildXcodebuildCommand).toHaveBeenCalledWith('-list', '/path/to/MyApp.xcodeproj', {
      json: true, // Should default to JSON
    });
  });

  it('should handle validation errors', async () => {
    const args = { projectPath: '/invalid/path' };

    mockValidateProjectPath.mockRejectedValue(
      new McpError(ErrorCode.InvalidParams, 'Project path does not exist')
    );

    await expect(xcodebuildListTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildListTool(args)).rejects.toThrow('Project path does not exist');

    expect(mockBuildXcodebuildCommand).not.toHaveBeenCalled();
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it('should handle xcodebuild command failures', async () => {
    const args = { projectPath: '/path/to/MyApp.xcodeproj' };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -project "/path/to/MyApp.xcodeproj" -json'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'xcodebuild: error: project not found',
    });

    await expect(xcodebuildListTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildListTool(args)).rejects.toThrow(
      'Failed to list project information: xcodebuild: error: project not found'
    );
  });

  it('should handle JSON parsing errors', async () => {
    const args = { projectPath: '/path/to/MyApp.xcodeproj', outputFormat: 'json' as const };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -project "/path/to/MyApp.xcodeproj" -json'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Invalid JSON output',
      stderr: '',
    });

    await expect(xcodebuildListTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildListTool(args)).rejects.toThrow('Failed to parse xcodebuild output:');
  });

  it('should handle executeCommand throwing errors', async () => {
    const args = { projectPath: '/path/to/MyApp.xcodeproj' };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -project "/path/to/MyApp.xcodeproj" -json'
    );
    mockExecuteCommand.mockRejectedValue(new Error('Command execution failed'));

    await expect(xcodebuildListTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildListTool(args)).rejects.toThrow(
      'xcodebuild-list failed: Command execution failed'
    );
  });

  it('should handle non-Error exceptions', async () => {
    const args = { projectPath: '/path/to/MyApp.xcodeproj' };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -project "/path/to/MyApp.xcodeproj" -json'
    );
    mockExecuteCommand.mockRejectedValue('String error');

    await expect(xcodebuildListTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildListTool(args)).rejects.toThrow('xcodebuild-list failed: String error');
  });

  it('should preserve McpError instances', async () => {
    const args = { projectPath: '/path/to/MyApp.xcodeproj' };
    const originalError = new McpError(ErrorCode.InvalidParams, 'Original error');

    mockValidateProjectPath.mockRejectedValue(originalError);

    await expect(xcodebuildListTool(args)).rejects.toBe(originalError);
  });

  it('should handle workspace files', async () => {
    const args = { projectPath: '/path/to/MyApp.xcworkspace' };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -workspace "/path/to/MyApp.xcworkspace" -json'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(mockProjectInfo),
      stderr: '',
    });

    const result = await xcodebuildListTool(args);

    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(mockProjectInfo);
  });

  it('should handle empty project info', async () => {
    const args = { projectPath: '/path/to/Empty.xcodeproj' };
    const emptyProjectInfo = { project: { targets: [], schemes: [], configurations: [] } };

    mockValidateProjectPath.mockResolvedValue(undefined);
    mockBuildXcodebuildCommand.mockReturnValue(
      'xcodebuild -list -project "/path/to/Empty.xcodeproj" -json'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(emptyProjectInfo),
      stderr: '',
    });

    const result = await xcodebuildListTool(args);

    expect(result.content[0].type).toBe('text');
    expect(JSON.parse(result.content[0].text)).toEqual(emptyProjectInfo);
  });
});
