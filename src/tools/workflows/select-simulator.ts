import { buildSettingsCache } from '../../state/build-settings-cache.js';

export interface SelectedSimulator {
  udid: string;
  name: string;
  /** The scheme's deployment target, when it could be read. */
  minimumOSVersion?: string;
}

/**
 * Picks the simulator a workflow builds for and installs to.
 *
 * Selection happens before the build, and the same device is used for every later step. Only
 * simulators at or above the scheme's deployment target qualify: xcodebuild rejects any other with
 * "Unable to find a destination matching the provided destination specifier".
 */
export async function selectSimulatorForScheme(
  projectPath: string,
  scheme: string,
  configuration: string
): Promise<SelectedSimulator> {
  const minimumOSVersion = await buildSettingsCache.getDeploymentTargetVersion(
    projectPath,
    scheme,
    configuration
  );

  const { simctlSuggestTool } = await import('../simctl/suggest.js');
  const suggestResult = await simctlSuggestTool({
    projectPath,
    maxSuggestions: 1,
    autoBootTopSuggestion: false,
    minimumOSVersion,
  });

  const suggestText = suggestResult.content?.[0]?.text;
  const suggestData = typeof suggestText === 'string' ? JSON.parse(suggestText) : undefined;
  const topSuggestion = suggestData?.suggestions?.[0];

  if (!topSuggestion?.udid) {
    throw new Error(
      minimumOSVersion
        ? `No available iOS simulator runs iOS ${minimumOSVersion} or later, the deployment target of scheme "${scheme}". Create one with simctl-create, or pass simulatorUdid.`
        : 'No suitable simulator found. Create one with simctl-create, or pass simulatorUdid.'
    );
  }

  return { udid: topSuggestion.udid, name: topSuggestion.name, minimumOSVersion };
}
