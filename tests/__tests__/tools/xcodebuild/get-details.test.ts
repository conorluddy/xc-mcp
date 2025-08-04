import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { xcodebuildGetDetailsTool } from '../../../../src/tools/xcodebuild/get-details.js';
import { setupTest } from '../../../__helpers__/test-utils.js';
import { setXcodeValidation } from '../../../__helpers__/test-utils.js';
import { responseCache } from '../../../../src/utils/response-cache.js';
import { mockResponseCacheEntry } from '../../../__helpers__/cache-helpers.js';

jest.mock('../../../../src/utils/command.js');
jest.mock('../../../../src/utils/validation.js');

describe('xcodebuild-get-details tool', () => {
  setupTest();

  beforeEach(() => {
    responseCache.clear();
  });

  it('should retrieve full build log', async () => {
    const buildId = 'build_12345';
    const cachedOutput = 'Build output details...';
    
    mockResponseCacheEntry(buildId, 'xcodebuild-build', cachedOutput);

    const result = await xcodebuildGetDetailsTool({
      buildId,
      detailType: 'full-log'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      buildId,
      detailType: 'full-log',
      content: cachedOutput
    });
  });

  it('should get errors only', async () => {
    const buildId = 'build_12345';
    const cachedOutput = `
      CompileC /path/to/file.m
      warning: deprecated API
      error: missing semicolon
      error: undefined symbol
      Build failed
    `;
    
    mockResponseCacheEntry(buildId, 'xcodebuild-build', cachedOutput);

    const result = await xcodebuildGetDetailsTool({
      buildId,
      detailType: 'errors-only'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.content).toContain('error: missing semicolon');
    expect(data.content).toContain('error: undefined symbol');
    expect(data.errors).toEqual([
      'error: missing semicolon',
      'error: undefined symbol'
    ]);
  });

  it('should get warnings only', async () => {
    const buildId = 'build_12345';
    const cachedOutput = `
      warning: deprecated API
      warning: unused variable
      error: missing semicolon
      Build succeeded
    `;
    
    mockResponseCacheEntry(buildId, 'xcodebuild-build', cachedOutput);

    const result = await xcodebuildGetDetailsTool({
      buildId,
      detailType: 'warnings-only'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.warnings).toEqual([
      'warning: deprecated API',
      'warning: unused variable'
    ]);
  });

  it('should get build summary', async () => {
    const buildId = 'build_12345';
    const cachedOutput = '=== BUILD TARGET MyApp OF PROJECT MyProject WITH CONFIGURATION Debug ===\nBuild output...';
    
    mockResponseCacheEntry(buildId, 'xcodebuild-build', cachedOutput, 'stderr output', 0, 'xcodebuild -project MyProject.xcodeproj');

    const result = await xcodebuildGetDetailsTool({
      buildId,
      detailType: 'summary'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      buildId,
      detailType: 'summary',
      exitCode: 0,
      hasErrors: false,
      hasWarnings: false,
      outputSize: expect.any(Number),
      tool: 'xcodebuild-build'
    });
  });

  it('should get command details', async () => {
    const buildId = 'build_12345';
    const command = 'xcodebuild -project MyProject.xcodeproj -scheme MyScheme';
    
    mockResponseCacheEntry(buildId, 'xcodebuild-build', 'output', '', 0, command);

    const result = await xcodebuildGetDetailsTool({
      buildId,
      detailType: 'command'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      buildId,
      detailType: 'command',
      command
    });
  });

  it('should get metadata', async () => {
    const buildId = 'build_12345';
    const metadata = { project: 'MyProject', scheme: 'MyScheme', configuration: 'Debug' };
    
    mockResponseCacheEntry(buildId, 'xcodebuild-build', 'output', '', 0, 'xcodebuild', metadata);

    const result = await xcodebuildGetDetailsTool({
      buildId,
      detailType: 'metadata'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data).toMatchObject({
      buildId,
      detailType: 'metadata',
      metadata
    });
  });

  it('should limit lines in full log', async () => {
    const buildId = 'build_12345';
    const lines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`);
    const cachedOutput = lines.join('\n');
    
    mockResponseCacheEntry(buildId, 'xcodebuild-build', cachedOutput);

    const result = await xcodebuildGetDetailsTool({
      buildId,
      detailType: 'full-log',
      maxLines: 50
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.totalLines).toBe(200);
    expect(data.showing).toBe('Last 50 lines');
    expect(data.content).toContain('Line 151');
    expect(data.content).toContain('Line 200');
    expect(data.content).not.toContain('Line 150');
  });

  it('should handle missing buildId', async () => {
    await expect(xcodebuildGetDetailsTool({}))
      .rejects.toThrow('buildId is required');
  });

  it('should handle non-existent buildId', async () => {
    await expect(xcodebuildGetDetailsTool({
      buildId: 'non_existent_build'
    })).rejects.toThrow('not found or expired');
  });

  it('should handle invalid detailType', async () => {
    const buildId = 'build_12345';
    mockResponseCacheEntry(buildId, 'xcodebuild-build', 'output');

    await expect(xcodebuildGetDetailsTool({
      buildId,
      detailType: 'invalid'
    })).rejects.toThrow('Invalid detailType');
  });

  it('should handle Xcode not installed', async () => {
    setXcodeValidation(false);

    await expect(xcodebuildGetDetailsTool({
      buildId: 'build_12345'
    })).rejects.toThrow('Xcode is not installed');
  });

  it('should handle stderr in full log', async () => {
    const buildId = 'build_12345';
    const cachedOutput = 'Build output';
    const cachedStderr = 'Error output';
    
    mockResponseCacheEntry(buildId, 'xcodebuild-build', cachedOutput, cachedStderr);

    const result = await xcodebuildGetDetailsTool({
      buildId,
      detailType: 'full-log'
    });

    expect(result.content[0].type).toBe('text');
    const data = JSON.parse(result.content[0].text);
    expect(data.content).toContain('Build output');
    expect(data.content).toContain('--- STDERR ---');
    expect(data.content).toContain('Error output');
  });
});