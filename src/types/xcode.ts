export interface XcodeProject {
  information: {
    LastUpgradeCheck: string;
    [key: string]: string | number | boolean;
  };
  project?: {
    configurations: string[];
    name: string;
    schemes: string[];
    targets: string[];
  };
  workspace?: {
    name: string;
    schemes: string[];
  };
}

export interface XcodeSDK {
  canonicalName: string;
  displayName: string;
  platform: string;
  platformPath: string;
  platformVersion: string;
  sdkPath: string;
  sdkVersion: string;
}

export interface XcodeBuildSettings {
  [key: string]: string | string[];
}

export interface XcodeBuildResult {
  success: boolean;
  buildLog: string;
  errors: string[];
  warnings: string[];
  duration?: number;
}

export interface XcodeDestination {
  platform: string;
  name?: string;
  id?: string;
  OS?: string;
  arch?: string;
}

export interface SimulatorDevice {
  availability: string;
  state: string;
  isAvailable: boolean;
  name: string;
  udid: string;
  availabilityError?: string;
  deviceTypeIdentifier: string;
  logPath?: string;
  version?: string;
}

export interface SimulatorRuntime {
  availability: string;
  bundlePath: string;
  buildversion: string;
  identifier: string;
  isAvailable: boolean;
  name: string;
  version: string;
}

export interface SimulatorDeviceType {
  bundlePath: string;
  identifier: string;
  name: string;
  productFamily: string;
}

export interface SimulatorList {
  devices: { [runtime: string]: SimulatorDevice[] };
  runtimes: SimulatorRuntime[];
  devicetypes: SimulatorDeviceType[];
}

export type OutputFormat = 'json' | 'text';

export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}
