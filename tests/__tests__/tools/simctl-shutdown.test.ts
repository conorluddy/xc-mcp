import { jest } from '@jest/globals';
import { simctlShutdownTool } from '../../../src/tools/simctl/shutdown.js';
import { validateDeviceId } from '../../../src/utils/validation.js';
import { executeCommand, buildSimctlCommand } from '../../../src/utils/command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
jest.mock('../../../src/utils/validation.js', () => ({
  validateDeviceId: jest.fn(),
}));

jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
  buildSimctlCommand: jest.fn(),
}));

const mockValidateDeviceId = validateDeviceId as jest.MockedFunction<typeof validateDeviceId>;
const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;
const mockBuildSimctlCommand = buildSimctlCommand as jest.MockedFunction<typeof buildSimctlCommand>;

// Mock console.error to suppress output during tests
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('simctlShutdownTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  const mockDeviceId = '12345678-1234-1234-1234-123456789012';

  it('should shutdown device successfully', async () => {
    const args = { deviceId: mockDeviceId };

    mockValidateDeviceId.mockReturnValue(undefined);
    mockBuildSimctlCommand.mockReturnValue(
      'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Device shutdown successfully',
      stderr: '',
    });

    // Mock Date.now for consistent timing
    const mockStartTime = 1640995200000;
    const mockEndTime = mockStartTime + 1500; // 1.5 seconds
    jest.spyOn(Date, 'now').mockReturnValueOnce(mockStartTime).mockReturnValueOnce(mockEndTime);

    const result = await simctlShutdownTool(args);

    expect(mockValidateDeviceId).toHaveBeenCalledWith(mockDeviceId);
    expect(mockBuildSimctlCommand).toHaveBeenCalledWith('shutdown', { deviceId: mockDeviceId });
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012',
      { timeout: 60000 }
    );
    expect(mockConsoleError).toHaveBeenCalledWith(
      '[simctl-shutdown] Executing: xcrun simctl shutdown 12345678-1234-1234-1234-123456789012'
    );

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(result.isError).toBe(false);

    const response = JSON.parse(result.content[0].text);
    expect(response).toEqual({
      success: true,
      command: 'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012',
      output: 'Device shutdown successfully',
      error: '',
      exitCode: 0,
      duration: 1500,
    });
  });

  it('should handle device already shut down', async () => {
    const args = { deviceId: mockDeviceId };

    mockValidateDeviceId.mockReturnValue(undefined);
    mockBuildSimctlCommand.mockReturnValue(
      'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Unable to shutdown device in current state: Shutdown',
    });

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995200500);

    const result = await simctlShutdownTool(args);

    expect(result.isError).toBe(false);

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(true);
    expect(response.error).toBe('Device was already shut down');
    expect(response.exitCode).toBe(1);
  });

  it('should handle invalid device ID from simctl', async () => {
    const args = { deviceId: 'invalid-device-id' };

    mockValidateDeviceId.mockReturnValue(undefined);
    mockBuildSimctlCommand.mockReturnValue('xcrun simctl shutdown invalid-device-id');
    mockExecuteCommand.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Invalid device: invalid-device-id',
    });

    await expect(simctlShutdownTool(args)).rejects.toThrow(McpError);
    await expect(simctlShutdownTool(args)).rejects.toThrow('Invalid device ID: invalid-device-id');
  });

  it('should handle validation errors', async () => {
    const args = { deviceId: 'invalid' };

    mockValidateDeviceId.mockImplementation(() => {
      throw new McpError(ErrorCode.InvalidParams, 'Invalid device ID format');
    });

    await expect(simctlShutdownTool(args)).rejects.toThrow(McpError);
    await expect(simctlShutdownTool(args)).rejects.toThrow('Invalid device ID format');

    expect(mockBuildSimctlCommand).not.toHaveBeenCalled();
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it('should handle command execution failure', async () => {
    const args = { deviceId: mockDeviceId };

    mockValidateDeviceId.mockReturnValue(undefined);
    mockBuildSimctlCommand.mockReturnValue(
      'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 1,
      stdout: '',
      stderr: 'Simulator service connection interrupted',
    });

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995201000);

    const result = await simctlShutdownTool(args);

    expect(result.isError).toBe(true);

    const response = JSON.parse(result.content[0].text);
    expect(response.success).toBe(false);
    expect(response.error).toBe('Simulator service connection interrupted');
    expect(response.exitCode).toBe(1);
    expect(response.duration).toBe(1000);
  });

  it('should handle executeCommand throwing errors', async () => {
    const args = { deviceId: mockDeviceId };

    mockValidateDeviceId.mockReturnValue(undefined);
    mockBuildSimctlCommand.mockReturnValue(
      'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012'
    );
    mockExecuteCommand.mockRejectedValue(new Error('Command execution failed'));

    await expect(simctlShutdownTool(args)).rejects.toThrow(McpError);
    await expect(simctlShutdownTool(args)).rejects.toThrow(
      'simctl-shutdown failed: Command execution failed'
    );
  });

  it('should handle non-Error exceptions', async () => {
    const args = { deviceId: mockDeviceId };

    mockValidateDeviceId.mockReturnValue(undefined);
    mockBuildSimctlCommand.mockReturnValue(
      'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012'
    );
    mockExecuteCommand.mockRejectedValue('String error');

    await expect(simctlShutdownTool(args)).rejects.toThrow(McpError);
    await expect(simctlShutdownTool(args)).rejects.toThrow('simctl-shutdown failed: String error');
  });

  it('should preserve McpError instances', async () => {
    const args = { deviceId: mockDeviceId };
    const originalError = new McpError(ErrorCode.InvalidParams, 'Original error');

    mockValidateDeviceId.mockImplementation(() => {
      throw originalError;
    });

    await expect(simctlShutdownTool(args)).rejects.toBe(originalError);
  });

  it('should handle timeout correctly', async () => {
    const args = { deviceId: mockDeviceId };

    mockValidateDeviceId.mockReturnValue(undefined);
    mockBuildSimctlCommand.mockReturnValue(
      'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012'
    );
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Success',
      stderr: '',
    });

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995260000); // 60 seconds later

    await simctlShutdownTool(args);

    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012',
      { timeout: 60000 } // 1 minute timeout
    );
  });

  it('should log command execution', async () => {
    const args = { deviceId: mockDeviceId };
    const expectedCommand = 'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012';

    mockValidateDeviceId.mockReturnValue(undefined);
    mockBuildSimctlCommand.mockReturnValue(expectedCommand);
    mockExecuteCommand.mockResolvedValue({
      code: 0,
      stdout: 'Success',
      stderr: '',
    });

    jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995200100);

    await simctlShutdownTool(args);

    expect(mockConsoleError).toHaveBeenCalledWith(
      `[simctl-shutdown] Executing: ${expectedCommand}`
    );
  });

  it('should handle various shutdown error messages', async () => {
    const errorScenarios = [
      {
        stderr: 'Unable to shutdown device in current state: Shutdown',
        expectedSuccess: true,
        expectedError: 'Device was already shut down',
      },
      {
        stderr: 'Invalid device: some-invalid-id',
        shouldThrow: true,
        expectedMessage: 'Invalid device ID: 12345678-1234-1234-1234-123456789012',
      },
      {
        stderr: 'Simulator service connection interrupted',
        expectedSuccess: false,
        expectedError: 'Simulator service connection interrupted',
      },
    ];

    for (const scenario of errorScenarios) {
      jest.clearAllMocks();

      const args = { deviceId: mockDeviceId };

      mockValidateDeviceId.mockReturnValue(undefined);
      mockBuildSimctlCommand.mockReturnValue(
        'xcrun simctl shutdown 12345678-1234-1234-1234-123456789012'
      );
      mockExecuteCommand.mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: scenario.stderr,
      });

      jest.spyOn(Date, 'now').mockReturnValueOnce(1640995200000).mockReturnValueOnce(1640995200500);

      if (scenario.shouldThrow) {
        await expect(simctlShutdownTool(args)).rejects.toThrow(McpError);
        await expect(simctlShutdownTool(args)).rejects.toThrow(scenario.expectedMessage);
      } else {
        const result = await simctlShutdownTool(args);
        const response = JSON.parse(result.content[0].text);

        expect(response.success).toBe(scenario.expectedSuccess);
        expect(response.error).toBe(scenario.expectedError);
        expect(result.isError).toBe(!scenario.expectedSuccess);
      }
    }
  });
});
