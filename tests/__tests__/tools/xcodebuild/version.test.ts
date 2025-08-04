import { describe, it, expect, jest } from '@jest/globals';
import { xcodebuildVersionTool } from '../../../../src/tools/xcodebuild/version.js';
import { setupTest, mockXcodebuildVersion } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../../src/utils/__mocks__/command.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-version tool', () => {
  setupTest();

  it('should return Xcode version information', async () => {
    mockXcodebuildVersion();

    const result = await xcodebuildVersionTool({});

    expect(result).toMatchObject({
      version: 'Xcode 15.0',
      build: 'Build version 15A240d',
      fullOutput: 'Xcode 15.0\nBuild version 15A240d',
    });
  });

  it('should handle version with additional information', async () => {
    setMockCommandConfig({
      'xcodebuild -version': {
        stdout: 'Xcode 15.1\nBuild version 15B87a\nAdditional tools:\n- Swift 5.9\n- iOS SDK 17.1',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({});

    expect(result).toMatchObject({
      version: 'Xcode 15.1',
      build: 'Build version 15B87a',
      fullOutput: expect.stringContaining('Additional tools'),
    });
  });

  it('should handle version command errors', async () => {
    setMockCommandConfig({
      'xcodebuild -version': {
        stdout: '',
        stderr: 'xcodebuild: error: invalid command',
        code: 1,
      },
    });

    const result = await xcodebuildVersionTool({});

    expect(result).toMatchObject({
      error: expect.stringContaining('Failed to get Xcode version'),
    });
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(xcodebuildVersionTool({})).rejects.toThrow('Xcode is not installed');
  });

  it('should handle malformed version output', async () => {
    setMockCommandConfig({
      'xcodebuild -version': {
        stdout: 'Unexpected format',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({});

    expect(result).toMatchObject({
      version: 'Unknown',
      build: 'Unknown',
      fullOutput: 'Unexpected format',
    });
  });

  it('should extract version and build from multi-line output', async () => {
    setMockCommandConfig({
      'xcodebuild -version': {
        stdout: 'Xcode 14.3.1\nBuild version 14E300c',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({});

    expect(result).toMatchObject({
      version: 'Xcode 14.3.1',
      build: 'Build version 14E300c',
    });
  });

  it('should include additional output', async () => {
    const output = 'Xcode 15.0\nBuild version 15A240d\n\nInstalled SDKs:\niOS 17.0\nmacOS 14.0';
    setMockCommandConfig({
      'xcodebuild -version': {
        stdout: output,
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({});

    expect(result).toMatchObject({
      version: 'Xcode 15.0',
      build: 'Build version 15A240d',
      fullOutput: output,
    });
  });
});
