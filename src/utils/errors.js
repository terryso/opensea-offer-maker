/**
 * Custom error type hierarchy for secure error handling
 *
 * This module provides a structured approach to error handling with
 * built-in security features like context sanitization and unique error IDs.
 */

import { sanitizeErrorMessage } from './errorSanitizer.js';

/**
 * Base error class with security features
 */
export class BaseError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = this.sanitizeContext(context);
    this.timestamp = new Date().toISOString();
    this.id = this.generateErrorId();

    // Capture stack trace for debugging
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Sanitize context to remove sensitive information
   * @param {Object} context - Raw context data
   * @returns {Object} Sanitized context
   */
  sanitizeContext(context) {
    if (!context || typeof context !== 'object') {
      return {};
    }

    const sanitized = { ...context };
    const sensitiveKeys = [
      'privateKey', 'privatekey', 'private_key',
      'apiKey', 'apikey', 'api_key',
      'password', 'pass', 'pwd',
      'secret', 'token', 'auth',
      'credential', 'credentials'
    ];

    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();

      // Check for sensitive key names
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Sanitize string values that might contain sensitive data
      if (typeof sanitized[key] === 'string') {
        sanitized[key] = sanitizeErrorMessage(sanitized[key]);
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        // Handle arrays by processing each item
        if (Array.isArray(sanitized[key])) {
          sanitized[key] = sanitized[key].map(item =>
            typeof item === 'object' && item !== null ? this.sanitizeContext(item) : item
          );
        } else {
          // Recursively sanitize nested objects
          sanitized[key] = this.sanitizeContext(sanitized[key]);
        }
      }
    }

    return sanitized;
  }

  /**
   * Generate unique error ID for tracking
   * @returns {string} Unique error ID
   */
  generateErrorId() {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert error to secure JSON format
   * @returns {Object} Secure error representation
   */
  toSecureJSON() {
    return {
      id: this.id,
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context
    };
  }

  /**
   * Get user-friendly error message (without sensitive context)
   * @returns {string} User-friendly message
   */
  getUserMessage() {
    return `${this.name}: ${this.message} (Error ID: ${this.id})`;
  }

  /**
   * Get developer-friendly error message with context
   * @returns {string} Developer message
   */
  getDeveloperMessage() {
    let message = `${this.name}: ${this.message}\n`;
    message += `Error ID: ${this.id}\n`;
    message += `Code: ${this.code}\n`;
    message += `Timestamp: ${this.timestamp}\n`;

    if (Object.keys(this.context).length > 0) {
      message += `Context: ${JSON.stringify(this.context, null, 2)}\n`;
    }

    return message;
  }
}

/**
 * ValidationError for input validation failures
 */
export class ValidationError extends BaseError {
  constructor(message, field = null, value = null, context = {}) {
    const sanitizedContext = {
      ...context,
      field,
      value: value ? '[REDACTED]' : null
    };

    super(message, 'VALIDATION_ERROR', sanitizedContext);
    this.field = field;
  }
}

/**
 * ConfigurationError for config-related issues
 */
export class ConfigurationError extends BaseError {
  constructor(message, configKey = null, context = {}) {
    super(message, 'CONFIGURATION_ERROR', {
      ...context,
      configKey
    });
    this.configKey = configKey;
  }
}

/**
 * NetworkError for API/network failures
 */
export class NetworkError extends BaseError {
  constructor(message, originalError = null, url = null, context = {}) {
    let sanitizedUrl = null;
    if (url) {
      try {
        const urlObj = new URL(url);
        sanitizedUrl = `${urlObj.protocol}//${urlObj.host}`;
      } catch {
        sanitizedUrl = '[INVALID_URL]';
      }
    }

    super(message, 'NETWORK_ERROR', {
      ...context,
      originalError: originalError?.message,
      url: sanitizedUrl,
      statusCode: originalError?.status || originalError?.statusCode
    });

    this.originalError = originalError;
    this.url = url;
  }
}

/**
 * SecurityError for security-related incidents
 */
export class SecurityError extends BaseError {
  constructor(message, severity = 'medium', context = {}) {
    super(message, 'SECURITY_ERROR', {
      ...context,
      severity
    });
    this.severity = severity; // low, medium, high, critical
  }
}

/**
 * SystemError for unexpected system failures
 */
export class SystemError extends BaseError {
  constructor(message, originalError = null, context = {}) {
    super(message, 'SYSTEM_ERROR', {
      ...context,
      originalError: originalError?.message,
      stack: originalError?.stack
    });

    this.originalError = originalError;
  }
}

/**
 * AuthenticationError for authentication failures
 */
export class AuthenticationError extends BaseError {
  constructor(message, context = {}) {
    super(message, 'AUTHENTICATION_ERROR', context);
  }
}

/**
 * AuthorizationError for permission/authorization failures
 */
export class AuthorizationError extends BaseError {
  constructor(message, resource = null, action = null, context = {}) {
    super(message, 'AUTHORIZATION_ERROR', {
      ...context,
      resource,
      action
    });

    this.resource = resource;
    this.action = action;
  }
}

/**
 * TimeoutError for operation timeouts
 */
export class TimeoutError extends BaseError {
  constructor(message, timeout = null, context = {}) {
    super(message, 'TIMEOUT_ERROR', {
      ...context,
      timeout
    });

    this.timeout = timeout;
  }
}

/**
 * Helper function to determine if an error is a custom error
 * @param {Error} error - Error to check
 * @returns {boolean} True if custom error
 */
export function isCustomError(error) {
  return error instanceof BaseError;
}

/**
 * Helper function to wrap non-custom errors
 * @param {Error} error - Error to wrap
 * @param {string} defaultMessage - Default message if no message exists
 * @param {Object} context - Additional context
 * @returns {BaseError} Wrapped error
 */
export function wrapError(error, defaultMessage = 'An unexpected error occurred', context = {}) {
  if (isCustomError(error)) {
    return error;
  }

  return new SystemError(
    error.message || defaultMessage,
    error,
    context
  );
}

export default {
  BaseError,
  ValidationError,
  ConfigurationError,
  NetworkError,
  SecurityError,
  SystemError,
  AuthenticationError,
  AuthorizationError,
  TimeoutError,
  isCustomError,
  wrapError
};
