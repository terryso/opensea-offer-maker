/**
 * Error handling system tests
 *
 * Tests for custom error types, error sanitization, and error handling patterns
 */

import {
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
} from '../utils/errors.js';

describe('Error Types', () => {
  describe('BaseError', () => {
    test('should create base error with required properties', () => {
      const error = new BaseError('Test message', 'TEST_CODE', { normalKey: 'value' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(BaseError);
      expect(error.name).toBe('BaseError');
      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.context).toEqual({ normalKey: 'value' });
      expect(error.timestamp).toBeDefined();
      expect(error.id).toMatch(/^err_\d+_[a-z0-9]+$/);
    });

    test('should sanitize context with sensitive data', () => {
      const error = new BaseError('Test message', 'TEST_CODE', {
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        apiKey: 'sk_test_123456789',
        normalField: 'normal value'
      });

      expect(error.context.privateKey).toBe('[REDACTED]');
      expect(error.context.apiKey).toBe('[REDACTED]');
      expect(error.context.normalField).toBe('normal value');
    });

    test('should generate secure JSON representation', () => {
      const error = new BaseError('Test message', 'TEST_CODE', { normalField: 'value' });
      const json = error.toSecureJSON();

      expect(json).toEqual({
        id: error.id,
        name: 'BaseError',
        code: 'TEST_CODE',
        message: 'Test message',
        timestamp: error.timestamp,
        context: { normalField: 'value' }
      });
    });

    test('should provide user-friendly and developer messages', () => {
      const error = new BaseError('Test message', 'TEST_CODE', { normalField: 'value' });

      expect(error.getUserMessage()).toContain('BaseError: Test message');
      expect(error.getUserMessage()).toContain(`Error ID: ${error.id}`);

      expect(error.getDeveloperMessage()).toContain('BaseError: Test message');
      expect(error.getDeveloperMessage()).toContain(`Error ID: ${error.id}`);
      expect(error.getDeveloperMessage()).toContain('Code: TEST_CODE');
    });
  });

  describe('ValidationError', () => {
    test('should create validation error with field information', () => {
      const error = new ValidationError('Invalid input', 'username', 'test@example.com');

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.field).toBe('username');
      expect(error.context.value).toBe('[REDACTED]');
    });

    test('should handle null field and value', () => {
      const error = new ValidationError('Invalid input');

      expect(error.field).toBeNull();
      expect(error.context.value).toBeNull();
    });
  });

  describe('ConfigurationError', () => {
    test('should create configuration error with config key', () => {
      const error = new ConfigurationError('Missing API key', 'OPENSEA_API_KEY');

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.name).toBe('ConfigurationError');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.configKey).toBe('OPENSEA_API_KEY');
    });
  });

  describe('NetworkError', () => {
    test('should create network error with original error and URL', () => {
      const originalError = new Error('Connection failed');
      originalError.status = 500;
      const error = new NetworkError('API call failed', originalError, 'https://api.example.com');

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(NetworkError);
      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.originalError).toBe(originalError);
      expect(error.context.statusCode).toBe(500);
    });

    test('should sanitize URLs in context', () => {
      const error = new NetworkError(
        'API call failed',
        null,
        'https://username:password@api.example.com/endpoint'
      );

      expect(error.context.url).toBe('https://api.example.com');
    });

    test('should handle invalid URLs', () => {
      const error = new NetworkError('API call failed', null, 'invalid-url');

      expect(error.context.url).toBe('[INVALID_URL]');
    });
  });

  describe('SecurityError', () => {
    test('should create security error with severity', () => {
      const error = new SecurityError('Suspicious activity detected', 'high');

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(SecurityError);
      expect(error.name).toBe('SecurityError');
      expect(error.code).toBe('SECURITY_ERROR');
      expect(error.severity).toBe('high');
      expect(error.context.severity).toBe('high');
    });

    test('should default to medium severity', () => {
      const error = new SecurityError('Security issue');

      expect(error.severity).toBe('medium');
    });
  });

  describe('AuthenticationError', () => {
    test('should create authentication error', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.name).toBe('AuthenticationError');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });
  });

  describe('AuthorizationError', () => {
    test('should create authorization error with resource and action', () => {
      const error = new AuthorizationError('Access denied', 'user:123', 'delete');

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.name).toBe('AuthorizationError');
      expect(error.code).toBe('AUTHORIZATION_ERROR');
      expect(error.resource).toBe('user:123');
      expect(error.action).toBe('delete');
    });
  });

  describe('TimeoutError', () => {
    test('should create timeout error with duration', () => {
      const error = new TimeoutError('Operation timed out', 5000);

      expect(error).toBeInstanceOf(BaseError);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.timeout).toBe(5000);
    });
  });
});

