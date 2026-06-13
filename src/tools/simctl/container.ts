import * as fs from 'fs';
import * as nodePath from 'path';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { simulatorCache } from '../../state/simulator-cache.js';
import { responseCache, responseResourceLink } from '../../utils/response-cache.js';

type ContainerMode = 'ls' | 'cat' | 'userdefaults' | 'coredata-path';

interface SimctlContainerToolArgs {
  udid?: string;
  bundleId: string;
  mode: ContainerMode;
  path?: string;
  depth?: number;
}

interface FileEntry {
  path: string;
  kind: 'file' | 'dir' | 'symlink';
  sizeBytes?: number;
  symlinkTarget?: string;
}

interface CoreDataStore {
  path: string;
  absolutePath: string;
  sizeBytes: number;
  type: 'database' | 'write-ahead-log' | 'shared-memory';
}

const CAT_CACHE_THRESHOLD_BYTES = 8192;

// === PRIVATE HELPERS ===

function describeEntry(entryPath: string, containerRoot: string): FileEntry {
  const relative = nodePath.relative(containerRoot, entryPath);
  const isSymlink = fs.lstatSync(entryPath).isSymbolicLink();
  const isDir = !isSymlink && fs.statSync(entryPath).isDirectory();

  const entry: FileEntry = {
    path: relative,
    kind: isSymlink ? 'symlink' : isDir ? 'dir' : 'file',
  };

  if (!isDir && !isSymlink) {
    try {
      entry.sizeBytes = fs.statSync(entryPath).size;
    } catch {
      // ignore
    }
  }

  if (isSymlink) {
    try {
      entry.symlinkTarget = fs.readlinkSync(entryPath);
    } catch {
      entry.symlinkTarget = '<unreadable>';
    }
  }

  return entry;
}

function walkDirectory(
  directory: string,
  containerRoot: string,
  currentDepth: number,
  maxDepth: number
): FileEntry[] {
  const entries: FileEntry[] = [];

  let children: string[];
  try {
    children = fs.readdirSync(directory).sort();
  } catch {
    return entries;
  }

  for (const child of children) {
    const childPath = nodePath.join(directory, child);
    try {
      entries.push(describeEntry(childPath, containerRoot));
      const stat = fs.lstatSync(childPath);
      if (stat.isDirectory() && !stat.isSymbolicLink() && currentDepth < maxDepth) {
        entries.push(...walkDirectory(childPath, containerRoot, currentDepth + 1, maxDepth));
      }
    } catch {
      // skip unreadable entries
    }
  }

  return entries;
}

function classifySqliteFile(filename: string): 'database' | 'write-ahead-log' | 'shared-memory' {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.sqlite-wal')) return 'write-ahead-log';
  if (lower.endsWith('.sqlite-shm')) return 'shared-memory';
  return 'database';
}

async function decodePlist(filePath: string): Promise<{ success: boolean; data: unknown }> {
  try {
    const result = await executeCommand(`plutil -convert json -o - "${filePath}"`, {
      timeout: 10000,
    });
    if (result.code === 0 && result.stdout.trim()) {
      return { success: true, data: JSON.parse(result.stdout) };
    }
    return { success: false, data: null };
  } catch {
    return { success: false, data: null };
  }
}

async function resolveContainerRoot(udid: string | undefined, bundleId: string): Promise<string> {
  const device = udid?.trim() || 'booted';

  const result = await executeCommand(
    `xcrun simctl get_app_container "${device}" "${bundleId}" data`,
    { timeout: 15000 }
  );

  if (result.code !== 0) {
    const stderr = result.stderr?.trim() || `exit code ${result.code}`;
    throw new McpError(
      ErrorCode.InternalError,
      `Cannot find data container for "${bundleId}": ${stderr}. Ensure the app is installed on the simulator.`
    );
  }

  const containerPath = result.stdout.trim();
  if (!containerPath) {
    throw new McpError(
      ErrorCode.InternalError,
      `No data container found for "${bundleId}". Ensure the app is installed on the simulator.`
    );
  }

  return containerPath;
}

function assertWithinContainer(resolvedTarget: string, containerRoot: string, rawPath: string) {
  if (
    !resolvedTarget.startsWith(containerRoot + nodePath.sep) &&
    resolvedTarget !== containerRoot
  ) {
    throw new McpError(ErrorCode.InvalidRequest, `Path escapes container boundary: "${rawPath}"`);
  }
}

// === MODE HANDLERS ===

