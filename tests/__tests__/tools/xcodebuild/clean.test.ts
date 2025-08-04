import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { xcodebuildCleanTool } from '../../../../src/tools/xcodebuild/clean.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../../src/utils/__mocks__/command.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import fs from 'fs/promises';

jest.mock('fs/promises');
jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-clean tool', () => {
  setupTest();

  beforeEach(() => {
    jest.mocked(fs.access).mockResolvedValue(undefined);
  });

  const mockCleanSuccess = (args: string[] = []) => {
    const fullCommand = `xcodebuild clean ${args.join(' ')}`;
    setMockCommandConfig({
      [fullCommand]: {
        stdout: 'Clean succeeded',
        stderr: '',
        code: 0
      }
    });
  };

  const mockCleanError = (args: string[] = []) => {
    const fullCommand = `xcodebuild clean ${args.join(' ')}`;
    setMockCommandConfig({
      [fullCommand]: {
        stdout: '',
        stderr: 'Clean failed: error',
        code: 65
      }
    });
  };

  it('should clean project with scheme', async () => {
    mockCleanSuccess(['-project', 'Test.xcodeproj', '-scheme', 'Test']);

    const result = await xcodebuildCleanTool({
      project: 'Test.xcodeproj',
      scheme: 'Test'
    });

    expect(result).toMatchObject({
      success: true
    });
  });

  it('should clean workspace with scheme', async () => {
    mockCleanSuccess(['-workspace', 'Test.xcworkspace', '-scheme', 'Test']);

    const result = await xcodebuildCleanTool({
      workspace: 'Test.xcworkspace',
      scheme: 'Test'
    });

    expect(result).toMatchObject({
      success: true
    });
  });

  it('should clean all targets when alltargets is true', async () => {
    mockCleanSuccess(['-project', 'Test.xcodeproj', '-alltargets']);

    const result = await xcodebuildCleanTool({
      project: 'Test.xcodeproj',
      alltargets: true
    });

    expect(result).toMatchObject({
      success: true
    });
  });

  it('should clean specific target', async () => {
    mockCleanSuccess(['-project', 'Test.xcodeproj', '-target', 'MyApp']);

    const result = await xcodebuildCleanTool({
      project: 'Test.xcodeproj',
      target: 'MyApp'
    });

    expect(result).toMatchObject({
      success: true
    });
  });

  it('should include configuration when specified', async () => {
    mockCleanSuccess(['-project', 'Test.xcodeproj', '-scheme', 'Test', '-configuration', 'Release']);

    const result = await xcodebuildCleanTool({
      project: 'Test.xcodeproj',
      scheme: 'Test',
      configuration: 'Release'
    });

    expect(result).toMatchObject({
      success: true
    });
  });

  it('should handle clean errors', async () => {
    mockCleanError(['-project', 'Test.xcodeproj', '-scheme', 'Test']);

    const result = await xcodebuildCleanTool({
      project: 'Test.xcodeproj',
      scheme: 'Test'
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Clean failed')
    });
  });

  it('should error when neither project nor workspace is provided', async () => {
    await expect(xcodebuildCleanTool({
      scheme: 'Test'
    })).rejects.toThrow('Either project or workspace must be specified');
  });

  it('should error when no target selector is provided', async () => {
    await expect(xcodebuildCleanTool({
      project: 'Test.xcodeproj'
    })).rejects.toThrow('Either scheme, target, or alltargets must be specified');
  });

  it('should validate project file exists', async () => {
    jest.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));

    await expect(xcodebuildCleanTool({
      project: 'NonExistent.xcodeproj',
      scheme: 'Test'
    })).rejects.toThrow('Project file not found');
  });

  it('should validate workspace file exists', async () => {
    jest.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));

    await expect(xcodebuildCleanTool({
      workspace: 'NonExistent.xcworkspace',
      scheme: 'Test'
    })).rejects.toThrow('Workspace file not found');
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(xcodebuildCleanTool({
      project: 'Test.xcodeproj',
      scheme: 'Test'
    })).rejects.toThrow('Xcode is not installed');
  });
});