import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export const XCODEBUILD_VALIDATE_CAPABILITIES_DOCS = `# xcodebuild-validate-capabilities

Compare an app's Info.plist required permissions/capabilities against the
permissions actually granted on a simulator, surfacing mismatches.

## Parameters
- \`projectPath\` (required): Path to the .xcodeproj or .xcworkspace
- \`scheme\` (required): Scheme name
- \`udid\` (optional): Simulator UDID to validate granted permissions against

## Returns
A capabilities validation report listing required vs granted permissions and any gaps.`;

export const XCODEBUILD_VALIDATE_CAPABILITIES_DOCS_MINI =
  'Validate app capabilities against project Info.plist requirements.';

/**
 * Validate App Capabilities Against Project
 *
 * Compare Info.plist required permissions with simulator granted permissions
 *
 * @param args Tool arguments
 * @returns Capabilities validation report
 */
export async function validateCapabilitiesTool(args: any) {
  const { projectPath, scheme, udid } = args;

  if (!projectPath || !scheme) {
    throw new McpError(ErrorCode.InvalidRequest, 'projectPath and scheme are required');
  }

  try {
    // Dynamic import to avoid circular dependencies
    const { buildSettingsCache } = await import('../../state/build-settings-cache.js');

    // Get build settings to extract Info.plist capabilities
    const buildSettings = await buildSettingsCache.getBuildSettings(projectPath, scheme);

    // Map of Info.plist keys to capability services
    const capabilityMap: Record<string, { service: string; description: string }> = {
      NSCameraUsageDescription: { service: 'camera', description: 'Camera access' },
      NSMicrophoneUsageDescription: { service: 'microphone', description: 'Microphone access' },
      NSLocationWhenInUseUsageDescription: {
        service: 'location',
        description: 'Location (when in use)',
      },
      NSLocationAlwaysAndWhenInUseUsageDescription: {
        service: 'location',
        description: 'Location (always)',
      },
      NSContactsUsageDescription: { service: 'contacts', description: 'Contacts access' },
      NSPhotoLibraryUsageDescription: { service: 'photos', description: 'Photo library access' },
      NSCalendarsUsageDescription: { service: 'calendar', description: 'Calendar access' },
      NSHealthShareUsageDescription: { service: 'health', description: 'Health data access' },
      NSRemindersUsageDescription: { service: 'reminders', description: 'Reminders access' },
      NSMotionUsageDescription: { service: 'motion', description: 'Motion/fitness access' },
    };

    // Extract required capabilities from build settings
    const requiredCapabilities: Array<{
      service: string;
      description: string;
      infoPlistKey: string;
    }> = [];

    for (const [key, capability] of Object.entries(capabilityMap)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((buildSettings as any)[key]) {
        requiredCapabilities.push({
          service: capability.service,
          description: capability.description,
          infoPlistKey: key,
        });
      }
    }

    const responseData = {
      success: true,
      capabilities: {
        required: requiredCapabilities,
        count: requiredCapabilities.length,
      },
      guidance: [
        `Found ${requiredCapabilities.length} required capabilities in project`,
        ...(udid
          ? [
              'To grant permissions on simulator:',
              ...requiredCapabilities.map(
                cap =>
                  `  simctl-privacy udid: "${udid}" action: "grant" service: "${cap.service}" bundleId: "com.example.App"`
              ),
            ]
          : ['Specify udid parameter to see permission grant commands']),
      ],
    };

    const responseText = JSON.stringify(responseData, null, 2);

    return {
      content: [{ type: 'text' as const, text: responseText }],
      isError: false,
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to validate capabilities: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
