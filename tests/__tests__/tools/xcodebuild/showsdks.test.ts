import { describe, it, expect, jest } from '@jest/globals';
import { xcodebuildShowSDKsTool } from '../../../../src/tools/xcodebuild/showsdks.js';
import { setupTest, setMockCommandConfig } from '../../../__helpers__/test-utils.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-showsdks tool', () => {
  setupTest();

  it('should list available SDKs', async () => {
    setMockCommandConfig({
      'xcodebuild -showsdks -json': {
        stdout: JSON.stringify([
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
        ]),
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildShowSDKsTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toEqual([
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
    ]);
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

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toEqual([]);
  });

  it('should handle SDK list errors', async () => {
    setMockCommandConfig({
      'xcodebuild -showsdks -json': {
        stdout: '',
        stderr: 'Failed to retrieve SDKs',
        code: 1,
      },
    });

    await expect(xcodebuildShowSDKsTool({})).rejects.toThrow('Failed to show SDKs');
  });

  it('should handle text format', async () => {
    setMockCommandConfig({
      'xcodebuild -showsdks': {
        stdout:
          'iOS SDKs:\n\tiOS 17.0 -sdk iphoneos17.0\n\niOS Simulator SDKs:\n\tSimulator - iOS 17.0 -sdk iphonesimulator17.0',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildShowSDKsTool({ outputFormat: 'text' });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('iOS 17.0');
  });

  it('should handle malformed JSON response', async () => {
    setMockCommandConfig({
      'xcodebuild -showsdks -json': {
        stdout: 'invalid json',
        stderr: '',
        code: 0,
      },
    });

    await expect(xcodebuildShowSDKsTool({})).rejects.toThrow(
      'Failed to parse xcodebuild -showsdks output'
    );
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

    await expect(xcodebuildShowSDKsTool({})).rejects.toThrow(errorMessage);
  });
});
