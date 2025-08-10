import {
  debugWorkflowPrompt,
  debugWorkflowPromptDefinition,
} from '../../../src/tools/prompts/debug-workflow.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('debugWorkflowPrompt', () => {
  describe('prompt definition', () => {
    it('should have correct name and description', () => {
      expect(debugWorkflowPromptDefinition.name).toBe('debug-workflow');
      expect(debugWorkflowPromptDefinition.description).toContain('Complete iOS debug workflow');
      expect(debugWorkflowPromptDefinition.description).toContain('build → install → test cycle');
    });

    it('should have correct arguments structure', () => {
      expect(debugWorkflowPromptDefinition.arguments).toHaveLength(3);

      const [projectPath, scheme, simulator] = debugWorkflowPromptDefinition.arguments;

      expect(projectPath.name).toBe('projectPath');
      expect(projectPath.required).toBe(true);
      expect(projectPath.description).toContain('.xcodeproj or .xcworkspace');

      expect(scheme.name).toBe('scheme');
      expect(scheme.required).toBe(true);
      expect(scheme.description).toContain('Build scheme name');

      expect(simulator.name).toBe('simulator');
      expect(simulator.required).toBe(false);
      expect(simulator.description).toContain('Target simulator');
    });
  });

  describe('prompt execution', () => {
    it('should generate prompt with required arguments', async () => {
      const result = await debugWorkflowPrompt({
        projectPath: '/path/to/MyApp.xcodeproj',
        scheme: 'MyApp',
      });

      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('messages');
      expect(result.description).toContain('iOS Debug Workflow');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');
    });

    it('should include project path and scheme in prompt text', async () => {
      const projectPath = '/path/to/TestProject.xcodeproj';
      const scheme = 'TestScheme';

      const result = await debugWorkflowPrompt({
        projectPath,
        scheme,
      });

      const promptText = result.messages[0].content.text;
      expect(promptText).toContain(projectPath);
      expect(promptText).toContain(scheme);
      expect(promptText).toContain('**Project**: /path/to/TestProject.xcodeproj');
      expect(promptText).toContain('**Scheme**: TestScheme');
    });

    it('should handle optional simulator parameter', async () => {
      const result = await debugWorkflowPrompt({
        projectPath: '/path/to/MyApp.xcodeproj',
        scheme: 'MyApp',
        simulator: 'iPhone 15',
      });

      const promptText = result.messages[0].content.text;
      expect(promptText).toContain('iPhone 15');
      expect(promptText).toContain('platform=iOS Simulator,name=iPhone 15');
    });

    it('should show auto-select message when no simulator specified', async () => {
      const result = await debugWorkflowPrompt({
        projectPath: '/path/to/MyApp.xcodeproj',
        scheme: 'MyApp',
      });

      const promptText = result.messages[0].content.text;
      expect(promptText).toContain('(will auto-select optimal simulator)');
    });

    it('should include XC-MCP tool emphasis throughout', async () => {
      const result = await debugWorkflowPrompt({
        projectPath: '/path/to/MyApp.xcodeproj',
        scheme: 'MyApp',
      });

      const promptText = result.messages[0].content.text;

      // Check for XC-MCP tool mentions
      expect(promptText).toContain('xcodebuild-build` XC-MCP tool');
      expect(promptText).toContain('xcodebuild-get-details` tool');
      expect(promptText).toContain('simctl-boot` XC-MCP tool');
      expect(promptText).toContain('simctl-list` tool');

      // Check for warnings against raw CLI
      expect(promptText).toContain('NOT raw xcodebuild CLI');
      expect(promptText).toContain('not raw simctl');
      expect(promptText).toContain('ALWAYS USE XC-MCP TOOLS');
    });

    it('should include critical rebuild warnings', async () => {
      const result = await debugWorkflowPrompt({
        projectPath: '/path/to/MyApp.xcodeproj',
        scheme: 'MyApp',
      });

      const promptText = result.messages[0].content.text;

      expect(promptText).toContain('🚨 **CRITICAL: After ANY code changes, you MUST REBUILD');
      expect(promptText).toContain("Without rebuilding, you're testing the OLD cached version");
      expect(promptText).toContain('XC-MCP REBUILD = FRESH REINSTALL = NEW CODE ACTIVE');
      expect(promptText).toContain('NO XC-MCP REBUILD = OLD CACHED APP = WASTED TIME');
    });

    it('should include validation checkpoints', async () => {
      const result = await debugWorkflowPrompt({
        projectPath: '/path/to/MyApp.xcodeproj',
        scheme: 'MyApp',
      });

      const promptText = result.messages[0].content.text;

      expect(promptText).toContain('⚠️ **VALIDATION CHECKPOINT**: Build MUST succeed');
      expect(promptText).toContain(
        'Check the `xcodebuild-build` tool response for `"success": true`'
      );
      expect(promptText).toContain('If build fails, use `xcodebuild-get-details`');
    });

    it('should include common mistakes section', async () => {
      const result = await debugWorkflowPrompt({
        projectPath: '/path/to/MyApp.xcodeproj',
        scheme: 'MyApp',
      });

      const promptText = result.messages[0].content.text;

      expect(promptText).toContain('## ⚠️ Common Mistakes to Avoid:');
      expect(promptText).toContain('❌ **FATAL ERROR**: Using raw xcodebuild CLI');
      expect(promptText).toContain('❌ **FATAL ERROR**: Testing without rebuilding');
      expect(promptText).toContain('❌ **FATAL ERROR**: Testing the old cached app version');
    });

    it('should throw McpError for missing required arguments', async () => {
      // Missing projectPath
      await expect(debugWorkflowPrompt({ scheme: 'MyApp' })).rejects.toThrow(McpError);

      // Missing scheme
      await expect(
        debugWorkflowPrompt({ projectPath: '/path/to/MyApp.xcodeproj' })
      ).rejects.toThrow(McpError);

      // Missing both
      await expect(debugWorkflowPrompt({})).rejects.toThrow(McpError);
    });

    it('should throw McpError with correct error code for missing arguments', async () => {
      try {
        await debugWorkflowPrompt({});
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect((error as McpError).code).toBe(ErrorCode.InvalidRequest);
        expect((error as McpError).message).toContain(
          'debug-workflow requires projectPath and scheme arguments'
        );
      }
    });

    it('should handle edge cases in arguments', async () => {
      // Test with minimal valid arguments
      const result = await debugWorkflowPrompt({
        projectPath: 'test.xcodeproj',
        scheme: 'test',
      });

      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('messages');
      expect(result.messages[0].content.text).toContain('test.xcodeproj');
      expect(result.messages[0].content.text).toContain('test');
    });

    it('should maintain consistent prompt structure', async () => {
      const result = await debugWorkflowPrompt({
        projectPath: '/path/to/MyApp.xcodeproj',
        scheme: 'MyApp',
        simulator: 'iPad Air',
      });

      const promptText = result.messages[0].content.text;

      // Check for structured sections
      expect(promptText).toContain('## Essential Steps (NEVER skip these):');
      expect(promptText).toContain('### 1. 🏗️ BUILD (ALWAYS FIRST)');
      expect(promptText).toContain('### 2. 🔍 VALIDATE BUILD SUCCESS');
      expect(promptText).toContain('### 3. 🔄 ENSURE SIMULATOR IS READY');
      expect(promptText).toContain('### 4. 📱 FRESH REINSTALL');
      expect(promptText).toContain('### 5. 🧪 TEST YOUR CHANGES');
      expect(promptText).toContain('## 🔄 **AFTER MAKING CODE CHANGES**');
      expect(promptText).toContain('## 🎯 Remember:');
    });
  });

  describe('error handling', () => {
    it('should handle null/undefined arguments gracefully', async () => {
      await expect(debugWorkflowPrompt(null as any)).rejects.toThrow(); // Can be TypeError or McpError, both are valid errors

      await expect(debugWorkflowPrompt(undefined as any)).rejects.toThrow(); // Can be TypeError or McpError, both are valid errors
    });

    it('should handle empty string arguments', async () => {
      await expect(
        debugWorkflowPrompt({
          projectPath: '',
          scheme: 'MyApp',
        })
      ).rejects.toThrow(McpError);

      await expect(
        debugWorkflowPrompt({
          projectPath: '/path/to/MyApp.xcodeproj',
          scheme: '',
        })
      ).rejects.toThrow(McpError);
    });
  });
});
