/**
 * Error handler module tests
 *
 * Tests for the ErrorHandler class, ErrorContext, and middleware classes
 */

import {
  ErrorHandler,
  ErrorContext,
  ServiceErrorMiddleware,
  CommandErrorMiddleware
} from '../utils/errorHandler.js';
import {
  BaseError,
  ValidationError,
  ConfigurationError,
  NetworkError,
  SecurityError,
  SystemError,
  isCustomError
} from '../utils/errors.js';

describe('ErrorContext', () => {
  let errorContext;

  beforeEach(() => {
    errorContext = new ErrorContext();
  });

  test('should initialize with required properties', () => {
    expect(errorContext.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    expect(errorContext.timestamp).toBeDefined();
    expect(errorContext.stack).toEqual([]);
    expect(errorContext.metadata).toEqual({});
    expect(errorContext.startTime).toBeGreaterThan(0);
  });

  test('should add context layers', () => {
    errorContext.addLayer('service', { operation: 'test' });

    expect(errorContext.stack).toHaveLength(1);
    expect(errorContext.stack[0]).toMatchObject({
      layer: 'service',
      data: { operation: 'test' }
    });
    expect(errorContext.stack[0].timestamp).toBeDefined();
  });

  test('should add metadata', () => {
    errorContext.addMetadata('userId', '123');
    errorContext.addMetadata('action', 'test');

    expect(errorContext.metadata).toEqual({
      userId: '123',
      action: 'test'
    });
  });

  test('should get duration', () => {
    const duration = errorContext.getDuration();
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  test('should convert to JSON', () => {
    errorContext.addLayer('service', { operation: 'test' });
    errorContext.addMetadata('userId', '123');

    const json = errorContext.toJSON();

    expect(json).toMatchObject({
      requestId: errorContext.requestId,
      timestamp: errorContext.timestamp,
      stack: [
        {
          layer: 'service',
          data: { operation: 'test' }
        }
      ],
      metadata: { userId: '123' }
    });
    expect(json.duration).toBeGreaterThanOrEqual(0);
  });

  test('should generate unique request IDs', () => {
    const context1 = new ErrorContext();
    const context2 = new ErrorContext();

    expect(context1.requestId).not.toBe(context2.requestId);
  });
});

describe('ErrorHandler', () => {
  describe('wrap', () => {
    test('should return custom errors as-is', () => {
      const customError = new ValidationError('Invalid input', 'email', 'test@test.com');
      const additionalContext = { userId: '123' };

      const result = ErrorHandler.wrap(customError, additionalContext);

      expect(result).toBe(customError);
      expect(result.context).toEqual({
        field: 'email',
        value: '[REDACTED]',
        userId: '123'
      });
    });

    test('should wrap ValidationError based on error name', () => {
      const error = new Error('Invalid input');
      error.name = 'ValidationError';

      const result = ErrorHandler.wrap(error, { field: 'email' });

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.message).toBe('Invalid input');
      expect(result.field).toBe('email');
    });

    test('should wrap TypeError as ValidationError', () => {
      const error = new TypeError('Cannot read property of undefined');

      const result = ErrorHandler.wrap(error, { field: 'user.name' });

      expect(result).toBeInstanceOf(ValidationError);
      expect(result.message).toBe('Cannot read property of undefined');
      expect(result.field).toBe('user.name');
    });

    test('should wrap network errors as NetworkError', () => {
      const fetchError = new Error('Network request failed');
      fetchError.name = 'FetchError';

      const result = ErrorHandler.wrap(fetchError, { url: 'https://api.example.com' });

      expect(result).toBeInstanceOf(NetworkError);
      expect(result.message).toBe('Network request failed');
      expect(result.originalError).toBe(fetchError);
    });

    test('should wrap Axios errors as NetworkError', () => {
      const axiosError = new Error('Request timeout');
      axiosError.name = 'AxiosError';

      const result = ErrorHandler.wrap(axiosError);

      expect(result).toBeInstanceOf(NetworkError);
    });

    test('should wrap connection errors as NetworkError', () => {
      const connError = new Error('Connection refused');
      connError.code = 'ECONNREFUSED';

      const result = ErrorHandler.wrap(connError);

      expect(result).toBeInstanceOf(NetworkError);
    });

    test('should wrap other errors as SystemError', () => {
      const genericError = new Error('Something went wrong');

      const result = ErrorHandler.wrap(genericError, { component: 'auth' });

      expect(result).toBeInstanceOf(SystemError);
      expect(result.message).toBe('Something went wrong');
      expect(result.originalError).toBe(genericError);
      expect(result.context.component).toBe('auth');
    });
  });

  describe('sanitizeArgs', () => {
    test('should sanitize string arguments', () => {
      const args = [
        'normal string',
        'string with password=secret123',
        { key: 'value' },
        42
      ];

      const result = ErrorHandler.sanitizeArgs(args);

      expect(typeof result[0]).toBe('string');
      expect(typeof result[1]).toBe('string');
      expect(typeof result[2]).toBe('object');
      expect(result[3]).toBe(42);
    });

    test('should handle null and undefined arguments', () => {
      const args = [null, undefined, 'test'];

      const result = ErrorHandler.sanitizeArgs(args);

      expect(result[0]).toBeNull();
      expect(result[1]).toBeUndefined();
      expect(result[2]).toBe('test');
    });
  });

  describe('handleCommandError', () => {
    test('should handle validation errors', () => {
      const error = new ValidationError('Invalid email format', 'email', 'invalid-email');

      // Should not throw
      expect(() => {
        ErrorHandler.handleCommandError(error, 'test-command');
      }).not.toThrow();
    });

    test('should handle different error types', () => {
      const configError = new ConfigurationError('Missing API key');
      const networkError = new NetworkError('Connection failed');
      const securityError = new SecurityError('Suspicious activity');

      // Should not throw for any error type
      expect(() => {
        ErrorHandler.handleCommandError(configError, 'test');
        ErrorHandler.handleCommandError(networkError, 'test');
        ErrorHandler.handleCommandError(securityError, 'test');
      }).not.toThrow();
    });
  });

  describe('handleServiceError', () => {
    test('should wrap service error with service context', () => {
      const originalError = new Error('Database connection failed');
      const serviceContext = { service: 'UserService', method: 'findById' };

      const result = ErrorHandler.handleServiceError(originalError, serviceContext);

      expect(result).toBeInstanceOf(SystemError);
      expect(result.context.layer).toBe('service');
      expect(result.context.service).toBe('UserService');
      expect(result.context.method).toBe('findById');
    });
  });

  describe('handleSecurityError', () => {
    test('should enhance SecurityError', () => {
      const securityError = new SecurityError('Potential injection attack', 'high');

      const result = ErrorHandler.handleSecurityError(securityError, {
        requestPath: '/api/users'
      });

      expect(result).toBe(securityError);
      expect(result.severity).toBe('high');
    });

    test('should wrap regular errors as SecurityError', () => {
      const regularError = new Error('Suspicious pattern detected');

      const result = ErrorHandler.handleSecurityError(regularError);

      expect(result).toBeInstanceOf(SecurityError);
      expect(result.severity).toBe('high');
    });
  });

  describe('createContext', () => {
    test('should create new ErrorContext instance', () => {
      const context = ErrorHandler.createContext();

      expect(context).toBeInstanceOf(ErrorContext);
      expect(context.requestId).toBeDefined();
    });
  });
});

describe('ServiceErrorMiddleware', () => {
  test('should create proxy that preserves non-function properties', () => {
    const mockService = {
      property: 'value',
      method() { return 'result'; }
    };

    const wrappedService = ServiceErrorMiddleware.wrap(mockService, {
      serviceName: 'TestService'
    });

    expect(wrappedService.property).toBe('value');
  });

  test('should wrap service methods', () => {
    const mockService = {
      async method() { return 'result'; },
      _privateMethod() { return 'private'; }
    };

    const wrappedService = ServiceErrorMiddleware.wrap(mockService, {
      serviceName: 'TestService'
    });

    // Private methods should not be wrapped
    expect(wrappedService._privateMethod()).toBe('private');
  });
});

describe('CommandErrorMiddleware', () => {
  describe('handler', () => {
    test('should create handler function', () => {
      const handler = CommandErrorMiddleware.handler('test-command');

      expect(typeof handler).toBe('function');
    });
  });

  describe('wrapAction', () => {
    test('should wrap command action function', () => {
      const successAction = () => 'action result';
      const wrappedAction = CommandErrorMiddleware.wrapAction(successAction, 'test');

      expect(typeof wrappedAction).toBe('function');
    });
  });
});