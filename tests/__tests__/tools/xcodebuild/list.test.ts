import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { xcodebuildListTool } from '../../../../src/tools/xcodebuild/list.js';
import { setupTest, mockXcodebuildList } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig, setXcodeValidation } from '../../../__helpers__/test-utils.js';
import fs from 'fs/promises';

jest.mock('fs/promises');
jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-list tool', () => {
  setupTest();

  beforeEach(() => {
    jest.mocked(fs.access).mockResolvedValue(undefined);
  });

  it('should list project information', async () => {
    mockXcodebuildList();

    const result = await xcodebuildListTool({
      projectPath: 'Test.xcodeproj',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      project: {
        name: 'TestProject',
        configurations: ['Debug', 'Release'],
        targets: ['TestApp', 'TestAppTests'],
        schemes: ['TestApp', 'TestApp-Dev'],
      },
    });
  });

  it('should list workspace information', async () => {
    mockXcodebuildList();

    const result = await xcodebuildListTool({
      projectPath: 'Test.xcworkspace',
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      workspace: {
        name: 'TestWorkspace',
        schemes: ['WorkspaceScheme'],
      },
    });
  });

  it('should require projectPath parameter', async () => {
    await expect(xcodebuildListTool({})).rejects.toThrow('Project path is required');
  });

  it('should handle list errors', async () => {
    setMockCommandConfig({
      'xcodebuild -list -json': {
        stdout: '',
        stderr: 'No project or workspace found',
        code: 1,
      },
    });

    const result = await xcodebuildListTool({});

    await expect(xcodebuildListTool({})).rejects.toThrow('Failed to list project information');
  });

  it('should validate project file exists', async () => {
    jest.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));

    await expect(
      xcodebuildListTool({
        projectPath: 'NonExistent.xcodeproj',
      })
    ).rejects.toThrow('Project file not found');
  });

  it('should validate workspace file exists', async () => {
    jest.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));

    await expect(
      xcodebuildListTool({
        projectPath: 'NonExistent.xcworkspace',
      })
    ).rejects.toThrow('Workspace file not found');
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(xcodebuildListTool({})).rejects.toThrow('Xcode is not installed');
  });

  it('should handle malformed JSON response', async () => {
    setMockCommandConfig({
      'xcodebuild -list -json': {
        stdout: 'invalid json',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildListTool({});

    await expect(xcodebuildListTool({})).rejects.toThrow('Failed to parse');
  });

  it('should include raw output when JSON parsing fails', async () => {
    const rawOutput = 'Some non-JSON output';
    setMockCommandConfig({
      'xcodebuild -list -json': {
        stdout: rawOutput,
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildListTool({});

    await expect(xcodebuildListTool({})).rejects.toThrow('Failed to parse');
  });
});
