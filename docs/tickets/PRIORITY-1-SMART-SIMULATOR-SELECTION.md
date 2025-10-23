# PRIORITY-1: Smart Simulator Selection with Project Awareness

**Status:** Pending
**Priority:** 1 - High Impact
**Effort:** Small
**Impact:** High - Improves simulator selection accuracy
**Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE

## Problem Statement

Current simulator suggestion algorithm (in `src/state/simulator-cache.ts`) uses only usage patterns and device popularity, ignoring project requirements:

- Suggests iOS 15 simulator for iOS 17+ project (incompatible)
- Suggests iPad for iPhone-only apps
- Doesn't consider deployment target versions
- Doesn't validate device family compatibility

This leads to "device not compatible" errors when AI agents blindly follow simulator suggestions.

## Current Behavior

Current scoring (lines 323-418):
- Recent usage (40%)
- iOS version popularity (30%)
- Boot performance (10%)
- Popular model ranking (20%)

**Missing:**
- Deployment target matching (0%)
- Device family compatibility (0%)

## Proposed Solution

Enhance `SimulatorCache.getSuggestedSimulators()` to accept build settings and filter/score based on project requirements.

### Implementation

Update: `src/state/simulator-cache.ts`

```typescript
export interface SuggestionCriteria {
  projectPath?: string;
  deviceType?: string;
  deploymentTarget?: number; // iOS version from build settings
  deviceFamilies?: { supportsIPhone: boolean; supportsIPad: boolean };
  maxSuggestions?: number;
}

async getSuggestedSimulators(
  criteria: SuggestionCriteria = {}
): Promise<Array<{ simulator: SimulatorInfo; score: number; reasons: string[] }>> {
  let available = this.getAvailableSimulators();

  // ===== NEW: Filter by deployment target compatibility =====
  if (criteria.deploymentTarget) {
    available = available.filter((device) => {
      const deviceVersion = this.extractiOSVersion(device);
      return deviceVersion >= criteria.deploymentTarget!;
    });

    if (available.length === 0) {
      return [{
        simulator: null,
        score: 0,
        reasons: [
          `No simulators compatible with deployment target iOS ${criteria.deploymentTarget}`,
          `Available simulators are below minimum required version`,
        ],
      }];
    }
  }

  // ===== NEW: Filter by device family =====
  if (criteria.deviceFamilies) {
    available = available.filter((device) => {
      if (criteria.deviceFamilies!.supportsIPhone && device.name.includes('iPhone')) {
        return true;
      }
      if (criteria.deviceFamilies!.supportsIPad && device.name.includes('iPad')) {
        return true;
      }
      return false;
    });

    if (available.length === 0) {
      return [{
        simulator: null,
        score: 0,
        reasons: [
          `No simulators match device family requirements`,
          `Requires: ${criteria.deviceFamilies.supportsIPhone ? 'iPhone' : ''} ${criteria.deviceFamilies.supportsIPad ? 'iPad' : ''}`,
        ],
      }];
    }
  }

  // Score remaining simulators
  const scored = available.map((simulator) => {
    let score = 0;
    const reasons: string[] = [];

    // ===== NEW: Deployment target match bonus =====
    if (criteria.deploymentTarget) {
      const deviceVersion = this.extractiOSVersion(simulator);
      if (deviceVersion === criteria.deploymentTarget) {
        score += 25; // High bonus for exact match
        reasons.push(`Matches deployment target iOS ${criteria.deploymentTarget}`);
      } else if (deviceVersion === criteria.deploymentTarget + 1) {
        score += 15; // Smaller bonus for next version
        reasons.push(`One version above deployment target`);
      } else {
        score += 5; // Small bonus for compatibility
      }
    }

    // Existing scoring factors
    // Recent usage (40%)
    const usageScore = this.getUsersageScore(simulator) * 0.4;
    score += usageScore;
    if (usageScore > 0) reasons.push('Recently used for this project');

    // iOS version popularity (30%)
    const versionPopularity = this.getVersionPopularityScore(simulator) * 0.3;
    score += versionPopularity;
    if (versionPopularity > 0) reasons.push('Popular iOS version');

    // Boot performance (10%)
    const bootScore = this.getBootPerformanceScore(simulator) * 0.1;
    score += bootScore;
    if (bootScore > 0) reasons.push('Fast boot times');

    // Popular model (20%)
    const modelScore = this.getModelPopularityScore(simulator) * 0.2;
    score += modelScore;
    if (modelScore > 0) reasons.push('Popular device model');

    return {
      simulator,
      score,
      reasons: reasons.length > 0 ? reasons : ['Compatible with project requirements'],
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, criteria.maxSuggestions || 4);
}

/**
 * Get best simulator for a project, considering project settings
 */
async getBestSimulatorForProject(projectPath: string): Promise<{
  simulator: SimulatorInfo;
  reasons: string[];
} | null> {
  try {
    // Get build settings from cache
    const buildSettings = await buildSettingsCache.getBuildSettings(
      projectPath,
      // Default scheme (can be improved in future)
      await this.getDefaultScheme(projectPath)
    );

    const deploymentTarget = await buildSettingsCache.getDeploymentTarget(
      projectPath,
      await this.getDefaultScheme(projectPath)
    );

    const deviceFamilies = await buildSettingsCache.getDeviceFamilies(
      projectPath,
      await this.getDefaultScheme(projectPath)
    );

    const suggestions = await this.getSuggestedSimulators({
      projectPath,
      deploymentTarget,
      deviceFamilies,
      maxSuggestions: 1,
    });

    if (suggestions.length > 0 && suggestions[0].simulator) {
      return {
        simulator: suggestions[0].simulator,
        reasons: suggestions[0].reasons,
      };
    }

    return null;
  } catch (error) {
    console.error('[simulator-cache] Error getting best simulator:', error);
    return null;
  }
}

private extractiOSVersion(simulator: SimulatorInfo): number {
  // Extract "17" from "iOS 17.2", "17.4.1", etc.
  const match = simulator.runtime?.match(/iOS (\d+)/);
  return match ? parseInt(match[1]) : 14;
}
```

