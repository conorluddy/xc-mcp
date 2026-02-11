import { jest } from '@jest/globals';

// Shared mocks
const mockExecuteCommandStreaming = jest.fn(async (..._args: any[]) => undefined as any);
const mockBuildXcodebuildCommand = jest.fn((..._args: any[]) => '');
const mockExtractBuildSummary = jest.fn((..._args: any[]) => undefined as any);
const mockResponseCacheStore = jest.fn((..._args: any[]) => undefined as any);
const mockGetPreferredBuildConfig = jest.fn(async (..._args: any[]) => undefined as any);
const mockRecordBuildResult = jest.fn((..._args: any[]) => undefined as any);
const mockGetPreferredSimulator = jest.fn(async (..._args: any[]) => undefined as any);
const mockGetSimulatorList = jest.fn(async (..._args: any[]) => undefined as any);
const mockRecordSimulatorUsage = jest.fn((..._args: any[]) => undefined as any);
const mockCreateConfigManager = jest.fn((..._args: any[]) => undefined as any);

jest.mock('../../../src/utils/validation.js', () => ({
  validateProjectPath: jest.fn(async () => undefined),
  validateScheme: jest.fn(),
}));

jest.mock('../../../src/utils/command.js', () => ({
  executeCommandStreaming: (...args: any[]) => mockExecuteCommandStreaming(...args),
  buildXcodebuildCommand: (...args: any[]) => mockBuildXcodebuildCommand(...args),
}));

jest.mock('../../../src/utils/response-cache.js', () => ({
  extractBuildSummary: (...args: any[]) => mockExtractBuildSummary(...args),
  responseCache: {
    store: (...args: any[]) => mockResponseCacheStore(...args),
  },
}));

jest.mock('../../../src/state/project-cache.js', () => ({
  projectCache: {
    getPreferredBuildConfig: (...args: any[]) => mockGetPreferredBuildConfig(...args),
    recordBuildResult: (...args: any[]) => mockRecordBuildResult(...args),
  },
}));

jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: {
    getPreferredSimulator: (...args: any[]) => mockGetPreferredSimulator(...args),
    getSimulatorList: (...args: any[]) => mockGetSimulatorList(...args),
    recordSimulatorUsage: (...args: any[]) => mockRecordSimulatorUsage(...args),
  },
}));

jest.mock('../../../src/utils/config.js', () => ({
  createConfigManager: (...args: any[]) => mockCreateConfigManager(...args),
}));

