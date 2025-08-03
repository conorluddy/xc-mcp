import { XcodeProject } from '../types/xcode.js';
import { executeCommand, buildXcodebuildCommand } from '../utils/command.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';

export interface BuildConfig {
  scheme: string;
  configuration: string;
  destination?: string;
  sdk?: string;
  derivedDataPath?: string;
}

export interface BuildMetrics {
  timestamp: Date;
  config: BuildConfig;
  success: boolean;
  duration?: number;
  errorCount: number;
  warningCount: number;
  buildSizeBytes: number;
}

export interface ProjectInfo {
  path: string;
  lastModified: Date;
  projectData: XcodeProject;
  preferredScheme?: string;
  lastSuccessfulConfig?: BuildConfig;
}

export interface DependencyInfo {
  lastChecked: Date;
  packageResolved?: Record<string, unknown>;
  podfileLock?: string;
  carthageResolved?: string;
}

export class ProjectCache {
  private projectConfigs: Map<string, ProjectInfo> = new Map();
  private buildHistory: Map<string, BuildMetrics[]> = new Map();
  private dependencyCache: Map<string, DependencyInfo> = new Map();
  private cacheMaxAge = 60 * 60 * 1000; // 1 hour default

  // Cache management methods
  setCacheMaxAge(milliseconds: number): void {
    this.cacheMaxAge = milliseconds;
  }

  getCacheMaxAge(): number {
    return this.cacheMaxAge;
  }

  clearCache(): void {
    this.projectConfigs.clear();
    this.buildHistory.clear();
    this.dependencyCache.clear();
  }

  async getProjectInfo(projectPath: string, force = false): Promise<ProjectInfo> {
    const normalizedPath = this.normalizePath(projectPath);

    // Check if we need to refresh
    const existing = this.projectConfigs.get(normalizedPath);
    if (!force && existing && (await this.isProjectCacheValid(existing))) {
      return existing;
    }

    // Get file modification time
    const stats = await fs.stat(projectPath);
    const lastModified = stats.mtime;

    // Fetch project data
    const command = projectPath.endsWith('.xcworkspace')
      ? buildXcodebuildCommand('-list', projectPath, { workspace: true, json: true })
      : buildXcodebuildCommand('-list', projectPath, { json: true });

    const result = await executeCommand(command);
    if (result.code !== 0) {
      throw new Error(`Failed to get project info: ${result.stderr}`);
    }

    const projectData: XcodeProject = JSON.parse(result.stdout);

    const projectInfo: ProjectInfo = {
      path: normalizedPath,
      lastModified,
      projectData,
      preferredScheme: existing?.preferredScheme,
      lastSuccessfulConfig: existing?.lastSuccessfulConfig,
    };

    this.projectConfigs.set(normalizedPath, projectInfo);
    return projectInfo;
  }

  async getPreferredBuildConfig(projectPath: string): Promise<BuildConfig | null> {
    const projectInfo = await this.getProjectInfo(projectPath);

    // Return last successful config if available
    if (projectInfo.lastSuccessfulConfig) {
      return projectInfo.lastSuccessfulConfig;
    }

    // Generate smart defaults
    const schemes =
      projectInfo.projectData.project?.schemes || projectInfo.projectData.workspace?.schemes || [];

    if (schemes.length === 0) {
      return null;
    }

    // Prefer scheme that matches project name or first scheme
    const projectName =
      projectInfo.projectData.project?.name || projectInfo.projectData.workspace?.name;

    const preferredScheme = projectName && schemes.includes(projectName) ? projectName : schemes[0];

    return {
      scheme: preferredScheme,
      configuration: 'Debug', // Safe default
    };
  }

  recordBuildResult(
    projectPath: string,
    config: BuildConfig,
    metrics: Omit<BuildMetrics, 'config'>
  ): void {
    const normalizedPath = this.normalizePath(projectPath);

    const buildMetric: BuildMetrics = {
      ...metrics,
      config,
    };

    // Update build history
    const history = this.buildHistory.get(normalizedPath) || [];
    history.push(buildMetric);

    // Keep only last 20 builds
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    this.buildHistory.set(normalizedPath, history);

    // Update last successful config if build succeeded
    if (metrics.success) {
      const projectInfo = this.projectConfigs.get(normalizedPath);
      if (projectInfo) {
        projectInfo.lastSuccessfulConfig = config;
        projectInfo.preferredScheme = config.scheme;
      }
    }
  }

