import {
  parseBuildSettingsJson,
  extractDeploymentTargetVersion,
  parseDeviceFamilies,
} from '../../../src/utils/build-settings-parser.js';

describe('build-settings-parser', () => {
  describe('parseBuildSettingsJson', () => {
    it('should parse valid xcodebuild JSON output', () => {
      const jsonOutput = JSON.stringify([
        {
          action: 'build',
          target: 'MyApp',
          buildSettings: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.example.MyApp',
            IPHONEOS_DEPLOYMENT_TARGET: '15.0',
            TARGETED_DEVICE_FAMILY: '1,2',
            INFOPLIST_FILE: 'MyApp/Info.plist',
            CONFIGURATION_BUILD_DIR: '/path/to/build',
            PRODUCT_NAME: 'MyApp',
            PRODUCT_MODULE_NAME: 'MyApp',
            NSCameraUsageDescription: 'Camera permission description',
          },
        },
      ]);

      const result = parseBuildSettingsJson(jsonOutput);

      expect(result).toEqual({
        PRODUCT_BUNDLE_IDENTIFIER: 'com.example.MyApp',
        DEPLOYMENT_TARGET: '15.0',
        TARGETED_DEVICE_FAMILY: '1,2',
        INFOPLIST_FILE: 'MyApp/Info.plist',
        CONFIGURATION_BUILD_DIR: '/path/to/build',
        PRODUCT_NAME: 'MyApp',
        PRODUCT_MODULE_NAME: 'MyApp',
        NSCameraUsageDescription: 'Camera permission description',
        NSLocationWhenInUseUsageDescription: undefined,
        NSLocationAlwaysAndWhenInUseUsageDescription: undefined,
        NSMicrophoneUsageDescription: undefined,
        NSContactsUsageDescription: undefined,
        NSCalendarsUsageDescription: undefined,
        NSRemindersUsageDescription: undefined,
        NSPhotosUsageDescription: undefined,
        NSHealthShareUsageDescription: undefined,
        NSHealthUpdateUsageDescription: undefined,
        NSBluetoothAlwaysUsageDescription: undefined,
        NSUserTrackingUsageDescription: undefined,
        NSSiriUsageDescription: undefined,
      });
    });

    it('should use macOS deployment target if iOS not present', () => {
      const jsonOutput = JSON.stringify([
        {
          buildSettings: {
            MACOSX_DEPLOYMENT_TARGET: '12.0',
            PRODUCT_BUNDLE_IDENTIFIER: 'com.example.MyMacApp',
            PRODUCT_NAME: 'MyMacApp',
            CONFIGURATION_BUILD_DIR: '/path',
            INFOPLIST_FILE: 'Info.plist',
            TARGETED_DEVICE_FAMILY: '1',
          },
        },
      ]);

      const result = parseBuildSettingsJson(jsonOutput);

      expect(result.DEPLOYMENT_TARGET).toBe('12.0');
    });

    it('should use default deployment target if none present', () => {
      const jsonOutput = JSON.stringify([
        {
          buildSettings: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.example.MyApp',
            PRODUCT_NAME: 'MyApp',
            CONFIGURATION_BUILD_DIR: '/path',
            INFOPLIST_FILE: 'Info.plist',
            TARGETED_DEVICE_FAMILY: '1',
          },
        },
      ]);

      const result = parseBuildSettingsJson(jsonOutput);

      expect(result.DEPLOYMENT_TARGET).toBe('14.0');
    });

    it('should use PRODUCT_NAME for module name if not specified', () => {
      const jsonOutput = JSON.stringify([
        {
          buildSettings: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.example.MyApp',
            PRODUCT_NAME: 'MyApp',
            CONFIGURATION_BUILD_DIR: '/path',
            INFOPLIST_FILE: 'Info.plist',
            TARGETED_DEVICE_FAMILY: '1',
            IPHONEOS_DEPLOYMENT_TARGET: '15.0',
          },
        },
      ]);

      const result = parseBuildSettingsJson(jsonOutput);

      expect(result.PRODUCT_MODULE_NAME).toBe('MyApp');
    });

    it('should throw error for invalid JSON', () => {
      const invalidJson = 'not valid json';

      expect(() => parseBuildSettingsJson(invalidJson)).toThrow('Invalid JSON from xcodebuild');
    });

    it('should throw error for non-array JSON', () => {
      const jsonObject = JSON.stringify({ foo: 'bar' });

      expect(() => parseBuildSettingsJson(jsonObject)).toThrow('expected array');
    });

    it('should throw error for empty array', () => {
      const emptyArray = JSON.stringify([]);

      expect(() => parseBuildSettingsJson(emptyArray)).toThrow('Empty build settings array');
    });

    it('should throw error when buildSettings missing', () => {
      const noSettings = JSON.stringify([{ action: 'build' }]);

      expect(() => parseBuildSettingsJson(noSettings)).toThrow('No buildSettings found');
    });

    it('should parse all capability descriptions', () => {
      const jsonOutput = JSON.stringify([
        {
          buildSettings: {
            PRODUCT_BUNDLE_IDENTIFIER: 'com.example.MyApp',
            PRODUCT_NAME: 'MyApp',
            CONFIGURATION_BUILD_DIR: '/path',
            INFOPLIST_FILE: 'Info.plist',
            TARGETED_DEVICE_FAMILY: '1',
            IPHONEOS_DEPLOYMENT_TARGET: '15.0',
            NSCameraUsageDescription: 'Camera',
            NSLocationWhenInUseUsageDescription: 'Location when in use',
            NSLocationAlwaysAndWhenInUseUsageDescription: 'Location always',
            NSMicrophoneUsageDescription: 'Microphone',
            NSContactsUsageDescription: 'Contacts',
            NSCalendarsUsageDescription: 'Calendars',
            NSRemindersUsageDescription: 'Reminders',
            NSPhotosUsageDescription: 'Photos',
            NSHealthShareUsageDescription: 'Health read',
            NSHealthUpdateUsageDescription: 'Health write',
            NSBluetoothAlwaysUsageDescription: 'Bluetooth',
            NSUserTrackingUsageDescription: 'Tracking',
            NSSiriUsageDescription: 'Siri',
          },
        },
      ]);

      const result = parseBuildSettingsJson(jsonOutput);

      expect(result.NSCameraUsageDescription).toBe('Camera');
      expect(result.NSLocationWhenInUseUsageDescription).toBe('Location when in use');
      expect(result.NSMicrophoneUsageDescription).toBe('Microphone');
      expect(result.NSHealthShareUsageDescription).toBe('Health read');
      expect(result.NSSiriUsageDescription).toBe('Siri');
    });
  });

  describe('extractDeploymentTargetVersion', () => {
    it('should extract major version from deployment target', () => {
      expect(extractDeploymentTargetVersion('15.0')).toBe(15);
      expect(extractDeploymentTargetVersion('16.4')).toBe(16);
      expect(extractDeploymentTargetVersion('17.0')).toBe(17);
    });

    it('should return default for invalid format', () => {
      expect(extractDeploymentTargetVersion('invalid')).toBe(14);
      expect(extractDeploymentTargetVersion('')).toBe(14);
    });
  });

  describe('parseDeviceFamilies', () => {
    it('should parse universal app (iPhone + iPad)', () => {
      const result = parseDeviceFamilies('1,2');

      expect(result).toEqual({
        supportsIPhone: true,
        supportsIPad: true,
      });
    });

    it('should parse iPhone-only app', () => {
      const result = parseDeviceFamilies('1');

      expect(result).toEqual({
        supportsIPhone: true,
        supportsIPad: false,
      });
    });

    it('should parse iPad-only app', () => {
      const result = parseDeviceFamilies('2');

      expect(result).toEqual({
        supportsIPhone: false,
        supportsIPad: true,
      });
    });

    it('should handle whitespace in family string', () => {
      const result = parseDeviceFamilies('1, 2');

      expect(result).toEqual({
        supportsIPhone: true,
        supportsIPad: true,
      });
    });
  });
});
