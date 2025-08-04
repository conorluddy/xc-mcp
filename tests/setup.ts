import { jest } from '@jest/globals';

// Mock Node.js built-in modules
jest.mock('child_process');
jest.mock('path');

// Create global mock helper functions
(global as any).setMockCommandConfig = (config: any) => {
  const commandModule = jest.requireMock('../src/utils/command.js') as any;
  if (commandModule.setMockCommandConfig) {
    commandModule.setMockCommandConfig(config);
  }
};

(global as any).setXcodeValidation = (installed: boolean) => {
  const validationModule = jest.requireMock('../src/utils/validation.js') as any;
  if (validationModule.setXcodeValidation) {
    validationModule.setXcodeValidation(installed);
  }
};

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

// Global timeout for all tests
jest.setTimeout(10000);