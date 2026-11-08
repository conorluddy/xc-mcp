import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { executeCommandWithArgs } from './command.js';

export async function duoCommand(args: string[]): Promise<string> {
  const result = await executeCommandWithArgs('xcrun', args, { timeout: 15000 });
  if (result.code !== 0) throw new Error(result.stderr || `xcrun exited ${result.code}`);
  return result.stdout;
}
export interface DuoBackend {
  angle(udid: string): Promise<number>;
  hinge(udid: string, from: number, to: number): Promise<void>;
  orient(udid: string, orientation: string): Promise<void>;
}
let pending: Promise<string> | undefined;
async function compileHelper(): Promise<string> {
  const source = fileURLToPath(new URL('../../native/duo.m', import.meta.url));
  const [bytes, version, sdk, compiler] = await Promise.all([
    fs.readFile(source),
    duoCommand(['xcodebuild', '-version']),
    duoCommand(['--sdk', 'iphonesimulator', '--show-sdk-path']),
    duoCommand(['--sdk', 'iphonesimulator', '--find', 'clang']),
  ]);
  const key = createHash('sha256')
    .update(bytes)
    .update(version)
    .update(sdk)
    .update(compiler)
    .update(process.arch)
    .digest('hex');
  const directory = path.join(os.homedir(), 'Library', 'Caches', 'xc-mcp', 'duo', key);
  const binary = path.join(directory, 'duo');
  try {
    await fs.access(binary, fs.constants.X_OK);
    return binary;
  } catch {
    /* compile */
  }
  await fs.mkdir(directory, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(directory, 'build-'));
  try {
    const output = path.join(temporary, 'duo');
    await duoCommand([
      '--sdk',
      'iphonesimulator',
      'clang',
      '-fobjc-arc',
      '-O2',
      '-arch',
      process.arch === 'arm64' ? 'arm64' : 'x86_64',
      '-mios-simulator-version-min=17.0',
      '-framework',
      'Foundation',
      '-framework',
      'IOKit',
      '-framework',
      'CoreMotion',
      source,
      '-o',
      output,
    ]);
    const signed = await executeCommandWithArgs('codesign', ['-f', '-s', '-', output], {
      timeout: 15000,
    });
    if (signed.code !== 0) throw new Error(signed.stderr);
    await fs.rename(output, binary);
    return binary;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
async function invoke(udid: string, args: string[]) {
  pending ??= compileHelper().catch(error => {
    pending = undefined;
    throw error;
  });
  return duoCommand(['simctl', 'spawn', udid, await pending, ...args]);
}
export const privateDuoBackend: DuoBackend = {
  async angle(udid) {
    const angle = Number(await invoke(udid, ['read']));
    if (!Number.isFinite(angle) || angle < 0 || angle > 180)
      throw new Error('Invalid hinge readback');
    return angle;
  },
  async hinge(udid, from, to) {
    await invoke(udid, ['hinge', String(from), String(to)]);
  },
  async orient(udid, orientation) {
    await invoke(udid, ['orientation', orientation]);
  },
};
