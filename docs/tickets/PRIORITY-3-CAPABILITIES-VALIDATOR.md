# PRIORITY-3: Capabilities Validator

**Status:** Pending
**Priority:** 3 - Low Impact
**Effort:** Medium
**Impact:** Low - Nice to have, helps with permissions testing
**Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE

## Problem Statement

iOS apps declare required permissions in Info.plist. Testing often fails because permissions aren't granted on simulator. No tool to:

1. Show what permissions app requires
2. Check current permission state
3. Suggest which permissions need testing
4. Validate permissions match project

This requires manual exploration of:
- Info.plist for permission declarations
- Simulator settings for granted permissions
- Comparing manually

## Proposed Solution

Create a `validate-capabilities` tool that:

1. Reads build settings from project
2. Extracts required capabilities from Info.plist keys
3. Checks current permission state on simulator
4. Reports what permissions need granting
5. Suggests grant/revoke commands

### Implementation

Create new file: `src/tools/xcodebuild/validate-capabilities.ts`

```typescript
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { buildSettingsCache } from '../../state/build-settings-cache.js';

export interface CapabilityRequirement {
  service: string;
  description: string;
  infoPlistKey: string;
  required: boolean;
  granted?: boolean;
}

export async function validateCapabilitiesTool(args: any) {
  const { projectPath, scheme, udid } = args;

  if (!projectPath || !scheme) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'projectPath and scheme are required'
    );
  }

  const responseData: any = {
    capabilities: [],
    summary: {
      requiredCount: 0,
      grantedCount: 0,
      needsGranting: [],
    },
  };

  try {
    // Get build settings to extract capabilities
    const buildSettings = await buildSettingsCache.getBuildSettings(
      projectPath,
      scheme
    );

    // Map of Info.plist keys to capability info
    const capabilityMap = {
      NSCameraUsageDescription: {
        service: 'camera',
        description: 'Camera access',
        infoPlistKey: 'NSCameraUsageDescription',
      },
      NSLocationWhenInUseUsageDescription: {
        service: 'location',
        description: 'Location (while in use)',
        infoPlistKey: 'NSLocationWhenInUseUsageDescription',
      },
      NSLocationAlwaysAndWhenInUseUsageDescription: {
        service: 'location',
        description: 'Location (always and in use)',
        infoPlistKey: 'NSLocationAlwaysAndWhenInUseUsageDescription',
      },
      NSMicrophoneUsageDescription: {
        service: 'microphone',
        description: 'Microphone access',
        infoPlistKey: 'NSMicrophoneUsageDescription',
      },
      NSContactsUsageDescription: {
        service: 'contacts',
        description: 'Contacts access',
        infoPlistKey: 'NSContactsUsageDescription',
      },
      NSCalendarsUsageDescription: {
        service: 'calendar',
        description: 'Calendar access',
        infoPlistKey: 'NSCalendarsUsageDescription',
      },
      NSRemindersUsageDescription: {
        service: 'reminders',
        description: 'Reminders access',
        infoPlistKey: 'NSRemindersUsageDescription',
      },
      NSPhotosUsageDescription: {
        service: 'photos',
        description: 'Photos library access',
        infoPlistKey: 'NSPhotosUsageDescription',
      },
      NSHealthShareUsageDescription: {
        service: 'health',
        description: 'Health data access',
        infoPlistKey: 'NSHealthShareUsageDescription',
      },
      NSHealthUpdateUsageDescription: {
        service: 'health',
        description: 'Health data write',
        infoPlistKey: 'NSHealthUpdateUsageDescription',
      },
      NSBluetoothAlwaysUsageDescription: {
        service: 'bluetooth',
        description: 'Bluetooth access',
        infoPlistKey: 'NSBluetoothAlwaysUsageDescription',
      },
      NSUserTrackingUsageDescription: {
        service: 'tracking',
        description: 'User tracking',
        infoPlistKey: 'NSUserTrackingUsageDescription',
      },
      NSSiriUsageDescription: {
        service: 'siri',
        description: 'Siri access',
        infoPlistKey: 'NSSiriUsageDescription',
      },
    };

    // Find declared capabilities
    const declaredCapabilities = new Set<string>();

    for (const [key, capInfo] of Object.entries(capabilityMap)) {
      if (buildSettings[key as keyof typeof buildSettings]) {
        const reason = buildSettings[key as keyof typeof buildSettings];

        responseData.capabilities.push({
          service: (capInfo as any).service,
          description: (capInfo as any).description,
          infoPlistKey: key,
          reason: reason as string,
          required: true,
          granted: undefined, // Will check if simulator provided
        });

        declaredCapabilities.add((capInfo as any).service);
        responseData.summary.requiredCount++;
      }
    }

    // If simulator provided, check granted permissions
    if (udid) {
      const simulator = await simulatorCache.findSimulatorByUdid(udid);

      if (!simulator) {
        return {
          ...responseData,
          warning: `Simulator ${udid} not found - cannot check granted permissions`,
          guidance: [
            'Showing required capabilities from project',
            'Cannot verify which are granted without valid simulator',
            'Use simctl-privacy to manage permissions',
          ],
        };
      }

      if (simulator.state !== 'Booted') {
        return {
          ...responseData,
          warning: `Simulator not booted - cannot check permissions reliably`,
          guidance: [
            'Showing required capabilities from project',
            'Boot simulator to check granted permissions',
          ],
        };
      }

      // Check permission state for each capability
      for (const capability of responseData.capabilities) {
        try {
          // Note: This would require querying simctl for permission state
          // For now, we just note what should be checked
          capability.needsValidation = true;
        } catch (error) {
          console.error(`Could not check permission for ${capability.service}:`, error);
        }
      }
    }

    // Generate suggested commands
    const suggestedCommands = responseData.capabilities.map((cap: any) => ({
      service: cap.service,
      grant: `simctl-privacy udid: "${udid}" bundleId: "<app-bundle-id>" action: "grant" service: "${cap.service}"`,
      revoke: `simctl-privacy udid: "${udid}" bundleId: "<app-bundle-id>" action: "revoke" service: "${cap.service}"`,
    }));

    return {
      capabilities: responseData.capabilities,
      summary: responseData.summary,
      suggestedCommands: suggestedCommands,
      guidance: [
        `Found ${responseData.capabilities.length} required capability/permissions`,
        '',
        'To test permissions on simulator:',
        ...responseData.capabilities.slice(0, 3).map(
          (cap: any) =>
            `  • Grant ${cap.service}: simctl-privacy udid: "${udid}" bundleId: "..." action: "grant" service: "${cap.service}"`
        ),
        '',
        'Or create a test scenario:',
        '  1. Grant all: simctl-privacy action: "grant" service: "all"',
        '  2. Launch app and test',
        '  3. Revoke one by one to test permission requests',
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Error validating capabilities: ${error}`
    );
  }
}
```

Register tool in `src/index.ts`:

```typescript
{
  name: 'validate-capabilities',
  description: `🔐 **Check app permissions and capabilities**

Analyzes your app's required permissions and capabilities from the project.

Shows:
• What permissions your app declares
• Description of each permission (from Info.plist)
• Suggested commands to grant/revoke permissions on simulator

Use before testing permission-related features to understand what needs to be granted.`,

  inputSchema: {
    type: 'object' as const,
    properties: {
      projectPath: {
        type: 'string',
        description: 'Path to .xcodeproj or .xcworkspace',
      },
      scheme: {
        type: 'string',
        description: 'Scheme name',
      },
      udid: {
        type: 'string',
        description: 'Optional: Simulator UDID to check current permission state',
      },
    },
    required: ['projectPath', 'scheme'],
  },
},
```

## Implementation Checklist

- [ ] Create `src/tools/xcodebuild/validate-capabilities.ts`
- [ ] Create capability mapping for all iOS permissions
- [ ] Extract capabilities from build settings
- [ ] Parse Info.plist usage descriptions
- [ ] Check simulator permission state (if udid provided)
- [ ] Generate suggested grant/revoke commands
- [ ] Format response with clear capability list
- [ ] Add helpful guidance for testing
- [ ] Register tool in main server
- [ ] Unit tests for capability detection
- [ ] Integration tests with real project
- [ ] Test with project having multiple permissions
- [ ] Test with project having no special permissions
- [ ] Update CLAUDE.md
- [ ] Add examples to README

## Testing Requirements

### Unit Tests

- [ ] Detects camera capability
- [ ] Detects location capability
- [ ] Detects microphone capability
- [ ] Handles multiple capabilities
- [ ] Handles projects with no special capabilities

### Integration Tests

- [ ] Works with real iOS project
- [ ] Correctly identifies Info.plist keys
- [ ] Generates correct permission commands
- [ ] Handles workspace projects

### Manual Testing

- [ ] Run on your project
- [ ] Verify detected permissions match your app
- [ ] Check suggested grant commands
- [ ] Manually test granting/revoking permissions

## Related Tickets

- **Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE
- **Works with:**
  - PRIORITY-1-PRE-OPERATION-VALIDATION
  - simctl-privacy tool
- **Future companion:** Automated permission testing

## Notes

### Common iOS Permissions

Camera, location, microphone, contacts, calendar, reminders, photos, health, Bluetooth, user tracking, Siri

### Testing Permissions

```
1. validate-capabilities projectPath: "..." scheme: "MyApp"
2. Grant permission: simctl-privacy action: "grant" service: "camera"
3. Launch app and test camera functionality
4. Revoke permission: simctl-privacy action: "revoke" service: "camera"
5. Verify app handles denied permission correctly
```

### Future Enhancements

- Query actual simulator permission state
- Create automated permission test scenarios
- Suggest permission test cases
- Track permission behavior history
