import { describe, it, expect, jest } from '@jest/globals';

// Mock child_process before importing command module
const mockExec = jest.fn() as any;
const mockExecSync = jest.fn() as any;

jest.mock('child_process', () => ({
  exec: mockExec,
  execSync: mockExecSync,
}));

jest.mock('util', () => ({
  promisify: jest.fn((fn: any) => {
    if (fn === mockExec) {
      return jest.fn((cmd: string, opts: any) => {
        return new Promise((resolve, reject) => {
          mockExec(cmd, opts, (err: any, stdout: any, stderr: any) => {
            if (err) reject(err);
            else resolve({ stdout, stderr });
          });
        });
      });
    }
    return fn;
  }),
}));

// Import after mocks are set up
import {
  executeCommand,
  executeCommandSync,
  buildXcodebuildCommand,
} from '../../../src/utils/command.js';

describe('command utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeCommand', () => {
    it('should execute command successfully', async () => {
      mockExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(null, 'Command output\n', '');
      });

      const result = await executeCommand('echo hello');

      expect(result).toEqual({
        stdout: 'Command output',
        stderr: '',
        code: 0,
      });
      expect(mockExec).toHaveBeenCalledWith('echo hello', expect.any(Object), expect.any(Function));
    });

    it('should handle command errors', async () => {
      const error: any = new Error('Command failed');
      error.code = 1;
      error.stdout = 'Partial output';
      error.stderr = 'Error output';

      mockExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(error);
      });

      const result = await executeCommand('failing-command');

      expect(result).toEqual({
        stdout: 'Partial output',
        stderr: 'Error output',
        code: 1,
      });
    });

    it('should handle timeout errors', async () => {
      const error: any = new Error('Timeout');
      error.code = 'ETIMEDOUT';

      mockExec.mockImplementation((cmd: any, opts: any, callback: any) => {
        callback(error);
      });

      await expect(executeCommand('slow-command')).rejects.toThrow(
        'Command timed out after 300000ms'
      );
    });
  });

  describe('executeCommandSync', () => {
    it('should execute command synchronously', () => {
      mockExecSync.mockReturnValue(Buffer.from('Sync output\n'));

      const result = executeCommandSync('echo hello');

      expect(result).toEqual({
        stdout: 'Sync output',
        stderr: '',
        code: 0,
      });
    });

    it('should handle sync command errors', () => {
      const error: any = new Error('Command failed');
      error.status = 1;
      error.stdout = Buffer.from('Partial output');
      error.stderr = Buffer.from('Error output');

      mockExecSync.mockImplementation(() => {
        throw error;
      });

      const result = executeCommandSync('failing-command');

      expect(result).toEqual({
        stdout: 'Partial output',
        stderr: 'Error output',
        code: 1,
      });
    });
  });

  describe('buildXcodebuildCommand', () => {
    it('should build basic project command', () => {
      const cmd = buildXcodebuildCommand('build', 'Project.xcodeproj', {
        scheme: 'MyScheme',
      });

      expect(cmd).toBe('xcodebuild -project "Project.xcodeproj" -scheme "MyScheme" build');
    });

    it('should handle workspace', () => {
      const cmd = buildXcodebuildCommand('build', 'Workspace.xcworkspace', {
        scheme: 'MyScheme',
      });

      expect(cmd).toContain('-workspace "Workspace.xcworkspace"');
    });

    it('should include all options', () => {
      const cmd = buildXcodebuildCommand('build', 'Project.xcodeproj', {
        scheme: 'MyScheme',
        configuration: 'Release',
        destination: 'platform=iOS Simulator,name=iPhone 15',
        sdk: 'iphonesimulator',
        derivedDataPath: '/tmp/DerivedData',
        json: true,
      });

      expect(cmd).toContain('-project "Project.xcodeproj"');
      expect(cmd).toContain('-scheme "MyScheme"');
      expect(cmd).toContain('-configuration Release');
      expect(cmd).toContain('-destination "platform=iOS Simulator,name=iPhone 15"');
      expect(cmd).toContain('-sdk iphonesimulator');
      expect(cmd).toContain('-derivedDataPath "/tmp/DerivedData"');
      expect(cmd).toContain('-json');
      expect(cmd).toContain('build');
    });
  });
});
