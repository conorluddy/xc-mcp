import { simctlContainerTool } from '../../../src/tools/simctl/container.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';

// Suppress console.error noise
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  jest.restoreAllMocks();
});

// Mock simulator cache
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    findSimulatorByUdid: jest.fn(),
  },
}));

// Mock executeCommand
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn(),
}));

// Mock response cache so no disk I/O
jest.mock('../../../src/utils/response-cache.js', () => ({
  responseCache: {
    store: jest.fn().mockReturnValue('cache-id-123'),
  },
  responseResourceLink: jest.fn().mockReturnValue({
    type: 'resource_link',
    uri: 'xcmcp://response/cache-id-123',
    name: 'simctl-container-output',
    description: 'cached content',
    mimeType: 'text/plain',
  }),
}));

// Mock fs
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  lstatSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  realpathSync: jest.fn(),
  readlinkSync: jest.fn(),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;
const mockFs = fs as jest.Mocked<typeof fs>;

const { executeCommand } = require('../../../src/utils/command.js');

const CONTAINER_ROOT =
  '/Users/conor/Library/Developer/CoreSimulator/Devices/UUID/data/Containers/Data/Application/APP-UUID';
const BUNDLE_ID = 'com.example.MyApp';
const UDID = 'device-iphone16pro';

const validSimulator = {
  name: 'iPhone 16 Pro',
  udid: UDID,
  state: 'Booted',
  isAvailable: true,
};

function setupContainerResolution(root = CONTAINER_ROOT) {
  executeCommand.mockResolvedValueOnce({ code: 0, stdout: root + '\n', stderr: '' });
}

