import { validateDeviceId } from '../../utils/validation.js';
import { executeCommand, buildSimctlCommand } from '../../utils/command.js';
// Removed unused import
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { simulatorCache } from '../../state/simulator-cache.js';

interface SimctlBootToolArgs {
  deviceId: string;
  waitForBoot?: boolean;
}

export async function simctlBootTool(args: any) {
  const { deviceId, waitForBoot = true } = args as SimctlBootToolArgs;

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
