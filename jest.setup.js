// Jest setup file to suppress console output during tests

// Store original console methods
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

// Suppress console output before each test
global.beforeEach(() => {
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
  console.debug = () => {};
  // Also suppress console.log for cleaner test output
  console.log = () => {};
});

// Restore console methods after each test
global.afterEach(() => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.debug = originalConsole.debug;
});