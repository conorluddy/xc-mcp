import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface IdbLaunchArgs {
  udid?: string;
  bundleId: string; // App bundle identifier
  streamOutput?: boolean; // Stream stdout/stderr (-w flag)
  arguments?: string[]; // Command-line arguments to pass to app
  environment?: Record<string, string>; // Environment variables
}

/**
 * Launch application on iOS target
 *
 * Examples:
 * - Simple launch: bundleId: "com.example.MyApp"
 * - Stream output: bundleId: "com.example.MyApp", streamOutput: true
 * - With arguments: bundleId: "com.example.MyApp", arguments: ["--debug", "--verbose"]
 * - With env vars: bundleId: "com.example.MyApp", environment: {"DEBUG": "1"}
 *
 * Output streaming (-w flag):
 * - streamOutput: true enables stdout/stderr capture
 * - Useful for debugging and behavior analysis
 * - Output included in response for analysis
 *
 * Process control:
 * - Returns process ID for tracking
 * - App runs in background after launch
 * - Use idb-terminate to stop app
 *
 * Device Support:
 * - Simulators: Full support ✅
 * - Physical Devices: Requires USB + idb_companion ✅
 */
export async function idbLaunchTool(args: IdbLaunchArgs) {
  const { udid, bundleId, streamOutput, arguments: appArgs, environment } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    if (!bundleId || bundleId.trim() === '') {
      throw new McpError(ErrorCode.InvalidRequest, 'bundleId is required');
    }

    // Resolve UDID and validate target is booted
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Launch
    // ============================================================================

    const result = await executeLaunchOperation(resolvedUdid, bundleId, {
      streamOutput,
      arguments: appArgs,
      environment,
    });

    // Record successful launch
    if (result.success) {
      IDBTargetCache.recordSuccess(resolvedUdid);
    }

    // ============================================================================
    // STAGE 3: Response Formatting
    // ============================================================================

    const duration = Date.now() - startTime;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ...result,
              udid: resolvedUdid,
              targetName: target.name,
              duration,
            },
            null,
            2
          ),
        },
      ],
      isError: !result.success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `idb-launch failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// LAUNCH EXECUTION
// ============================================================================

/**
 * Execute app launch
 *
 * Why: IDB launches app and optionally streams output.
 * Format: idb launch [--udid UDID] [-w] BUNDLE_ID [-- ARGS...]
 *
 * With -w flag: Streams stdout/stderr (useful for debugging)
 * Without -w: Fire and forget (app runs in background)
 */
async function executeLaunchOperation(
  udid: string,
  bundleId: string,
  options: {
    streamOutput?: boolean;
    arguments?: string[];
    environment?: Record<string, string>;
  }
): Promise<any> {
  // Build command
  let command = `idb launch --udid "${udid}"`;

  // Add stream output flag
  if (options.streamOutput) {
    command += ' -w';
  }

  // Add bundle ID
  command += ` ${bundleId}`;

  // Add arguments if provided
  if (options.arguments && options.arguments.length > 0) {
    command += ' -- ' + options.arguments.join(' ');
  }

  // Environment variables are passed differently - add to command if needed
  if (options.environment && Object.keys(options.environment).length > 0) {
    // IDB uses --env KEY=VALUE format
    for (const [key, value] of Object.entries(options.environment)) {
      command = `idb launch --udid "${udid}" --env ${key}="${value}" ${options.streamOutput ? '-w' : ''} ${bundleId}`;
    }
  }

  console.error(`[idb-launch] Executing: ${command}`);

  // Launch timeout depends on streaming
  const timeout = options.streamOutput ? 30000 : 15000;
  const result = await executeCommand(command, { timeout });

  if (result.code !== 0) {
    return {
      success: false,
      bundleId,
      error: result.stderr || 'Launch failed',
      guidance: formatErrorGuidance(bundleId, result.stderr || '', udid),
    };
  }

  // Parse process ID from output
  const processId = extractProcessIdFromOutput(result.stdout);

  return {
    success: true,
    bundleId,
    processId: processId || 'Unknown',
    streamOutput: options.streamOutput || false,
    output: result.stdout,
    stderr: result.stderr || undefined,
    guidance: formatSuccessGuidance(bundleId, processId, options.streamOutput, udid),
  };
}

// ============================================================================
// OUTPUT PARSING
// ============================================================================

/**
 * Extract process ID from IDB launch output
 *
 * Why: IDB outputs process ID in format "Launched <bundle-id> with process ID <pid>"
 */
function extractProcessIdFromOutput(stdout: string): number | undefined {
  // Example: "Launched com.example.MyApp with process ID 12345"
  const patterns = [
    /process\s+ID\s+(\d+)/i,
    /pid[:\s]+(\d+)/i,
    /launched.*?(\d{4,})/i, // 4+ digits likely to be PID
  ];

  for (const pattern of patterns) {
    const match = stdout.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }

  return undefined;
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatSuccessGuidance(
  bundleId: string,
  processId: number | undefined,
  streamedOutput: boolean | undefined,
  udid: string
): string[] {
  const guidance: string[] = [`✅ Successfully launched ${bundleId}`, ``];

  if (processId) {
    guidance.push(`Process ID: ${processId}`);
  }

  if (streamedOutput) {
    guidance.push(`Output streaming enabled (check 'output' field for stdout/stderr)`);
  }

  guidance.push(``);
  guidance.push(`Next steps:`);
  guidance.push(`• Take screenshot: simctl-screenshot-inline --udid ${udid}`);
  guidance.push(`• Interact with UI: idb-ui-tap / idb-ui-input / idb-ui-gesture`);
  guidance.push(`• Query UI tree: idb-ui-describe --operation all --udid ${udid}`);
  guidance.push(`• Terminate app: idb-terminate --bundle-id ${bundleId} --udid ${udid}`);

  if (!streamedOutput) {
    guidance.push(``);
    guidance.push(`Tip: Use streamOutput: true to capture stdout/stderr for debugging`);
  }

  return guidance;
}

function formatErrorGuidance(bundleId: string, stderr: string, udid: string): string[] {
  const guidance: string[] = [`❌ Failed to launch ${bundleId}`, ``, `Error: ${stderr}`, ``];

  // Provide context-specific troubleshooting
  if (stderr.includes('not found') || stderr.includes('not installed')) {
    guidance.push(`App not installed:`);
    guidance.push(`• Install app: idb-install --app-path /path/to/App.app --udid ${udid}`);
    guidance.push(`• Verify installation: idb-list-apps --filter-type user --udid ${udid}`);
    guidance.push(`• Check bundle ID is correct`);
  } else if (stderr.includes('already running')) {
    guidance.push(`App already running:`);
    guidance.push(`• Terminate first: idb-terminate --bundle-id ${bundleId} --udid ${udid}`);
    guidance.push(`• Then retry launch`);
    guidance.push(`• Or interact with running app directly`);
  } else if (stderr.includes('crashed') || stderr.includes('exited')) {
    guidance.push(`App crashed on launch:`);
    guidance.push(`• Check crash logs: idb crash list --bundle-id ${bundleId} --udid ${udid}`);
    guidance.push(`• View crash report: idb crash show <crash-name> --udid ${udid}`);
    guidance.push(`• Enable streaming: streamOutput: true for stdout/stderr`);
    guidance.push(`• Check app dependencies and build settings`);
  } else {
    guidance.push(`Troubleshooting:`);
    guidance.push(`• Verify app is installed: idb-list-apps --udid ${udid}`);
    guidance.push(`• Check target is booted: idb-targets --operation list --state Booted`);
    guidance.push(`• Try installing app: idb-install --app-path /path/to/App.app --udid ${udid}`);
    guidance.push(`• Check IDB connection: idb list-targets`);
  }

  return guidance;
}
