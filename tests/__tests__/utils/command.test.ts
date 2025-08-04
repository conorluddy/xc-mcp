import { jest } from '@jest/globals';
import { exec, execSync } from 'child_process';
import {
  buildXcodebuildCommand,
  buildSimctlCommand,
  executeCommand,
  executeCommandSync,
} from '../../../src/utils/command.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));

const mockExec = exec as jest.MockedFunction<typeof exec>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('buildXcodebuildCommand', () => {
  it('should build basic project command', () => {
    const command = buildXcodebuildCommand('build', '/path/to/Project.xcodeproj');

    expect(command).toBe('xcodebuild -project "/path/to/Project.xcodeproj" build');
  });

  it('should build workspace command', () => {
    const command = buildXcodebuildCommand('build', '/path/to/Workspace.xcworkspace');

    expect(command).toBe('xcodebuild -workspace "/path/to/Workspace.xcworkspace" build');
  });

  it('should build command with workspace option', () => {
    const command = buildXcodebuildCommand('build', '/path/to/Project.xcodeproj', {
      workspace: true,
    });

    expect(command).toBe('xcodebuild -workspace "/path/to/Project.xcodeproj" build');
  });

  it('should build command with all options', () => {
    const options = {
      scheme: 'MyApp',
      configuration: 'Release',
      destination: 'platform=iOS Simulator,name=iPhone 15',
      sdk: 'iphonesimulator',
      derivedDataPath: '/tmp/DerivedData',
      json: true,
    };

    const command = buildXcodebuildCommand('build', '/path/to/Project.xcodeproj', options);

    expect(command).toContain('-project "/path/to/Project.xcodeproj"');
    expect(command).toContain('-scheme "MyApp"');
    expect(command).toContain('-configuration Release');
    expect(command).toContain('-destination "platform=iOS Simulator,name=iPhone 15"');
    expect(command).toContain('-sdk iphonesimulator');
    expect(command).toContain('-derivedDataPath "/tmp/DerivedData"');
    expect(command).toContain('-json');
    expect(command).toContain('build');
  });

  it('should handle scheme with spaces', () => {
    const command = buildXcodebuildCommand('build', '/path/to/Project.xcodeproj', {
      scheme: 'My App Scheme',
    });

    expect(command).toContain('-scheme "My App Scheme"');
  });

  it('should handle empty action', () => {
    const command = buildXcodebuildCommand('', '/path/to/Project.xcodeproj');

    expect(command).toBe('xcodebuild -project "/path/to/Project.xcodeproj"');
  });

  it('should handle partial options', () => {
    const command = buildXcodebuildCommand('clean', '/path/to/Project.xcodeproj', {
      scheme: 'MyApp',
      configuration: 'Debug',
    });

    expect(command).toContain('-scheme "MyApp"');
    expect(command).toContain('-configuration Debug');
    expect(command).not.toContain('-destination');
    expect(command).not.toContain('-json');
  });
});

describe('buildSimctlCommand', () => {
  it('should build basic list command', () => {
    const command = buildSimctlCommand('list');

    expect(command).toBe('xcrun simctl list');
  });

  it('should build list command with JSON flag', () => {
    const command = buildSimctlCommand('list', { json: true });

    expect(command).toBe('xcrun simctl list -j');
  });

  it('should build boot command with device ID', () => {
    const command = buildSimctlCommand('boot', {
      deviceId: '12345678-1234-1234-1234-123456789012',
    });

    expect(command).toBe('xcrun simctl boot 12345678-1234-1234-1234-123456789012');
  });

  it('should build shutdown command with device ID', () => {
    const command = buildSimctlCommand('shutdown', {
      deviceId: '12345678-1234-1234-1234-123456789012',
    });

    expect(command).toBe('xcrun simctl shutdown 12345678-1234-1234-1234-123456789012');
  });

  it('should build create command with full parameters', () => {
    const command = buildSimctlCommand('create', {
      name: 'Test iPhone',
      deviceType: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
      runtime: 'com.apple.CoreSimulator.SimRuntime.iOS-17-0',
    });

    expect(command).toBe(
      'xcrun simctl create "Test iPhone" com.apple.CoreSimulator.SimDeviceType.iPhone-15 com.apple.CoreSimulator.SimRuntime.iOS-17-0'
    );
  });

  it('should not add JSON flag for unsupported actions', () => {
    const command = buildSimctlCommand('boot', {
      deviceId: '12345678-1234-1234-1234-123456789012',
      json: true,
    });

    expect(command).toBe('xcrun simctl boot 12345678-1234-1234-1234-123456789012');
    expect(command).not.toContain('-j');
  });

  it('should handle actions without device-specific parameters', () => {
    const command = buildSimctlCommand('help');

    expect(command).toBe('xcrun simctl help');
  });

  it('should ignore deviceId for unsupported actions', () => {
    const command = buildSimctlCommand('list', {
      deviceId: '12345678-1234-1234-1234-123456789012',
    });

    expect(command).toBe('xcrun simctl list');
  });

  it('should handle create command with missing parameters', () => {
    const command = buildSimctlCommand('create', {
      name: 'Test iPhone',
      // Missing deviceType and runtime
    });

    expect(command).toBe('xcrun simctl create');
  });

  it('should handle device name with spaces in create command', () => {
    const command = buildSimctlCommand('create', {
      name: 'My Test Device',
      deviceType: 'iPhone-15',
      runtime: 'iOS-17-0',
    });

    expect(command).toContain('"My Test Device"');
  });
});

describe('executeCommand', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute command successfully', async () => {
    const mockCallback = jest.fn().mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(null, { stdout: 'success output', stderr: 'warning message' });
    });
    mockExec.mockImplementation(mockCallback as any);

    const result = await executeCommand('echo "test"');

    expect(result).toEqual({
      stdout: 'success output',
      stderr: 'warning message',
      code: 0,
    });
    expect(mockExec).toHaveBeenCalledWith(
      'echo "test"',
      expect.objectContaining({
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024,
      }),
      expect.any(Function)
    );
  });

  it('should handle command timeout', async () => {
    const timeoutError = new Error('Command failed') as any;
    timeoutError.code = 'ETIMEDOUT';

    const mockCallback = jest.fn().mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(timeoutError);
    });
    mockExec.mockImplementation(mockCallback as any);

    await expect(executeCommand('sleep 10')).rejects.toThrow(McpError);
    await expect(executeCommand('sleep 10')).rejects.toThrow(
      'Command timed out after 300000ms: sleep 10'
    );
  });

  it('should handle command failure with stderr', async () => {
    const execError = new Error('Command failed') as any;
    execError.code = 1;
    execError.stdout = 'partial output';
    execError.stderr = 'error message';

    const mockCallback = jest.fn().mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(execError);
    });
    mockExec.mockImplementation(mockCallback as any);

    const result = await executeCommand('false');

    expect(result).toEqual({
      stdout: 'partial output',
      stderr: 'error message',
      code: 1,
    });
  });

  it('should handle command failure without stdout/stderr', async () => {
    const execError = new Error('Permission denied') as any;
    execError.code = 126;

    const mockCallback = jest.fn().mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(execError);
    });
    mockExec.mockImplementation(mockCallback as any);

    const result = await executeCommand('invalid-command');

    expect(result).toEqual({
      stdout: '',
      stderr: 'Permission denied',
      code: 126,
    });
  });

  it('should use custom options', async () => {
    const mockCallback = jest.fn().mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(null, { stdout: 'output', stderr: '' });
    });
    mockExec.mockImplementation(mockCallback as any);

    await executeCommand('echo "test"', { timeout: 60000, maxBuffer: 1024 });

    expect(mockExec).toHaveBeenCalledWith(
      'echo "test"',
      expect.objectContaining({
        timeout: 60000,
        maxBuffer: 1024,
      }),
      expect.any(Function)
    );
  });

  it('should trim stdout and stderr', async () => {
    const mockCallback = jest.fn().mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(null, { stdout: '  output with spaces  ', stderr: '  warning  ' });
    });
    mockExec.mockImplementation(mockCallback as any);

    const result = await executeCommand('echo "test"');

    expect(result.stdout).toBe('output with spaces');
    expect(result.stderr).toBe('warning');
  });
});

describe('executeCommandSync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should execute command successfully', () => {
    mockExecSync.mockReturnValue('success output  ');

    const result = executeCommandSync('echo "test"');

    expect(result).toEqual({
      stdout: 'success output',
      stderr: '',
      code: 0,
    });
    expect(mockExecSync).toHaveBeenCalledWith('echo "test"', {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  });

  it('should handle command failure with stdout/stderr', () => {
    const execError = new Error('Command failed') as any;
    execError.status = 1;
    execError.stdout = 'partial output  ';
    execError.stderr = '  error message';

    mockExecSync.mockImplementation(() => {
      throw execError;
    });

    const result = executeCommandSync('false');

    expect(result).toEqual({
      stdout: 'partial output',
      stderr: 'error message',
      code: 1,
    });
  });

  it('should handle command failure without stdout/stderr', () => {
    const execError = new Error('Permission denied') as any;
    execError.status = 126;

    mockExecSync.mockImplementation(() => {
      throw execError;
    });

    const result = executeCommandSync('invalid-command');

    expect(result).toEqual({
      stdout: '',
      stderr: 'Permission denied',
      code: 126,
    });
  });

  it('should handle missing status code', () => {
    const execError = new Error('Unknown error') as any;
    // No status property

    mockExecSync.mockImplementation(() => {
      throw execError;
    });

    const result = executeCommandSync('unknown-command');

    expect(result).toEqual({
      stdout: '',
      stderr: 'Unknown error',
      code: 1,
    });
  });
});
