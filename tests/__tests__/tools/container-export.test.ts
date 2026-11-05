import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simctlContainerTool } from '../../../src/tools/simctl/container.js';
import { executeCommand } from '../../../src/utils/command.js';
jest.mock('../../../src/utils/command.js', () => ({ executeCommand: jest.fn() }));
jest.mock('../../../src/utils/response-cache.js', () => ({
  responseCache: {},
  responseResourceLink: jest.fn(),
}));
it('exports files and refuses to overwrite an existing export', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'container-export-'));
  try {
    const source = path.join(directory, 'source');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'data.txt'), 'saved data');
    (executeCommand as jest.Mock).mockResolvedValue({ code: 0, stdout: source, stderr: '' });
    const destination = path.join(directory, 'exports');
    const args = { bundleId: 'com.example.app', mode: 'export', destination };
    await simctlContainerTool(args);
    expect(fs.readFileSync(path.join(destination, 'com.example.app', 'data.txt'), 'utf8')).toBe(
      'saved data'
    );
    await expect(simctlContainerTool(args)).rejects.toThrow('already exists');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
