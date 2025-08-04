import { describe, it, expect, jest } from '@jest/globals';
import { xcodebuildShowSDKsTool } from '../../../../src/tools/xcodebuild/showsdks.js';
import { setupTest, mockXcodebuildShowSDKs } from '../../../__helpers__/test-utils.js';
import { setMockCommandConfig } from '../../../../src/utils/__mocks__/command.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-showsdks tool', () => {
  setupTest();

  it('should list available SDKs', async () => {
    mockXcodebuildShowSDKs();

    const result = await xcodebuildShowSDKsTool({});

    expect(result).toMatchObject({
      sdks: [
        {
          canonicalName: 'iphoneos17.0',
          displayName: 'iOS 17.0',
          platform: 'iphoneos',
          version: '17.0',
          buildID: '21A5277g',
        },
        {
          canonicalName: 'iphonesimulator17.0',
          displayName: 'iOS 17.0 Simulator',
          platform: 'iphonesimulator',
          version: '17.0',
          buildID: '21A5277g',
        },
      ],
    });
  });

  it('should handle empty SDK list', async () => {
    setMockCommandConfig({
      'xcodebuild -showsdks -json': {
        stdout: JSON.stringify([]),
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildShowSDKsTool({});

    expect(result).toMatchObject({
      sdks: [],
    });
  });

  it('should handle SDK list errors', async () => {
    setMockCommandConfig({
      'xcodebuild -showsdks -json': {
        stdout: '',
        stderr: 'Failed to retrieve SDKs',
        code: 1,
      },
    });

    const result = await xcodebuildShowSDKsTool({});

    expect(result).toMatchObject({
      error: expect.stringContaining('Failed to retrieve SDK information'),
    });
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(xcodebuildShowSDKsTool({})).rejects.toThrow('Xcode is not installed');
  });

  it('should handle malformed JSON response', async () => {
    setMockCommandConfig({
      'xcodebuild -showsdks -json': {
        stdout: 'invalid json',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildShowSDKsTool({});

    expect(result).toMatchObject({
      error: expect.stringContaining('Failed to parse SDK information'),
    });
  });

  it('should include stderr in error when command fails', async () => {
    const errorMessage = 'Xcode license not accepted';
    setMockCommandConfig({
      'xcodebuild -showsdks -json': {
        stdout: '',
        stderr: errorMessage,
        code: 69,
      },
    });

    const result = await xcodebuildShowSDKsTool({});

    expect(result).toMatchObject({
      error: expect.stringContaining(errorMessage),
    });
  });
});
