import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simctlAddmediaTool } from '../../../src/tools/simctl/addmedia.js';
import { executeCommandWithArgs } from '../../../src/utils/command.js';
jest.mock('../../../src/utils/command.js', () => ({
  executeCommandWithArgs: jest.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
}));
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: { findSimulatorByUdid: jest.fn().mockResolvedValue({ name: 'Test' }) },
}));
it('validates all files before mutation and preserves paths as argv', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-batch-'));
  try {
    const file = path.join(directory, 'photo with spaces.png');
    fs.writeFileSync(file, 'fixture');
    await expect(
      simctlAddmediaTool({ udid: 'device', mediaPaths: [file, path.join(directory, 'missing')] })
    ).rejects.toThrow('does not exist');
    expect(executeCommandWithArgs).not.toHaveBeenCalled();
    await simctlAddmediaTool({ udid: 'device', mediaPaths: [file] });
    expect(executeCommandWithArgs).toHaveBeenCalledWith(
      'xcrun',
      ['simctl', 'addmedia', 'device', file],
      expect.any(Object)
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
