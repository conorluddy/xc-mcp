import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { xcodebuildBuildTool } from '../../../../src/tools/xcodebuild/build.js';
import { setupTest, mockXcodebuildBuild, mockBuildError } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../__helpers__/test-utils.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import fs from 'fs/promises';

jest.mock('fs/promises');
jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-build tool', () => {
  setupTest();

  beforeEach(() => {
    jest.mocked(fs.access).mockResolvedValue(undefined);
  });

  it('should build with minimal configuration', async () => {
    mockXcodebuildBuild(['-project', 'Test.xcodeproj', '-scheme', 'Test']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test'
    });

    expect(result).toMatchObject({
      success: true,
      buildId: expect.stringContaining('build_'),
      configuration: 'Debug',
      destination: 'generic/platform=iOS Simulator'
    });
  });

  it('should build with workspace', async () => {
    mockXcodebuildBuild(['-workspace', 'Test.xcworkspace', '-scheme', 'Test']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcworkspace',
      scheme: 'Test'
    });

    expect(result).toMatchObject({
      success: true,
      buildId: expect.stringContaining('build_'),
      configuration: 'Debug'
    });
  });

  it('should include configuration when specified', async () => {
    mockXcodebuildBuild(['-project', 'Test.xcodeproj', '-scheme', 'Test', '-configuration', 'Release']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      configuration: 'Release'
    });

    expect(result).toMatchObject({
      success: true,
      configuration: 'Release'
    });
  });

  it('should include destination when specified', async () => {
    const destination = 'platform=iOS Simulator,name=iPhone 15';
    mockXcodebuildBuild(['-project', 'Test.xcodeproj', '-scheme', 'Test', '-destination', destination]);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      destination
    });

    expect(result).toMatchObject({
      success: true,
      destination
    });
  });

  it('should include SDK when specified', async () => {
    mockXcodebuildBuild(['-project', 'Test.xcodeproj', '-scheme', 'Test', '-sdk', 'iphoneos']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      sdk: 'iphoneos'
    });

    expect(result).toMatchObject({
      success: true,
      sdk: 'iphoneos'
    });
  });

  it('should include arch when specified', async () => {
    mockXcodebuildBuild(['-project', 'Test.xcodeproj', '-scheme', 'Test', '-arch', 'arm64']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      arch: 'arm64'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      success: true
    });
  });

  it('should include derivedDataPath when specified', async () => {
    const ddPath = '/tmp/DerivedData';
    mockXcodebuildBuild(['-project', 'Test.xcodeproj', '-scheme', 'Test', '-derivedDataPath', ddPath]);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      derivedDataPath: ddPath
    });

    expect(result).toMatchObject({
      success: true,
      derivedDataPath: ddPath
    });
  });

  it('should perform clean build when specified', async () => {
    mockXcodebuildBuild(['clean', 'build', '-project', 'Test.xcodeproj', '-scheme', 'Test']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      clean: true
    });

    expect(result).toMatchObject({
      success: true
    });
  });

  it('should run analyze when specified', async () => {
    mockXcodebuildBuild(['analyze', '-project', 'Test.xcodeproj', '-scheme', 'Test']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      analyze: true
    });

    expect(result).toMatchObject({
      success: true
    });
  });

  it('should include additional arguments', async () => {
    mockXcodebuildBuild(['-project', 'Test.xcodeproj', '-scheme', 'Test', '-quiet', '-parallelizeTargets']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test',
      additionalArgs: ['-quiet', '-parallelizeTargets']
    });

    expect(result).toMatchObject({
      success: true
    });
  });

  it('should handle build errors', async () => {
    mockBuildError(['-project', 'Test.xcodeproj', '-scheme', 'Test']);

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test'
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Build failed')
    });
  });

  it('should error when projectPath is not provided', async () => {
    await expect(xcodebuildBuildTool({
      scheme: 'Test'
    })).rejects.toThrow('Project path is required');
  });

  it('should error when scheme is not provided', async () => {
    await expect(xcodebuildBuildTool({
      project: 'Test.xcodeproj'
    })).rejects.toThrow('Scheme must be specified');
  });

  it('should validate project file exists', async () => {
    jest.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));

    await expect(xcodebuildBuildTool({
      projectPath: 'NonExistent.xcodeproj',
      scheme: 'Test'
    })).rejects.toThrow('Project file not found');
  });

  it('should validate workspace file exists', async () => {
    jest.mocked(fs.access).mockRejectedValueOnce(new Error('File not found'));

    await expect(xcodebuildBuildTool({
      projectPath: 'NonExistent.xcworkspace',
      scheme: 'Test'
    })).rejects.toThrow('Workspace file not found');
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test'
    })).rejects.toThrow('Xcode is not installed');
  });

  it('should cache build output', async () => {
    const longOutput = 'A'.repeat(20000); // Long output to trigger caching
    setMockCommandConfig({
      'xcodebuild -project Test.xcodeproj -scheme Test': {
        stdout: longOutput,
        stderr: '',
        code: 0
      }
    });

    const result = await xcodebuildBuildTool({
      projectPath: 'Test.xcodeproj',
      scheme: 'Test'
    });

    expect(result).toMatchObject({
      success: true,
      buildId: expect.stringContaining('build_'),
      outputTruncated: true,
      outputSize: longOutput.length
    });
  });
});