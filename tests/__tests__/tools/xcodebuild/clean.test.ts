import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { xcodebuildCleanTool } from '../../../../src/tools/xcodebuild/clean.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../__helpers__/test-utils.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-clean tool', () => {
  setupTest();

  const mockCleanSuccess = (args: string[] = []) => {
    const fullCommand = `xcodebuild ${args.join(' ')}`;
    setMockCommandConfig({
      [fullCommand]: {
        stdout: 'Clean succeeded',
        stderr: '',
        code: 0,
      },
    });
  };

  const mockCleanError = (args: string[] = []) => {
    const fullCommand = `xcodebuild ${args.join(' ')}`;
    setMockCommandConfig({
      [fullCommand]: {
        stdout: '',
        stderr: 'Clean failed: error',
        code: 65,
      },
    });
  };

  it('should clean project with scheme', async () => {
    mockCleanSuccess(['-project', '"Test.xcodeproj"', '-scheme', '"Test"', 'clean']);

    const result = await xcodebuildCleanTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
  });

  it('should clean workspace with scheme', async () => {
    mockCleanSuccess(['-workspace', '"Test.xcworkspace"', '-scheme', '"Test"', 'clean']);

    const result = await xcodebuildCleanTool({
      projectPath: 'Test.xcworkspace',
      scheme: 'Test',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
  });

  it('should include configuration when specified', async () => {
    mockCleanSuccess([
      '-project',
      '"Test.xcodeproj"',
      '-scheme',
      '"Test"',
      '-configuration',
      'Release',
      'clean'
    ]);

    const result = await xcodebuildCleanTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      configuration: 'Release',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(true);
  });

  it('should handle clean errors', async () => {
    mockCleanError(['-project', '"Test.xcodeproj"', '-scheme', '"Test"', 'clean']);

    const result = await xcodebuildCleanTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Clean failed');
  });

  it('should error when project path is not provided', async () => {
    await expect(
      xcodebuildCleanTool({
        scheme: 'Test',
      })
    ).rejects.toThrow('Project path is required');
  });

  it('should error when scheme is not provided', async () => {
    await expect(
      xcodebuildCleanTool({
        projectPath: 'Test.xcodeproj',
      })
    ).rejects.toThrow('Scheme is required');
  });

  it('should validate project file exists', async () => {
    await expect(
      xcodebuildCleanTool({
        projectPath: 'NonExistent.xcodeproj',
        scheme: 'Test',
      })
    ).rejects.toThrow('Project file not found');
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(
      xcodebuildCleanTool({
        projectPath: 'Test.xcodeproj',
        scheme: 'Test',
      })
    ).rejects.toThrow('Xcode is not installed');
  });
});
