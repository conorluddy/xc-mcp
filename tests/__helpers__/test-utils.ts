import { jest } from '@jest/globals';

// Access mock functions through jest.requireMock
export const setMockCommandConfig = (config: any) => {
  const mock = jest.requireMock('../../src/utils/command.js') as any;
  if (mock.setMockCommandConfig) {
    mock.setMockCommandConfig(config);
  }
};

export const clearMockCommandConfig = () => {
  const mock = jest.requireMock('../../src/utils/command.js') as any;
  if (mock.clearMockCommandConfig) {
    mock.clearMockCommandConfig();
  }
};

export const setXcodeValidation = (installed: boolean) => {
  const mock = jest.requireMock('../../src/utils/validation.js') as any;
  if (mock.setXcodeValidation) {
    mock.setXcodeValidation(installed);
  }
};

export const setupTest = () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearMockCommandConfig();
    setXcodeValidation(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    clearMockCommandConfig();
  });
};

export const mockXcodebuildList = () => {
  const listOutput = JSON.stringify({
    project: {
      name: 'TestProject',
      configurations: ['Debug', 'Release'],
      targets: ['TestApp', 'TestAppTests'],
      schemes: ['TestApp', 'TestApp-Dev']
    }
  });
  
  setMockCommandConfig({
    // Without project path
    'xcodebuild -list -json': {
      stdout: listOutput,
      stderr: '',
      code: 0
    },
    // With project path
    'xcodebuild -project "Test.xcodeproj" -list -json': {
      stdout: listOutput,
      stderr: '',
      code: 0
    },
    // With workspace path
    'xcodebuild -workspace "Test.xcworkspace" -list -json': {
      stdout: JSON.stringify({
        workspace: {
          name: 'TestWorkspace',
          schemes: ['WorkspaceScheme']
        }
      }),
      stderr: '',
      code: 0
    }
  });
};

export const mockXcodebuildVersion = () => {
  setMockCommandConfig({
    'xcodebuild -version': {
      stdout: 'Xcode 15.0\nBuild version 15A240d',
      stderr: '',
      code: 0
    }
  });
};

export const mockXcodebuildShowSDKs = () => {
  setMockCommandConfig({
    'xcodebuild -showsdks -json': {
      stdout: JSON.stringify([
        {
          canonicalName: 'iphoneos17.0',
          displayName: 'iOS 17.0',
          platform: 'iphoneos',
          version: '17.0',
          buildID: '21A5277g'
        },
        {
          canonicalName: 'iphonesimulator17.0',
          displayName: 'iOS 17.0 Simulator',
          platform: 'iphonesimulator',
          version: '17.0',
          buildID: '21A5277g'
        }
      ]),
      stderr: '',
      code: 0
    }
  });
};

export const mockSimctlList = () => {
  setMockCommandConfig({
    'xcrun simctl list devices -j': {
      stdout: JSON.stringify({
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            {
              dataPath: '/path/to/device/data',
              dataPathSize: 1234567890,
              logPath: '/path/to/logs',
              udid: 'test-device-1',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
              state: 'Shutdown',
              name: 'iPhone 15'
            },
            {
              dataPath: '/path/to/device/data2',
              dataPathSize: 2345678901,
              logPath: '/path/to/logs2',
              udid: 'test-device-2',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-14',
              state: 'Booted',
              name: 'iPhone 14'
            }
          ]
        }
      }),
      stderr: '',
      code: 0
    }
  });
};

export const mockSimctlBoot = (deviceId: string) => {
  setMockCommandConfig({
    [`xcrun simctl boot ${deviceId}`]: {
      stdout: '',
      stderr: '',
      code: 0
    }
  });
};

export const mockSimctlShutdown = (deviceId: string) => {
  setMockCommandConfig({
    [`xcrun simctl shutdown ${deviceId}`]: {
      stdout: '',
      stderr: '',
      code: 0
    }
  });
};

export const mockXcodebuildBuild = (args: string[] = []) => {
  const fullCommand = `xcodebuild ${args.join(' ')}`;
  setMockCommandConfig({
    [fullCommand]: {
      stdout: `Building target...\nBuild succeeded\n`,
      stderr: '',
      code: 0
    }
  });
};

export const mockBuildError = (args: string[] = []) => {
  const fullCommand = `xcodebuild ${args.join(' ')}`;
  setMockCommandConfig({
    [fullCommand]: {
      stdout: '',
      stderr: 'Build failed: error: no such module \'Foundation\'',
      code: 65
    }
  });
};