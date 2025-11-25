import { simctlListTool } from '../../../src/tools/simctl/list.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { responseCache } from '../../../src/utils/response-cache.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

// Mock the caches
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    getSimulatorList: jest.fn(),
  },
}));

jest.mock('../../../src/utils/response-cache.js', () => ({
  responseCache: {
    store: jest.fn(),
  },
  extractSimulatorSummary: jest.fn(),
  createProgressiveSimulatorResponse: jest.fn(),
}));

const mockSimulatorCache = simulatorCache as jest.Mocked<typeof simulatorCache>;
const mockResponseCache = responseCache as jest.Mocked<typeof responseCache>;
const {
  extractSimulatorSummary,
  createProgressiveSimulatorResponse,
} = require('../../../src/utils/response-cache.js');

describe('simctlListTool', () => {
  const mockSimulatorList = {
    devices: {
      'iOS 18.5': [
        {
          name: 'iPhone 15',
          udid: 'test-uuid-1',
          state: 'Booted',
          isAvailable: true,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
        },
        {
          name: 'iPad Air',
          udid: 'test-uuid-2',
          state: 'Shutdown',
          isAvailable: true,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPad-Air-5th-generation',
        },
      ],
      'iOS 17.5': [
        {
          name: 'iPhone 14',
          udid: 'test-uuid-3',
          state: 'Shutdown',
          isAvailable: true,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
        },
      ],
    },
    runtimes: [
      {
        name: 'iOS 18.5',
        identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-18-5',
        version: '18.5',
        isAvailable: true,
        buildversion: '22F5027f',
      },
      {
        name: 'iOS 17.5',
        identifier: 'com.apple.CoreSimulator.SimRuntime.iOS-17-5',
        version: '17.5',
        isAvailable: true,
        buildversion: '21F5048f',
      },
    ],
    devicetypes: [],
    lastUpdated: new Date(),
  };

  const mockSummary = {
    totalDevices: 3,
    availableDevices: 3,
    bootedDevices: 1,
    deviceTypes: ['iPhone', 'iPad'],
    commonRuntimes: ['iOS 18.5', 'iOS 17.5'],
    lastUpdated: '2025-08-10T16:12:20.469Z',
    cacheAge: '1 minute ago',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSimulatorCache.getSimulatorList.mockResolvedValue(mockSimulatorList as any);
    extractSimulatorSummary.mockReturnValue(mockSummary);
    createProgressiveSimulatorResponse.mockReturnValue({
      cacheId: 'test-cache-id',
      summary: mockSummary,
      quickAccess: {
        bootedDevices: [],
        recentlyUsed: [],
        recommendedForBuild: [],
      },
      nextSteps: ['Use simctl-get-details with cacheId for full device list'],
      availableDetails: ['full-list', 'devices-only'],
      smartFilters: {
        commonDeviceTypes: ['iPhone', 'iPad'],
        commonRuntimes: ['iOS 18.5', 'iOS 17.5'],
        suggestedFilters: 'deviceType=iPhone runtime="iOS 18.5"',
      },
    });
    mockResponseCache.store.mockReturnValue('test-cache-id');
  });

  describe('basic functionality', () => {
    it('should return progressive disclosure by default', async () => {
      const result = await simctlListTool({});

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(mockSimulatorCache.getSimulatorList).toHaveBeenCalledTimes(1);
      expect(extractSimulatorSummary).toHaveBeenCalledWith(mockSimulatorList);
    });

    it('should handle concise=true (default)', async () => {
      const result = await simctlListTool({ concise: true });

      expect(createProgressiveSimulatorResponse).toHaveBeenCalledWith(
        mockSummary,
        'test-cache-id',
        expect.objectContaining({
          availability: 'available',
          deviceType: undefined,
          runtime: undefined,
        })
      );
    });

    it('should return full output when concise=false', async () => {
      const result = await simctlListTool({ concise: false, outputFormat: 'json' });

      expect(result.content[0].text).toContain('"devices"');
      expect(result.content[0].text).toContain('"runtimes"');
    });

    it('should handle different output formats', async () => {
      // JSON format
      const jsonResult = await simctlListTool({ outputFormat: 'json', concise: false });
      expect(jsonResult.content[0].text).toMatch(/^\{/); // Starts with JSON

      // Text format
      const textResult = await simctlListTool({ outputFormat: 'text', concise: false });
      expect(textResult.content[0].text).toContain('Simulator List (cached at');
    });
  });

  describe('filtering', () => {
    it('should handle deviceType filtering', async () => {
      await simctlListTool({ deviceType: 'iPhone' });
      expect(mockSimulatorCache.getSimulatorList).toHaveBeenCalledTimes(1);
    });

    it('should handle runtime filtering', async () => {
      await simctlListTool({ runtime: 'iOS 18.5' });
      expect(mockSimulatorCache.getSimulatorList).toHaveBeenCalledTimes(1);
    });

    it('should handle availability filtering', async () => {
      await simctlListTool({ availability: 'available' });
      expect(mockSimulatorCache.getSimulatorList).toHaveBeenCalledTimes(1);
    });

    it('should handle combined filters', async () => {
      await simctlListTool({
        deviceType: 'iPhone',
        runtime: 'iOS 18.5',
        availability: 'available',
      });
      expect(mockSimulatorCache.getSimulatorList).toHaveBeenCalledTimes(1);
    });
  });

  describe('progressive disclosure', () => {
    it('should store full output in response cache for concise mode', async () => {
      await simctlListTool({ concise: true, outputFormat: 'json' });

      expect(mockResponseCache.store).toHaveBeenCalledWith({
        tool: 'simctl-list',
        fullOutput: JSON.stringify(mockSimulatorList, null, 2),
        stderr: '',
        exitCode: 0,
        command: 'simctl list -j',
        metadata: {
          totalDevices: mockSummary.totalDevices,
          availableDevices: mockSummary.availableDevices,
          hasFilters: false,
        },
      });
    });

    it('should mark filters in metadata when present', async () => {
      await simctlListTool({
        deviceType: 'iPhone',
        runtime: 'iOS 18.5',
        concise: true,
      });

      expect(mockResponseCache.store).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            hasFilters: true,
          }),
        })
      );
    });

    it('should return cacheId in progressive response', async () => {
      const result = await simctlListTool({ concise: true });
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData).toHaveProperty('cacheId', 'test-cache-id');
      expect(responseData).toHaveProperty('summary');
      expect(responseData).toHaveProperty('nextSteps');
    });
  });

  describe('default values', () => {
    it('should use default values when no arguments provided', async () => {
      const result = await simctlListTool({});

      // Should use defaults: concise=true, availability='available', outputFormat='json'
      expect(extractSimulatorSummary).toHaveBeenCalled();
      expect(createProgressiveSimulatorResponse).toHaveBeenCalled();
    });

    it('should handle explicit default values', async () => {
      const result = await simctlListTool({
        availability: 'available',
        outputFormat: 'json',
        concise: true,
      });

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should handle simulator cache errors', async () => {
      const errorMessage = 'Cache error';
      mockSimulatorCache.getSimulatorList.mockRejectedValue(new Error(errorMessage));

      await expect(simctlListTool({})).rejects.toThrow(McpError);
    });

    it('should propagate McpError from cache', async () => {
      const mcpError = new McpError(ErrorCode.InternalError, 'Cache McpError');
      mockSimulatorCache.getSimulatorList.mockRejectedValue(mcpError);

      await expect(simctlListTool({})).rejects.toThrow(mcpError);
    });

    it('should wrap non-McpError in McpError', async () => {
      const regularError = new Error('Regular error');
      mockSimulatorCache.getSimulatorList.mockRejectedValue(regularError);

      try {
        await simctlListTool({});
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InternalError);
        expect((error as McpError).message).toContain('simctl-list failed');
        expect((error as McpError).message).toContain('Regular error');
      }
    });
  });

  describe('response format validation', () => {
    it('should return proper MCP tool response format', async () => {
      const result = await simctlListTool({});

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should ensure text is always string type', async () => {
      const result = await simctlListTool({ concise: false, outputFormat: 'json' });
      expect(typeof result.content[0].text).toBe('string');

      const textResult = await simctlListTool({ concise: false, outputFormat: 'text' });
      expect(typeof textResult.content[0].text).toBe('string');
    });
  });

  describe('cache integration', () => {
    it('should call simulator cache getSimulatorList', async () => {
      await simctlListTool({});
      expect(mockSimulatorCache.getSimulatorList).toHaveBeenCalledTimes(1);
    });

    it('should use cached simulator list data', async () => {
      const result = await simctlListTool({ concise: false });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData).toHaveProperty('devices');
      expect(responseData).toHaveProperty('runtimes');
    });
  });

  describe('argument validation', () => {
    it('should handle undefined arguments', async () => {
      // undefined args should throw error due to destructuring
      await expect(simctlListTool(undefined)).rejects.toThrow();
    });

    it('should handle empty object arguments', async () => {
      const result = await simctlListTool({});
      expect(result).toBeDefined();
    });

    it('should handle null arguments', async () => {
      // null args should throw error due to destructuring
      await expect(simctlListTool(null)).rejects.toThrow();
    });
  });

  describe('device limiting with max parameter', () => {
    it('should limit devices to 5 by default when concise=false', async () => {
      // Create mock data with 10 devices across multiple runtimes
      const largeSimulatorList = {
        devices: {
          'iOS 18.5': [
            {
              name: 'iPhone 15-1',
              udid: 'uuid-1',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
              lastUsed: new Date('2025-01-15T10:00:00Z'),
              bootHistory: [],
            },
            {
              name: 'iPhone 15-2',
              udid: 'uuid-2',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
              lastUsed: new Date('2025-01-14T10:00:00Z'),
              bootHistory: [],
            },
            {
              name: 'iPhone 15-3',
              udid: 'uuid-3',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
              lastUsed: new Date('2025-01-13T10:00:00Z'),
              bootHistory: [],
            },
            {
              name: 'iPhone 15-4',
              udid: 'uuid-4',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
              lastUsed: new Date('2025-01-12T10:00:00Z'),
              bootHistory: [],
            },
            {
              name: 'iPhone 15-5',
              udid: 'uuid-5',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
              lastUsed: new Date('2025-01-11T10:00:00Z'),
              bootHistory: [],
            },
          ],
          'iOS 17.5': [
            {
              name: 'iPhone 14-1',
              udid: 'uuid-6',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
              lastUsed: new Date('2025-01-10T10:00:00Z'),
              bootHistory: [],
            },
            {
              name: 'iPhone 14-2',
              udid: 'uuid-7',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
              lastUsed: new Date('2025-01-09T10:00:00Z'),
              bootHistory: [],
            },
            {
              name: 'iPhone 14-3',
              udid: 'uuid-8',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
              lastUsed: new Date('2025-01-08T10:00:00Z'),
              bootHistory: [],
            },
            {
              name: 'iPhone 14-4',
              udid: 'uuid-9',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
              lastUsed: new Date('2025-01-07T10:00:00Z'),
              bootHistory: [],
            },
            {
              name: 'iPhone 14-5',
              udid: 'uuid-10',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
              lastUsed: new Date('2025-01-06T10:00:00Z'),
              bootHistory: [],
            },
          ],
        },
        runtimes: mockSimulatorList.runtimes,
        devicetypes: [],
        lastUpdated: new Date(),
      };

      mockSimulatorCache.getSimulatorList.mockResolvedValue(largeSimulatorList as any);

      const result = await simctlListTool({ concise: false, outputFormat: 'json' });
      const responseData = JSON.parse(result.content[0].text);

      // Should have metadata
      expect(responseData).toHaveProperty('metadata');
      expect(responseData.metadata.totalDevicesInCache).toBe(10);
      expect(responseData.metadata.devicesReturned).toBe(5);
      expect(responseData.metadata.limitApplied).toBe(5);

      // Count total devices in response
      const totalDevicesInResponse = Object.values(responseData.devices).reduce(
        (sum: number, devices: any) => sum + (Array.isArray(devices) ? devices.length : 0),
        0
      );
      expect(totalDevicesInResponse).toBe(5);
    });

    it('should respect custom max parameter', async () => {
      const largeList = {
        devices: {
          'iOS 18.5': [
            {
              name: 'iPhone 15-1',
              udid: 'uuid-1',
              lastUsed: new Date('2025-01-15T10:00:00Z'),
              bootHistory: [],
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
            {
              name: 'iPhone 15-2',
              udid: 'uuid-2',
              lastUsed: new Date('2025-01-14T10:00:00Z'),
              bootHistory: [],
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
            {
              name: 'iPhone 15-3',
              udid: 'uuid-3',
              lastUsed: new Date('2025-01-13T10:00:00Z'),
              bootHistory: [],
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
          ],
        },
        runtimes: mockSimulatorList.runtimes,
        devicetypes: [],
        lastUpdated: new Date(),
      };

      mockSimulatorCache.getSimulatorList.mockResolvedValue(largeList as any);

      // Test max=2
      const result = await simctlListTool({ concise: false, outputFormat: 'json', max: 2 });
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData.metadata.limitApplied).toBe(2);
      expect(responseData.metadata.devicesReturned).toBe(2);
    });

    it('should sort devices by lastUsed date', async () => {
      const sortableList = {
        devices: {
          'iOS 18.5': [
            {
              name: 'Old Device',
              udid: 'uuid-old',
              lastUsed: new Date('2025-01-01T10:00:00Z'),
              bootHistory: [],
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
            {
              name: 'New Device',
              udid: 'uuid-new',
              lastUsed: new Date('2025-01-20T10:00:00Z'),
              bootHistory: [],
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
            {
              name: 'Middle Device',
              udid: 'uuid-mid',
              lastUsed: new Date('2025-01-10T10:00:00Z'),
              bootHistory: [],
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
          ],
        },
        runtimes: mockSimulatorList.runtimes,
        devicetypes: [],
        lastUpdated: new Date(),
      };

      mockSimulatorCache.getSimulatorList.mockResolvedValue(sortableList as any);

      const result = await simctlListTool({ concise: false, outputFormat: 'json', max: 3 });
      const responseData = JSON.parse(result.content[0].text);

      const devices = Object.values(responseData.devices).flat() as any[];
      expect(devices[0].name).toBe('New Device');
      expect(devices[1].name).toBe('Middle Device');
      expect(devices[2].name).toBe('Old Device');
    });

    it('should handle devices without lastUsed date', async () => {
      const mixedList = {
        devices: {
          'iOS 18.5': [
            {
              name: 'Device with date',
              udid: 'uuid-1',
              lastUsed: new Date('2025-01-20T10:00:00Z'),
              bootHistory: [],
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
            {
              name: 'Device without date',
              udid: 'uuid-2',
              lastUsed: undefined,
              bootHistory: [],
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
          ],
        },
        runtimes: mockSimulatorList.runtimes,
        devicetypes: [],
        lastUpdated: new Date(),
      };

      mockSimulatorCache.getSimulatorList.mockResolvedValue(mixedList as any);

      const result = await simctlListTool({ concise: false, outputFormat: 'json', max: 2 });
      const responseData = JSON.parse(result.content[0].text);

      const devices = Object.values(responseData.devices).flat() as any[];
      // Device with lastUsed should come first
      expect(devices[0].name).toBe('Device with date');
      expect(devices[1].name).toBe('Device without date');
    });

    it('should include metadata about limiting', async () => {
      const result = await simctlListTool({ concise: false, outputFormat: 'json', max: 10 });
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData.metadata).toEqual({
        totalDevicesInCache: 3,
        devicesReturned: 3,
        limitApplied: 10,
      });
    });

    it('should ignore max parameter in concise mode', async () => {
      const result = await simctlListTool({ concise: true, max: 2 });

      // In concise mode, should use progressive disclosure, not limiting
      expect(createProgressiveSimulatorResponse).toHaveBeenCalled();
      expect(mockResponseCache.store).toHaveBeenCalled();
    });

    it('should return all devices when max >= total devices', async () => {
      // mockSimulatorList has 3 devices total
      const result = await simctlListTool({ concise: false, outputFormat: 'json', max: 100 });
      const responseData = JSON.parse(result.content[0].text);

      expect(responseData.metadata.devicesReturned).toBe(3);
      expect(responseData.metadata.limitApplied).toBe(100);
    });
  });
});
