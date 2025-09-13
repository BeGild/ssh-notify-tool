/**
 * @fileoverview Test setup and global configuration
 * Configures Jest testing environment for SSH Notify Tool
 */

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests unless explicitly testing them
const originalConsole = global.console;

beforeEach(() => {
  // Only mock if not explicitly testing console output
  if (!expect.getState().currentTestName?.includes('console') && 
      !expect.getState().currentTestName?.includes('log')) {
    global.console = {
      ...originalConsole,
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: originalConsole.error, // Keep error for test debugging
      debug: jest.fn()
    };
  }
});

afterEach(() => {
  // Restore original console
  global.console = originalConsole;
  
  // Clear all timers
  jest.clearAllTimers();
  
  // Clear all mocks
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  /**
   * Create a mock notification for testing
   */
  createMockNotification: (overrides = {}) => ({
    title: 'Test Notification',
    message: 'This is a test message',
    level: 'info',
    metadata: { test: true },
    ...overrides
  }),

  /**
   * Create a mock plugin config
   */
  createMockPluginConfig: (overrides = {}) => ({
    enabled: true,
    timeout: 5000,
    ...overrides
  }),

  /**
   * Sleep utility for async tests
   */
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

  /**
   * Wait for condition to be true
   */
  waitFor: async (condition, timeout = 5000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await global.testUtils.sleep(10);
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }
};

// Environment setup
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests