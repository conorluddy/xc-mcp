import { jest } from '@jest/globals';
import { execSync } from 'child_process';
import { access, constants, stat } from 'fs/promises';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  validateXcodeInstallation,
  validateProjectPath,
  validateScheme,
  validateDeviceId,
  sanitizePath,
  escapeShellArg,
} from '../../../src/utils/validation.js';

// Mock child_process and fs/promises
jest.mock('child_process');
jest.mock('fs/promises');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockAccess = access as jest.MockedFunction<typeof access>;
const mockStat = stat as jest.MockedFunction<typeof stat>;

describe('validateXcodeInstallation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when Xcode CLI tools are installed', async () => {
    mockExecSync.mockReturnValue('/usr/bin/xcodebuild');

    await expect(validateXcodeInstallation()).resolves.toBeUndefined();
    expect(mockExecSync).toHaveBeenCalledWith('which xcodebuild', { stdio: 'ignore' });
  });

  it('should throw McpError when Xcode CLI tools are not found', async () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('Command not found');
    });

    await expect(validateXcodeInstallation()).rejects.toThrow(McpError);
    await expect(validateXcodeInstallation()).rejects.toThrow('Xcode command line tools not found');
    await expect(validateXcodeInstallation()).rejects.toThrow('xcode-select --install');

    // Check that it's specifically an InternalError
    try {
      await validateXcodeInstallation();
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(ErrorCode.InternalError);
    }
  });
});

describe('validateProjectPath', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass for valid .xcodeproj directory', async () => {
    const projectPath = '/path/to/MyProject.xcodeproj';

    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isDirectory: () => true,
    } as any);

    await expect(validateProjectPath(projectPath)).resolves.toBeUndefined();
    expect(mockAccess).toHaveBeenCalledWith(projectPath, constants.F_OK);
  });

  it('should pass for valid .xcworkspace directory', async () => {
    const projectPath = '/path/to/MyWorkspace.xcworkspace';

    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isDirectory: () => true,
    } as any);

    await expect(validateProjectPath(projectPath)).resolves.toBeUndefined();
  });

  it('should throw when project path does not exist', async () => {
    const projectPath = '/path/to/NonExistent.xcodeproj';

    mockAccess.mockRejectedValue(new Error('ENOENT: no such file or directory'));

    await expect(validateProjectPath(projectPath)).rejects.toThrow(McpError);
    await expect(validateProjectPath(projectPath)).rejects.toThrow(
      'Project path not found or inaccessible'
    );

    try {
      await validateProjectPath(projectPath);
    } catch (error) {
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });

  it('should throw when project path is not a directory', async () => {
    const projectPath = '/path/to/file.xcodeproj';

    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isDirectory: () => false,
    } as any);

    await expect(validateProjectPath(projectPath)).rejects.toThrow(McpError);
    await expect(validateProjectPath(projectPath)).rejects.toThrow(
      'Project path is not a directory'
    );

    try {
      await validateProjectPath(projectPath);
    } catch (error) {
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });

  it('should throw when project path does not have Xcode extension', async () => {
    const projectPath = '/path/to/regular-directory';

    mockAccess.mockResolvedValue(undefined);
    mockStat.mockResolvedValue({
      isDirectory: () => true,
    } as any);

    await expect(validateProjectPath(projectPath)).rejects.toThrow(McpError);
    await expect(validateProjectPath(projectPath)).rejects.toThrow('Invalid Xcode project path');
    await expect(validateProjectPath(projectPath)).rejects.toThrow('.xcodeproj or .xcworkspace');

    try {
      await validateProjectPath(projectPath);
    } catch (error) {
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });

  it('should re-throw McpError as-is', async () => {
    const projectPath = '/path/to/project.xcodeproj';
    const originalError = new McpError(ErrorCode.InvalidParams, 'Custom error');

    mockAccess.mockResolvedValue(undefined);
    mockStat.mockImplementation(() => {
      throw originalError;
    });

    await expect(validateProjectPath(projectPath)).rejects.toThrow(originalError);
  });

  it('should handle access permission errors', async () => {
    const projectPath = '/path/to/MyProject.xcodeproj';

    mockAccess.mockRejectedValue(new Error('EACCES: permission denied'));

    await expect(validateProjectPath(projectPath)).rejects.toThrow(McpError);
    await expect(validateProjectPath(projectPath)).rejects.toThrow(
      'Project path not found or inaccessible'
    );
  });
});

