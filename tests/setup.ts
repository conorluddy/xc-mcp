import { jest } from '@jest/globals';

// Mock Node.js built-in modules
jest.mock('child_process');
// Note: path module is NOT mocked as tests need real path operations

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

// Global timeout for all tests
jest.setTimeout(10000);
