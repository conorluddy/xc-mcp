import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const execAsync = promisify(exec);

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number;
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
