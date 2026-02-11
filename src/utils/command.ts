import { exec, execSync, spawn } from 'child_process';
import { promisify } from 'util';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const execAsync = promisify(exec);

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface StreamingCommandResult extends CommandResult {
  timedOut: boolean;
  fatalMatch?: string;
}

export interface CommandOptions {
  timeout?: number;
  maxBuffer?: number;
  cwd?: string;
}

export async function executeCommand(
  command: string,
  options: CommandOptions = {}
): Promise<CommandResult> {
  const defaultOptions = {
    timeout: 300000, // 5 minutes default timeout
    maxBuffer: 10 * 1024 * 1024, // 10MB max buffer
    ...options,
  };

  try {
    const { stdout, stderr } = await execAsync(command, defaultOptions);
    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      code: 0,
    };
  } catch (error) {
    // Handle timeout and other execution errors
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
    };
    if (execError.code === 'ETIMEDOUT') {
      throw new McpError(
        ErrorCode.InternalError,
        `Command timed out after ${defaultOptions.timeout}ms: ${command}`
      );
    }

    return {
      stdout: execError.stdout?.trim() || '',
      stderr: execError.stderr?.trim() || execError.message || '',
      code: execError.code || 1,
    };
  }
}

interface StreamingOptions extends CommandOptions {
  fatalPatterns?: RegExp[];
  onFatalMatch?: (line: string) => void;
}

/**
 * Execute a command with streaming output, optional fatal-pattern detection, and timeout.
 * Kills the process early if a fatal pattern is seen or the timeout elapses.
 */
export async function executeCommandStreaming(
  command: string,
  options: StreamingOptions = {}
): Promise<StreamingCommandResult> {
  const {
    timeout = 60000,
    maxBuffer = 10 * 1024 * 1024,
    fatalPatterns = [],
    onFatalMatch,
  } = options;

  return new Promise<StreamingCommandResult>((resolve, reject) => {
    const child = spawn(command, { shell: true, timeout });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let fatalMatch: string | undefined;

    const checkPatterns = (chunk: string) => {
      if (fatalMatch) return;
      for (const pattern of fatalPatterns) {
        const match = chunk.match(pattern);
        if (match) {
          fatalMatch = match[0];
          onFatalMatch?.(match[0]);
          child.kill();
          break;
        }
      }
    };

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout);

    child.stdout?.on('data', data => {
      const text = data.toString();
      stdout += text;
      checkPatterns(text);
      if (stdout.length > maxBuffer) {
        child.kill();
        clearTimeout(timeoutId);
        reject(
          new McpError(
            ErrorCode.InternalError,
            `Command output exceeded max buffer size of ${maxBuffer} bytes`
          )
        );
      }
    });

    child.stderr?.on('data', data => {
      const text = data.toString();
      stderr += text;
      checkPatterns(text);
    });

    child.on('close', code => {
      clearTimeout(timeoutId);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        code: code ?? 0,
        timedOut,
        fatalMatch,
      });
    });

    child.on('error', error => {
      clearTimeout(timeoutId);
      reject(new McpError(ErrorCode.InternalError, `Failed to execute command: ${error.message}`));
    });
  });
}

/**
 * Execute a command with arguments using spawn (safer than shell execution).
 * This function does NOT invoke a shell, preventing command injection vulnerabilities.
 *
 * @param command - The command to execute (e.g., 'idb', 'xcrun')
 * @param args - Array of arguments (each element is safely passed as-is)
 * @param options - Execution options
 * @returns Command result with stdout, stderr, and exit code
 */
export async function executeCommandWithArgs(
  command: string,
  args: string[],
  options: CommandOptions = {}
): Promise<CommandResult> {
  const defaultOptions = {
    timeout: 300000, // 5 minutes default timeout
    maxBuffer: 10 * 1024 * 1024, // 10MB max buffer
    ...options,
  };

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: defaultOptions.cwd,
      timeout: defaultOptions.timeout,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      child.kill();
      reject(
        new McpError(
          ErrorCode.InternalError,
          `Command timed out after ${defaultOptions.timeout}ms: ${command} ${args.join(' ')}`
        )
      );
    }, defaultOptions.timeout);

    // Collect stdout
    child.stdout?.on('data', data => {
      stdout += data.toString();
      if (stdout.length > defaultOptions.maxBuffer!) {
        killed = true;
        child.kill();
        clearTimeout(timeoutId);
        reject(
          new McpError(
            ErrorCode.InternalError,
            `Command output exceeded max buffer size of ${defaultOptions.maxBuffer} bytes`
          )
        );
      }
    });

    // Collect stderr
    child.stderr?.on('data', data => {
      stderr += data.toString();
    });

    // Handle process exit
    child.on('close', code => {
      clearTimeout(timeoutId);
      if (!killed) {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          code: code || 0,
        });
      }
    });

    // Handle process errors
    child.on('error', error => {
      clearTimeout(timeoutId);
      if (!killed) {
        reject(
          new McpError(ErrorCode.InternalError, `Failed to execute command: ${error.message}`)
        );
      }
    });
  });
}

export function executeCommandSync(command: string): CommandResult {
  try {
    const stdout = execSync(command, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return {
      stdout: stdout.trim(),
      stderr: '',
      code: 0,
    };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    return {
      stdout: execError.stdout?.trim() || '',
      stderr: execError.stderr?.trim() || execError.message || '',
      code: execError.status || 1,
    };
  }
}

export function buildXcodebuildCommand(
  action: string,
  projectPath: string,
  options: {
    scheme?: string;
    configuration?: string;
    destination?: string;
    sdk?: string;
    derivedDataPath?: string;
    workspace?: boolean;
    json?: boolean;
    [key: string]: string | boolean | undefined;
  } = {}
): string {
  const parts: string[] = ['xcodebuild'];

  // Add project or workspace
  if (options.workspace || projectPath.endsWith('.xcworkspace')) {
    parts.push('-workspace', `"${projectPath}"`);
  } else {
    parts.push('-project', `"${projectPath}"`);
  }

  // Add scheme if provided
  if (options.scheme) {
    parts.push('-scheme', `"${options.scheme}"`);
  }

  // Add configuration if provided
  if (options.configuration) {
    parts.push('-configuration', options.configuration);
  }

  // Add destination if provided
  if (options.destination) {
    parts.push('-destination', `"${options.destination}"`);
  }

  // Add SDK if provided
  if (options.sdk) {
    parts.push('-sdk', options.sdk);
  }

  // Add derived data path if provided
  if (options.derivedDataPath) {
    parts.push('-derivedDataPath', `"${options.derivedDataPath}"`);
  }

  // Add JSON flag if requested
  if (options.json) {
    parts.push('-json');
  }

  // Add action (build, clean, archive, etc.)
  if (action) {
    parts.push(action);
  }

  return parts.join(' ');
}

export function buildSimctlCommand(
  action: string,
  options: {
    deviceId?: string;
    deviceType?: string;
    runtime?: string;
    name?: string;
    json?: boolean;
    [key: string]: string | boolean | undefined;
  } = {}
): string {
  const parts: string[] = ['xcrun', 'simctl'];

  // Add action
  parts.push(action);

  // Add JSON flag if requested and supported
  if (options.json && ['list'].includes(action)) {
    parts.push('-j');
  }

  // Add device ID for device-specific actions
  if (options.deviceId && ['boot', 'shutdown', 'delete'].includes(action)) {
    parts.push(options.deviceId);
  }

  // Add device creation parameters
  if (action === 'create' && options.name && options.deviceType && options.runtime) {
    parts.push(`"${options.name}"`, options.deviceType, options.runtime);
  }

  return parts.join(' ');
}
