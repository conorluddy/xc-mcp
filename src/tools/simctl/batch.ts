import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { simulatorCache } from '../../state/simulator-cache.js';

type Operation = 'boot' | 'shutdown' | 'erase' | 'delete';
interface BatchArgs {
  all?: boolean;
  deviceType?: string;
  runtime?: string;
  confirm?: boolean;
  force?: boolean;
  waitForBoot?: boolean;
}

/** Resolve a snapshot before mutation so deletion cannot change the selected set. */
export async function simulatorBatch(operation: Operation, args: BatchArgs) {
  if ((operation === 'erase' || operation === 'delete') && args.confirm !== true)
    throw new McpError(
      ErrorCode.InvalidRequest,
      'confirm: true is required for destructive batch operations'
    );
  const devices = await simulatorCache.getAvailableSimulators(args.deviceType, args.runtime);
  const results: Array<{ deviceId: string; success: boolean; error?: string }> = [];
  for (const device of devices) {
    if (
      (operation === 'boot' && device.state === 'Booted') ||
      (operation === 'shutdown' && device.state === 'Shutdown')
    )
      continue;
    try {
      const options = {
        deviceId: device.udid,
        confirm: args.confirm,
        force: args.force,
        waitForBoot: args.waitForBoot,
        openGui: false,
      };
      const result =
        operation === 'boot'
          ? await (await import('./boot.js')).simctlBootTool(options)
          : operation === 'shutdown'
            ? await (await import('./shutdown.js')).simctlShutdownTool(options)
            : operation === 'erase'
              ? await (await import('./erase.js')).simctlEraseTool(options)
              : await (await import('./delete.js')).simctlDeleteTool(options);
      results.push({ deviceId: device.udid, success: !result.isError });
    } catch (error) {
      results.push({ deviceId: device.udid, success: false, error: String(error) });
    }
  }
  const success = results.every(result => result.success);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success, operation, selected: devices.length, results }),
      },
    ],
    isError: !success,
  };
}
