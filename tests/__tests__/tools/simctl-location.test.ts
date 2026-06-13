import { simctlLocationTool } from '../../../src/tools/simctl/location.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Suppress console.error noise
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  jest.restoreAllMocks();
});

// Mock command execution
jest.mock('../../../src/utils/command.js', () => ({
  executeCommand: jest.fn().mockResolvedValue({
    code: 0,
    stdout: '',
    stderr: '',
  }),
}));

import { executeCommand } from '../../../src/utils/command.js';
const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

describe('simctlLocationTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteCommand.mockResolvedValue({ code: 0, stdout: '', stderr: '' });
  });

  // === coords ===

  describe('lat/lng coordinate action', () => {
    it('should build the correct set command', async () => {
      const result = await simctlLocationTool({ udid: 'test-udid', lat: 53.3498, lng: -6.2603 });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('xcrun simctl location "test-udid" set 53.3498,-6.2603'),
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text);
      expect(data.action).toBe('set_coordinate');
      expect(data.lat).toBe(53.3498);
      expect(data.lng).toBe(-6.2603);
    });

    it('should default to booted device when udid is omitted', async () => {
      await simctlLocationTool({ lat: 10, lng: 20 });
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('"booted"'),
        expect.any(Object)
      );
    });

    it('should reject latitude out of range (lat=200)', async () => {
      await expect(simctlLocationTool({ lat: 200, lng: 0 })).rejects.toThrow(McpError);
    });

    it('should reject latitude below -90', async () => {
      await expect(simctlLocationTool({ lat: -91, lng: 0 })).rejects.toThrow(McpError);
    });

    it('should reject longitude out of range (lng=200)', async () => {
      await expect(simctlLocationTool({ lat: 0, lng: 200 })).rejects.toThrow(McpError);
    });

    it('should accept boundary values lat=90, lng=180', async () => {
      const result = await simctlLocationTool({ lat: 90, lng: 180 });
      expect(result.isError).toBe(false);
    });

    it('should return isError=true when command fails', async () => {
      mockExecuteCommand.mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'set failed' });
      const result = await simctlLocationTool({ lat: 10, lng: 20 });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
    });
  });

  // === city ===

  describe('city action', () => {
    it('should resolve nyc to New York City coordinates', async () => {
      const result = await simctlLocationTool({ city: 'nyc' });
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('set 40.7128,-74.006'),
        expect.any(Object)
      );
      const data = JSON.parse(result.content[0].text);
      expect(data.action).toBe('set_city');
      expect(data.lat).toBe(40.7128);
      expect(data.lng).toBe(-74.006);
    });

    it('should resolve Dublin (case-insensitive)', async () => {
      const result = await simctlLocationTool({ city: 'Dublin' });
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('set 53.3498,-6.2603'),
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });

    it('should resolve sf alias to San Francisco', async () => {
      const result = await simctlLocationTool({ city: 'sf' });
      const data = JSON.parse(result.content[0].text);
      expect(data.lat).toBe(37.7749);
      expect(data.lng).toBe(-122.4194);
    });

    it('should reject unknown city and list available cities', async () => {
      await expect(simctlLocationTool({ city: 'atlantis' })).rejects.toThrow(McpError);
    });

    it('should not expose alias names (nyc/sf/la) in the error list', async () => {
      try {
        await simctlLocationTool({ city: 'atlantis' });
      } catch (err) {
        expect((err as McpError).message).not.toMatch(/\bnyc\b/);
        expect((err as McpError).message).not.toMatch(/\bsf\b/);
        expect((err as McpError).message).not.toMatch(/\bla\b/);
      }
    });
  });

  // === gpx ===

  describe('gpx action', () => {
    it('should build the correct run command', async () => {
      const result = await simctlLocationTool({ gpx: 'FreewayDrive' });
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('xcrun simctl location "booted" run FreewayDrive'),
        expect.any(Object)
      );
      const data = JSON.parse(result.content[0].text);
      expect(data.action).toBe('run_gpx');
      expect(data.scenario).toBe('FreewayDrive');
    });
  });

  // === waypoints ===

  describe('waypoints action', () => {
    it('should build the start command with speed and waypoints', async () => {
      const result = await simctlLocationTool({
        waypoints: '53.34,-6.26 51.50,-0.12',
        speed: 15,
      });

      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('start --speed=15 53.34,-6.26 51.5,-0.12'),
        expect.any(Object)
      );
      const data = JSON.parse(result.content[0].text);
      expect(data.action).toBe('start_waypoints');
      expect(data.speed).toBe(15);
      expect(data.waypoints).toHaveLength(2);
    });

    it('should default speed to 20', async () => {
      await simctlLocationTool({ waypoints: '53.34,-6.26 51.50,-0.12' });
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('--speed=20'),
        expect.any(Object)
      );
    });

    it('should reject fewer than 2 waypoints', async () => {
      await expect(simctlLocationTool({ waypoints: '53.34,-6.26' })).rejects.toThrow(McpError);
    });

    it('should reject malformed waypoint pair', async () => {
      await expect(simctlLocationTool({ waypoints: 'notacoord 51.50,-0.12' })).rejects.toThrow(
        McpError
      );
    });

    it('should handle 3+ waypoints', async () => {
      const result = await simctlLocationTool({
        waypoints: '53.34,-6.26 51.50,-0.12 48.85,2.35',
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.waypoints).toHaveLength(3);
    });
  });

  // === clear ===

  describe('clear action', () => {
    it('should build the correct clear command', async () => {
      const result = await simctlLocationTool({ udid: 'test-device', clear: true });
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('xcrun simctl location "test-device" clear'),
        expect.any(Object)
      );
      const data = JSON.parse(result.content[0].text);
      expect(data.action).toBe('clear');
      expect(data.success).toBe(true);
    });
  });

  // === listScenarios ===

  describe('listScenarios action', () => {
    it('should build the list command and parse output', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        code: 0,
        stdout: 'FreewayDrive\nApplePark\nCityBicycleRide\n',
        stderr: '',
      });
      const result = await simctlLocationTool({ listScenarios: true });
      expect(mockExecuteCommand).toHaveBeenCalledWith(
        expect.stringContaining('xcrun simctl location "booted" list'),
        expect.any(Object)
      );
      const data = JSON.parse(result.content[0].text);
      expect(data.action).toBe('list_scenarios');
      expect(data.scenarios).toEqual(['FreewayDrive', 'ApplePark', 'CityBicycleRide']);
    });
  });

  // === validation ===

  describe('exactly-one-action validation', () => {
    it('should reject when no action is provided', async () => {
      await expect(simctlLocationTool({})).rejects.toThrow(McpError);
    });

    it('should reject when two actions are specified (city + clear)', async () => {
      await expect(simctlLocationTool({ city: 'Dublin', clear: true })).rejects.toThrow(McpError);
    });

    it('should reject when lat is provided without lng', async () => {
      await expect(simctlLocationTool({ lat: 53.3498 })).rejects.toThrow(McpError);
    });

    it('should reject when lng is provided without lat', async () => {
      await expect(simctlLocationTool({ lng: -6.2603 })).rejects.toThrow(McpError);
    });
  });

  // === response shape ===

  describe('response format', () => {
    it('should return content array with type=text', async () => {
      const result = await simctlLocationTool({ clear: true });
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in text field', async () => {
      const result = await simctlLocationTool({ clear: true });
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include action, udid, success, message, guidance in all responses', async () => {
      const result = await simctlLocationTool({ clear: true });
      const data = JSON.parse(result.content[0].text);
      expect(data).toHaveProperty('action');
      expect(data).toHaveProperty('udid');
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('message');
      expect(data).toHaveProperty('guidance');
    });
  });
});
