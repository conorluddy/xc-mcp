import { buildAndRunTool } from '../../../src/tools/workflows/build-and-run.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';

// Mock all the tools used in the workflow
jest.mock('../../../src/tools/xcodebuild/build.js', () => ({
  xcodebuildBuildTool: jest.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          summary: { duration: 5000, errorCount: 0 },
        }),
      },
    ],
  }),
}));

jest.mock('../../../src/tools/simctl/boot.js', () => ({
  simctlBootTool: jest.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true }),
      },
    ],
  }),
}));

jest.mock('../../../src/tools/simctl/suggest.js', () => ({
  simctlSuggestTool: jest.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          suggestions: [
            {
              simulator: {
                udid: 'device-iphone16pro',
                name: 'iPhone 16 Pro',
              },
            },
          ],
        }),
      },
    ],
  }),
}));

jest.mock('../../../src/tools/simctl/install.js', () => ({
  simctlInstallTool: jest.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          bundleId: 'com.example.MyApp',
        }),
      },
    ],
  }),
}));

jest.mock('../../../src/tools/simctl/launch.js', () => ({
  simctlLaunchTool: jest.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({ success: true }),
      },
    ],
  }),
}));

jest.mock('../../../src/tools/simctl/io.js', () => ({
  simctlIoTool: jest.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          success: true,
          filePath: '/path/to/screenshot.png',
        }),
      },
    ],
  }),
}));

jest.mock('../../../src/utils/build-artifacts.js', () => ({
  findBuildArtifacts: jest.fn().mockResolvedValue({
    appPath: '/path/to/MyApp.app',
    bundleIdentifier: 'com.example.MyApp',
  }),
}));

