import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommandWithArgs } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

export async function idbLibraryTool(args: {
  operation: 'notification-list' | 'notification-clear' | 'photos-clear';
  udid?: string;
  bundleId?: string;
  confirm?: boolean;
  limit?: number;
}) {
  if (args.operation === 'photos-clear' && args.confirm !== true)
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Clearing photos deletes the simulator photo library. Set confirm: true to proceed.'
    );
  if (args.operation !== 'photos-clear' && !args.bundleId?.trim())
    throw new McpError(ErrorCode.InvalidRequest, 'bundleId is required');
  const udid = await resolveIdbUdid(args.udid);
  await validateTargetBooted(udid);
  const command =
    args.operation === 'photos-clear'
      ? ['photos', 'clear']
      : ['notification', args.operation === 'notification-list' ? 'list' : 'clear', args.bundleId!];
  if (args.operation === 'notification-list') command.push('--json');
  const result = await executeCommandWithArgs('idb', [...command, '--udid', udid], {
    timeout: 30000,
  });
  if (result.code !== 0)
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: result.stderr,
            guidance: 'Check idb CLI and companion support this operation (idb 1.7+).',
          }),
        },
      ],
      isError: true,
    };
  let notifications: unknown[] | undefined;
  if (args.operation === 'notification-list') {
    try {
      notifications = result.stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch {
      return {
        content: [
          { type: 'text' as const, text: 'Cannot parse notification list returned by idb.' },
        ],
        isError: true,
      };
    }
  }
  IDBTargetCache.recordSuccess(udid);
  const limit = args.limit ?? 25;
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          notifications: notifications?.slice(0, limit),
          total: notifications?.length,
          remaining: notifications ? Math.max(0, notifications.length - limit) : undefined,
        }),
      },
    ],
    isError: false,
  };
}
export const IDB_LIBRARY_DOCS = `
# idb-library
Manage delivered notifications and the simulator photo library.

operation: notification-list | notification-clear | photos-clear. udid is optional.
Notification operations require bundleId. List output defaults to 25 entries; limit controls the cap.
photos-clear requires confirm: true and permanently deletes all simulator photos.
Requires idb 1.7+; unsupported commands return errors with upgrade guidance.
`;
export const IDB_LIBRARY_DOCS_MINI =
  'List/clear delivered notifications or clear simulator photos with explicit confirmation.';
