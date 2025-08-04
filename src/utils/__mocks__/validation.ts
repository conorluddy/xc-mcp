// Manual mock for validation.ts
import { jest } from '@jest/globals';

// Mock storage for validation state
let xcodeInstalled = true;

export const validateXcodeInstallation = jest.fn(async (): Promise<void> => {
  if (!xcodeInstalled) {
    const { McpError, ErrorCode } = await import('@modelcontextprotocol/sdk/types.js');
    throw new McpError(
      ErrorCode.InternalError,
      'Xcode command line tools not found. Please install with: xcode-select --install'
    );
  }
});

export const validateProjectPath = jest.fn(async (_projectPath: string): Promise<void> => {
  // Always pass validation in tests unless configured otherwise
  return Promise.resolve();
});

export const validateScheme = jest.fn((scheme: string): void => {
  if (!scheme || scheme.trim().length === 0) {
    const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js'); // eslint-disable-line @typescript-eslint/no-require-imports
    throw new McpError(ErrorCode.InvalidParams, 'Scheme name is required and cannot be empty');
  }
});

export const validateDeviceId = jest.fn((deviceId: string): void => {
  if (!deviceId || deviceId.trim().length === 0) {
    const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js'); // eslint-disable-line @typescript-eslint/no-require-imports
    throw new McpError(ErrorCode.InvalidParams, 'Device ID is required and cannot be empty');
  }
});

export const sanitizePath = jest.fn((path: string): string => {
  return path.replace(/[;&|`$(){}[\]]/g, '');
});

export const escapeShellArg = jest.fn((arg: string): string => {
  return `"${arg.replace(/[\\$"`]/g, '\\$&')}"`;
});

// Helper function to control mock behavior
export const setXcodeValidation = (installed: boolean) => {
  xcodeInstalled = installed;
};

export const clearValidationMocks = () => {
  validateXcodeInstallation.mockClear();
  validateProjectPath.mockClear();
  validateScheme.mockClear();
  validateDeviceId.mockClear();
  sanitizePath.mockClear();
  escapeShellArg.mockClear();
  xcodeInstalled = true;
};
