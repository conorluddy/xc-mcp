// Manual mock for command.ts
import { jest } from '@jest/globals';
import type { CommandResult, CommandOptions } from '../command.js';

export const executeCommand = jest.fn(async (command: string, options: CommandOptions = {}): Promise<CommandResult> => {
  // Default success response
  return {
    stdout: 'Mock command output',
    stderr: '',
    code: 0
  };
});

export const executeCommandSync = jest.fn((command: string): CommandResult => {
  return {
    stdout: 'Mock sync output',
    stderr: '',
    code: 0
  };
});

export const buildXcodebuildCommand = jest.fn((action: string, projectPath: string, options: any = {}) => {
  const parts = ['xcodebuild'];
  
  if (options.workspace || projectPath.endsWith('.xcworkspace')) {
    parts.push('-workspace', `"${projectPath}"`);
  } else {
    parts.push('-project', `"${projectPath}"`);
  }
  
  if (options.scheme) {
    parts.push('-scheme', `"${options.scheme}"`);
  }
  
  if (options.configuration) {
    parts.push('-configuration', options.configuration);
  }
  
  if (options.destination) {
    parts.push('-destination', `"${options.destination}"`);
  }
  
  if (options.sdk) {
    parts.push('-sdk', options.sdk);
  }
  
  if (options.derivedDataPath) {
    parts.push('-derivedDataPath', `"${options.derivedDataPath}"`);
  }
  
  if (options.json) {
    parts.push('-json');
  }
  
  if (action) {
    parts.push(action);
  }
  
  return parts.join(' ');
});

export const buildSimctlCommand = jest.fn((action: string, options: any = {}) => {
  const parts = ['xcrun', 'simctl'];
  
  parts.push(action);
  
  if (options.json && ['list'].includes(action)) {
    parts.push('-j');
  }
  
  if (options.deviceId && ['boot', 'shutdown', 'delete'].includes(action)) {
    parts.push(options.deviceId);
  }
  
  if (action === 'create' && options.name && options.deviceType && options.runtime) {
    parts.push(`"${options.name}"`, options.deviceType, options.runtime);
  }
  
  return parts.join(' ');
});

// Mock config storage
let mockConfig: Record<string, any> = {};

export const setMockCommandConfig = (config: Record<string, any>) => {
  mockConfig = config;
  
  // Update executeCommand to use the config
  executeCommand.mockImplementation(async (command, options = {}) => {
    // Check exact match first
    if (mockConfig[command]) {
      const result = mockConfig[command];
      return typeof result === 'function' ? result(command) : result;
    }
    
    // Check patterns
    for (const [pattern, result] of Object.entries(mockConfig)) {
      if (pattern.includes('*') && new RegExp(pattern.replace(/\*/g, '.*')).test(command)) {
        return typeof result === 'function' ? result(command) : result;
      }
    }
    
    // Default response
    return {
      stdout: 'Mock command output',
      stderr: '',
      code: 0
    };
  });
};

export const clearMockCommandConfig = () => {
  mockConfig = {};
  executeCommand.mockClear();
  executeCommandSync.mockClear();
  buildXcodebuildCommand.mockClear();
  buildSimctlCommand.mockClear();
};