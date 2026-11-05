import { simulatorBatch } from '../../../src/tools/simctl/batch.js';
import { simulatorCache } from '../../../src/state/simulator-cache.js';
import { simctlEraseTool } from '../../../src/tools/simctl/erase.js';
jest.mock('../../../src/state/simulator-cache.js', () => ({
  simulatorCache: { getAvailableSimulators: jest.fn() },
}));
jest.mock('../../../src/tools/simctl/erase.js', () => ({ simctlEraseTool: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
it('requires batch destructive consent before resolving or mutating devices', async () => {
  await expect(simulatorBatch('erase', { all: true })).rejects.toThrow('confirm');
  expect(simulatorCache.getAvailableSimulators).not.toHaveBeenCalled();
});
it('uses a filtered snapshot and reports partial failure', async () => {
  (simulatorCache.getAvailableSimulators as jest.Mock).mockResolvedValue([
    { udid: 'a' },
    { udid: 'b' },
  ]);
  (simctlEraseTool as jest.Mock)
    .mockResolvedValueOnce({ isError: false })
    .mockRejectedValueOnce(new Error('failed'));
  const result = await simulatorBatch('erase', {
    deviceType: 'iPad',
    runtime: '26',
    confirm: true,
  });
  expect(simulatorCache.getAvailableSimulators).toHaveBeenCalledWith('iPad', '26');
  expect(simctlEraseTool).toHaveBeenCalledWith(
    expect.objectContaining({ deviceId: 'a', confirm: true })
  );
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text).results).toHaveLength(2);
});

it('rejects explicit device IDs combined with batch filters before resolving devices', async () => {
  await expect(
    simulatorBatch('erase', { deviceId: 'single-device', runtime: '26', confirm: true })
  ).rejects.toThrow('either deviceId or batch');
  expect(simulatorCache.getAvailableSimulators).not.toHaveBeenCalled();
  expect(simctlEraseTool).not.toHaveBeenCalled();
});
