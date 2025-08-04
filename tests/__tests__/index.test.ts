import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupTest } from '../__helpers__/test-utils.js';
import { setXcodeValidation } from '../__helpers__/test-utils.js';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    connect: jest.fn(),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn(),
}));

jest.mock('../../src/utils/command.js');
jest.mock('../../src/utils/validation.js');

// Import after mocks are set up
let serverModule: any;

describe('MCP Server (index.ts)', () => {
  let mockServer: any;
  let mockTransport: any;
  let consoleErrorSpy: any;

  setupTest();

  beforeEach(async () => {
    // Clear module cache
    jest.resetModules();

    // Create mock instances
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
    };

    mockTransport = {
      _transport: 'mock',
    };

    // Set up mocks
    (Server as unknown as jest.Mock).mockImplementation(() => mockServer);
    (StdioServerTransport as unknown as jest.Mock).mockImplementation(() => mockTransport);

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Import the module fresh
    serverModule = await import('../../src/index.js');
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should create server with correct configuration', () => {
    expect(Server).toHaveBeenCalledWith(
      {
        name: 'xc-mcp',
        version: expect.any(String),
      },
      expect.objectContaining({
        capabilities: {
          tools: {},
        },
      })
    );
  });

  it('should register tools/list handler', async () => {
    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/list'
    )?.[1];

    expect(handler).toBeDefined();

    const result = await handler();
    expect(result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({
          name: 'xcodebuild-build',
          description: expect.any(String),
        }),
        expect.objectContaining({
          name: 'xcodebuild-clean',
        }),
        expect.objectContaining({
          name: 'simctl-list',
        }),
        expect.objectContaining({
          name: 'cache-get-stats',
        }),
      ]),
    });
  });

  it('should register tools/call handler', async () => {
    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/call'
    )?.[1];

    expect(handler).toBeDefined();
  });

  it('should handle xcodebuild-version tool call', async () => {
    const { setMockCommandConfig } = await import('../__mocks__/command.js');
    setMockCommandConfig({
      'xcodebuild -version': {
        stdout: 'Xcode 15.0\nBuild version 15A240d',
        stderr: '',
        code: 0,
      },
    });

    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/call'
    )?.[1];

    const result = await handler({
      name: 'xcodebuild-version',
      arguments: {},
    });

    expect(result).toMatchObject({
      content: [
        {
          type: 'text',
          text: expect.stringContaining('Xcode 15.0'),
        },
      ],
    });
  });

  it('should handle invalid tool name', async () => {
    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/call'
    )?.[1];

    await expect(
      handler({
        name: 'invalid-tool',
        arguments: {},
      })
    ).rejects.toThrow('Tool not found: invalid-tool');
  });

  it('should handle tool execution errors', async () => {
    setXcodeValidation(false);

    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/call'
    )?.[1];

    await expect(
      handler({
        name: 'xcodebuild-version',
        arguments: {},
      })
    ).rejects.toThrow('Xcode is not installed');
  });

  it('should connect transport to server', () => {
    expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);
  });

  it('should handle server startup errors', async () => {
    // Create a new mock that throws on connect
    const errorServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
    };

    (Server as unknown as jest.Mock).mockImplementation(() => errorServer);

    // Re-import to trigger the error
    await import('../../src/index.js?error');

    expect(consoleErrorSpy).toHaveBeenCalledWith('Server error:', expect.any(Error));
  });

  it('should include all expected tools in tools/list', async () => {
    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/list'
    )?.[1];

    const result = await handler();
    const toolNames = result.tools.map((t: any) => t.name);

    // xcodebuild tools
    expect(toolNames).toContain('xcodebuild-build');
    expect(toolNames).toContain('xcodebuild-clean');
    expect(toolNames).toContain('xcodebuild-list');
    expect(toolNames).toContain('xcodebuild-showsdks');
    expect(toolNames).toContain('xcodebuild-version');
    expect(toolNames).toContain('xcodebuild-get-details');

    // simctl tools
    expect(toolNames).toContain('simctl-list');
    expect(toolNames).toContain('simctl-boot');
    expect(toolNames).toContain('simctl-shutdown');
    expect(toolNames).toContain('simctl-get-details');

    // cache tools
    expect(toolNames).toContain('cache-get-stats');
    expect(toolNames).toContain('cache-set-config');
    expect(toolNames).toContain('cache-get-config');
    expect(toolNames).toContain('cache-clear');
    expect(toolNames).toContain('list-cached-responses');
  });

  it('should validate tool arguments', async () => {
    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/call'
    )?.[1];

    // Test with missing required argument
    await expect(
      handler({
        name: 'xcodebuild-build',
        arguments: {
          // Missing required 'scheme' parameter
          project: 'Test.xcodeproj',
        },
      })
    ).rejects.toThrow('Scheme must be specified');
  });

  it('should handle cache management tools', async () => {
    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/call'
    )?.[1];

    const result = await handler({
      name: 'cache-get-stats',
      arguments: {},
    });

    expect(result).toMatchObject({
      content: [
        {
          type: 'text',
          text: expect.stringContaining('simulator'),
        },
      ],
    });
  });

  it('should format tool results correctly', async () => {
    const { setMockCommandConfig } = await import('../__mocks__/command.js');
    setMockCommandConfig({
      'xcodebuild -list -json': {
        stdout: JSON.stringify({
          project: {
            name: 'TestProject',
            schemes: ['TestScheme'],
          },
        }),
        stderr: '',
        code: 0,
      },
    });

    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/call'
    )?.[1];

    const result = await handler({
      name: 'xcodebuild-list',
      arguments: {},
    });

    expect(result.content[0].type).toBe('text');
    const text = JSON.parse(result.content[0].text);
    expect(text).toMatchObject({
      project: {
        name: 'TestProject',
        schemes: ['TestScheme'],
      },
    });
  });

  it('should handle complex tool arguments', async () => {
    const { setMockCommandConfig } = await import('../__mocks__/command.js');
    setMockCommandConfig({
      'xcodebuild clean build -project Test.xcodeproj -scheme TestScheme -configuration Release -destination platform=iOS Simulator,name=iPhone 15':
        {
          stdout: 'Build succeeded',
          stderr: '',
          code: 0,
        },
    });

    const handler = mockServer.setRequestHandler.mock.calls.find(
      (call: any[]) => call[0] === 'tools/call'
    )?.[1];

    const result = await handler({
      name: 'xcodebuild-build',
      arguments: {
        project: 'Test.xcodeproj',
        scheme: 'TestScheme',
        configuration: 'Release',
        destination: 'platform=iOS Simulator,name=iPhone 15',
        clean: true,
      },
    });

    expect(result).toMatchObject({
      content: [
        {
          type: 'text',
          text: expect.stringContaining('success'),
        },
      ],
    });
  });
});
