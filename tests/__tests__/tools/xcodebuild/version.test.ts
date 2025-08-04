import { describe, it, expect, jest } from '@jest/globals';
import { xcodebuildVersionTool } from '../../../../src/tools/xcodebuild/version.js';
import { setupTest, setMockCommandConfig } from '../../../__helpers__/test-utils.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-version tool', () => {
  setupTest();

  it('should return Xcode version information (JSON format)', async () => {
    // Mock JSON version output
    setMockCommandConfig({
      'xcodebuild -version -json': {
        stdout: JSON.stringify({
          version: '15.0',
          buildVersion: '15A240d',
        }),
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      version: '15.0',
      buildVersion: '15A240d',
    });
  });

  it('should handle plain text version output when JSON fails', async () => {
    // Mock command that returns plain text (older Xcode versions)
    setMockCommandConfig({
      'xcodebuild -version -json': {
        stdout: 'Xcode 15.0\nBuild version 15A240d',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      version: 'Xcode 15.0\nBuild version 15A240d',
      format: 'text',
    });
  });

  it('should handle text format when requested', async () => {
    setMockCommandConfig({
      'xcodebuild -version': {
        stdout: 'Xcode 15.1\nBuild version 15B87a',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({ outputFormat: 'text' });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe('Xcode 15.1\nBuild version 15B87a');
  });

  it('should handle version command errors', async () => {
    setMockCommandConfig({
      'xcodebuild -version -json': {
        stdout: '',
        stderr: 'xcodebuild: error: invalid command',
        code: 1,
      },
    });

    await expect(xcodebuildVersionTool({})).rejects.toThrow('Failed to get version information');
  });

  it('should handle malformed JSON version output', async () => {
    setMockCommandConfig({
      'xcodebuild -version -json': {
        stdout: 'Invalid JSON output',
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({});

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      version: 'Invalid JSON output',
      format: 'text',
    });
  });

  it('should handle SDK parameter', async () => {
    setMockCommandConfig({
      'xcodebuild -version -sdk iphoneos -json': {
        stdout: JSON.stringify({
          version: '15.0',
          buildVersion: '15A240d',
          sdkVersion: '17.0',
        }),
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({ sdk: 'iphoneos' });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      version: '15.0',
      buildVersion: '15A240d',
      sdkVersion: '17.0',
    });
  });

  it('should handle SDK parameter with text format', async () => {
    const output = 'Xcode 15.0\nBuild version 15A240d\niOS SDK 17.0';
    setMockCommandConfig({
      'xcodebuild -version -sdk iphoneos': {
        stdout: output,
        stderr: '',
        code: 0,
      },
    });

    const result = await xcodebuildVersionTool({ sdk: 'iphoneos', outputFormat: 'text' });

    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBe(output);
  });
});
