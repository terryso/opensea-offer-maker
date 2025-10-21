/**
 * Error handling middleware and utilities
 *
 * This module provides centralized error handling with security features,
 * context preservation, and consistent error management across all layers.
 */

import {
  BaseError,
  ValidationError,
  ConfigurationError,
  NetworkError,
  SecurityError,
  SystemError,
  isCustomError,
  wrapError
} from './errors.js';
import { sanitizeErrorMessage, sanitizeObject } from './errorSanitizer.js';
import logger from './logger.js';

/**
 * Error context manager for preserving debugging information
 */
export class ErrorContext {
  constructor() {
    this.requestId = this.generateRequestId();
    this.timestamp = new Date().toISOString();
    this.stack = [];
    this.metadata = {};
    this.startTime = Date.now();
  }

  /**
   * Add context layer with service/method information
   * @param {string} layer - Layer name (e.g., 'service', 'command', 'utility')
   * @param {Object} data - Context data for this layer
   */
  addLayer(layer, data = {}) {
    this.stack.push({
      layer,
      timestamp: new Date().toISOString(),
      data: this.sanitizeData(data)
    });
  }

  /**
   * Add metadata to the error context
   * @param {string} key - Metadata key
   * @param {any} value - Metadata value
   */
  addMetadata(key, value) {
    this.metadata[key] = this.sanitizeData(value);
  }

  /**
   * Sanitize data to remove sensitive information
   * @param {any} data - Data to sanitize
   * @returns {any} Sanitized data
   */
  sanitizeData(data) {
    return sanitizeObject(data, {
      maxDepth: 5,
      preserveStructure: true
    });
  }

  /**
   * Generate unique request ID
   * @returns {string} Unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get duration since context creation
   * @returns {number} Duration in milliseconds
   */
  getDuration() {
    return Date.now() - this.startTime;
  }

  /**
   * Convert context to JSON format
   * @returns {Object} Context as JSON
   */
  toJSON() {
    return {
      requestId: this.requestId,
      timestamp: this.timestamp,
      duration: this.getDuration(),
      stack: this.stack,
      metadata: this.metadata
    };
  }
}

/**
 * Main error handler class
 */
export class ErrorHandler {
  /**
   * Wrap an error with additional context
   * @param {Error} error - Original error
   * @param {Object} context - Additional context
   * @returns {BaseError} Wrapped error
   */
  static wrap(error, context = {}) {
    if (isCustomError(error)) {
      // Add additional context to existing custom error
      error.context = { ...error.context, ...context };
      return error;
    }

    // Determine error type based on error characteristics
    let wrappedError;

    if (error.name === 'ValidationError' || context.isValidationError) {
      wrappedError = new ValidationError(
        error.message || 'Validation failed',
        context.field,
        context.value,
        context
      );
    } else if (error.name === 'TypeError' || context.isTypeError) {
      wrappedError = new ValidationError(
        error.message || 'Invalid data type',
        context.field,
        context.value,
        context
      );
    } else if (error.name === 'ReferenceError' || context.isReferenceError) {
      wrappedError = new ValidationError(
        error.message || 'Invalid reference',
        context.field,
        context.value,
        context
      );
    } else if (error.name === 'FetchError' ||
               error.name === 'AxiosError' ||
               error.code === 'ECONNREFUSED' ||
               error.code === 'ENOTFOUND' ||
               context.isNetworkError) {
      wrappedError = new NetworkError(
        error.message || 'Network operation failed',
        error,
        context.url,
        context
      );
    } else if (error.name === 'SyntaxError' && context.message?.includes('JSON')) {
      wrappedError = new ValidationError(
        'Invalid JSON data',
        'json',
        context.message,
        context
      );
    } else if (error.name === 'RangeError' || context.isRangeError) {
      wrappedError = new ValidationError(
        error.message || 'Value out of range',
        context.field,
        context.value,
        context
      );
    } else {
      wrappedError = new SystemError(
        error.message || 'An unexpected error occurred',
        error,
        context
      );
    }

    return wrappedError;
  }

  /**
   * Sanitize arguments to prevent sensitive data leakage
   * @param {Array} args - Function arguments
   * @returns {Array} Sanitized arguments
   */
  static sanitizeArgs(args) {
    return args.map(arg => {
      if (typeof arg === 'string') {
        return sanitizeErrorMessage(arg);
      } else if (typeof arg === 'object' && arg !== null) {
        return sanitizeObject(arg);
      }
      return arg;
    });
  }

