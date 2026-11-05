import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { appStateCaptureTool } from '../../../src/tools/workflows/app-state-capture.js';
import { executeCommandWithArgs } from '../../../src/utils/command.js';
jest.mock('../../../src/utils/command.js', () => ({ executeCommandWithArgs: jest.fn() }));
jest.mock('../../../src/utils/idb-device-detection.js', () => ({
  resolveIdbUdid: jest.fn().mockResolvedValue('device'),
  validateTargetBooted: jest.fn().mockResolvedValue({ name: 'Test' }),
}));
it('writes a bundle with per-artifact failure reporting and bounded logs', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-test-'));
  try {
    (executeCommandWithArgs as jest.Mock).mockImplementation(async (_command, argv) => ({
      code: argv.includes('describe-all') ? 1 : 0,
      stderr: 'unavailable',
      stdout: Array.from({ length: 200 }, (_, i) => String(i)).join('\n'),
    }));
    const result = await appStateCaptureTool({ outputDir: directory, bundleId: 'com.example.app' });
    const summary = JSON.parse(result.content[0].text);
    expect(result.isError).toBe(true);
    expect(summary.artifacts.find((a: any) => a.file === 'accessibility.json').captured).toBe(
      false
    );
    expect(
      fs.readFileSync(path.join(summary.directory, 'app-logs.txt'), 'utf8').split('\n')
    ).toHaveLength(100);
    expect(fs.existsSync(path.join(summary.directory, 'summary.json'))).toBe(true);
    expect(fs.existsSync(path.join(summary.directory, 'README.md'))).toBe(true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