describe('simctlContainerTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatorCache.findSimulatorByUdid.mockResolvedValue(validSimulator as any);
    // Default: realpathSync returns root as-is for container
    (mockFs.realpathSync as unknown as jest.Mock).mockImplementation((p: string) => p);
  });

  // === VALIDATION ===

  describe('input validation', () => {
    it('rejects missing bundleId', async () => {
      await expect(simctlContainerTool({ mode: 'ls' })).rejects.toThrow(McpError);
    });

    it('rejects empty bundleId', async () => {
      await expect(simctlContainerTool({ bundleId: '', mode: 'ls' })).rejects.toThrow(McpError);
    });

    it('rejects bundleId without dot', async () => {
      await expect(simctlContainerTool({ bundleId: 'myapp', mode: 'ls' })).rejects.toThrow(
        McpError
      );
    });

    it('rejects missing mode', async () => {
      await expect(simctlContainerTool({ bundleId: BUNDLE_ID })).rejects.toThrow(McpError);
    });

    it('rejects unknown mode', async () => {
      await expect(simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'export' })).rejects.toThrow(
        McpError
      );
    });

    it('rejects cat without path', async () => {
      await expect(simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'cat' })).rejects.toThrow(
        McpError
      );
    });

    it('rejects non-existent simulator when udid given', async () => {
      mockSimulatorCache.findSimulatorByUdid.mockResolvedValueOnce(null);
      await expect(
        simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls', udid: 'bad-udid' })
      ).rejects.toThrow(McpError);
    });
  });

  // === CONTAINER RESOLUTION ===

  describe('container path resolution', () => {
    it('uses "booted" when udid is absent', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        isFile: () => false,
      });
      (mockFs.readdirSync as jest.Mock).mockReturnValue([]);

      await simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls' });

      expect(executeCommand).toHaveBeenCalledWith(
        expect.stringContaining('booted'),
        expect.any(Object)
      );
    });

    it('throws InternalError when container not found', async () => {
      executeCommand.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'No such app' });
      await expect(simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls' })).rejects.toThrow(
        McpError
      );
    });

    it('throws InternalError when container stdout is empty', async () => {
      executeCommand.mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' });
      await expect(simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls' })).rejects.toThrow(
        McpError
      );
    });
  });

  // === MODE: ls ===

  describe('mode: ls', () => {
    function setupLsFs(root: string) {
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockImplementation((p: string) => ({
        isDirectory: () => p === root,
        isSymbolicLink: () => false,
        isFile: () => p !== root,
        size: 1234,
      }));
      (mockFs.statSync as jest.Mock).mockImplementation(() => ({
        isDirectory: () => false,
        isFile: () => true,
        size: 1234,
      }));
      (mockFs.readdirSync as jest.Mock).mockReturnValue(['Documents', 'Library']);
    }

    it('returns entries for root listing', async () => {
      setupContainerResolution();
      setupLsFs(CONTAINER_ROOT);
      // After setupLsFs, override lstatSync for children to be files
      (mockFs.lstatSync as jest.Mock).mockImplementation((p: string) => ({
        isDirectory: () => p === CONTAINER_ROOT,
        isSymbolicLink: () => false,
        isFile: () => p !== CONTAINER_ROOT,
        size: 512,
      }));
      (mockFs.statSync as jest.Mock).mockReturnValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 512,
      });

      const result = await simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls' });
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('ls');
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.totalEntries).toBe(2);
    });

    it('returns single-entry for file path', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        isFile: () => true,
        size: 200,
      });
      (mockFs.statSync as jest.Mock).mockReturnValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 200,
      });
      (mockFs.readdirSync as jest.Mock).mockReturnValue([]);

      const result = await simctlContainerTool({
        bundleId: BUNDLE_ID,
        mode: 'ls',
        path: 'Documents/data.json',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.totalEntries).toBe(1);
      expect(data.entries[0].kind).toBe('file');
    });

    it('throws InvalidRequest for path outside container', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      await expect(
        simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls', path: '../../etc/passwd' })
      ).rejects.toThrow(McpError);
    });

    it('throws InvalidRequest for non-existent sub-path', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValueOnce(false);
      await expect(
        simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls', path: 'NoSuchDir' })
      ).rejects.toThrow(McpError);
    });
  });

  // === MODE: cat ===

  describe('mode: cat', () => {
    const FILE_PATH = 'Documents/settings.json';

    it('returns text content for small text file', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 50,
      });
      // plutil fails → falls through to text
      executeCommand.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'not a plist' });
      (mockFs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('{"key":"value"}'));

      const result = await simctlContainerTool({
        bundleId: BUNDLE_ID,
        mode: 'cat',
        path: FILE_PATH,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.contentType).toBe('text');
      expect(data.content).toBe('{"key":"value"}');
    });

    it('returns plist contentType for valid plist file', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 100,
      });
      // plutil succeeds
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '{"NSLanguages":["en"],"NSLocale":"en_US"}',
        stderr: '',
      });

      const result = await simctlContainerTool({
        bundleId: BUNDLE_ID,
        mode: 'cat',
        path: 'Library/Preferences/com.example.MyApp.plist',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.contentType).toBe('plist');
      expect(data.content).toEqual({ NSLanguages: ['en'], NSLocale: 'en_US' });
    });

    it('caches large text files and returns cacheId', async () => {
      setupContainerResolution();
      const bigText = 'x'.repeat(9000);
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 9000,
      });
      executeCommand.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'not plist' });
      (mockFs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(bigText));

      const result = await simctlContainerTool({
        bundleId: BUNDLE_ID,
        mode: 'cat',
        path: FILE_PATH,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.cacheId).toBeDefined();
      expect(data.content).toBeUndefined();
    });

    it('returns binary indicator for binary files', async () => {
      setupContainerResolution();
      const binaryBuf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x01]);
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: binaryBuf.length,
      });
      executeCommand.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'not plist' });
      (mockFs.readFileSync as jest.Mock).mockReturnValue(binaryBuf);

      const result = await simctlContainerTool({
        bundleId: BUNDLE_ID,
        mode: 'cat',
        path: 'data.bin',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.contentType).toBe('binary');
    });

    it('throws InvalidRequest for path escaping container', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      await expect(
        simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'cat', path: '../../secret' })
      ).rejects.toThrow(McpError);
    });

    it('throws InvalidRequest for directory path', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        size: 0,
      });
      await expect(
        simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'cat', path: 'Documents' })
      ).rejects.toThrow(McpError);
    });
  });

  // === MODE: userdefaults ===

  describe('mode: userdefaults', () => {
    it('returns parsed preferences from plist', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      // plutil decode
      executeCommand.mockResolvedValueOnce({
        code: 0,
        stdout: '{"theme":"dark","notifications":true}',
        stderr: '',
      });

      const result = await simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'userdefaults' });
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('userdefaults');
      expect(data.preferences).toEqual({ theme: 'dark', notifications: true });
      expect(data.totalKeys).toBe(2);
    });

    it('throws InternalError when plist file not found', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(false);
      await expect(
        simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'userdefaults' })
      ).rejects.toThrow(McpError);
    });

    it('throws InternalError when plist cannot be parsed', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      executeCommand.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'invalid plist' });
      await expect(
        simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'userdefaults' })
      ).rejects.toThrow(McpError);
    });
  });

  // === MODE: coredata-path ===

  describe('mode: coredata-path', () => {
    it('finds sqlite files in Library/Application Support', async () => {
      setupContainerResolution();
      const libAppSupport = CONTAINER_ROOT + '/Library/Application Support';
      const sqliteFile = libAppSupport + '/Model.sqlite';

      (mockFs.existsSync as jest.Mock).mockImplementation((p: string) => {
        return p === libAppSupport || p === sqliteFile;
      });
      (mockFs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        if (p === libAppSupport) return ['Model.sqlite'];
        return [];
      });
      (mockFs.lstatSync as jest.Mock).mockImplementation((p: string) => ({
        isFile: () => p === sqliteFile,
        isDirectory: () => p === libAppSupport,
        isSymbolicLink: () => false,
        size: 32768,
      }));

      const result = await simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'coredata-path' });
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.totalStores).toBe(1);
      expect(data.stores[0].type).toBe('database');
      expect(data.stores[0].sizeBytes).toBe(32768);
    });

    it('returns empty stores list when no sqlite files found', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(false);

      const result = await simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'coredata-path' });
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.totalStores).toBe(0);
      expect(data.stores).toEqual([]);
    });

    it('classifies .sqlite-wal as write-ahead-log', async () => {
      setupContainerResolution();
      const libAppSupport = CONTAINER_ROOT + '/Library/Application Support';
      const walFile = libAppSupport + '/Model.sqlite-wal';

      (mockFs.existsSync as jest.Mock).mockImplementation(
        (p: string) => p === libAppSupport || p === walFile
      );
      (mockFs.readdirSync as jest.Mock).mockImplementation((p: string) => {
        if (p === libAppSupport) return ['Model.sqlite-wal'];
        return [];
      });
      (mockFs.lstatSync as jest.Mock).mockImplementation((p: string) => ({
        isFile: () => p === walFile,
        isDirectory: () => p === libAppSupport,
        isSymbolicLink: () => false,
        size: 4096,
      }));

      const result = await simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'coredata-path' });
      const data = JSON.parse(result.content[0].text);
      expect(data.stores[0].type).toBe('write-ahead-log');
    });
  });

  // === RESPONSE FORMAT ===

  describe('response format', () => {
    it('returns valid JSON in content[0].text', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        isFile: () => false,
      });
      (mockFs.readdirSync as jest.Mock).mockReturnValue([]);

      const result = await simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls' });
      expect(result.content[0].type).toBe('text');
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('includes guidance array in every response', async () => {
      setupContainerResolution();
      (mockFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockFs.lstatSync as jest.Mock).mockReturnValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        isFile: () => false,
      });
      (mockFs.readdirSync as jest.Mock).mockReturnValue([]);

      const result = await simctlContainerTool({ bundleId: BUNDLE_ID, mode: 'ls' });
      const data = JSON.parse(result.content[0].text);
      expect(Array.isArray(data.guidance)).toBe(true);
    });
  });
});
