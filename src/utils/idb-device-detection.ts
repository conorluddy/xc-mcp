import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { IDBTargetCache } from '../state/idb-target-cache.js';
import { executeCommand } from './command.js';

/**
 * Resolve UDID with intelligent fallback
 *
 * Why: Enable auto-detection for better UX.
 * Fallback order:
 * 1. Explicit UDID if provided
 * 2. Last used booted simulator (preferred for development)
 * 3. First booted target (any type)
 *
 * @param udid - Optional explicit UDID
 * @returns Resolved UDID
 * @throws McpError if no suitable target found
 */
export async function resolveIdbUdid(udid?: string): Promise<string> {
  // If UDID provided, validate and return
  if (udid && udid.trim().length > 0) {
    return udid.trim();
  }

  // Fallback: Try to find last used booted target
  const lastUsed = await IDBTargetCache.getLastUsedTarget();
  if (lastUsed) {
    console.error(`[idb-device-detection] Auto-detected UDID: ${lastUsed.udid} (${lastUsed.name})`);
    return lastUsed.udid;
  }

  // No booted targets found
  throw new McpError(
    ErrorCode.InvalidRequest,
    'No UDID provided and no booted targets found. ' +
      'Boot a simulator or device first, or provide explicit UDID parameter.'
  );
}

/**
 * Validate device is ready for operations
 *
 * Why: Physical devices require USB connection + idb_companion daemon.
 * Better to fail fast with actionable error than cryptic IDB failure.
 *
 * @param udid - Target UDID to validate
 * @throws McpError if device not ready
 */
export async function validateDeviceReady(udid: string): Promise<void> {
  const target = await IDBTargetCache.getTarget(udid);

  // Simulators don't need companion validation
  if (target.type === 'simulator') {
    return;
  }

  // For physical devices, verify companion is reachable
  // Why: idb_companion must be running for device operations
  try {
    const companionCheck = await executeCommand(`idb connect ${udid} --check-companion 2>&1`, {
      timeout: 5000,
    });

    if (companionCheck.code !== 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Physical device "${target.name}" (${udid}) not ready.

Prerequisites for device operations:
${target.connectionType === 'usb' ? '• Device connected via USB ✓' : '• Device connected via WiFi'}
• Trust this computer on the device
• idb_companion daemon running

Current state: ${target.state}
Connection: ${target.connectionType || 'Unknown'}

Troubleshooting:
1. For USB devices:
   - Reconnect USB cable
   - Unlock device and tap "Trust" if prompted

2. For WiFi devices:
   - Ensure device and Mac on same network
   - Run: idb_companion --udid ${udid} --grpc-port 10882

3. Verify with: idb list-targets

Error: ${companionCheck.stderr || 'Companion not reachable'}`
      );
    }
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    // Companion check failed for other reason
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to validate device companion: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validate target exists and is booted
 *
 * Why: Most IDB operations require target to be booted.
 * Provide actionable error instead of cryptic IDB failure.
 *
 * @param udid - Target UDID
 * @returns Target details if valid
 * @throws McpError if target not found or not booted
 */
export async function validateTargetBooted(udid: string) {
  const target = await IDBTargetCache.getTarget(udid);

  console.error(
    `[idb-device-detection] validateTargetBooted(${udid}): ${target.name} - state: ${target.state}`
  );

  if (target.state !== 'Booted') {
    console.error(
      `[idb-device-detection] Validation failed: target state is ${target.state}, not Booted`
    );
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Target "${target.name}" (${udid}) is not booted.

Current state: ${target.state}

Boot the target first:
${target.type === 'simulator' ? `- Simulator: simctl-boot ${udid}` : `- Device: Wake device and unlock`}

Or use idb-targets to list available booted targets.`
    );
  }

  console.error(`[idb-device-detection] Validation passed: target is booted`);
  return target;
}