async function handleLs(
  containerRoot: string,
  bundleId: string,
  subPath: string | undefined,
  depth: number
) {
  const rootResolved = fs.realpathSync(containerRoot);
  let target = rootResolved;

  if (subPath) {
    const candidate = nodePath.resolve(rootResolved, subPath);
    assertWithinContainer(candidate, rootResolved, subPath);
    target = candidate;
  }

  if (!fs.existsSync(target)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Path does not exist within container: "${subPath}"`
    );
  }

  const stat = fs.lstatSync(target);
  if (stat.isFile()) {
    return {
      mode: 'ls',
      bundleId,
      success: true,
      containerRoot,
      listedPath: target,
      entries: [describeEntry(target, rootResolved)],
      totalEntries: 1,
      guidance: ['Single file matched. Use mode "cat" to read its contents.'],
    };
  }

  const entries = walkDirectory(target, rootResolved, 0, depth);
  return {
    mode: 'ls',
    bundleId,
    success: true,
    containerRoot,
    listedPath: target,
    maxDepth: depth,
    entries,
    totalEntries: entries.length,
    guidance: [
      `Listed ${entries.length} entries (depth ${depth}).`,
      'Use mode "cat" with path to read a specific file.',
      'Use mode "userdefaults" to inspect Library/Preferences/<bundleId>.plist.',
      'Use mode "coredata-path" to find SQLite stores.',
    ],
  };
}

async function handleCat(containerRoot: string, bundleId: string, filePath: string) {
  const rootResolved = fs.realpathSync(containerRoot);
  const candidate = nodePath.resolve(rootResolved, filePath);
  assertWithinContainer(candidate, rootResolved, filePath);

  if (!fs.existsSync(candidate)) {
    throw new McpError(ErrorCode.InvalidRequest, `File not found in container: "${filePath}"`);
  }

  const lstat = fs.lstatSync(candidate);
  if (lstat.isDirectory()) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `"${filePath}" is a directory — use mode "ls" to list it`
    );
  }

  const sizeBytes = lstat.size;
  const base = {
    mode: 'cat',
    bundleId,
    success: true,
    path: filePath,
    sizeBytes,
  };

  // Try plist decode via plutil
  const plistResult = await decodePlist(candidate);
  if (plistResult.success) {
    if (sizeBytes > CAT_CACHE_THRESHOLD_BYTES) {
      const fullContent = JSON.stringify(plistResult.data);
      const cacheId = responseCache.store({
        tool: 'simctl-container',
        fullOutput: fullContent,
        stderr: '',
        exitCode: 0,
        command: `cat ${candidate}`,
        metadata: { bundleId, path: filePath, contentType: 'plist' },
      });
      return {
        ...base,
        contentType: 'plist',
        cacheId,
        resourceLink: responseResourceLink(
          cacheId,
          'simctl-container',
          `Plist content of ${filePath}`
        ),
        note: `File is ${sizeBytes} bytes — full plist content cached. Retrieve with cacheId "${cacheId}".`,
        guidance: ['Large plist cached. Use xcodebuild-get-details or retrieve via cacheId.'],
      };
    }
    return { ...base, contentType: 'plist', content: plistResult.data };
  }

  // Try text
  let fileBuffer: Buffer;
  try {
    fileBuffer = fs.readFileSync(candidate);
  } catch (err) {
    throw new McpError(ErrorCode.InternalError, `Cannot read file: ${err}`);
  }

  let content: string;

  try {
    content = fileBuffer.toString('utf8');
    // Heuristic: if more than 10% non-printable control bytes, treat as binary.
    // Count bytes outside printable/whitespace ranges without a control-char regex.
    let nonPrintable = 0;
    for (const byte of fileBuffer) {
      const isPrintableControl = byte === 0x09 || byte === 0x0a || byte === 0x0d; // tab, LF, CR
      if ((byte < 0x20 && !isPrintableControl) || byte === 0x7f) {
        nonPrintable++;
      }
    }
    if (fileBuffer.length > 0 && nonPrintable / fileBuffer.length > 0.1) {
      throw new Error('binary');
    }
  } catch {
    return {
      ...base,
      contentType: 'binary',
      content: `<binary file: ${sizeBytes} bytes>`,
      guidance: ['Binary file — cannot display inline.'],
    };
  }

  if (sizeBytes > CAT_CACHE_THRESHOLD_BYTES) {
    const cacheId = responseCache.store({
      tool: 'simctl-container',
      fullOutput: content,
      stderr: '',
      exitCode: 0,
      command: `cat ${candidate}`,
      metadata: { bundleId, path: filePath, contentType: 'text' },
    });
    return {
      ...base,
      contentType: 'text',
      cacheId,
      resourceLink: responseResourceLink(
        cacheId,
        'simctl-container',
        `Text content of ${filePath}`
      ),
      note: `File is ${sizeBytes} bytes — full content cached. Retrieve with cacheId "${cacheId}".`,
      guidance: ['Large text file cached. Retrieve via cacheId.'],
    };
  }

  return { ...base, contentType: 'text', content };
}

async function handleUserDefaults(containerRoot: string, bundleId: string) {
  const plistPath = nodePath.join(containerRoot, 'Library', 'Preferences', `${bundleId}.plist`);

  if (!fs.existsSync(plistPath)) {
    throw new McpError(
      ErrorCode.InternalError,
      `UserDefaults plist not found: ${plistPath}. The app may not have written any defaults yet.`
    );
  }

  const plistResult = await decodePlist(plistPath);
  if (!plistResult.success) {
    throw new McpError(ErrorCode.InternalError, `Cannot parse plist at: ${plistPath}`);
  }

  const preferences = plistResult.data as Record<string, unknown>;
  return {
    mode: 'userdefaults',
    bundleId,
    success: true,
    plistPath,
    preferences,
    totalKeys:
      typeof preferences === 'object' && preferences !== null ? Object.keys(preferences).length : 0,
    guidance: [
      'UserDefaults decoded from binary/XML plist.',
      'Keys are sorted alphabetically. Nested dicts/arrays shown inline.',
    ],
  };
}

function handleCoreDatePath(containerRoot: string, bundleId: string) {
  const searchDirs = [
    nodePath.join(containerRoot, 'Library', 'Application Support'),
    nodePath.join(containerRoot, 'Documents'),
  ];

  const sqliteExtensions = new Set(['.sqlite', '.sqlite-wal', '.sqlite-shm']);
  const stores: CoreDataStore[] = [];

  for (const searchDir of searchDirs) {
    if (!fs.existsSync(searchDir)) continue;

    const recurse = (dir: string) => {
      let children: string[];
      try {
        children = fs.readdirSync(dir);
      } catch {
        return;
      }

      for (const child of children) {
        const childPath = nodePath.join(dir, child);
        try {
          const stat = fs.lstatSync(childPath);
          if (stat.isFile()) {
            const ext = nodePath.extname(child).toLowerCase();
            // Handle compound extensions like .sqlite-wal
            const lowerChild = child.toLowerCase();
            const matchedExt = [...sqliteExtensions].find(e => lowerChild.endsWith(e));
            if (matchedExt) {
              stores.push({
                path: nodePath.relative(containerRoot, childPath),
                absolutePath: childPath,
                sizeBytes: stat.size,
                type: classifySqliteFile(child),
              });
            } else if (sqliteExtensions.has(ext)) {
              stores.push({
                path: nodePath.relative(containerRoot, childPath),
                absolutePath: childPath,
                sizeBytes: stat.size,
                type: classifySqliteFile(child),
              });
            }
          } else if (stat.isDirectory() && !stat.isSymbolicLink()) {
            recurse(childPath);
          }
        } catch {
          // skip
        }
      }
    };

    recurse(searchDir);
  }

  return {
    mode: 'coredata-path',
    bundleId,
    success: true,
    containerRoot,
    stores,
    totalStores: stores.length,
    guidance:
      stores.length === 0
        ? [
            'No Core Data SQLite stores found. The app may not use Core Data, or may not have persisted data yet.',
          ]
        : [
            `Found ${stores.length} SQLite file(s).`,
            'Use mode "cat" on a .sqlite path to inspect (binary content will be indicated).',
          ],
  };
}

// === MAIN TOOL ===

export async function simctlContainerTool(args: any) {
  const { udid, bundleId, mode, path: subPath, depth = 3 } = args as SimctlContainerToolArgs;

  try {
    // Validate required params
    if (!bundleId || bundleId.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidRequest, 'bundleId is required and cannot be empty');
    }

    if (!bundleId.includes('.')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'bundleId should follow the format: com.company.appname'
      );
    }

    const validModes: ContainerMode[] = ['ls', 'cat', 'userdefaults', 'coredata-path'];
    if (!mode || !validModes.includes(mode)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `mode is required and must be one of: ${validModes.join(', ')}`
      );
    }

    if (mode === 'cat' && (!subPath || subPath.trim().length === 0)) {
      throw new McpError(ErrorCode.InvalidRequest, 'path is required when mode is "cat"');
    }

    // Validate simulator if udid provided
    if (udid && udid.trim().length > 0) {
      const simulator = await simulatorCache.findSimulatorByUdid(udid.trim());
      if (!simulator) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Simulator with UDID "${udid}" not found. Use simctl-list to see available simulators.`
        );
      }
    }

    console.error(`[simctl-container] mode=${mode} bundleId=${bundleId} udid=${udid || 'booted'}`);

    const containerRoot = await resolveContainerRoot(udid, bundleId);

    let result: Record<string, unknown>;

    switch (mode) {
      case 'ls':
        result = await handleLs(containerRoot, bundleId, subPath, depth);
        break;
      case 'cat':
        result = await handleCat(containerRoot, bundleId, subPath!);
        break;
      case 'userdefaults':
        result = await handleUserDefaults(containerRoot, bundleId);
        break;
      case 'coredata-path':
        result = handleCoreDatePath(containerRoot, bundleId);
        break;
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-container failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export const SIMCTL_CONTAINER_DOCS = `
# simctl-container

App sandbox inspector — list files, read file contents, inspect UserDefaults, and locate Core Data stores inside an iOS simulator app's data container.

## What it does

Resolves the app data container via \`xcrun simctl get_app_container\`, then performs semantic
file operations within that sandbox without needing to know the raw CoreSimulator path.

## Parameters

- **bundleId** (string, required): App bundle identifier (e.g. com.example.MyApp)
- **mode** (string, required): Operation — \`ls\` | \`cat\` | \`userdefaults\` | \`coredata-path\`
- **udid** (string, optional): Simulator UDID. Defaults to booted device.
- **path** (string, optional): Sub-path for \`ls\` (subdir) or file path for \`cat\`
- **depth** (number, optional): Recursion depth for \`ls\` (default: 3)

## Modes

### ls
Lists files in the container (or a sub-path) up to \`depth\` levels deep.
Returns entries with \`path\`, \`kind\` (file/dir/symlink), and \`sizeBytes\`.
Path traversal outside the container root is rejected.

### cat
Reads a file at \`path\` (relative to container root).
- Attempts plist decode first (binary and XML plists via \`plutil\`)
- Falls back to UTF-8 text, then binary detection
- Returns \`contentType\`: \`plist\` | \`text\` | \`binary\`
- Files > 8 KB (text/plist) are stored in responseCache; returns \`cacheId\` + \`resourceLink\`

### userdefaults
Reads \`Library/Preferences/<bundleId>.plist\` and returns decoded key/value pairs.
Handles both binary and XML plist formats via \`plutil\`.

### coredata-path
Searches \`Library/Application Support/\` and \`Documents/\` recursively for
\`.sqlite\`, \`.sqlite-wal\`, and \`.sqlite-shm\` files.
Returns \`{ path, absolutePath, sizeBytes, type }\` for each store found.

## Returns

JSON response with \`{ mode, bundleId, success, ... }\` plus mode-specific fields and \`guidance\`.

## Examples

### List container root
\`\`\`typescript
await simctlContainerTool({ bundleId: 'com.example.MyApp', mode: 'ls' })
\`\`\`

### List a sub-directory
\`\`\`typescript
await simctlContainerTool({ bundleId: 'com.example.MyApp', mode: 'ls', path: 'Library/Caches' })
\`\`\`

### Read a JSON config file
\`\`\`typescript
await simctlContainerTool({ bundleId: 'com.example.MyApp', mode: 'cat', path: 'Documents/config.json' })
\`\`\`

### Inspect UserDefaults
\`\`\`typescript
await simctlContainerTool({ bundleId: 'com.example.MyApp', mode: 'userdefaults' })
\`\`\`

### Find Core Data stores
\`\`\`typescript
await simctlContainerTool({ bundleId: 'com.example.MyApp', mode: 'coredata-path' })
\`\`\`

## Error Handling

- **bundleId required**: Rejects empty or missing bundleId
- **mode required**: Rejects unknown or missing mode
- **path required for cat**: Rejects cat without a path
- **container not found**: InternalError with install suggestion
- **path escapes container**: InvalidRequest with clear message
- **plist unreadable**: InternalError with path context

## Notes

- Keychain is explicitly out of scope
- Binary plist decoding uses \`plutil -convert json\` (macOS built-in)
- Large text/plist files (> 8 KB) are cached; retrieve via \`cacheId\` using the cache tool
`;

export const SIMCTL_CONTAINER_DOCS_MINI =
  'Inspect app sandbox: list files (ls), read files (cat), UserDefaults, Core Data paths. Use rtfm({ toolName: "simctl-container" }) for docs.';
