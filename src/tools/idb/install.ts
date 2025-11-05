import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { executeCommand } from '../../utils/command.js';
import { resolveIdbUdid, validateTargetBooted } from '../../utils/idb-device-detection.js';
import { IDBTargetCache } from '../../state/idb-target-cache.js';
import { isSafePath } from '../../utils/shell-escape.js';
import { formatToolError } from '../../utils/error-formatter.js';

interface IdbInstallArgs {
  udid?: string;
  appPath: string; // Path to .app or .ipa file
}

/**
 * Install application to iOS target - deploy .app bundles or .ipa archives for testing
 *
 * **What it does:**
 * Transfers and registers application bundles (.app) or archives (.ipa) to iOS targets. Validates
 * app path format before transfer, handles installation process (transfer, registration, signature
 * validation), extracts bundle ID from output for launching, and provides detailed error guidance
 * for common failures (code signing, architecture mismatch, already installed).
 *
 * **Why you'd use it:**
 * - Deploy fresh builds to simulators and devices for automated testing - no Xcode required
 * - Install multiple app versions for A/B testing or regression validation
 * - Automated CI/CD integration for deploying test builds to device farms
 * - Troubleshoot installation failures with architecture-specific and signing-specific guidance
 *
 * **Parameters:**
 * - appPath (required): Absolute path to .app bundle or .ipa archive
 * - udid (optional): Target identifier - auto-detects if omitted
 *
 * **Returns:**
 * Installation status with success indicator, app path, extracted bundle ID (if available),
 * installation output, and context-specific troubleshooting guidance (code signing issues,
 * architecture mismatches, already installed, file not found).
 *
 * **Example:**
 * ```typescript
 * // Install simulator build
 * const result = await idbInstallTool({
 *   appPath: '/path/to/DerivedData/Build/Products/Debug-iphonesimulator/MyApp.app'
 * });
 *
 * // Install signed IPA to physical device
 * await idbInstallTool({
 *   appPath: '/path/to/MyApp.ipa',
 *   udid: 'DEVICE-UDID-123'
 * });
 * ```
 *
 * **Full documentation:** See idb/install.md for detailed parameters and troubleshooting
 *
 * @param args Tool arguments with app path and optional target UDID
 * @returns Tool result with installation status and bundle ID
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
  // Validate app path to prevent path traversal and command injection
  if (!isSafePath(appPath)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Invalid or potentially dangerous app path: ${appPath}`
    );
  }

  const command = `idb install "${appPath}" --udid "${udid}"`;

  console.error(`[idb-install] Executing: ${command}`);
  console.error(`[idb-install] Installing ${appPath} to ${target.name}...`);

  // Installation can be slow, use 120s timeout
  const result = await executeCommand(command, { timeout: 120000 });

  if (result.code !== 0) {
    const condensedError = formatToolError(result.stderr, 'Installation failed');
    return {
      success: false,
      appPath,
      error: condensedError,
      guidance: formatErrorGuidance(appPath, condensedError, udid),
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

function formatErrorGuidance(appPath: string, condensedError: string, udid: string): string[] {
  const guidance: string[] = [`❌ Failed to install app`, ``, `Reason: ${condensedError}`, ``];

  // Provide context-specific troubleshooting
  if (condensedError.includes('No such file') || condensedError.includes('not found')) {
    guidance.push(`Next steps:`);
    guidance.push(`• Verify path exists: ${appPath}`);
    guidance.push(`• Use absolute path, not relative`);
  } else if (condensedError.includes('signature') || condensedError.includes('provisioning')) {
    guidance.push(`Code signing issue:`);
    guidance.push(`• Simulators: Use unsigned .app bundles`);
    guidance.push(`• Devices: Must have valid provisioning profile`);
  } else if (condensedError.includes('already installed')) {
    guidance.push(`App already installed:`);
    guidance.push(`• Uninstall first: idb-uninstall --bundle-id <id> --udid ${udid}`);
  } else if (condensedError.includes('architecture')) {
    guidance.push(`Architecture mismatch:`);
    guidance.push(`• Rebuild for correct target architecture`);
  } else {
    guidance.push(`Troubleshooting:`);
    guidance.push(`• Verify device is booted: idb-targets --operation list`);
    guidance.push(`• Check target is ready: idb-connect --udid ${udid}`);
  }

  return guidance;
}

export const IDB_INSTALL_DOCS = `
# idb-install

Install application to iOS target - deploy .app bundles or .ipa archives for testing.

## Overview

Transfers and registers application bundles (.app) or archives (.ipa) to iOS targets. Validates app path format before transfer, handles installation process (transfer, registration, signature validation), extracts bundle ID from output for launching, and provides detailed error guidance for common failures (code signing, architecture mismatch, already installed).

## Parameters

### Required
- **appPath** (string): Absolute path to .app bundle or .ipa archive

### Optional
- **udid** (string): Target identifier - auto-detects if omitted

## Returns

Installation status with success indicator, app path, extracted bundle ID (if available), installation output, and context-specific troubleshooting guidance (code signing issues, architecture mismatches, already installed, file not found).

## Examples

### Install simulator build
\`\`\`typescript
const result = await idbInstallTool({
  appPath: '/path/to/DerivedData/Build/Products/Debug-iphonesimulator/MyApp.app'
});
\`\`\`

### Install signed IPA to physical device
\`\`\`typescript
await idbInstallTool({
  appPath: '/path/to/MyApp.ipa',
  udid: 'DEVICE-UDID-123'
});
\`\`\`

## Related Tools

- idb-list-apps: Find bundle ID after installation
- idb-launch: Launch installed app by bundle ID
- idb-uninstall: Remove app for clean reinstall

## Notes

- Supports .app bundles (from Xcode build) and .ipa archives (signed/unsigned)
- Installation can take 10-60 seconds depending on app size
- Simulators accept unsigned .app bundles
- Physical devices require valid provisioning profile
- Auto-terminates running apps before installation
- Extracts bundle ID from output when available
`;
