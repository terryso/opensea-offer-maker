export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

class Logger {
  constructor() {
    // Default log level, can be set via environment variable
    this.level = process.env.LOG_LEVEL ?
      parseInt(process.env.LOG_LEVEL) :
      (process.env.NODE_ENV === 'test' ? LogLevel.ERROR : LogLevel.INFO);
  }

  setLevel(level) {
    this.level = level;
  }

  error(...args) {
    if (this.level >= LogLevel.ERROR) {
      console.error(...args);
    }
  }

  warn(...args) {
    if (this.level >= LogLevel.WARN) {
      console.warn(...args);
    }
  }

  info(...args) {
    if (this.level >= LogLevel.INFO) {
      console.log(...args);
    }
  }

  debug(...args) {
    if (this.level >= LogLevel.DEBUG) {
      console.debug(...args);
    }
  }

  // For printing objects during testing
  debugObject(label, obj) {
    if (this.level >= LogLevel.DEBUG) {
      console.debug(label + ':', JSON.stringify(obj, null, 2));
    }
  }
}

const logger = new Logger();

export { logger };

// Also provide default export for compatibility
export default logger;
