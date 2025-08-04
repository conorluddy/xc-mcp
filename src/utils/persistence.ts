import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { randomUUID } from 'crypto';

export interface PersistenceConfig {
  enabled: boolean;
  cacheDir: string;
  schemaVersion: string;
}

export interface SerializedData {
  version: string;
  timestamp: Date;
  data: any;
}

/**
 * PersistenceManager handles opt-in file-based persistence for XC-MCP cache systems.
 * Provides atomic file operations, smart storage location selection, and graceful degradation.
 */
export class PersistenceManager {
  private enabled = false;
  private cacheDir: string | null = null;
  private readonly schemaVersion = '1.0.0';
  private readonly saveQueue = new Map<string, NodeJS.Timeout>();

  /**
   * Enable persistence with optional custom cache directory
   */
  async enable(
    userCacheDir?: string
  ): Promise<{ success: boolean; cacheDir: string; message?: string }> {
    try {
      const selectedDir = await this.determineStorageLocation(userCacheDir);

      // Ensure directory exists and is writable
      if (!(await this.ensureDirectoryWritable(selectedDir))) {
        return {
          success: false,
          cacheDir: selectedDir,
          message: 'Directory is not writable',
        };
      }

      this.cacheDir = selectedDir;
      this.enabled = true;

      // Create directory structure
      await this.createDirectoryStructure();

      // Create .gitignore if needed
      await this.ensureGitignore();

      // Create version file
      await this.writeVersionFile();

      return {
        success: true,
        cacheDir: selectedDir,
        message: 'Persistence enabled successfully',
      };
    } catch (error) {
      return {
        success: false,
        cacheDir: userCacheDir || 'unknown',
        message: `Failed to enable persistence: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Disable persistence with option to clear existing data
   */
  async disable(clearData = false): Promise<{ success: boolean; message?: string }> {
    try {
      this.enabled = false;

      // Clear any pending saves
      for (const timeout of this.saveQueue.values()) {
        clearTimeout(timeout);
      }
      this.saveQueue.clear();

      if (clearData && this.cacheDir) {
        await this.clearAllData();
      }

      this.cacheDir = null;

      return {
        success: true,
        message: clearData ? 'Persistence disabled and data cleared' : 'Persistence disabled',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to disable persistence: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get current persistence status and storage information
   */
  async getStatus(includeStorageInfo = true): Promise<{
    enabled: boolean;
    cacheDir?: string;
    schemaVersion: string;
    storageInfo?: {
      diskUsage: number;
      fileCount: number;
      lastSave?: Date;
      isWritable: boolean;
    };
  }> {
    const status = {
      enabled: this.enabled,
      cacheDir: this.cacheDir || undefined,
      schemaVersion: this.schemaVersion,
    };

    if (includeStorageInfo && this.cacheDir) {
      const storageInfo = await this.getStorageInfo();
      return { ...status, storageInfo };
    }

    return status;
  }

  /**
   * Check if persistence is currently enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Save state for a specific cache type with debouncing
   */
  async saveState(cacheType: string, data: any): Promise<void> {
    if (!this.enabled || !this.cacheDir) {
      return; // Silently no-op when disabled
    }

    // Clear existing debounced save for this cache type
    const existingTimeout = this.saveQueue.get(cacheType);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Debounce saves to avoid excessive disk I/O
    const timeout = setTimeout(async () => {
      try {
        await this.doSaveState(cacheType, data);
        this.saveQueue.delete(cacheType);
      } catch (error) {
        console.warn(`Failed to persist ${cacheType} cache state:`, error);
      }
    }, 1000);

    this.saveQueue.set(cacheType, timeout);
  }

  /**
   * Load state for a specific cache type
   */
  async loadState<T>(cacheType: string): Promise<T | null> {
    if (!this.enabled || !this.cacheDir) {
      return null; // Silently no-op when disabled
    }

    try {
      const filePath = this.getCacheFilePath(cacheType);
      const content = await fs.readFile(filePath, 'utf8');
      const serializedData: SerializedData = this.deserialize(content);

      // Validate schema version
      if (serializedData.version !== this.schemaVersion) {
        console.warn(
          `Schema version mismatch for ${cacheType}: ${serializedData.version} vs ${this.schemaVersion}`
        );
        // For now, ignore old data (future: implement migrations)
        return null;
      }

      // Validate cache data
      if (!this.validateCacheData(cacheType, serializedData.data)) {
        console.warn(`Invalid cache data for ${cacheType}, ignoring`);
        return null;
      }

      return serializedData.data;
    } catch (error) {
      // File doesn't exist or is corrupted - return null for graceful degradation
      if ((error as any).code === 'ENOENT') {
        return null; // File doesn't exist yet
      }
      console.warn(`Failed to load ${cacheType} cache state:`, error);
      return null;
    }
  }

  /**
   * Determine the best storage location based on priority
   */
  private async determineStorageLocation(userCacheDir?: string): Promise<string> {
    const candidates = [
      userCacheDir, // 1. User-specified (highest priority)
      process.env.XC_MCP_CACHE_DIR, // 2. Environment variable
      process.env.XDG_CACHE_HOME ? join(process.env.XDG_CACHE_HOME, 'xc-mcp') : null, // 3. XDG standard
      join(process.cwd(), '.xc-mcp'), // 4. Project-local
      join(homedir(), '.cache', 'xc-mcp'), // 5. User cache (Linux/macOS)
      join(homedir(), '.xc-mcp'), // 6. User home fallback
      join(tmpdir(), 'xc-mcp'), // 7. Temp (last resort)
    ].filter(Boolean) as string[];

    // Return first valid/writable location
    for (const candidate of candidates) {
      if (await this.ensureDirectoryWritable(candidate)) {
        return candidate;
      }
    }

    // Fallback to temp directory
    const fallback = join(tmpdir(), 'xc-mcp');
    await fs.mkdir(fallback, { recursive: true });
    return fallback;
  }

  /**
   * Ensure directory exists and is writable
   */
  private async ensureDirectoryWritable(dir: string): Promise<boolean> {
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o755 });

      // Test write access
      const testFile = join(dir, '.write-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create the required directory structure
   */
  private async createDirectoryStructure(): Promise<void> {
    if (!this.cacheDir) return;

    const cacheSubDir = join(this.cacheDir, 'cache');
    const responsesDir = join(cacheSubDir, 'responses');

    await fs.mkdir(cacheSubDir, { recursive: true });
    await fs.mkdir(responsesDir, { recursive: true });

    // Create marker file
    const markerFile = join(cacheSubDir, '.persistence-enabled');
    await fs.writeFile(markerFile, new Date().toISOString());
  }

  /**
   * Smart .gitignore handling that preserves existing content
   */
  private async ensureGitignore(): Promise<void> {
    if (!this.cacheDir) return;

    const gitignoreFile = join(this.cacheDir, 'cache', '.gitignore');
    const marker = '# XC-MCP Cache Files (auto-generated)';
    const ignoreEntries = [marker, '*', '!.gitignore', '# End XC-MCP Cache Files'];

    try {
      let content = '';
      try {
        content = await fs.readFile(gitignoreFile, 'utf8');
      } catch {
        // File doesn't exist, will create
      }

      // Check if already managed
      if (content.includes(marker)) {
        return; // Already managed, don't modify
      }

      // Append with clear separation
      const addition = (content ? '\n\n' : '') + ignoreEntries.join('\n') + '\n';
      await fs.writeFile(gitignoreFile, content + addition, 'utf8');
    } catch (error) {
      // Log but don't fail - gitignore is nice-to-have
      console.warn('Could not update .gitignore:', (error as Error).message);
    }
  }

  /**
   * Write schema version file
   */
  private async writeVersionFile(): Promise<void> {
    if (!this.cacheDir) return;

    const versionFile = join(this.cacheDir, 'version');
    await fs.writeFile(versionFile, this.schemaVersion);
  }

  /**
   * Perform the actual state save with atomic writes
   */
  private async doSaveState(cacheType: string, data: any): Promise<void> {
    if (!this.cacheDir) return;

    const filePath = this.getCacheFilePath(cacheType);

    await this.withFileLock(filePath, async () => {
      const serializedData: SerializedData = {
        version: this.schemaVersion,
        timestamp: new Date(),
        data,
      };

      const content = this.serialize(serializedData);

      // Atomic write: write to temp file, then rename
      const tempFile = `${filePath}.tmp.${randomUUID()}`;
      await fs.writeFile(tempFile, content, 'utf8');
      await fs.rename(tempFile, filePath);
    });
  }

  /**
   * Get cache file path for a specific cache type
   */
  private getCacheFilePath(cacheType: string): string {
    if (!this.cacheDir) throw new Error('Cache directory not set');

    const cacheSubDir = join(this.cacheDir, 'cache');

    switch (cacheType) {
      case 'simulators':
        return join(cacheSubDir, 'simulators.json');
      case 'projects':
        return join(cacheSubDir, 'projects.json');
      case 'responses':
        return join(cacheSubDir, 'responses', 'index.json');
      default:
        return join(cacheSubDir, `${cacheType}.json`);
    }
  }

  /**
   * Serialize data with support for Map and Date objects
   */
  private serialize<T>(data: T): string {
    return JSON.stringify(
      data,
      (key, value) => {
        if (value instanceof Map) {
          return { __type: 'Map', entries: Array.from(value.entries()) };
        }
        if (value instanceof Date) {
          return { __type: 'Date', value: value.toISOString() };
        }
        return value;
      },
      2
    ); // Pretty print for debugging
  }

  /**
   * Deserialize data with support for Map and Date objects
   */
  private deserialize<T>(json: string): T {
    return JSON.parse(json, (key, value) => {
      if (value && typeof value === 'object') {
        if (value.__type === 'Map') {
          return new Map(value.entries);
        }
        if (value.__type === 'Date') {
          return new Date(value.value);
        }
      }
      return value;
    });
  }

  /**
   * Validate cache data structure
   */
  private validateCacheData(type: string, data: any): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    switch (type) {
      case 'simulators':
        return (
          typeof data === 'object' &&
          (data.cache === null || typeof data.cache === 'object') &&
          Array.isArray(data.preferredByProject) &&
          Array.isArray(data.lastUsed)
        );
      case 'projects':
        return (
          typeof data === 'object' &&
          Array.isArray(data.projectConfigs) &&
          Array.isArray(data.buildHistory) &&
          Array.isArray(data.dependencyCache)
        );
      case 'responses':
        return typeof data === 'object';
      default:
        return true; // Unknown cache types are allowed
    }
  }

  /**
   * File locking for concurrent access protection
   */
  private async withFileLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const lockFile = `${filePath}.lock`;
    const maxRetries = 5;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await fs.writeFile(lockFile, process.pid.toString(), { flag: 'wx' });
        try {
          return await operation();
        } finally {
          await fs.unlink(lockFile).catch(() => {}); // Cleanup lock
        }
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          // Lock exists, wait and retry
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Could not acquire file lock');
  }

  /**
   * Get storage information for status reporting
   */
  private async getStorageInfo(): Promise<{
    diskUsage: number;
    fileCount: number;
    lastSave?: Date;
    isWritable: boolean;
  }> {
    if (!this.cacheDir) {
      return { diskUsage: 0, fileCount: 0, isWritable: false };
    }

    let diskUsage = 0;
    let fileCount = 0;
    let lastSave: Date | undefined;

    try {
      const cacheDir = join(this.cacheDir, 'cache');
      const files = await this.getAllFiles(cacheDir);

      for (const file of files) {
        try {
          const stats = await fs.stat(file);
          diskUsage += stats.size;
          fileCount++;

          if (!lastSave || stats.mtime > lastSave) {
            lastSave = stats.mtime;
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Directory doesn't exist or not accessible
    }

    const isWritable = await this.ensureDirectoryWritable(this.cacheDir);

    return { diskUsage, fileCount, lastSave, isWritable };
  }

  /**
   * Recursively get all files in a directory
   */
  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          files.push(...(await this.getAllFiles(fullPath)));
        } else {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or not accessible
    }

    return files;
  }

  /**
   * Clear all persisted data
   */
  private async clearAllData(): Promise<void> {
    if (!this.cacheDir) return;

    try {
      const cacheDir = join(this.cacheDir, 'cache');
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clear cache data:', error);
    }
  }
}

// Global persistence manager instance
export const persistenceManager = new PersistenceManager();
