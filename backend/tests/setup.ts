/**
 * Jest global setup for backend tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3999';

// Mock console to reduce noise in tests (optional)
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: console.error, // Keep error for debugging
};
