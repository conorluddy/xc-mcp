import { duoCommand, privateDuoBackend } from '../../utils/duo-backend.js';
export const SIMCTL_DUO_DOCS = `# simctl-duo

Control a booted Duo's hinge and interface orientation, with observed state readback.

Requires an explicit simulator UDID. operation: state, hinge, or rotate. hinge accepts
angle (0–180 degrees) or pose (closed=0, partial=90, open=180), exclusively.
rotate accepts orientation: portrait, landscape, portrait-upside-down, landscape-flipped.
The private helper is compiled with Xcode on first use. No additional CLI is required.
Changes poll readback for five seconds; hinge tolerance is two degrees. Endpoint changes
also verify the active cover/inner display. Intermediate angles do not imply a specific display.
Research credits: https://github.com/artemnovichkov/hinge and https://github.com/skarol/duoctl.
Replace the private backend when supported headless APIs provide equivalent verified behavior;
XCTest-only hinge APIs are insufficient. Folding and rotation can migrate independently.
idb coordinate touches on the inner screen are unverified. Use explicit display screenshots.
`;
export const SIMCTL_DUO_DOCS_MINI =
  'Read or set Duo hinge and orientation. Explicit booted Duo UDID required.';
interface Args {
  udid: string;
  operation: 'state' | 'hinge' | 'rotate';
  angle?: number;
  pose?: 'closed' | 'partial' | 'open';
  orientation?: 'portrait' | 'landscape' | 'portrait-upside-down' | 'landscape-flipped';
}
export async function simctlDuoTool(args: Args) {
  try {
    if (
      args.operation === 'hinge'
        ? (args.angle === undefined) === (args.pose === undefined) || args.orientation !== undefined
        : args.angle !== undefined ||
          args.pose !== undefined ||
          (args.operation === 'state' && args.orientation !== undefined) ||
          (args.operation === 'rotate' && !args.orientation)
    )
      throw new Error(
        'Supply only parameters belonging to the operation; hinge requires exactly one of angle or pose.'
      );
    const devices = JSON.parse(
      await duoCommand(['simctl', 'list', 'devices', 'booted', '-j'])
    ).devices;
    const device = Object.values(devices)
      .flat()
      .find(value => (value as { udid: string }).udid === args.udid) as
      | { deviceTypeIdentifier?: string }
      | undefined;
    if (!device || !/iPhone-Duo/i.test(device.deviceTypeIdentifier ?? ''))
      throw new Error('Select an explicitly booted iPhone Duo UDID.');
    const read = async () => {
      const data = JSON.parse(
        await duoCommand([
          'devicectl',
          'device',
          'info',
          'displays',
          '-d',
          args.udid,
          '--json-output',
          '-',
        ])
      );
      const displays = data.result.displays.filter((d: { name?: string }) =>
        d.name?.startsWith('LCD')
      );
      const active = displays.find((d: { active?: boolean }) => d.active);
      if (!active) throw new Error('No active Duo display reported');
      return {
        hingeAngle: await privateDuoBackend.angle(args.udid),
        activeScreen: active.primary ? 'cover' : 'inner',
        displayId: active.displayId,
        rotation: active.currentOrientation,
        displays,
      };
    };
    let state = await read();
    const target =
      args.angle ?? (args.pose ? { closed: 0, partial: 90, open: 180 }[args.pose] : undefined);
    if (target !== undefined && (!Number.isFinite(target) || target < 0 || target > 180))
      throw new Error('Angle must be between 0 and 180 degrees');
    const rotation = args.orientation
      ? {
          portrait: 'rot0',
          landscape: 'rot90',
          'portrait-upside-down': 'rot180',
          'landscape-flipped': 'rot270',
        }[args.orientation]
      : undefined;
    if (args.operation === 'hinge')
      await privateDuoBackend.hinge(args.udid, state.hingeAngle, target as number);
    const deadline = Date.now() + 5000;
    let attempt = 0;
    const matches = () =>
      args.operation === 'state' ||
      (args.operation === 'hinge'
        ? Math.abs(state.hingeAngle - (target as number)) <= 2 &&
          (target === 0
            ? state.activeScreen === 'cover'
            : target === 180
              ? state.activeScreen === 'inner'
              : true)
        : state.rotation === rotation);
    while (!matches() && Date.now() < deadline) {
      if (args.operation === 'rotate' && attempt < 4)
        await privateDuoBackend.orient(
          args.udid,
          ['portrait', 'landscape-left', 'landscape-right', 'pud'][attempt++]
        );
      await new Promise(resolve => setTimeout(resolve, 200));
      state = await read();
    }
    const success = matches();
    return {
      isError: !success,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success,
              udid: args.udid,
              ...state,
              ...(!success
                ? { error: 'Requested state was not observed within five seconds' }
                : {}),
              guidance: [
                'Use the observed displayId with screenshot display. Inner-display idb coordinate routing is unverified.',
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              success: false,
              error: String(error),
              guidance: ['Check Xcode, the iOS runtime and the explicitly selected booted Duo.'],
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