describe('Error Helper Functions', () => {
  describe('isCustomError', () => {
    test('should identify custom errors', () => {
      const customError = new ValidationError('Test error');
      const regularError = new Error('Regular error');

      expect(isCustomError(customError)).toBe(true);
      expect(isCustomError(regularError)).toBe(false);
    });
  });

  describe('wrapError', () => {
    test('should return custom errors as-is', () => {
      const customError = new ValidationError('Test error');
      const wrapped = wrapError(customError);

      expect(wrapped).toBe(customError);
    });

    test('should wrap regular errors in SystemError', () => {
      const regularError = new Error('Regular error');
      const wrapped = wrapError(regularError);

      expect(wrapped).not.toBe(regularError);
      expect(wrapped).toBeInstanceOf(SystemError);
      expect(wrapped.originalError).toBe(regularError);
    });

    test('should use default message when error has no message', () => {
      const error = new Error();
      const wrapped = wrapError(error, 'Default message');

      expect(wrapped.message).toBe('Default message');
    });
  });
});

describe('Error Context Sanitization', () => {
  test('should sanitize various sensitive key patterns', () => {
    const sensitiveContext = {
      privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      privateKeyHex: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      api_key: 'sk_test_123456789',
      password: 'secret123',
      accessToken: 'token123',
      normalField: 'normal value',
      nested: {
        secret: 'nested secret',
        public: 'nested public'
      }
    };

    const error = new BaseError('Test message', 'TEST_CODE', sensitiveContext);

    expect(error.context.privateKey).toBe('[REDACTED]');
    expect(error.context.privateKeyHex).toBe('[REDACTED]');
    expect(error.context.api_key).toBe('[REDACTED]');
    expect(error.context.password).toBe('[REDACTED]');
    expect(error.context.accessToken).toBe('[REDACTED]');
    expect(error.context.normalField).toBe('normal value');
    expect(error.context.nested.secret).toBe('[REDACTED]');
    expect(error.context.nested.public).toBe('nested public');
  });

  test('should handle arrays in context', () => {
    const context = {
      items: ['secret1', 'normal', 'secret2'],
      normalArray: [1, 2, 3]
    };

    const error = new BaseError('Test message', 'TEST_CODE', context);

    // Arrays should be processed recursively
    expect(typeof error.context.items).toBe('object');
    expect(Array.isArray(error.context.normalArray)).toBe(true);
    expect(error.context.normalArray).toEqual([1, 2, 3]);
  });

  test('should handle null and undefined context', () => {
    const error1 = new BaseError('Test message', 'TEST_CODE', null);
    const error2 = new BaseError('Test message', 'TEST_CODE', undefined);

    expect(error1.context).toEqual({});
    expect(error2.context).toEqual({});
  });
});

describe('Error Stack Trace', () => {
  test('should capture stack trace for debugging', () => {
    const error = new BaseError('Test message');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('BaseError: Test message');
  });

  test('should preserve stack trace in wrapped errors', () => {
    const originalError = new Error('Original error');
    const wrapped = wrapError(originalError);

    expect(wrapped.stack).toBeDefined();
    expect(wrapped.originalError).toBe(originalError);
  });
});

describe('Error ID Generation', () => {
  test('should generate unique error IDs', () => {
    const error1 = new BaseError('Test message 1');
    const error2 = new BaseError('Test message 2');

    expect(error1.id).not.toBe(error2.id);
    expect(error1.id).toMatch(/^err_\d+_[a-z0-9]+$/);
    expect(error2.id).toMatch(/^err_\d+_[a-z0-9]+$/);
  });

  test('should generate timestamp in correct format', () => {
    const before = new Date();
    const error = new BaseError('Test message');
    const after = new Date();

    const errorTime = new Date(error.timestamp);
    expect(errorTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(errorTime.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});