  getBuildHistory(projectPath: string, limit = 10): BuildMetrics[] {
    const normalizedPath = this.normalizePath(projectPath);
    const history = this.buildHistory.get(normalizedPath) || [];
    return history.slice(-limit).reverse(); // Most recent first
  }

  getPerformanceTrends(projectPath: string): {
    avgBuildTime?: number;
    successRate: number;
    recentErrorCount: number;
    buildTimeImprovement?: number;
  } {
    const history = this.getBuildHistory(projectPath, 20);

    if (history.length === 0) {
      return { successRate: 0, recentErrorCount: 0 };
    }

    const successful = history.filter(h => h.success);
    const successRate = successful.length / history.length;

    const durations = successful.map(h => h.duration).filter((d): d is number => d !== undefined);

    const avgBuildTime =
      durations.length > 0
        ? durations.reduce((sum, d) => sum + d, 0) / durations.length
        : undefined;

    const recentErrorCount = history
      .slice(0, 5) // Last 5 builds
      .reduce((sum, h) => sum + h.errorCount, 0);

    // Calculate build time trend (recent vs older builds)
    let buildTimeImprovement: number | undefined;
    if (durations.length >= 6) {
      const recent = durations.slice(0, 3);
      const older = durations.slice(3, 6);
      const recentAvg = recent.reduce((s, d) => s + d, 0) / recent.length;
      const olderAvg = older.reduce((s, d) => s + d, 0) / older.length;
      buildTimeImprovement = ((olderAvg - recentAvg) / olderAvg) * 100;
    }

    return {
      avgBuildTime,
      successRate,
      recentErrorCount,
      buildTimeImprovement,
    };
  }

  async getDependencyInfo(projectPath: string): Promise<DependencyInfo | null> {
    const normalizedPath = this.normalizePath(projectPath);
    const projectDir = dirname(projectPath);

    // Check cache first
    const existing = this.dependencyCache.get(normalizedPath);
    if (existing && this.isDependencyCacheValid(existing)) {
      return existing;
    }

    const depInfo: DependencyInfo = {
      lastChecked: new Date(),
    };

    try {
      // Check for Package.resolved (SPM)
      const packageResolvedPath = join(projectDir, 'Package.resolved');
      try {
        const packageResolved = JSON.parse(await fs.readFile(packageResolvedPath, 'utf8'));
        depInfo.packageResolved = packageResolved;
      } catch {
        // File doesn't exist or invalid JSON
      }

      // Check for Podfile.lock (CocoaPods)
      const podfileLockPath = join(projectDir, 'Podfile.lock');
      try {
        const podfileLock = await fs.readFile(podfileLockPath, 'utf8');
        depInfo.podfileLock = podfileLock;
      } catch {
        // File doesn't exist
      }

      // Check for Cartfile.resolved (Carthage)
      const carthagePath = join(projectDir, 'Cartfile.resolved');
      try {
        const carthageResolved = await fs.readFile(carthagePath, 'utf8');
        depInfo.carthageResolved = carthageResolved;
      } catch {
        // File doesn't exist
      }

      this.dependencyCache.set(normalizedPath, depInfo);
      return depInfo;
    } catch {
      return null;
    }
  }

  getCacheStats(): {
    projectCount: number;
    buildHistoryCount: number;
    dependencyCount: number;
    cacheMaxAgeMs: number;
    cacheMaxAgeHuman: string;
  } {
    return {
      projectCount: this.projectConfigs.size,
      buildHistoryCount: Array.from(this.buildHistory.values()).reduce(
        (sum, history) => sum + history.length,
        0
      ),
      dependencyCount: this.dependencyCache.size,
      cacheMaxAgeMs: this.cacheMaxAge,
      cacheMaxAgeHuman: this.formatDuration(this.cacheMaxAge),
    };
  }

  private async isProjectCacheValid(projectInfo: ProjectInfo): Promise<boolean> {
    try {
      const stats = await fs.stat(projectInfo.path);
      return stats.mtime.getTime() === projectInfo.lastModified.getTime();
    } catch {
      return false;
    }
  }

  private isDependencyCacheValid(depInfo: DependencyInfo): boolean {
    const age = Date.now() - depInfo.lastChecked.getTime();
    return age < this.cacheMaxAge;
  }

  private normalizePath(path: string): string {
    return path.replace(/\/$/, ''); // Remove trailing slash
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

// Global project cache instance
export const projectCache = new ProjectCache();