describe('validateScheme', () => {
  it('should pass for valid scheme name', () => {
    expect(() => validateScheme('MyApp')).not.toThrow();
    expect(() => validateScheme('My App Scheme')).not.toThrow();
    expect(() => validateScheme('App-With-Dashes')).not.toThrow();
  });

  it('should throw for empty scheme', () => {
    expect(() => validateScheme('')).toThrow(McpError);
    expect(() => validateScheme('')).toThrow('Scheme name is required');

    try {
      validateScheme('');
    } catch (error) {
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });

  it('should throw for whitespace-only scheme', () => {
    expect(() => validateScheme('   ')).toThrow(McpError);
    expect(() => validateScheme('\t\n')).toThrow(McpError);
  });

  it('should throw for undefined scheme', () => {
    expect(() => validateScheme(undefined as any)).toThrow(McpError);
    expect(() => validateScheme(null as any)).toThrow(McpError);
  });
});

describe('validateDeviceId', () => {
  it('should pass for valid device ID', () => {
    expect(() => validateDeviceId('12345678-1234-1234-1234-123456789012')).not.toThrow();
    expect(() => validateDeviceId('ABCDEF12-3456-7890-ABCD-EF1234567890')).not.toThrow();
    expect(() => validateDeviceId('simple-device-id')).not.toThrow();
  });

  it('should throw for empty device ID', () => {
    expect(() => validateDeviceId('')).toThrow(McpError);
    expect(() => validateDeviceId('')).toThrow('Device ID is required');

    try {
      validateDeviceId('');
    } catch (error) {
      expect((error as McpError).code).toBe(ErrorCode.InvalidParams);
    }
  });

  it('should throw for whitespace-only device ID', () => {
    expect(() => validateDeviceId('   ')).toThrow(McpError);
    expect(() => validateDeviceId('\t\n')).toThrow(McpError);
  });

  it('should throw for undefined device ID', () => {
    expect(() => validateDeviceId(undefined as any)).toThrow(McpError);
    expect(() => validateDeviceId(null as any)).toThrow(McpError);
  });
});

describe('sanitizePath', () => {
  it('should remove dangerous characters', () => {
    expect(sanitizePath('/safe/path')).toBe('/safe/path');
    expect(sanitizePath('/path/with spaces')).toBe('/path/with spaces');
    expect(sanitizePath('/path/with-dashes_and.dots')).toBe('/path/with-dashes_and.dots');
  });

  it('should remove shell injection characters', () => {
    expect(sanitizePath('/path; rm -rf /')).toBe('/path rm -rf /');
    expect(sanitizePath('/path && malicious')).toBe('/path  malicious');
    expect(sanitizePath('/path | grep secret')).toBe('/path  grep secret');
    expect(sanitizePath('/path `whoami`')).toBe('/path whoami');
    expect(sanitizePath('/path $(dangerous)')).toBe('/path dangerous');
    expect(sanitizePath('/path { evil }')).toBe('/path  evil ');
    expect(sanitizePath('/path [0]')).toBe('/path 0');
  });

  it('should handle empty string', () => {
    expect(sanitizePath('')).toBe('');
  });

  it('should handle strings with only dangerous characters', () => {
    expect(sanitizePath(';|&`$()[]{}')).toBe('');
  });

  it('should preserve safe special characters', () => {
    expect(sanitizePath('/path/with@email.com')).toBe('/path/with@email.com');
    expect(sanitizePath('/path/with#hash')).toBe('/path/with#hash');
    expect(sanitizePath('/path/with%percent')).toBe('/path/with%percent');
  });
});

describe('escapeShellArg', () => {
  it('should wrap simple arguments in quotes', () => {
    expect(escapeShellArg('simple')).toBe('"simple"');
    expect(escapeShellArg('path/to/file')).toBe('"path/to/file"');
  });

  it('should escape double quotes', () => {
    expect(escapeShellArg('say "hello"')).toBe('"say \\"hello\\""');
  });

  it('should escape backslashes', () => {
    expect(escapeShellArg('path\\\\to\\\\file')).toBe('"path\\\\\\\\to\\\\\\\\file"');
  });

  it('should escape dollar signs', () => {
    expect(escapeShellArg('$HOME/path')).toBe('"\\$HOME/path"');
    expect(escapeShellArg('$(dangerous)')).toBe('"\\$(dangerous)"');
  });

  it('should escape backticks', () => {
    expect(escapeShellArg('`whoami`')).toBe('"\\`whoami\\`"');
  });

  it('should handle complex strings with multiple special characters', () => {
    const input = 'path with "quotes" and $vars and `commands` and \\\\backslashes';
    const expected =
      '"path with \\"quotes\\" and \\$vars and \\`commands\\` and \\\\\\\\backslashes"';
    expect(escapeShellArg(input)).toBe(expected);
  });

  it('should handle empty string', () => {
    expect(escapeShellArg('')).toBe('""');
  });

  it('should handle strings with spaces', () => {
    expect(escapeShellArg('path with spaces')).toBe('"path with spaces"');
  });

  it('should handle already safe strings', () => {
    expect(escapeShellArg('safe-path_123')).toBe('"safe-path_123"');
  });
});
