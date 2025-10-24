import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';

interface IdbInstallArgs {
  udid?: string;
  appPath: string; // Path to .app or .ipa file
}

/**
 * Install application to iOS target
 *
 * Examples:
 * - Install .app: appPath: "/path/to/MyApp.app"
 * - Install .ipa: appPath: "/path/to/MyApp.ipa"
 * - Auto-detect target: appPath: "/path/to/App.app"
 * - Specific target: appPath: "/path/to/App.app", udid: "ABC-123"
 *
 * Supported formats:
 * - .app bundles (from Xcode build)
 * - .ipa archives (signed/unsigned)
 *
 * Installation process:
 * - Validates app exists and is correct format
 * - Transfers to target device/simulator
 * - Registers app with system
 * - Returns bundle ID for launching
 *
 * Device Support:
 * - Simulators: Full support ✅
 * - Physical Devices: Requires USB + idb_companion ✅
 */
export async function idbInstallTool(args: IdbInstallArgs) {
  const { udid, appPath } = args;

  try {
    // ============================================================================
    // STAGE 1: Validation & Preparation
    // ============================================================================

    if (!appPath || appPath.trim() === '') {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'appPath is required (path to .app or .ipa file)'
      );
    }

    // Validate app path format
    if (!appPath.endsWith('.app') && !appPath.endsWith('.ipa')) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'appPath must end with .app or .ipa (received: ' + appPath + ')'
      );
    }

    // Resolve UDID and validate target is booted
    const resolvedUdid = await resolveIdbUdid(udid);
    const target = await validateTargetBooted(resolvedUdid);

    const startTime = Date.now();

    // ============================================================================
    // STAGE 2: Execute Installation
    // ============================================================================

    const result = await executeInstallOperation(resolvedUdid, appPath, target);

    // Record successful installation
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
      `idb-install failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// INSTALLATION EXECUTION
// ============================================================================

/**
 * Execute app installation
 *
 * Why: IDB handles transfer and registration of app bundles.
 * Format: idb install <path> --udid <UDID>
 *
 * Installation can take 10-60 seconds depending on app size.
 */
async function executeInstallOperation(udid: string, appPath: string, target: any): Promise<any> {
  const command = `idb install "${appPath}" --udid "${udid}"`;

  console.error(`[idb-install] Executing: ${command}`);
  console.error(`[idb-install] Installing ${appPath} to ${target.name}...`);

  // Installation can be slow, use 120s timeout
  const result = await executeCommand(command, { timeout: 120000 });

  if (result.code !== 0) {
    return {
      success: false,
      appPath,
      error: result.stderr || 'Installation failed',
      guidance: formatErrorGuidance(appPath, result.stderr || '', udid),
    };
  }

  // Parse output to extract bundle ID if present
  const bundleId = extractBundleIdFromOutput(result.stdout);

  return {
    success: true,
    appPath,
    bundleId: bundleId || 'Unknown',
    output: result.stdout,
    guidance: formatSuccessGuidance(appPath, bundleId, udid),
  };
}

// ============================================================================
// OUTPUT PARSING
// ============================================================================

/**
 * Extract bundle ID from IDB install output
 *
 * Why: IDB may output bundle ID in stdout.
 * If not found, return undefined and suggest using idb-list-apps.
 */
function extractBundleIdFromOutput(stdout: string): string | undefined {
  // IDB install output format varies, try common patterns
  // Example: "Installed com.example.MyApp"
  const patterns = [
    /Installed\s+([\w.]+)/i,
    /bundle\s+id[:\s]+([\w.]+)/i,
    /identifier[:\s]+([\w.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = stdout.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return undefined;
}

// ============================================================================
// GUIDANCE FORMATTING
// ============================================================================

function formatSuccessGuidance(
  appPath: string,
  bundleId: string | undefined,
  udid: string
): string[] {
  const appName =
    appPath
      .split('/')
      .pop()
      ?.replace(/\.(app|ipa)$/, '') || 'App';

  const guidance: string[] = [
    `✅ Successfully installed ${appName}`,
    ``,
    `App details:`,
    `• Path: ${appPath}`,
    bundleId ? `• Bundle ID: ${bundleId}` : `• Bundle ID: Unknown (use idb-list-apps to find)`,
    ``,
    `Next steps:`,
  ];

  if (bundleId && bundleId !== 'Unknown') {
    guidance.push(`• Launch app: idb-launch --bundle-id ${bundleId} --udid ${udid}`);
    guidance.push(`• Verify installation: idb-list-apps --filter-type user --udid ${udid}`);
    guidance.push(`• Take screenshot after launch: simctl-screenshot-inline --udid ${udid}`);
    guidance.push(`• Interact with UI: idb-ui-tap / idb-ui-input`);
  } else {
    guidance.push(`• Find bundle ID: idb-list-apps --filter-type user --udid ${udid}`);
    guidance.push(`• Then launch: idb-launch --bundle-id <bundle-id> --udid ${udid}`);
  }

  return guidance;
}

function formatErrorGuidance(appPath: string, stderr: string, udid: string): string[] {
  const guidance: string[] = [`❌ Failed to install app`, ``, `Error: ${stderr}`, ``];

  // Provide context-specific troubleshooting
  if (stderr.includes('No such file') || stderr.includes('not found')) {
    guidance.push(`Troubleshooting:`);
    guidance.push(`• Verify app path exists: ${appPath}`);
    guidance.push(`• Use absolute path (not relative)`);
    guidance.push(`• For .app: Must be built for simulator (if installing to simulator)`);
    guidance.push(`• For .ipa: Must be signed for device (if installing to device)`);
  } else if (stderr.includes('signature') || stderr.includes('provisioning')) {
    guidance.push(`Code signing issue:`);
    guidance.push(`• For simulators: No signing required, use .app bundle`);
    guidance.push(`• For devices: Must have valid provisioning profile`);
    guidance.push(`• Check Xcode signing settings`);
    guidance.push(`• Verify device UDID in provisioning profile`);
  } else if (stderr.includes('already installed')) {
    guidance.push(`App already installed:`);
    guidance.push(`• Uninstall first: idb-uninstall --bundle-id <bundle-id> --udid ${udid}`);
    guidance.push(`• Then retry installation`);
    guidance.push(`• Or use simctl-install for force reinstall`);
  } else if (stderr.includes('architecture')) {
    guidance.push(`Architecture mismatch:`);
    guidance.push(`• Simulator requires x86_64 or arm64 (M-series Mac)`);
    guidance.push(`• Device requires arm64`);
    guidance.push(`• Check build settings: ARCHS in Xcode`);
    guidance.push(`• Rebuild for correct architecture`);
  } else {
    guidance.push(`Troubleshooting:`);
    guidance.push(`• Verify target is booted: idb-targets --operation list --state Booted`);
    guidance.push(`• Check app is valid: file ${appPath}`);
    guidance.push(`• Try simctl-install as alternative`);
    guidance.push(`• Check IDB logs for details`);
  }

  return guidance;
}
