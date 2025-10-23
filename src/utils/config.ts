import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';

export interface ProjectConfig {
  lastUsedSimulator?: string;
  lastUsedSimulatorName?: string;
  lastBuildTime?: number;
  buildCount?: number;
  successfulBuilds?: number;
}

export interface XCMCPConfig {
  version: string;
  projectConfigs: Map<string, ProjectConfig>;
  lastUpdated: Date;
}

/**
 * ConfigManager handles project-local configuration with auto-learning capabilities.
 * Stores `.xc-mcp/config.json` in project directories for persistent preferences.
 *
 * Features:
 * - Project-specific simulator preferences
 * - Build history tracking
 * - Atomic writes (temp file + rename)
 * - Graceful degradation if config unavailable
 */
export class ConfigManager {
  private configDir: string;
  private projectConfigs: Map<string, ProjectConfig> = new Map();
  private readonly schemaVersion = '1.0.0';
  private readonly configFileName = 'config.json';

  constructor(projectPath?: string) {
    // Determine config directory - prefer .xc-mcp in project root
    if (projectPath) {
      this.configDir = join(projectPath, '.xc-mcp');
    } else {
      // Fallback to user home for global config
      this.configDir = join(homedir(), '.xc-mcp');
    }
  }

  /**
   * Get the full path to the config file
   */
  private getConfigPath(): string {
    return join(this.configDir, this.configFileName);
  }

  /**
   * Get project-specific configuration
   */
  async getProjectConfig(projectPath: string): Promise<ProjectConfig> {
    // Load from cache if available
    if (this.projectConfigs.has(projectPath)) {
      return this.projectConfigs.get(projectPath)!;
    }

    // Try to load from disk
    const diskConfig = await this.loadConfigFromDisk();
    if (diskConfig && diskConfig.projectConfigs) {
      const configMap = new Map(diskConfig.projectConfigs as Array<[string, ProjectConfig]>);
      this.projectConfigs = configMap;

      if (configMap.has(projectPath)) {
        return configMap.get(projectPath)!;
      }
    }

    // Return empty config if not found
    const emptyConfig: ProjectConfig = {};
    this.projectConfigs.set(projectPath, emptyConfig);
    return emptyConfig;
  }

  /**
   * Update project configuration
   */
  async updateProjectConfig(projectPath: string, updates: Partial<ProjectConfig>): Promise<void> {
    // Update in-memory config
    const currentConfig = await this.getProjectConfig(projectPath);
    const updatedConfig: ProjectConfig = { ...currentConfig, ...updates };
    this.projectConfigs.set(projectPath, updatedConfig);

    // Save to disk atomically
    await this.saveConfigToDisk();
  }

  /**
   * Record a successful build with simulator preference
   */
  async recordSuccessfulBuild(
    projectPath: string,
    simulatorUDID?: string,
    simulatorName?: string
  ): Promise<void> {
    const config = await this.getProjectConfig(projectPath);

    const updatedConfig: ProjectConfig = {
      ...config,
      lastBuildTime: Date.now(),
      buildCount: (config.buildCount || 0) + 1,
      successfulBuilds: (config.successfulBuilds || 0) + 1,
    };

    // Update simulator preference if provided
    if (simulatorUDID) {
      updatedConfig.lastUsedSimulator = simulatorUDID;
      updatedConfig.lastUsedSimulatorName = simulatorName;
    }

    this.projectConfigs.set(projectPath, updatedConfig);
    await this.saveConfigToDisk();
  }

  /**
   * Get last used simulator for project
   */
  async getLastUsedSimulator(projectPath: string): Promise<string | undefined> {
    const config = await this.getProjectConfig(projectPath);
    return config.lastUsedSimulator;
  }

  /**
   * Get build success rate for project
   */
  async getBuildSuccessRate(projectPath: string): Promise<number> {
    const config = await this.getProjectConfig(projectPath);
    if (!config.buildCount || config.buildCount === 0) {
      return 0;
    }
    return ((config.successfulBuilds || 0) / config.buildCount) * 100;
  }

  /**
   * Load entire config from disk
   */
  private async loadConfigFromDisk(): Promise<any> {
    try {
      const configPath = this.getConfigPath();
      const content = await fs.readFile(configPath, 'utf8');
      const parsed = JSON.parse(content);

      // Validate schema version
      if (parsed.version !== this.schemaVersion) {
        console.warn(`Config schema version mismatch: ${parsed.version} vs ${this.schemaVersion}`);
        return null;
      }

      return parsed;
    } catch (error) {
      // File doesn't exist or is corrupted - return null for graceful degradation
      if (error instanceof Error && 'code' in error && (error as any).code === 'ENOENT') {
        return null; // File doesn't exist yet
      }
      console.warn('Failed to load config from disk:', error);
      return null;
    }
  }

  /**
   * Save entire config to disk with atomic writes
   */
  private async saveConfigToDisk(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Convert Map to array for serialization
      const configData = {
        version: this.schemaVersion,
        projectConfigs: Array.from(this.projectConfigs.entries()),
        lastUpdated: new Date().toISOString(),
      };

      const content = JSON.stringify(configData, null, 2);
      const configPath = this.getConfigPath();

      // Atomic write: write to temp file, then rename
      const tempFile = `${configPath}.tmp.${randomUUID()}`;
      await fs.writeFile(tempFile, content, 'utf8');
      await fs.rename(tempFile, configPath);
    } catch (error) {
      console.warn('Failed to save config to disk:', error);
      // Gracefully continue - config is still in memory
    }
  }

  /**
   * Clear all configurations
   */
  async clear(): Promise<void> {
    this.projectConfigs.clear();
    try {
      const configPath = this.getConfigPath();
      await fs.unlink(configPath);
    } catch {
      // File doesn't exist, that's fine
    }
  }

  /**
   * Get all project configurations
   */
  getAllProjectConfigs(): Map<string, ProjectConfig> {
    return new Map(this.projectConfigs);
  }
}

// Global config manager instance (project-aware)
export function createConfigManager(projectPath?: string): ConfigManager {
  return new ConfigManager(projectPath);
}

// Singleton pattern for backward compatibility
let globalConfigManager: ConfigManager | null = null;

export function getConfigManager(projectPath?: string): ConfigManager {
  if (!globalConfigManager) {
    globalConfigManager = new ConfigManager(projectPath);
  }
  return globalConfigManager;
}
