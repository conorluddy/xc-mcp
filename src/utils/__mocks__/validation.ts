// Manual mock for validation.ts
import { jest } from '@jest/globals';

let xcodeInstalled = true;

export const validateXcodeInstallation = jest.fn(async () => {
  if (!xcodeInstalled) {
    throw new Error('Xcode is not installed or not configured properly');
  }
  return true;
});

export const checkXcodeInstalled = jest.fn(() => {
  if (!xcodeInstalled) {
    throw new Error('Xcode is not installed or not configured properly. Please run: xcode-select --install');
  }
  return true;
});

export const validateProjectPath = jest.fn(async (projectPath: string) => {
  if (!projectPath) {
    throw new Error('Project path is required');
  }
  
  if (projectPath.includes('NonExistent')) {
    throw new Error('Project file not found');
  }
  
  if (!projectPath.endsWith('.xcodeproj') && !projectPath.endsWith('.xcworkspace')) {
    throw new Error('Project path must be a .xcodeproj or .xcworkspace file');
  }
  
  return true;
});

export const validateScheme = jest.fn((scheme: string) => {
  if (!scheme) {
    throw new Error('Scheme must be specified');
  }
  if (scheme === 'InvalidScheme') {
    throw new Error('Invalid scheme');
  }
  return true;
});

export const validateConfiguration = jest.fn((configuration: string) => {
  if (configuration && !['Debug', 'Release'].includes(configuration)) {
    throw new Error('Invalid configuration. Must be Debug or Release');
  }
  return true;
});

export const validateDeviceId = jest.fn((deviceId: string) => {
  if (!deviceId) {
    throw new Error('Device ID is required');
  }
  if (deviceId === 'invalid-device-id') {
    throw new Error('Invalid device ID format');
  }
  return true;
});

export const setXcodeValidation = (installed: boolean) => {
  xcodeInstalled = installed;
};