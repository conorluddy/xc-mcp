import { validateCapabilitiesTool } from '../../../src/tools/xcodebuild/validate-capabilities.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock build settings cache
jest.mock('../../../src/state/build-settings-cache.js', () => ({
  buildSettingsCache: {
    getBuildSettings: jest.fn().mockResolvedValue({
      NSCameraUsageDescription: 'This app needs camera access for photos',
      NSLocationWhenInUseUsageDescription: 'This app needs location for maps',
      NSPhotoLibraryUsageDescription: 'This app needs photo library access',
    }),
  },
}));

describe('validateCapabilitiesTool', () => {
  const validProjectPath = '/path/to/MyApp.xcworkspace';
  const validScheme = 'MyApp';
  const validUDID = 'device-iphone16pro';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful capability validation', () => {
    it('should validate app capabilities', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.capabilities).toBeDefined();
    });

    it('should extract required capabilities from build settings', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.capabilities.required).toBeDefined();
      expect(Array.isArray(response.capabilities.required)).toBe(true);
      expect(response.capabilities.required.length).toBe(3);

      // Check extracted capabilities
      const capabilities = response.capabilities.required;
      expect(capabilities.find((c: any) => c.service === 'camera')).toBeDefined();
      expect(capabilities.find((c: any) => c.service === 'location')).toBeDefined();
      expect(capabilities.find((c: any) => c.service === 'photos')).toBeDefined();
    });

    it('should include capability descriptions', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      const cameraCapability = response.capabilities.required.find(
        (c: any) => c.service === 'camera'
      );

      expect(cameraCapability).toBeDefined();
      expect(cameraCapability.description).toBe('Camera access');
      expect(cameraCapability.infoPlistKey).toBe('NSCameraUsageDescription');
    });

    it('should include capabilities count', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.capabilities.count).toBe(3);
    });

    it('should provide guidance with capability summary', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);

      // Should include count
      expect(response.guidance.some((g: string) => g.includes('3 required capabilities'))).toBe(
        true
      );
    });

    it('should provide permission grant commands when udid specified', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
        udid: validUDID,
      });

      const response = JSON.parse(result.content[0].text);

      // Should include simctl-privacy commands
      expect(response.guidance.some((g: string) => g.includes('To grant permissions'))).toBe(true);
      expect(response.guidance.some((g: string) => g.includes('simctl-privacy'))).toBe(true);
      expect(response.guidance.some((g: string) => g.includes(validUDID))).toBe(true);
      expect(response.guidance.some((g: string) => g.includes('service: "camera"'))).toBe(true);
    });

    it('should prompt for udid when not specified', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) => g.includes('Specify udid parameter'))).toBe(
        true
      );
    });

    it('should handle projects with no capabilities', async () => {
      const { buildSettingsCache } = await import('../../../src/state/build-settings-cache.js');
      (buildSettingsCache.getBuildSettings as jest.Mock).mockResolvedValueOnce({});

      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.capabilities.required.length).toBe(0);
      expect(response.capabilities.count).toBe(0);
    });

    it('should handle all capability types', async () => {
      const { buildSettingsCache } = await import('../../../src/state/build-settings-cache.js');
      (buildSettingsCache.getBuildSettings as jest.Mock).mockResolvedValueOnce({
        NSCameraUsageDescription: 'Camera',
        NSMicrophoneUsageDescription: 'Microphone',
        NSLocationWhenInUseUsageDescription: 'Location when in use',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Location always',
        NSContactsUsageDescription: 'Contacts',
        NSPhotoLibraryUsageDescription: 'Photos',
        NSCalendarsUsageDescription: 'Calendar',
        NSHealthShareUsageDescription: 'Health',
        NSRemindersUsageDescription: 'Reminders',
        NSMotionUsageDescription: 'Motion',
      });

      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);

      // Should have all 10 capabilities (note: location appears twice but maps to same service)
      expect(response.capabilities.required.length).toBe(10);

      const services = response.capabilities.required.map((c: any) => c.service);
      expect(services).toContain('camera');
      expect(services).toContain('microphone');
      expect(services).toContain('location');
      expect(services).toContain('contacts');
      expect(services).toContain('photos');
      expect(services).toContain('calendar');
      expect(services).toContain('health');
      expect(services).toContain('reminders');
      expect(services).toContain('motion');
    });
  });

  describe('input validation', () => {
    it('should reject missing projectPath', async () => {
      await expect(
        validateCapabilitiesTool({
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject missing scheme', async () => {
      await expect(
        validateCapabilitiesTool({
          projectPath: validProjectPath,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty projectPath', async () => {
      await expect(
        validateCapabilitiesTool({
          projectPath: '',
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty scheme', async () => {
      await expect(
        validateCapabilitiesTool({
          projectPath: validProjectPath,
          scheme: '',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('error handling', () => {
    it('should handle build settings cache errors', async () => {
      const { buildSettingsCache } = await import('../../../src/state/build-settings-cache.js');
      (buildSettingsCache.getBuildSettings as jest.Mock).mockRejectedValueOnce(
        new Error('Failed to read build settings')
      );

      await expect(
        validateCapabilitiesTool({
          projectPath: validProjectPath,
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('response format', () => {
    it('should return proper MCP response format', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
      expect(result.isError).toBe(false);
    });

    it('should return valid JSON in text content', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include all required response fields', async () => {
      const result = await validateCapabilitiesTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('capabilities');
      expect(response).toHaveProperty('guidance');
      expect(response.capabilities).toHaveProperty('required');
      expect(response.capabilities).toHaveProperty('count');
    });
  });
});