  /**
   * Handle command-level errors with user-friendly output
   * @param {Error} error - Error to handle
   * @param {string} commandName - Command name
   */
  static handleCommandError(error, commandName) {
    const wrappedError = wrapError(error, { commandName });

    // Log detailed error for developers
    logger.error('Command execution failed', {
      error: wrappedError.getDeveloperMessage(),
      command: commandName,
      errorId: wrappedError.id,
      stack: wrappedError.stack
    });

    // Show user-friendly message
    console.error(`\n❌ ${wrappedError.getUserMessage()}`);

    // Provide additional context for specific error types
    if (wrappedError instanceof ValidationError) {
      console.error('\n💡 Please check your input and try again.');
    } else if (wrappedError instanceof ConfigurationError) {
      console.error('\n💡 Please check your configuration in .env file.');
    } else if (wrappedError instanceof NetworkError) {
      console.error('\n💡 Please check your internet connection and try again.');
    } else if (wrappedError instanceof SecurityError) {
      console.error('\n💡 A security issue was detected. Please contact support if this persists.');
    }

    console.error(`\n🔍 Error ID: ${wrappedError.id}`);
    console.error('   Use this ID when reporting issues for faster resolution.\n');
  }

  /**
   * Handle service-level errors with proper propagation
   * @param {Error} error - Error to handle
   * @param {Object} serviceContext - Service context
   * @returns {BaseError} Wrapped error for propagation
   */
  static handleServiceError(error, serviceContext) {
    return this.wrap(error, {
      layer: 'service',
      ...serviceContext
    });
  }

  /**
   * Handle security-related errors with enhanced logging
   * @param {Error} error - Security error
   * @param {Object} context - Additional context
   */
  static handleSecurityError(error, context = {}) {
    const securityError = error instanceof SecurityError
      ? error
      : new SecurityError(error.message || 'Security incident detected', 'high', context);

    // Enhanced logging for security events
    logger.error('Security event detected', {
      errorId: securityError.id,
      severity: securityError.severity,
      message: securityError.message,
      context: securityError.context,
      timestamp: securityError.timestamp,
      stack: securityError.stack
    });

    return securityError;
  }

  /**
   * Create async function wrapper with error handling
   * @param {Function} fn - Function to wrap
   * @param {Object} context - Default context for errors
   * @returns {Function} Wrapped function
   */
  static wrapAsync(fn, context = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        throw wrapError(error, {
          ...context,
          function: fn.name || 'anonymous',
          args: this.sanitizeArgs(args)
        });
      }
    };
  }

  /**
   * Create service wrapper with error handling middleware
   * @param {Object} service - Service instance
   * @param {string} serviceName - Service name
   * @returns {Proxy} Wrapped service
   */
  static wrapService(service, serviceName) {
    return new Proxy(service, {
      get(target, prop) {
        const value = target[prop];

        if (typeof value === 'function') {
          return async (...args) => {
            try {
              return await value.apply(target, args);
            } catch (error) {
              throw wrapError(error, {
                service: serviceName,
                method: prop,
                args: ErrorHandler.sanitizeArgs(args)
              });
            }
          };
        }

        return value;
      }
    });
  }

  /**
   * Create error context for current operation
   * @returns {ErrorContext} New error context
   */
  static createContext() {
    return new ErrorContext();
  }
}

/**
 * Service error middleware for automatic error wrapping
 */
export class ServiceErrorMiddleware {
  /**
   * Wrap a service instance with error handling
   * @param {Object} service - Service to wrap
   * @param {Object} options - Middleware options
   * @returns {Proxy} Wrapped service
   */
  static wrap(service, options = {}) {
    const { serviceName = service.constructor?.name || 'UnknownService' } = options;

    return new Proxy(service, {
      get(target, prop) {
        const value = target[prop];

        if (typeof value === 'function' && !prop.startsWith('_')) {
          return async (...args) => {
            const context = ErrorHandler.createContext();
            context.addLayer('service', {
              service: serviceName,
              method: prop,
              args: ErrorHandler.sanitizeArgs(args)
            });

            try {
              const result = await value.apply(target, args);
              return result;
            } catch (error) {
              throw ErrorHandler.wrap(error, {
                service: serviceName,
                method: prop,
                context: context.toJSON(),
                args: ErrorHandler.sanitizeArgs(args)
              });
            }
          };
        }

        return value;
      }
    });
  }
}

/**
 * Command error middleware for CLI commands
 */
export class CommandErrorMiddleware {
  /**
   * Create command error handler
   * @param {string} commandName - Command name
   * @returns {Function} Error handler function
   */
  static handler(commandName) {
    return (error) => {
      ErrorHandler.handleCommandError(error, commandName);
      process.exit(1);
    };
  }

  /**
   * Wrap command action with error handling
   * @param {Function} action - Command action function
   * @param {string} commandName - Command name
   * @returns {Function} Wrapped action
   */
  static wrapAction(action, commandName) {
    return async (...args) => {
      try {
        return await action(...args);
      } catch (error) {
        CommandErrorMiddleware.handler(commandName)(error);
      }
    };
  }
}

export default {
  ErrorHandler,
  ErrorContext,
  ServiceErrorMiddleware,
  CommandErrorMiddleware,
  wrapError,
  isCustomError
};