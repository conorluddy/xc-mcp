import * as fs from 'fs';
import * as path from 'path';
import { executeCommandWithArgs } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';

export const APP_STATE_CAPTURE_DOCS = `# app-state-capture
Capture a diagnostic bundle containing screenshot.png, accessibility.json, app-logs.txt,
device.json, summary.json, and README.md. Requires outputDir. udid is auto-detected;
bundleId optionally filters recent logs. Creates a fresh capture directory and reports
individual artifact failures. Log capture covers the last five minutes, capped at 100 lines.`;

export async function appStateCaptureTool(args: {
  outputDir: string;
  udid?: string;
  bundleId?: string;
}) {
  const udid = await resolveIdbUdid(args.udid);
  const device = await validateTargetBooted(udid);
  fs.mkdirSync(args.outputDir, { recursive: true });
  const directory = fs.mkdtempSync(path.join(args.outputDir, 'capture-'));
  fs.writeFileSync(path.join(directory, 'device.json'), JSON.stringify(device, null, 2));
  const artifacts = await Promise.all(
    [
      {
        file: 'screenshot.png',
        command: 'xcrun',
        argv: ['simctl', 'io', udid, 'screenshot', path.join(directory, 'screenshot.png')],
      },
      { file: 'accessibility.json', command: 'idb', argv: ['ui', 'describe-all', '--udid', udid] },
      {
        file: 'app-logs.txt',
        command: 'xcrun',
        argv: [
          'simctl',
          'spawn',
          udid,
          'log',
          'show',
          '--last',
          '5m',
          '--style',
          'compact',
          ...(args.bundleId
            ? [
                '--predicate',
                `subsystem == ${JSON.stringify(args.bundleId)} OR process == ${JSON.stringify(args.bundleId.split('.').at(-1))}`,
              ]
            : []),
        ],
      },
    ].map(async artifact => {
      try {
        const result = await executeCommandWithArgs(artifact.command, artifact.argv, {
          timeout: 15000,
        });
        if (result.code) return { file: artifact.file, captured: false, error: result.stderr };
        if (artifact.file !== 'screenshot.png')
          fs.writeFileSync(
            path.join(directory, artifact.file),
            artifact.file === 'app-logs.txt'
              ? result.stdout.split('\n').slice(-100).join('\n')
              : result.stdout
          );
        return { file: artifact.file, captured: true };
      } catch (error) {
        return { file: artifact.file, captured: false, error: String(error) };
      }
    })
  );
  const summary = {
    success: artifacts.every(a => a.captured),
    directory,
    udid,
    bundleId: args.bundleId,
    timestamp: new Date().toISOString(),
    artifacts,
  };
  fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(
    path.join(directory, 'README.md'),
    `# App state capture\n\nDevice: ${udid}\n\n${artifacts.map(a => `- ${a.file}: ${a.captured ? 'captured' : a.error}`).join('\n')}\n`
  );
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(summary) }],
    isError: !summary.success,
  };
}