describe('xcodebuild-build parameter resolution', () => {
  const projectPath = 'SpaceTime.xcodeproj';
  const scheme = 'SpaceTime';

  const successResult = {
    stdout: '',
    stderr: '',
    code: 0,
    timedOut: false,
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockBuildXcodebuildCommand.mockImplementation((action: string, path: string, opts: any) =>
      JSON.stringify({ action, path, opts })
    );
    mockExecuteCommandStreaming.mockResolvedValue(successResult);
    mockExtractBuildSummary.mockReturnValue({
      success: true,
      errors: [],
      warnings: [],
      errorCount: 0,
      warningCount: 0,
      buildSizeBytes: 0,
    });
    mockResponseCacheStore.mockReturnValue('build-id');
    mockCreateConfigManager.mockReturnValue({
      recordSuccessfulBuild: jest.fn(),
    });
  });

  async function loadTool() {
    const mod = await import('../../../src/tools/xcodebuild/build.js');
    return mod.xcodebuildBuildTool;
  }

  function responseFrom(result: any) {
    return JSON.parse(result.content[0].text);
  }

  it('uses explicit destination and does not override it', async () => {
    mockGetPreferredBuildConfig.mockResolvedValue({
      scheme,
      configuration: 'Release',
      destination: 'platform=iOS Simulator,id=CACHED',
    });

    const xcodebuildBuildTool = await loadTool();

    const result = await xcodebuildBuildTool({
      projectPath,
      scheme,
      destination: 'generic/platform=macOS,name=Any Mac',
      sdk: 'macosx',
    });

    const lastCall = mockBuildXcodebuildCommand.mock.calls.at(-1)![2] as any;
    expect(lastCall.destination).toBe('generic/platform=macOS,name=Any Mac');
    expect(mockGetPreferredSimulator).not.toHaveBeenCalled();

    const response = responseFrom(result);
    expect(response.intelligence.usedSmartDestination).toBe(false);
  });

  it('skips cached simulator destination when building for macOS', async () => {
    mockGetPreferredBuildConfig.mockResolvedValue({
      scheme,
      configuration: 'Debug',
      destination: 'platform=iOS Simulator,id=CACHED',
    });

    const xcodebuildBuildTool = await loadTool();

    const result = await xcodebuildBuildTool({
      projectPath,
      scheme,
      sdk: 'macosx',
    });

    const lastCall = mockBuildXcodebuildCommand.mock.calls.at(-1)![2] as any;
    expect(lastCall.destination).toBeUndefined();

    const response = responseFrom(result);
    expect(response.intelligence.usedSmartDestination).toBe(false);
  });

  it('reuses cached destination when platform matches sdk', async () => {
    mockGetPreferredBuildConfig.mockResolvedValue({
      scheme,
      configuration: 'Debug',
      destination: 'platform=tvOS Simulator,id=TV-1',
    });

    const xcodebuildBuildTool = await loadTool();

    const result = await xcodebuildBuildTool({
      projectPath,
      scheme,
      sdk: 'tvossimulator',
    });

    const lastCall = mockBuildXcodebuildCommand.mock.calls.at(-1)![2] as any;
    expect(lastCall.destination).toBe('platform=tvOS Simulator,id=TV-1');

    const response = responseFrom(result);
    expect(response.intelligence.usedSmartDestination).toBe(true);
  });

  it('selects a platform-matched simulator when no cached destination', async () => {
    mockGetPreferredBuildConfig.mockResolvedValue({
      scheme,
      configuration: 'Debug',
    });

    mockGetPreferredSimulator.mockResolvedValue(null);
    mockGetSimulatorList.mockResolvedValue({
      devices: {
        'com.apple.CoreSimulator.SimRuntime.tvOS-18-0': [
          {
            udid: 'TV-UDID',
            name: 'Apple TV',
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.Apple-TV-4K',
            state: 'Shutdown',
            isAvailable: true,
            availability: 'available',
            bootHistory: [],
          },
        ],
        'com.apple.CoreSimulator.SimRuntime.iOS-18-0': [
          {
            udid: 'PHONE',
            name: 'iPhone',
            deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-16',
            state: 'Shutdown',
            isAvailable: true,
            availability: 'available',
            bootHistory: [],
          },
        ],
      },
      runtimes: [],
      devicetypes: [],
      lastUpdated: new Date(),
      preferredByProject: new Map(),
    });

    const xcodebuildBuildTool = await loadTool();

    const result = await xcodebuildBuildTool({
      projectPath,
      scheme,
      sdk: 'tvossimulator',
    });

    const lastCall = mockBuildXcodebuildCommand.mock.calls.at(-1)![2] as any;
    expect(lastCall.destination).toBe('platform=tvOS Simulator,id=TV-UDID');

    const response = responseFrom(result);
    expect(response.intelligence.usedSmartDestination).toBe(true);
  });

  it('prioritizes caller-provided configuration over cached', async () => {
    mockGetPreferredBuildConfig.mockResolvedValue({
      scheme,
      configuration: 'Debug',
    });

    const xcodebuildBuildTool = await loadTool();

    await xcodebuildBuildTool({
      projectPath,
      scheme,
      configuration: 'Release',
    });

    const lastCall = mockBuildXcodebuildCommand.mock.calls.at(-1)![2] as any;
    expect(lastCall.configuration).toBe('Release');
  });

  it('uses cached configuration when caller does not provide one and marks smart usage', async () => {
    mockGetPreferredBuildConfig.mockResolvedValue({
      scheme,
      configuration: 'Release',
    });

    const xcodebuildBuildTool = await loadTool();

    const result = await xcodebuildBuildTool({
      projectPath,
      scheme,
    });

    const lastCall = mockBuildXcodebuildCommand.mock.calls.at(-1)![2] as any;
    expect(lastCall.configuration).toBe('Release');

    const response = responseFrom(result);
    expect(response.intelligence.usedSmartConfiguration).toBe(true);
  });
});