describe('buildAndRunTool', () => {
  const validProjectPath = '/path/to/MyApp.xcworkspace';
  const validScheme = 'MyApp';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful workflow execution', () => {
    it('should complete full build-and-run workflow', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.workflow).toBeDefined();
    });

    it('should execute all workflow steps in order', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      const steps = response.workflow.steps.map((s: any) => s.name);

      expect(steps).toEqual(['build', 'suggest', 'boot', 'install', 'launch']);
    });

    it('should mark all steps as successful', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      const allSuccessful = response.workflow.steps.every((s: any) => s.success);
      expect(allSuccessful).toBe(true);
    });

    it('should include workflow duration', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.workflow.totalDuration).toBeGreaterThanOrEqual(0);
      expect(response.summary.totalDuration).toBeGreaterThanOrEqual(0);
      expect(typeof response.workflow.totalDuration).toBe('number');
    });

    it('should include simulator information in summary', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.summary.simulator).toBeDefined();
      expect(response.summary.simulator.udid).toBe('device-iphone16pro');
      expect(response.summary.simulator.name).toBe('iPhone 16 Pro');
    });

    it('should include bundle ID in summary', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.summary.bundleId).toBe('com.example.MyApp');
    });

    it('should provide next steps guidance', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);

      // Should suggest next interactions
      expect(response.guidance.some((g: string) => g.includes('simctl-tap'))).toBe(true);
      expect(response.guidance.some((g: string) => g.includes('simctl-type'))).toBe(true);
    });

    it('should use specified configuration', async () => {
      const { xcodebuildBuildTool } = await import('../../../src/tools/xcodebuild/build.js');

      await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
        configuration: 'Release',
      });

      expect(xcodebuildBuildTool).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: 'Release',
        })
      );
    });

    it('should default to Debug configuration', async () => {
      const { xcodebuildBuildTool } = await import('../../../src/tools/xcodebuild/build.js');

      await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(xcodebuildBuildTool).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: 'Debug',
        })
      );
    });

    it('should use specified simulator UDID when provided', async () => {
      const { simctlSuggestTool } = await import('../../../src/tools/simctl/suggest.js');
      const { simctlBootTool } = await import('../../../src/tools/simctl/boot.js');

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
        simulatorUdid: 'custom-udid-123',
      });

      // Should not call suggest when UDID is provided
      expect(simctlSuggestTool).not.toHaveBeenCalled();

      // Should boot the specified simulator
      expect(simctlBootTool).toHaveBeenCalledWith(
        expect.objectContaining({
          udid: 'custom-udid-123',
        })
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.workflow.steps.find((s: any) => s.name === 'suggest')).toBeDefined();
    });

    it('should pass launch arguments to app', async () => {
      const { simctlLaunchTool } = await import('../../../src/tools/simctl/launch.js');
      const launchArgs = ['--test-mode', '--debug'];

      await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
        launchArguments: launchArgs,
      });

      expect(simctlLaunchTool).toHaveBeenCalledWith(
        expect.objectContaining({
          arguments: launchArgs,
        })
      );
    });

    it('should pass environment variables to app', async () => {
      const { simctlLaunchTool } = await import('../../../src/tools/simctl/launch.js');
      const envVars = { API_KEY: 'test-123', DEBUG: 'true' };

      await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
        environmentVariables: envVars,
      });

      expect(simctlLaunchTool).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: envVars,
        })
      );
    });

    it('should take screenshot when requested', async () => {
      const { simctlIoTool } = await import('../../../src/tools/simctl/io.js');

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
        takeScreenshot: true,
      });

      expect(simctlIoTool).toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      const screenshotStep = response.workflow.steps.find((s: any) => s.name === 'screenshot');
      expect(screenshotStep).toBeDefined();
      expect(screenshotStep.success).toBe(true);
    });

    it('should skip screenshot when not requested', async () => {
      const { simctlIoTool } = await import('../../../src/tools/simctl/io.js');

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
        takeScreenshot: false,
      });

      expect(simctlIoTool).not.toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      const screenshotStep = response.workflow.steps.find((s: any) => s.name === 'screenshot');
      expect(screenshotStep).toBeUndefined();
    });
  });

  describe('input validation', () => {
    it('should reject missing projectPath', async () => {
      await expect(
        buildAndRunTool({
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject missing scheme', async () => {
      await expect(
        buildAndRunTool({
          projectPath: validProjectPath,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty projectPath', async () => {
      await expect(
        buildAndRunTool({
          projectPath: '',
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty scheme', async () => {
      await expect(
        buildAndRunTool({
          projectPath: validProjectPath,
          scheme: '',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('error handling', () => {
    it('should handle build failures', async () => {
      const { xcodebuildBuildTool } = await import('../../../src/tools/xcodebuild/build.js');
      (xcodebuildBuildTool as jest.Mock).mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              summary: { firstError: 'Compilation failed' },
            }),
          },
        ],
      });

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.workflow.errors.length).toBeGreaterThan(0);
    });

    it('should continue when boot fails (may already be booted)', async () => {
      const { simctlBootTool } = await import('../../../src/tools/simctl/boot.js');
      (simctlBootTool as jest.Mock).mockRejectedValueOnce(new Error('Already booted'));

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      // Workflow should continue despite boot error
      const response = JSON.parse(result.content[0].text);
      expect(response.workflow.steps.length).toBeGreaterThan(2); // Should have more than just build + suggest
    });

    it('should handle simulator suggestion failures', async () => {
      const { simctlSuggestTool } = await import('../../../src/tools/simctl/suggest.js');
      (simctlSuggestTool as jest.Mock).mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ suggestions: [] }) }],
      });

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });

    it('should handle install failures', async () => {
      const { simctlInstallTool } = await import('../../../src/tools/simctl/install.js');
      (simctlInstallTool as jest.Mock).mockRejectedValueOnce(new Error('Install failed'));

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });

    it('should handle launch failures', async () => {
      const { simctlLaunchTool } = await import('../../../src/tools/simctl/launch.js');
      (simctlLaunchTool as jest.Mock).mockRejectedValueOnce(new Error('Launch failed'));

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
    });

    it('should not fail workflow if screenshot fails', async () => {
      const { simctlIoTool } = await import('../../../src/tools/simctl/io.js');
      (simctlIoTool as jest.Mock).mockRejectedValueOnce(new Error('Screenshot failed'));

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
        takeScreenshot: true,
      });

      // Workflow should still succeed
      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should provide debugging guidance on failure', async () => {
      const { xcodebuildBuildTool } = await import('../../../src/tools/xcodebuild/build.js');
      (xcodebuildBuildTool as jest.Mock).mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ success: false }) }],
      });

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(response.guidance.some((g: string) => g.includes('debug'))).toBe(true);
      expect(response.guidance.some((g: string) => g.includes('xcodebuild-build'))).toBe(true);
    });

    it('should show completed steps on failure', async () => {
      const { simctlInstallTool } = await import('../../../src/tools/simctl/install.js');
      (simctlInstallTool as jest.Mock).mockRejectedValueOnce(new Error('Install failed'));

      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.workflow.steps.length).toBeGreaterThanOrEqual(3); // build, suggest, boot completed
      expect(response.guidance.some((g: string) => g.includes('Steps completed'))).toBe(true);
    });
  });

  describe('response format', () => {
    it('should return proper MCP response format', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.content).toBeDefined();
      expect(result.content[0]).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(typeof result.content[0].text).toBe('string');
    });

    it('should return valid JSON in text content', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include all required response fields', async () => {
      const result = await buildAndRunTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('workflow');
      expect(response).toHaveProperty('summary');
      expect(response).toHaveProperty('guidance');
    });
  });
});