### Usage in Tools

Update: `src/tools/simctl/suggest.ts`

```typescript
export async function simctlSuggestTool(args: any) {
  const { projectPath, maxSuggestions = 4, deviceType } = args;

  let criteria: SuggestionCriteria = {
    deviceType,
    maxSuggestions,
  };

  // NEW: If project path provided, get deployment target from build settings
  if (projectPath) {
    try {
      const deploymentTarget = await buildSettingsCache.getDeploymentTarget(
        projectPath,
        await getDefaultScheme(projectPath)
      );

      const deviceFamilies = await buildSettingsCache.getDeviceFamilies(
        projectPath,
        await getDefaultScheme(projectPath)
      );

      criteria = { ...criteria, projectPath, deploymentTarget, deviceFamilies };
    } catch (error) {
      // Fall back to basic suggestion if build settings unavailable
      console.warn('[simctl-suggest] Could not read build settings:', error);
    }
  }

  const suggestions = await simulatorCache.getSuggestedSimulators(criteria);

  return {
    suggestions: suggestions.map((s) => ({
      simulator: s.simulator,
      score: s.score.toFixed(1),
      reasons: s.reasons,
    })),
    summary: {
      total: suggestions.length,
      top: suggestions[0],
      deploymentTargetConsidered: !!criteria.deploymentTarget,
    },
    guidance: [
      `Found ${suggestions.length} compatible simulators`,
      ...(criteria.deploymentTarget
        ? [
            `Filtered for deployment target iOS ${criteria.deploymentTarget}+`,
            `Filtered for device families`,
          ]
        : []),
      `Top choice: ${suggestions[0]?.simulator.name} (${suggestions[0]?.simulator.runtime})`,
    ],
  };
}
```

## Implementation Checklist

- [ ] Add `SuggestionCriteria` interface to simulator-cache.ts
- [ ] Update `getSuggestedSimulators()` to accept criteria
- [ ] Add deployment target filtering logic
- [ ] Add device family filtering logic
- [ ] Implement deployment target match scoring
- [ ] Update scoring to maintain existing factors
- [ ] Add `getBestSimulatorForProject()` convenience method
- [ ] Update `simctl-suggest.ts` to use new parameters
- [ ] Update tool description to mention project awareness
- [ ] Add unit tests for filtering and scoring
- [ ] Add integration tests with real projects
- [ ] Document new parameters in tool responses

## Testing Requirements

### Unit Tests

- [ ] Filters simulators by deployment target
- [ ] Filters simulators by device family
- [ ] Scoring prioritizes exact version match
- [ ] Fails gracefully when no compatible simulators
- [ ] Maintains existing scoring factors
- [ ] Device family parsing works correctly

### Integration Tests

- [ ] Works with iOS 15+ project
- [ ] Works with iOS 17+ project
- [ ] iPhone-only app excludes iPad simulators
- [ ] iPad-only app excludes iPhone simulators
- [ ] Universal app includes both families

### Manual Testing

- [ ] Run with your iOS project, verify correct simulator suggested
- [ ] Verify scoring reasons are accurate
- [ ] Test with different deployment targets
- [ ] Verify backward compatibility (works without build settings)

## Related Tickets

- **Depends on:** PRIORITY-1-BUILD-SETTINGS-CACHE
- **Enables:** PRIORITY-2-BUILD-AND-RUN-WORKFLOW
- **Works with:**
  - PRIORITY-1-PRE-OPERATION-VALIDATION
  - PRIORITY-3-SIMULATOR-LIFECYCLE-STATE

## Notes

### Backward Compatibility

If build settings unavailable (old project format, parsing fails), fall back to basic suggestion without deployment target filtering. This ensures tool continues to work.

### Scoring Formula

```
Final Score = (40% recent usage) + (30% version popularity) + (10% boot perf)
            + (20% model popularity) + (25% deployment target match)
```

### Future Enhancements

- Auto-detect default scheme from project
- Consider device-specific features (Face ID, A-series GPU)
- Weight based on actual usage patterns per project
- Suggest multiple options with reasoning
