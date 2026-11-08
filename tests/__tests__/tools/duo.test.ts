import { simctlDuoTool } from '../../../src/tools/simctl/duo.js';
import { duoCommand, privateDuoBackend } from '../../../src/utils/duo-backend.js';
jest.mock('../../../src/utils/duo-backend.js', () => ({
  duoCommand: jest.fn(),
  privateDuoBackend: { angle: jest.fn(), hinge: jest.fn(), orient: jest.fn() },
}));
const command = duoCommand as jest.Mock;
const angle = privateDuoBackend.angle as jest.Mock;
const hinge = privateDuoBackend.hinge as jest.Mock;
const result = async (args: Parameters<typeof simctlDuoTool>[0]) =>
  JSON.parse((await simctlDuoTool(args)).content[0].text);
describe('Duo control safety and verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    command.mockImplementation(async (args: string[]) =>
      args[0] === 'simctl'
        ? JSON.stringify({
            devices: {
              runtime: [
                {
                  udid: 'duo',
                  deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-Duo',
                },
              ],
            },
          })
        : JSON.stringify({
            result: {
              displays: [
                {
                  name: 'LCD',
                  active: true,
                  primary: true,
                  displayId: 1,
                  currentOrientation: 'rot0',
                },
              ],
            },
          })
    );
    angle.mockResolvedValue(0);
  });
  it('rejects ambiguous hinge arguments before any command', async () => {
    expect(
      (await result({ udid: 'duo', operation: 'hinge', angle: 90, pose: 'open' })).success
    ).toBe(false);
    expect(command).not.toHaveBeenCalled();
  });
  it('rejects a different target without invoking the helper', async () => {
    expect((await result({ udid: 'other', operation: 'state' })).success).toBe(false);
    expect(angle).not.toHaveBeenCalled();
  });
  it('returns observed state and display inventory', async () => {
    expect(await result({ udid: 'duo', operation: 'state' })).toMatchObject({
      success: true,
      hingeAngle: 0,
      displayId: 1,
      activeScreen: 'cover',
    });
  });
  it('verifies a hinge command against readback', async () => {
    angle.mockResolvedValueOnce(90).mockResolvedValue(0);
    expect((await result({ udid: 'duo', operation: 'hinge', pose: 'closed' })).success).toBe(true);
    expect(hinge).toHaveBeenCalledWith('duo', 90, 0);
  });
  it('reports unavailable readback instead of success', async () => {
    angle.mockRejectedValue(new Error('no hinge readback'));
    expect((await result({ udid: 'duo', operation: 'state' })).success).toBe(false);
  });
});
