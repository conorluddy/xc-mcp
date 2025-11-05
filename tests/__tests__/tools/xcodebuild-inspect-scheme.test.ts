import { inspectSchemeTool } from '../../../src/tools/xcodebuild/inspect-scheme.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';

// Mock fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
}));

const mockSchemeXml = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1500"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <EnvironmentVariables>
         <EnvironmentVariable
            name = "API_KEY"
            value = "test-key-123"
            isEnabled = "YES">
         </EnvironmentVariable>
         <EnvironmentVariable
            name = "DEBUG_MODE"
            value = "true"
            isEnabled = "YES">
         </EnvironmentVariable>
      </EnvironmentVariables>
   </LaunchAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
         <TestableReference
            skipped = "NO">
         </TestableReference>
      </Testables>
   </TestAction>
</Scheme>`;

describe('inspectSchemeTool', () => {
  const validProjectPath = '/path/to/MyApp.xcworkspace';
  const validScheme = 'MyApp';

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock fs functions
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue(['MyApp.xcscheme', 'MyApp-Release.xcscheme']);
    fs.readFileSync.mockReturnValue(mockSchemeXml);
  });

  describe('successful scheme inspection', () => {
    it('should inspect scheme configuration', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.scheme).toBeDefined();
      expect(response.scheme.name).toBe(validScheme);
    });

    it('should parse launch configuration', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.scheme.launchConfiguration).toBeDefined();
      expect(response.scheme.launchConfiguration.configuration).toBe('Debug');
    });

    it('should parse test configuration', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.scheme.testConfiguration).toBeDefined();
      expect(response.scheme.testConfiguration.configuration).toBe('Debug');
    });

    it('should parse build configuration', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.scheme.buildConfiguration).toBeDefined();
      expect(response.scheme.buildConfiguration.configuration).toBe('Debug');
    });

    it('should extract environment variables', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.scheme.launchConfiguration.environmentVariables).toBeDefined();
      expect(Array.isArray(response.scheme.launchConfiguration.environmentVariables)).toBe(true);
      expect(response.scheme.launchConfiguration.environmentVariables.length).toBe(2);

      const envVars = response.scheme.launchConfiguration.environmentVariables;
      expect(envVars[0]).toEqual({ name: 'API_KEY', value: 'test-key-123' });
      expect(envVars[1]).toEqual({ name: 'DEBUG_MODE', value: 'true' });
    });

    it('should include scheme path in response', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.scheme.path).toBeDefined();
      expect(response.scheme.path).toContain('xcschemes');
      expect(response.scheme.path).toContain('MyApp.xcscheme');
    });

    it('should provide guidance with configuration summary', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance).toBeDefined();
      expect(Array.isArray(response.guidance)).toBe(true);
      expect(response.guidance.length).toBeGreaterThan(0);

      // Should include scheme name
      expect(response.guidance.some((g: string) => g.includes(validScheme))).toBe(true);
      // Should include build/launch/test configs
      expect(response.guidance.some((g: string) => g.includes('Build Config'))).toBe(true);
      expect(response.guidance.some((g: string) => g.includes('Launch Config'))).toBe(true);
      expect(response.guidance.some((g: string) => g.includes('Test Config'))).toBe(true);
    });

    it('should mention environment variables in guidance', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.guidance.some((g: string) => g.includes('Environment variables'))).toBe(true);
    });
  });

  describe('input validation', () => {
    it('should reject missing projectPath', async () => {
      await expect(
        inspectSchemeTool({
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject missing scheme', async () => {
      await expect(
        inspectSchemeTool({
          projectPath: validProjectPath,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty projectPath', async () => {
      await expect(
        inspectSchemeTool({
          projectPath: '',
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });

    it('should reject empty scheme', async () => {
      await expect(
        inspectSchemeTool({
          projectPath: validProjectPath,
          scheme: '',
        })
      ).rejects.toThrow(McpError);
    });
  });

  describe('error handling', () => {
    it('should handle non-existent scheme', async () => {
      const fs = require('fs');
      fs.readdirSync.mockReturnValue([]);

      await expect(
        inspectSchemeTool({
          projectPath: validProjectPath,
          scheme: 'NonExistent',
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle missing xcschemes directory', async () => {
      const fs = require('fs');
      fs.existsSync.mockReturnValue(false);

      await expect(
        inspectSchemeTool({
          projectPath: validProjectPath,
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle file read errors', async () => {
      const fs = require('fs');
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File read failed');
      });

      await expect(
        inspectSchemeTool({
          projectPath: validProjectPath,
          scheme: validScheme,
        })
      ).rejects.toThrow(McpError);
    });

    it('should handle malformed XML gracefully', async () => {
      const fs = require('fs');
      fs.readFileSync.mockReturnValue('invalid xml');

      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      // Should still return a response with default values
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.scheme.launchConfiguration.configuration).toBe('Debug');
    });
  });

  describe('response format', () => {
    it('should return proper MCP response format', async () => {
      const result = await inspectSchemeTool({
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
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });

    it('should include all required scheme fields', async () => {
      const result = await inspectSchemeTool({
        projectPath: validProjectPath,
        scheme: validScheme,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.scheme).toHaveProperty('name');
      expect(response.scheme).toHaveProperty('path');
      expect(response.scheme).toHaveProperty('launchConfiguration');
      expect(response.scheme).toHaveProperty('testConfiguration');
      expect(response.scheme).toHaveProperty('buildConfiguration');
      expect(response.scheme).toHaveProperty('buildSettings');
    });
  });
});
