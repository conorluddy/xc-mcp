import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the MCP SDK and stdio before importing
const mockSetRequestHandler = jest.fn();
const mockConnect = jest.fn();
const mockServer = {
  setRequestHandler: mockSetRequestHandler,
  connect: mockConnect,
};

const mockTransport = {};

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn(() => mockServer),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(() => mockTransport),
}));

// Mock all tool modules
jest.mock('../../src/tools/xcodebuild/build.js', () => ({
  xcodebuildBuildTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'build result' }] }),
}));

jest.mock('../../src/tools/xcodebuild/clean.js', () => ({
  xcodebuildCleanTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'clean result' }] }),
}));

jest.mock('../../src/tools/xcodebuild/list.js', () => ({
  xcodebuildListTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'list result' }] }),
}));

jest.mock('../../src/tools/xcodebuild/showsdks.js', () => ({
  xcodebuildShowSDKsTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'sdks result' }] }),
}));

jest.mock('../../src/tools/xcodebuild/version.js', () => ({
  xcodebuildVersionTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'version result' }] }),
}));

jest.mock('../../src/tools/xcodebuild/get-details.js', () => ({
  xcodebuildGetDetailsTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'details result' }] }),
}));

jest.mock('../../src/tools/simctl/list.js', () => ({
  simctlListTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'simctl list result' }] }),
}));

jest.mock('../../src/tools/simctl/boot.js', () => ({
  simctlBootTool: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'boot result' }] }),
}));

jest.mock('../../src/tools/simctl/shutdown.js', () => ({
  simctlShutdownTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'shutdown result' }] }),
}));

jest.mock('../../src/tools/simctl/get-details.js', () => ({
  simctlGetDetailsTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'simctl details result' }] }),
}));

jest.mock('../../src/tools/cache/cache-management.js', () => ({
  cacheGetStatsTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'stats result' }] }),
  cacheSetConfigTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'config set result' }] }),
  cacheGetConfigTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'config get result' }] }),
  cacheClearTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'clear result' }] }),
}));

jest.mock('../../src/tools/cache/list-cached.js', () => ({
  listCachedResponsesTool: jest
    .fn()
    .mockResolvedValue({ content: [{ type: 'text', text: 'cached list result' }] }),
}));

// Import the module after all mocks are set up
describe('MCP Server', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Import the index module to trigger server setup
    await import('../../src/index.js');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should create server with correct configuration', () => {
    const Server = require('@modelcontextprotocol/sdk/server/index.js').Server;
    expect(Server).toHaveBeenCalledWith(
      {
        name: 'xc-mcp',
        version: expect.any(String),
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  });

  it('should connect transport to server', () => {
    expect(mockConnect).toHaveBeenCalledWith(mockTransport);
  });

  it('should log server startup', () => {
    expect(consoleLogSpy).toHaveBeenCalledWith('XC-MCP server running on stdio');
  });

  it('should register tools/list handler', () => {
    const handler = mockSetRequestHandler.mock.calls.find(call => call[0] === 'tools/list')?.[1];

    expect(handler).toBeDefined();
  });

  it('should return all tools in tools/list', async () => {
    const handler = mockSetRequestHandler.mock.calls.find(call => call[0] === 'tools/list')?.[1];

    const result = await handler();

    expect(result.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'xcodebuild-build' }),
        expect.objectContaining({ name: 'xcodebuild-clean' }),
        expect.objectContaining({ name: 'xcodebuild-list' }),
        expect.objectContaining({ name: 'xcodebuild-showsdks' }),
        expect.objectContaining({ name: 'xcodebuild-version' }),
        expect.objectContaining({ name: 'xcodebuild-get-details' }),
        expect.objectContaining({ name: 'simctl-list' }),
        expect.objectContaining({ name: 'simctl-boot' }),
        expect.objectContaining({ name: 'simctl-shutdown' }),
        expect.objectContaining({ name: 'simctl-get-details' }),
        expect.objectContaining({ name: 'cache-get-stats' }),
        expect.objectContaining({ name: 'cache-set-config' }),
        expect.objectContaining({ name: 'cache-get-config' }),
        expect.objectContaining({ name: 'cache-clear' }),
        expect.objectContaining({ name: 'list-cached-responses' }),
      ])
    );
  });

  it('should register tools/call handler', () => {
    const handler = mockSetRequestHandler.mock.calls.find(call => call[0] === 'tools/call')?.[1];

    expect(handler).toBeDefined();
  });

  it('should handle xcodebuild-build tool call', async () => {
    const handler = mockSetRequestHandler.mock.calls.find(call => call[0] === 'tools/call')?.[1];

    const buildTool = require('../../src/tools/xcodebuild/build.js').xcodebuildBuildTool;

    const result = await handler({
      name: 'xcodebuild-build',
      arguments: { projectPath: 'test.xcodeproj', scheme: 'Test' },
    });

    expect(buildTool).toHaveBeenCalledWith({ projectPath: 'test.xcodeproj', scheme: 'Test' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'build result' }] });
  });

  it('should handle invalid tool name', async () => {
    const handler = mockSetRequestHandler.mock.calls.find(call => call[0] === 'tools/call')?.[1];

    await expect(
      handler({
        name: 'invalid-tool',
        arguments: {},
      })
    ).rejects.toThrow('Tool not found: invalid-tool');
  });

  it('should handle tool execution errors', async () => {
    const handler = mockSetRequestHandler.mock.calls.find(call => call[0] === 'tools/call')?.[1];

    const buildTool = require('../../src/tools/xcodebuild/build.js').xcodebuildBuildTool;
    buildTool.mockRejectedValueOnce(new Error('Build failed'));

    await expect(
      handler({
        name: 'xcodebuild-build',
        arguments: { projectPath: 'test.xcodeproj', scheme: 'Test' },
      })
    ).rejects.toThrow('Build failed');
  });
});
