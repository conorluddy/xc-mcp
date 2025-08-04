import { jest } from '@jest/globals';
import { xcodebuildVersionTool } from '../../../src/tools/xcodebuild/version.js';
import { executeCommand } from '../../../src/utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

describe('xcodebuildVersionTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockVersionInfo = {
    productBuildVersion: '15E204a',
    productName: 'Xcode',
    productVersion: '15.3',
  };

  it('should get version information with JSON output format by default', async () => {
    const args = {};

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(mockVersionInfo),
      stderr: '',
    });

    const result = await xcodebuildVersionTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith('xcodebuild -version -json');

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual(mockVersionInfo);
  });

  it('should get version information with text output format', async () => {
    const args = { outputFormat: 'text' as const };
    const textOutput = 'Xcode 15.3\nBuild version 15E204a';

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: textOutput,
      stderr: '',
    });

    const result = await xcodebuildVersionTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith('xcodebuild -version');
    expect(result.content[0].text).toBe(textOutput);
  });

  it('should include SDK parameter when specified', async () => {
    const args = { sdk: 'iphoneos' };

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(mockVersionInfo),
      stderr: '',
    });

    await xcodebuildVersionTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith('xcodebuild -version -sdk iphoneos -json');
  });

  it('should handle SDK parameter with text format', async () => {
    const args = { sdk: 'iphonesimulator', outputFormat: 'text' as const };
    const textOutput = 'iOS Simulator SDK version';

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: textOutput,
      stderr: '',
    });

    await xcodebuildVersionTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith('xcodebuild -version -sdk iphonesimulator');
  });

  it('should handle xcodebuild command failures', async () => {
    const args = {};

    mockExecuteCommand.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'xcodebuild: error: SDK not found',
    });

    await expect(xcodebuildVersionTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildVersionTool(args)).rejects.toThrow(
      'Failed to get version information: xcodebuild: error: SDK not found'
    );
  });

  it('should handle JSON parsing errors gracefully', async () => {
    const args = { outputFormat: 'json' as const };
    const textOutput = 'Xcode 15.3\nBuild version 15E204a';

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: textOutput, // Invalid JSON
      stderr: '',
    });

    const result = await xcodebuildVersionTool(args);

    expect(result.content[0].type).toBe('text');

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual({
      version: textOutput,
      format: 'text',
    });
  });

  it('should handle executeCommand throwing errors', async () => {
    const args = {};

    mockExecuteCommand.mockRejectedValue(new Error('Command execution failed'));

    await expect(xcodebuildVersionTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildVersionTool(args)).rejects.toThrow(
      'xcodebuild-version failed: Command execution failed'
    );
  });

  it('should handle non-Error exceptions', async () => {
    const args = {};

    mockExecuteCommand.mockRejectedValue('String error');

    await expect(xcodebuildVersionTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildVersionTool(args)).rejects.toThrow(
      'xcodebuild-version failed: String error'
    );
  });

  it('should preserve McpError instances', async () => {
    const args = {};
    const originalError = new McpError(ErrorCode.InvalidParams, 'Original error');

    mockExecuteCommand.mockRejectedValue(originalError);

    await expect(xcodebuildVersionTool(args)).rejects.toBe(originalError);
  });

  it('should handle complex SDK version information', async () => {
    const args = { sdk: 'macosx' };
    const macosVersionInfo = {
      productBuildVersion: '15E204a',
      productName: 'macOS',
      productVersion: '14.4',
      platform: {
        name: 'macOS',
        identifier: 'macosx',
        version: '14.4',
      },
    };

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(macosVersionInfo),
      stderr: '',
    });

    const result = await xcodebuildVersionTool(args);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual(macosVersionInfo);
  });

  it('should handle empty version output', async () => {
    const args = {};

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: '',
      stderr: '',
    });

    const result = await xcodebuildVersionTool(args);

    // Should handle empty JSON gracefully
    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual({
      version: '',
      format: 'text',
    });
  });

  it('should handle various SDK types', async () => {
    const sdkTypes = [
      'iphoneos',
      'iphonesimulator',
      'macosx',
      'watchos',
      'watchsimulator',
      'appletvos',
      'appletvsimulator',
    ];

    for (const sdk of sdkTypes) {
      jest.clearAllMocks();

      mockExecuteCommand.mockResolvedValue({
        code: 0,
        stdout: JSON.stringify({ sdk }),
        stderr: '',
      });

      await xcodebuildVersionTool({ sdk });

      expect(mockExecuteCommand).toHaveBeenCalledWith(`xcodebuild -version -sdk ${sdk} -json`);
    }
  });
});
