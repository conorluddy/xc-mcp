/**
 * iOS runtime version comparison.
 *
 * simctl keys devices by runtime identifier ("com.apple.CoreSimulator.SimRuntime.iOS-27-0") or
 * display name ("iOS 27.0"). A scheme's deployment target is a dotted version ("27.0"). A simulator
 * can only run an app whose deployment target is at or below its runtime version.
 */

const IOS_RUNTIME_PATTERN = /iOS[- ](\d+)(?:[-.](\d+))?/i;

/** Parses "…iOS-27-0" or "iOS 27.0" into [major, minor]; undefined for any non-iOS runtime. */
export function parseIOSRuntimeVersion(runtimeKey: string): [number, number] | undefined {
  const match = runtimeKey.match(IOS_RUNTIME_PATTERN);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2] ?? 0)];
}

/** True when `runtimeKey` is an iOS runtime at or above `minimumVersion` (e.g. "27.0"). */
export function isIOSRuntimeAtLeast(runtimeKey: string, minimumVersion: string): boolean {
  const runtime = parseIOSRuntimeVersion(runtimeKey);
  if (!runtime) return false;

  const [minimumMajor = 0, minimumMinor = 0] = minimumVersion.split('.').map(Number);
  if (Number.isNaN(minimumMajor) || Number.isNaN(minimumMinor)) return true;

  const [major, minor] = runtime;
  return major > minimumMajor || (major === minimumMajor && minor >= minimumMinor);
}
