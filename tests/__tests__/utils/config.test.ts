import { ConfigManager, type ProjectConfig } from '../../../src/utils/config.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

// Use a temporary directory for testing
const baseTmpDir = (() => {
  const dir = tmpdir();
  return (dir && dir.length > 0) ? dir : '/tmp';
})();

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let testDir: string;

  beforeEach(async () => {
    // Create fresh temp directory for each test
    testDir = path.join(baseTmpDir, `xc-mcp-config-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(testDir, { recursive: true });
    configManager = new ConfigManager(testDir);
  });

  afterEach(async () => {
    // Clean up
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getProjectConfig', () => {
    it('should return empty config for new project', async () => {
      const config = await configManager.getProjectConfig('/path/to/project');
      expect(config).toEqual({});
    });

    it('should cache project config in memory', async () => {
      const projectPath = '/path/to/project1';
      const config1 = await configManager.getProjectConfig(projectPath);
      const config2 = await configManager.getProjectConfig(projectPath);

      expect(config1).toBe(config2); // Same reference
    });

    it('should handle multiple projects independently', async () => {
      const project1 = '/path/to/project1';
      const project2 = '/path/to/project2';

      await configManager.updateProjectConfig(project1, { buildCount: 5 });
      await configManager.updateProjectConfig(project2, { buildCount: 10 });

      const config1 = await configManager.getProjectConfig(project1);
      const config2 = await configManager.getProjectConfig(project2);

      expect(config1.buildCount).toBe(5);
      expect(config2.buildCount).toBe(10);
    });
  });

  describe('updateProjectConfig', () => {
    it('should update project configuration', async () => {
      const projectPath = '/path/to/project';
      await configManager.updateProjectConfig(projectPath, {
        lastUsedSimulator: 'device-123',
        buildCount: 1,
      });

      const config = await configManager.getProjectConfig(projectPath);
      expect(config.lastUsedSimulator).toBe('device-123');
      expect(config.buildCount).toBe(1);
    });

    it('should merge updates with existing config', async () => {
      const projectPath = '/path/to/project';
      await configManager.updateProjectConfig(projectPath, {
        lastUsedSimulator: 'device-123',
      });
      await configManager.updateProjectConfig(projectPath, {
        buildCount: 5,
      });

      const config = await configManager.getProjectConfig(projectPath);
      expect(config.lastUsedSimulator).toBe('device-123');
      expect(config.buildCount).toBe(5);
    });

    it('should persist config to disk', async () => {
      const projectPath = '/path/to/project';
      await configManager.updateProjectConfig(projectPath, {
        lastUsedSimulator: 'device-123',
        buildCount: 3,
      });

      // Create new manager instance to test persistence
      const newManager = new ConfigManager(testDir);
      const config = await newManager.getProjectConfig(projectPath);

      expect(config.lastUsedSimulator).toBe('device-123');
      expect(config.buildCount).toBe(3);
    });
  });

  describe('recordSuccessfulBuild', () => {
    it('should increment build count and successful builds', async () => {
      const projectPath = '/path/to/project';
      await configManager.recordSuccessfulBuild(projectPath);
      await configManager.recordSuccessfulBuild(projectPath);

      const config = await configManager.getProjectConfig(projectPath);
      expect(config.buildCount).toBe(2);
      expect(config.successfulBuilds).toBe(2);
    });

    it('should update last build time', async () => {
      const projectPath = '/path/to/project';
      const beforeTime = Date.now();
      await configManager.recordSuccessfulBuild(projectPath);
      const afterTime = Date.now();

      const config = await configManager.getProjectConfig(projectPath);
      expect(config.lastBuildTime).toBeDefined();
      expect(config.lastBuildTime! >= beforeTime).toBe(true);
      expect(config.lastBuildTime! <= afterTime).toBe(true);
    });

    it('should record simulator preference when provided', async () => {
      const projectPath = '/path/to/project';
      const udid = 'device-123';
      const name = 'iPhone 16 Pro';

      await configManager.recordSuccessfulBuild(projectPath, udid, name);

      const config = await configManager.getProjectConfig(projectPath);
      expect(config.lastUsedSimulator).toBe(udid);
      expect(config.lastUsedSimulatorName).toBe(name);
    });

    it('should update simulator preference on subsequent builds', async () => {
      const projectPath = '/path/to/project';

      await configManager.recordSuccessfulBuild(projectPath, 'device-123', 'iPhone 15');
      await configManager.recordSuccessfulBuild(projectPath, 'device-456', 'iPhone 16');

      const config = await configManager.getProjectConfig(projectPath);
      expect(config.lastUsedSimulator).toBe('device-456');
      expect(config.lastUsedSimulatorName).toBe('iPhone 16');
    });
  });

  describe('getLastUsedSimulator', () => {
    it('should return undefined for new project', async () => {
      const simulator = await configManager.getLastUsedSimulator('/path/to/project');
      expect(simulator).toBeUndefined();
    });

    it('should return last used simulator', async () => {
      const projectPath = '/path/to/project';
      const udid = 'device-123';

      await configManager.recordSuccessfulBuild(projectPath, udid, 'iPhone 15');
      const simulator = await configManager.getLastUsedSimulator(projectPath);

      expect(simulator).toBe(udid);
    });
  });

  describe('getBuildSuccessRate', () => {
    it('should return 0 for new project', async () => {
      const rate = await configManager.getBuildSuccessRate('/path/to/project');
      expect(rate).toBe(0);
    });

    it('should calculate success rate correctly', async () => {
      const projectPath = '/path/to/project';

      // Simulate 3 successful builds and 2 total (needs manual setup)
      await configManager.updateProjectConfig(projectPath, {
        buildCount: 5,
        successfulBuilds: 3,
      });

      const rate = await configManager.getBuildSuccessRate(projectPath);
      expect(rate).toBe(60); // 3/5 = 60%
    });

    it('should return 100 for all successful builds', async () => {
      const projectPath = '/path/to/project';

      await configManager.recordSuccessfulBuild(projectPath);
      await configManager.recordSuccessfulBuild(projectPath);
      await configManager.recordSuccessfulBuild(projectPath);

      const rate = await configManager.getBuildSuccessRate(projectPath);
      expect(rate).toBe(100);
    });
  });

  describe('getAllProjectConfigs', () => {
    it('should return all project configurations', async () => {
      const project1 = '/path/to/project1';
      const project2 = '/path/to/project2';

      await configManager.recordSuccessfulBuild(project1);
      await configManager.recordSuccessfulBuild(project2);

      const allConfigs = configManager.getAllProjectConfigs();
      expect(allConfigs.size).toBe(2);
      expect(allConfigs.has(project1)).toBe(true);
      expect(allConfigs.has(project2)).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all in-memory configurations', async () => {
      const projectPath = '/path/to/project';
      await configManager.recordSuccessfulBuild(projectPath);

      await configManager.clear();

      const allConfigs = configManager.getAllProjectConfigs();
      expect(allConfigs.size).toBe(0);
    });

    it('should delete config file from disk', async () => {
      const projectPath = '/path/to/project';
      await configManager.recordSuccessfulBuild(projectPath);

      const configPath = path.join(testDir, 'config.json');
      const existsBefore = await fs
        .stat(configPath)
        .then(() => true)
        .catch(() => false);
      expect(existsBefore).toBe(true);

      await configManager.clear();

      const existsAfter = await fs
        .stat(configPath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });
  });

  describe('graceful degradation', () => {
    it('should handle missing config directory gracefully', async () => {
      // Config manager should work even if directory doesn't exist initially
      const newTestDir = path.join(baseTmpDir, 'xc-mcp-nonexistent-' + Date.now());
      const manager = new ConfigManager(newTestDir);

      // Should not throw
      const config = await manager.getProjectConfig('/project');
      expect(config).toEqual({});
    });

    it('should handle corrupted config file gracefully', async () => {
      const projectPath = '/path/to/project';

      // Save a valid config first
      await configManager.updateProjectConfig(projectPath, { buildCount: 5 });

      // Corrupt the config file
      const configPath = path.join(testDir, 'config.json');
      await fs.writeFile(configPath, 'invalid json {]');

      // Create new manager and try to load
      const newManager = new ConfigManager(testDir);

      // Should gracefully degrade and return empty config
      const config = await newManager.getProjectConfig(projectPath);
      expect(config).toEqual({});
    });
  });

  describe('atomic writes', () => {
    it('should maintain data integrity during concurrent updates', async () => {
      const projectPath1 = '/path/to/project1';
      const projectPath2 = '/path/to/project2';

      // Simulate concurrent updates
      await Promise.all([
        configManager.recordSuccessfulBuild(projectPath1, 'device-1', 'iPhone 15'),
        configManager.recordSuccessfulBuild(projectPath2, 'device-2', 'iPhone 16'),
      ]);

      // Verify both updates persisted correctly
      const newManager = new ConfigManager(testDir);
      const config1 = await newManager.getProjectConfig(projectPath1);
      const config2 = await newManager.getProjectConfig(projectPath2);

      expect(config1.lastUsedSimulator).toBe('device-1');
      expect(config2.lastUsedSimulator).toBe('device-2');
    });
  });
});
