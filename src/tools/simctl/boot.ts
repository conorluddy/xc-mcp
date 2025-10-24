import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand, buildSimctlCommand } from '../../utils/command.js';
// Removed unused import
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlBootToolArgs {
  deviceId: string;
  waitForBoot?: boolean;
  openGui?: boolean;
}

/**
 * Boot iOS simulator device with intelligent performance tracking and learning
 *
 * **What it does:**
 * Boots an iOS simulator device and optionally waits for complete boot. Tracks performance
 * metrics and learns from successful configurations for future recommendations.
 *
 * **Why you'd use it:**
 * - 📊 Performance tracking - Records boot times for optimization insights
 * - 🧠 Learning system - Remembers which devices are fastest
 * - 🎯 Smart recommendations - Future boots suggest fastest devices
 * - 🛡️ Better error handling - Clear feedback vs cryptic xcrun errors
 * - ⏱️ Wait management - Intelligent waiting vs guessing when boot is done
 *
 * **Parameters:**
 * - `deviceId` (string): Device UDID from simctl-list, "booted" for current, or "all"
 * - `waitForBoot` (boolean, default: true): Wait for device to finish booting completely
 * - `openGui` (boolean, default: true): Open Simulator.app GUI (visual feedback)
 *
 * **Returns:**
 * Boot status with device info, boot time metrics, and next step guidance
 *
 * **Example:**
 * ```typescript
 * // Boot with defaults (wait + GUI)
 * await simctlBootTool({ deviceId: 'ABC-123-DEF' })
 *
 * // Quick boot without GUI
 * await simctlBootTool({ deviceId: 'ABC-123-DEF', waitForBoot: false, openGui: false })
 * ```
 *
 * **Device Support:**
 * - Simulators: Full support ✅
 * - Physical devices: N/A
 *
 * **Full documentation:** See simctl/boot.md for detailed parameters and examples
 *
 * @param args Boot configuration (requires deviceId)
 * @returns Boot result with status, metrics, and guidance
 * @throws McpError for invalid device ID or boot failure
 */
export async function simctlBootTool(args: any) {
  const { deviceId, waitForBoot = true, openGui = true } = args as SimctlBootToolArgs;

  try {
    // Validate inputs
    validateDeviceId(deviceId);

    // Build boot command
    const bootCommand = buildSimctlCommand('boot', { deviceId });

    console.error(`[simctl-boot] Executing: ${bootCommand}`);

    // Execute boot command
    const startTime = Date.now();
    const bootResult = await executeCommand(bootCommand, {
      timeout: 120000, // 2 minutes for boot
    });

    let bootStatus = {
      success: bootResult.code === 0,
      command: bootCommand,
      output: bootResult.stdout,
      error: bootResult.stderr,
      exitCode: bootResult.code,
      bootTime: Date.now() - startTime,
    };

    // If boot failed due to device already being booted, that's actually OK
    if (
      !bootStatus.success &&
      bootResult.stderr.includes('Unable to boot device in current state: Booted')
    ) {
      bootStatus = {
        ...bootStatus,
        success: true,
        error: 'Device was already booted',
      };
    }

    // Wait for boot to complete if requested
    if (waitForBoot && bootStatus.success) {
      try {
        await waitForDeviceBoot(deviceId);
        bootStatus.bootTime = Date.now() - startTime;
      } catch (waitError) {
        throw new McpError(
          ErrorCode.InternalError,
          `Device booted but failed to wait for completion: ${waitError}`
        );
      }
    }

    // Record boot event and usage in cache
    if (bootStatus.success) {
      simulatorCache.recordBootEvent(deviceId, true, bootStatus.bootTime);
      // Also record usage with current working directory as project path
      simulatorCache.recordSimulatorUsage(deviceId, process.cwd());

      // Open Simulator.app GUI if requested
      if (openGui) {
        try {
          await executeCommand('open -a Simulator', { timeout: 5000 });
          console.error('[simctl-boot] Opened Simulator.app GUI');
        } catch (openError) {
          // Non-fatal - simulator still booted successfully
          console.warn(
            '[simctl-boot] Failed to open Simulator GUI:',
            openError instanceof Error ? openError.message : String(openError)
          );
        }
      }
    }

    // Format response
    const responseText = JSON.stringify(bootStatus, null, 2);

    return {
      content: [
        {
          type: 'text' as const,
          text: responseText,
        },
      ],
      isError: !bootStatus.success,
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InternalError,
      `simctl-boot failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function waitForDeviceBoot(deviceId: string, timeoutMs = 120000): Promise<void> {
  const startTime = Date.now();
  const pollInterval = 2000; // Poll every 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      // Check device status
      const statusCommand = `xcrun simctl list devices -j`;
      const result = await executeCommand(statusCommand);

      if (result.code === 0) {
        const deviceList = JSON.parse(result.stdout);

        // Find the device in the list
        for (const devices of Object.values(deviceList.devices)) {
          const deviceArray = devices as any[];
          const device = deviceArray.find(d => d.udid === deviceId);

          if (device && device.state === 'Booted') {
            return; // Device is fully booted
          }
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch {
      // Continue polling on errors
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(`Device ${deviceId} did not boot within ${timeoutMs}ms`);
}
