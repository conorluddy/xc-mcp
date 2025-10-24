import { executeCommand } from './command.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

/**
 * Device information from parsing simctl output
 */
interface BootedDevice {
  name: string;
  udid: string;
}

/**
 * Get the currently booted iOS simulator
 *
 * @returns Device info with name and UDID
 * @throws Error if no booted simulator is found
 */
export async function getBootedDevice(): Promise<BootedDevice> {
  try {
    const command = 'xcrun simctl list devices -j';
    const result = await executeCommand(command);

    if (result.code !== 0) {
      throw new Error(`Failed to list devices: ${result.stderr}`);
    }

    const deviceList = JSON.parse(result.stdout);

    // Search through all runtime device lists for a booted device
    for (const devices of Object.values(deviceList.devices)) {
      const deviceArray = devices as Array<{
        state: string;
        isAvailable?: boolean;
        name: string;
        udid: string;
      }>;
      const bootedDevice = deviceArray.find(d => d.state === 'Booted' && d.isAvailable !== false);

      if (bootedDevice) {
        return {
          name: bootedDevice.name,
          udid: bootedDevice.udid,
        };
      }
    }

    throw new Error('No booted simulator found');
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to detect booted device: ${String(error)}`);
  }
}

/**
 * Resolve a device UDID, using auto-detection if not provided
 *
 * @param udid - Optional UDID to use directly
 * @returns The resolved UDID
 * @throws McpError if UDID is empty or if auto-detection fails
 */
export async function resolveDeviceId(udid?: string): Promise<string> {
  // If UDID explicitly provided, validate and use it
  if (udid && udid.trim().length > 0) {
    return udid;
  }

  // Auto-detect booted simulator
  try {
    const bootedDevice = await getBootedDevice();
    return bootedDevice.udid;
  } catch (error) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `No simulator UDID provided and could not auto-detect booted simulator. ` +
        `Please provide a device UDID or boot a simulator first. ` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
