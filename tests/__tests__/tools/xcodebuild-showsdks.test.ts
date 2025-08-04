import { jest } from '@jest/globals';
import { xcodebuildShowSDKsTool } from '../../../src/tools/xcodebuild/showsdks.js';
import { executeCommand } from '../../../src/utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

describe('xcodebuildShowSDKsTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSDKInfo = {
    sdks: [
      {
        canonicalName: 'iphoneos17.4',
        displayName: 'iOS 17.4',
        platform: 'iOS',
        version: '17.4',
      },
      {
        canonicalName: 'iphonesimulator17.4',
        displayName: 'iOS Simulator 17.4',
        platform: 'iOS Simulator',
        version: '17.4',
      },
      {
        canonicalName: 'macosx14.4',
        displayName: 'macOS 14.4',
        platform: 'macOS',
        version: '14.4',
      },
    ],
  };

  it('should show SDKs with JSON output format by default', async () => {
    const args = {};

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(mockSDKInfo),
      stderr: '',
    });

    const result = await xcodebuildShowSDKsTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith('xcodebuild -showsdks -json');

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual(mockSDKInfo);
  });

  it('should show SDKs with text output format', async () => {
    const args = { outputFormat: 'text' as const };
    const textOutput = `iOS SDKs:
\tiOS 17.4                      \t-sdk iphoneos17.4

iOS Simulator SDKs:
\tiOS Simulator 17.4            \t-sdk iphonesimulator17.4

macOS SDKs:
\tmacOS 14.4                    \t-sdk macosx14.4`;

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: textOutput,
      stderr: '',
    });

    const result = await xcodebuildShowSDKsTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith('xcodebuild -showsdks');
    expect(result.content[0].text).toBe(textOutput);
  });

  it('should handle xcodebuild command failures', async () => {
    const args = {};

    mockExecuteCommand.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'xcodebuild: error: unable to find any available SDKs',
    });

    await expect(xcodebuildShowSDKsTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildShowSDKsTool(args)).rejects.toThrow(
      'Failed to show SDKs: xcodebuild: error: unable to find any available SDKs'
    );
  });

  it('should handle JSON parsing errors', async () => {
    const args = { outputFormat: 'json' as const };

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Invalid JSON output',
      stderr: '',
    });

    await expect(xcodebuildShowSDKsTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildShowSDKsTool(args)).rejects.toThrow(
      'Failed to parse xcodebuild -showsdks output:'
    );
  });

  it('should handle executeCommand throwing errors', async () => {
    const args = {};

    mockExecuteCommand.mockRejectedValue(new Error('Command execution failed'));

    await expect(xcodebuildShowSDKsTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildShowSDKsTool(args)).rejects.toThrow(
      'xcodebuild-showsdks failed: Command execution failed'
    );
  });

  it('should handle non-Error exceptions', async () => {
    const args = {};

    mockExecuteCommand.mockRejectedValue('String error');

    await expect(xcodebuildShowSDKsTool(args)).rejects.toThrow(McpError);
    await expect(xcodebuildShowSDKsTool(args)).rejects.toThrow(
      'xcodebuild-showsdks failed: String error'
    );
  });

  it('should preserve McpError instances', async () => {
    const args = {};
    const originalError = new McpError(ErrorCode.InvalidParams, 'Original error');

    mockExecuteCommand.mockRejectedValue(originalError);

    await expect(xcodebuildShowSDKsTool(args)).rejects.toBe(originalError);
  });

  it('should handle empty SDK list', async () => {
    const args = {};
    const emptySDKInfo = { sdks: [] };

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(emptySDKInfo),
      stderr: '',
    });

    const result = await xcodebuildShowSDKsTool(args);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual(emptySDKInfo);
  });

  it('should handle comprehensive SDK information', async () => {
    const args = {};
    const comprehensiveSDKInfo = {
      sdks: [
        {
          canonicalName: 'iphoneos17.4',
          displayName: 'iOS 17.4',
          platform: 'iOS',
          version: '17.4',
          platformPath: '/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform',
          sdkPath:
            '/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS17.4.sdk',
        },
        {
          canonicalName: 'watchos10.4',
          displayName: 'watchOS 10.4',
          platform: 'watchOS',
          version: '10.4',
          platformPath: '/Applications/Xcode.app/Contents/Developer/Platforms/WatchOS.platform',
          sdkPath:
            '/Applications/Xcode.app/Contents/Developer/Platforms/WatchOS.platform/Developer/SDKs/WatchOS10.4.sdk',
        },
        {
          canonicalName: 'appletvos17.4',
          displayName: 'tvOS 17.4',
          platform: 'tvOS',
          version: '17.4',
          platformPath: '/Applications/Xcode.app/Contents/Developer/Platforms/AppleTVOS.platform',
          sdkPath:
            '/Applications/Xcode.app/Contents/Developer/Platforms/AppleTVOS.platform/Developer/SDKs/AppleTVOS17.4.sdk',
        },
      ],
    };

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(comprehensiveSDKInfo),
      stderr: '',
    });

    const result = await xcodebuildShowSDKsTool(args);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual(comprehensiveSDKInfo);
    expect(responseData.sdks).toHaveLength(3);
    expect(responseData.sdks[0]).toHaveProperty('sdkPath');
    expect(responseData.sdks[0]).toHaveProperty('platformPath');
  });

  it('should handle output format parameter explicitly set to json', async () => {
    const args = { outputFormat: 'json' as const };

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: JSON.stringify(mockSDKInfo),
      stderr: '',
    });

    const result = await xcodebuildShowSDKsTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith('xcodebuild -showsdks -json');

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual(mockSDKInfo);
  });

  it('should handle malformed but parseable JSON', async () => {
    const args = {};
    const malformedButValid = '{"sdks":[{"canonicalName":"test"}]}';

    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: malformedButValid,
      stderr: '',
    });

    const result = await xcodebuildShowSDKsTool(args);

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData).toEqual({ sdks: [{ canonicalName: 'test' }] });
  });

  it('should handle various error scenarios in stderr', async () => {
    const errorScenarios = [
      "xcode-select: error: tool 'xcodebuild' requires Xcode",
      'xcodebuild: error: SDK not found',
      'error: The operation could not be completed.',
    ];

    for (const errorMessage of errorScenarios) {
      jest.clearAllMocks();

      mockExecuteCommand.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: errorMessage,
      });

      await expect(xcodebuildShowSDKsTool({})).rejects.toThrow(McpError);
      await expect(xcodebuildShowSDKsTool({})).rejects.toThrow(
        `Failed to show SDKs: ${errorMessage}`
      );
    }
  });
});
