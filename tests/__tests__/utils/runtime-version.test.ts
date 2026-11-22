import { isIOSRuntimeAtLeast, parseIOSRuntimeVersion } from '../../../src/utils/runtime-version.js';

describe('parseIOSRuntimeVersion', () => {
  it('reads a runtime identifier', () => {
    expect(parseIOSRuntimeVersion('com.apple.CoreSimulator.SimRuntime.iOS-26-5')).toEqual([26, 5]);
  });

  it('reads a runtime display name', () => {
    expect(parseIOSRuntimeVersion('iOS 27.0')).toEqual([27, 0]);
  });

  it('returns undefined for a runtime that is not iOS', () => {
    expect(
      parseIOSRuntimeVersion('com.apple.CoreSimulator.SimRuntime.watchOS-27-0')
    ).toBeUndefined();
  });
});

describe('isIOSRuntimeAtLeast', () => {
  const iOS26_5 = 'com.apple.CoreSimulator.SimRuntime.iOS-26-5';

  it('rejects a simulator below the deployment target', () => {
    expect(isIOSRuntimeAtLeast(iOS26_5, '27.0')).toBe(false);
  });

  it('accepts a simulator at the deployment target', () => {
    expect(isIOSRuntimeAtLeast('iOS 27.0', '27.0')).toBe(true);
  });

  it('accepts a simulator above the deployment target', () => {
    expect(isIOSRuntimeAtLeast('iOS 27.1', '27.0')).toBe(true);
    expect(isIOSRuntimeAtLeast(iOS26_5, '18.4')).toBe(true);
  });

  it('compares the minor version within the same major', () => {
    expect(isIOSRuntimeAtLeast(iOS26_5, '26.6')).toBe(false);
  });

  it('accepts a deployment target with no minor version', () => {
    expect(isIOSRuntimeAtLeast('iOS 27.0', '27')).toBe(true);
  });

  it('rejects a runtime that is not iOS', () => {
    expect(isIOSRuntimeAtLeast('com.apple.CoreSimulator.SimRuntime.watchOS-27-0', '18.0')).toBe(
      false
    );
  });
});
