/**
 * Secure logger module tests
 *
 * Tests for the SecureLogger class
 */

import path from 'path';
import { jest } from '@jest/globals';
import { BaseError } from '../utils/errors.js';
import fs from 'fs/promises';

// Mock the modules
jest.mock('fs/promises');
// Set up the logger mock with separate functions
const mockLoggerFunctions = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

jest.mock('../utils/logger.js', () => mockLoggerFunctions);
jest.mock('os', () => ({
  hostname: jest.fn(() => 'test-hostname')
}));

import { SecureLogger } from '../utils/secureLogger.js';

describe('SecureLogger', () => {
  let testLogDir;
  let testLogger;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    testLogDir = '.test-logs-' + Date.now();

    // Mock successful directory creation by default
    fs.mkdir = jest.fn().mockResolvedValue();
    fs.stat = jest.fn().mockResolvedValue({ size: 1024 });
    fs.access = jest.fn().mockResolvedValue();
    fs.rename = jest.fn().mockResolvedValue();
    fs.unlink = jest.fn().mockResolvedValue();
    fs.appendFile = jest.fn().mockResolvedValue();
    fs.readFile = jest.fn().mockResolvedValue('');
    fs.readdir = jest.fn().mockResolvedValue([]);

    // Create a fresh logger instance
    testLogger = new SecureLogger({ secureLogDir: testLogDir });
    testLogger.initialized = true;

    // Use fake timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('should create logger with default config', () => {
    const defaultLogger = new SecureLogger();

    expect(defaultLogger.config.secureLogDir).toBe('.logs');
    expect(defaultLogger.config.maxLogSize).toBe(5 * 1024 * 1024);
    expect(defaultLogger.config.maxBackupFiles).toBe(5);
    expect(defaultLogger.logBuffer).toEqual([]);
    expect(defaultLogger.initialized).toBe(false);
  });

  test('should create logger with custom config', () => {
    const customConfig = {
      secureLogDir: '.custom-logs',
      maxLogSize: 2000,
      maxBackupFiles: 3
    };

    const customLogger = new SecureLogger(customConfig);
    customLogger.initialized = true;

    expect(customLogger.config.secureLogDir).toBe('.custom-logs');
    expect(customLogger.config.maxLogSize).toBe(2000);
    expect(customLogger.config.maxBackupFiles).toBe(3);
  });

  test('should generate session ID correctly', () => {
    const sessionId = testLogger.generateSessionId();

    expect(sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
    expect(sessionId.length).toBeGreaterThan(10);
  });

  test('should get log file path correctly', () => {
    const today = new Date().toISOString().split('T')[0];
    const expectedPath = path.join(testLogDir, `secure-${today}.log`);

    const logPath = testLogger.getLogFilePath();

    expect(logPath).toBe(expectedPath);
  });

  test('should ensure log directory with correct permissions', async () => {
    await testLogger.ensureLogDirectory();

    expect(fs.mkdir).toHaveBeenCalledWith(testLogDir, { recursive: true, mode: 0o700 });
  });

  test('should handle directory creation failure', async () => {
    fs.mkdir.mockRejectedValue(new Error('Permission denied'));

    await expect(testLogger.ensureLogDirectory()).rejects.toThrow('Failed to create log directory: Permission denied');
  });

  test('should rotate log file when size exceeds limit', async () => {
    const filePath = testLogger.getLogFilePath();
    const stats = { size: 6 * 1024 * 1024 }; // 6MB, exceeds 5MB limit

    fs.stat.mockResolvedValue(stats);

    await testLogger.rotateLogFile(filePath);

    expect(fs.stat).toHaveBeenCalledWith(filePath);
    expect(fs.rename).toHaveBeenCalledWith(filePath, `${filePath}.1`);
  });

  test('should not rotate log file when size is within limit', async () => {
    const filePath = testLogger.getLogFilePath();
    const stats = { size: 1024 }; // 1KB, within limit

    fs.stat.mockResolvedValue(stats);

    await testLogger.rotateLogFile(filePath);

    expect(fs.stat).toHaveBeenCalledWith(filePath);
    expect(fs.rename).not.toHaveBeenCalled();
  });

  test('should handle log rotation failure gracefully', async () => {
    const filePath = testLogger.getLogFilePath();
    fs.stat.mockRejectedValue(new Error('File not found'));

    // This should not throw an error, just handle it gracefully
    await testLogger.rotateLogFile(filePath);

    // Test passes if no exception is thrown
    expect(true).toBe(true);
  });

  test('should write to secure log with immediate flush for errors', async () => {
    const mockMetadata = { userId: '123', action: 'login' };

    await testLogger.writeToSecureLog('error', 'Test error message', mockMetadata);

    expect(fs.appendFile).toHaveBeenCalled();
  });

  test('should buffer non-error logs and flush when buffer is full', async () => {
    const bufferLogger = new SecureLogger({
      secureLogDir: testLogDir,
      bufferSize: 2
    });
    bufferLogger.initialized = true;

    // Add first log entry (should buffer)
    await bufferLogger.writeToSecureLog('info', 'Info message 1');
    expect(bufferLogger.logBuffer).toHaveLength(1);

    // Add second log entry (should trigger flush due to buffer size)
    await bufferLogger.writeToSecureLog('info', 'Info message 2');
    expect(bufferLogger.logBuffer).toHaveLength(0); // Should be flushed
    expect(fs.appendFile).toHaveBeenCalled();
  });

  test('should not write when not initialized', async () => {
    testLogger.initialized = false;

    await testLogger.writeToSecureLog('info', 'Test message');

    expect(fs.appendFile).not.toHaveBeenCalled();
    expect(testLogger.logBuffer).toHaveLength(0);
  });

  test('should flush buffer correctly', async () => {
    testLogger.logBuffer = [
      { timestamp: '2023-01-01T00:00:00.000Z', level: 'INFO', message: 'Test 1' },
      { timestamp: '2023-01-01T00:00:01.000Z', level: 'INFO', message: 'Test 2' }
    ];

    await testLogger.flushBuffer();

    expect(testLogger.logBuffer).toHaveLength(0);
    expect(fs.appendFile).toHaveBeenCalled();
  });

  test('should not flush when already writing', async () => {
    testLogger.isWriting = true;
    testLogger.logBuffer = [{ level: 'INFO', message: 'Test' }];

    await testLogger.flushBuffer();

    expect(fs.appendFile).not.toHaveBeenCalled();
    expect(testLogger.logBuffer).toHaveLength(1);
  });

  test('should handle flush failure gracefully', async () => {
    testLogger.logBuffer = [{ level: 'INFO', message: 'Test' }];
    fs.appendFile.mockRejectedValue(new Error('Write failed'));
    console.error = jest.fn();

    await testLogger.flushBuffer();

    expect(console.error).toHaveBeenCalledWith('Failed to write to secure log:', 'Write failed');
  });

  test('should extract error info from regular error', () => {
    const error = new Error('Test error');
    error.code = 'TEST_CODE';

    const info = testLogger.extractErrorInfo(error);

    expect(info.errorName).toBe('Error');
    expect(info.message).toBe('Test error');
    expect(info.code).toBe('TEST_CODE');
    expect(info.stack).toBeDefined();
  });

  test('should extract error info from custom error', () => {
    const customError = new BaseError('Custom error', 'CUSTOM_CODE', { context: 'test' });

    const info = testLogger.extractErrorInfo(customError);

    expect(info.errorId).toBe(customError.id);
    expect(info.errorName).toBe('BaseError');
    expect(info.errorCode).toBe('CUSTOM_CODE');
    expect(info.message).toBe('Custom error');
    expect(info.context).toEqual({ context: 'test' });
    expect(info.timestamp).toBe(customError.timestamp);
  });

  test('should log error with dual-level output', () => {
    const testError = new Error('Test error');
    const context = { userId: '123' };

    testLogger.writeToSecureLog = jest.fn();

    testLogger.logError(testError, context);

    expect(testLogger.writeToSecureLog).toHaveBeenCalledWith('error', 'Test error', expect.objectContaining({
      errorName: 'Error',
      message: 'Test error',
      userId: '123'
    }));
  });

  test('should log custom error with ID', () => {
    const customError = new BaseError('Custom error', 'CUSTOM_CODE');

    testLogger.writeToSecureLog = jest.fn();

    testLogger.logError(customError);

    expect(testLogger.writeToSecureLog).toHaveBeenCalledWith('error', 'Custom error', expect.objectContaining({
      errorId: customError.id,
      errorName: 'BaseError'
    }));
  });

  test('should log security event with medium severity', () => {
    const event = { id: 'SEC001', message: 'Suspicious login attempt' };

    testLogger.writeToSecureLog = jest.fn();

    testLogger.logSecurityEvent(event, 'medium');

    expect(testLogger.writeToSecureLog).toHaveBeenCalledWith('security', 'Security event: Suspicious login attempt', expect.objectContaining({
      ...event,
      severity: 'medium',
      category: 'security',
      sessionId: expect.stringMatching(/^session_\d+_[a-z0-9]+$/)
    }));
  });

  test('should log security event with high severity and trigger alert', () => {
    const event = { id: 'SEC002', message: 'Data breach detected' };

    testLogger.writeToSecureLog = jest.fn();
    testLogger.triggerSecurityAlert = jest.fn();

    testLogger.logSecurityEvent(event, 'high');

    expect(testLogger.writeToSecureLog).toHaveBeenCalledWith('security', 'Security event: Data breach detected', expect.any(Object));
    expect(testLogger.triggerSecurityAlert).toHaveBeenCalledWith(expect.objectContaining({
      ...event,
      severity: 'high'
    }));
  });

  test('should log performance metrics for slow operations', () => {
    testLogger.writeToSecureLog = jest.fn();

    testLogger.logPerformance('api_call', 6000, { endpoint: '/api/test' });

    expect(testLogger.writeToSecureLog).toHaveBeenCalledWith('warn', 'Slow operation: api_call', expect.objectContaining({
      operation: 'api_call',
      duration: 6000,
      endpoint: '/api/test',
      category: 'performance'
    }));
  });

  test('should log performance metrics for fast operations', () => {
    testLogger.writeToSecureLog = jest.fn();

    testLogger.logPerformance('api_call', 1000, { endpoint: '/api/test' });

    expect(testLogger.writeToSecureLog).toHaveBeenCalledWith('info', 'Performance: api_call', expect.objectContaining({
      operation: 'api_call',
      duration: 1000,
      endpoint: '/api/test',
      category: 'performance'
    }));
  });

  test('should log user action for audit trail', () => {
    testLogger.writeToSecureLog = jest.fn();

    const action = 'login_success';
    const context = { userId: '123', ip: '192.168.1.1' };

    testLogger.logUserAction(action, context);

    expect(testLogger.writeToSecureLog).toHaveBeenCalledWith('info', 'User action: login_success', expect.objectContaining({
      action: 'login_success',
      userId: '123',
      ip: '192.168.1.1',
      category: 'audit',
      sessionId: expect.stringMatching(/^session_\d+_[a-z0-9]+$/)
    }));
  });

  test('should trigger security alert with console output', () => {
    const event = {
      id: 'SEC003',
      message: 'Critical security breach',
      severity: 'critical',
      timestamp: '2023-01-01T00:00:00.000Z',
      sessionId: 'session_123_abc'
    };

    testLogger.writeToSecureLog = jest.fn();
    console.error = jest.fn();

    testLogger.triggerSecurityAlert(event);

    expect(console.error).toHaveBeenCalledWith('\n🚨 SECURITY ALERT 🚨');
    expect(console.error).toHaveBeenCalledWith('Severity: critical');
    expect(console.error).toHaveBeenCalledWith('Event: Critical security breach');
    expect(console.error).toHaveBeenCalledWith('Timestamp: 2023-01-01T00:00:00.000Z');
    expect(console.error).toHaveBeenCalledWith('Session ID: session_123_abc');
    expect(console.error).toHaveBeenCalledWith('Please review the secure logs for more details.\n');
    expect(testLogger.writeToSecureLog).toHaveBeenCalledWith('alert', 'Security alert triggered', event);
  });

  test('should get recent logs successfully', async () => {
    const mockLogContent = '{"timestamp":"2023-01-01T00:00:00.000Z","level":"INFO","message":"Test message"}\n' +
                          '{"timestamp":"2023-01-01T00:01:00.000Z","level":"ERROR","message":"Test error"}';

    fs.readFile.mockResolvedValue(mockLogContent);

    const logs = await testLogger.getRecentLogs(10);

    expect(logs).toHaveLength(2);
    expect(logs[0]).toEqual({
      timestamp: '2023-01-01T00:00:00.000Z',
      level: 'INFO',
      message: 'Test message'
    });
    expect(logs[1]).toEqual({
      timestamp: '2023-01-01T00:01:00.000Z',
      level: 'ERROR',
      message: 'Test error'
    });
  });

  test('should handle file read errors when getting recent logs', async () => {
    fs.readFile.mockRejectedValue(new Error('File not found'));

    const logs = await testLogger.getRecentLogs(10);

    expect(logs).toEqual([]);
  });

  test('should handle malformed log lines when getting recent logs', async () => {
    const mockLogContent = '{"timestamp":"2023-01-01T00:00:00.000Z","level":"INFO","message":"Valid log"}\n' +
                          'Invalid log line\n' +
                          '{"timestamp":"2023-01-01T00:01:00.000Z","level":"ERROR","message":"Another valid log"}';

    fs.readFile.mockResolvedValue(mockLogContent);

    const logs = await testLogger.getRecentLogs(10);

    expect(logs).toHaveLength(3);
    expect(logs[0]).toEqual({
      timestamp: '2023-01-01T00:00:00.000Z',
      level: 'INFO',
      message: 'Valid log'
    });
    expect(logs[1]).toEqual({
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      level: 'info',
      message: 'Invalid log line'
    });
    expect(logs[2]).toEqual({
      timestamp: '2023-01-01T00:01:00.000Z',
      level: 'ERROR',
      message: 'Another valid log'
    });
  });

  test('should search logs by level', async () => {
    const mockLogs = [
      { timestamp: '2023-01-01T00:00:00.000Z', level: 'INFO', message: 'Info message', metadata: {} },
      { timestamp: '2023-01-01T00:01:00.000Z', level: 'ERROR', message: 'Error message', metadata: {} },
      { timestamp: '2023-01-01T00:02:00.000Z', level: 'INFO', message: 'Another info', metadata: {} }
    ];

    testLogger.getRecentLogs = jest.fn().mockResolvedValue(mockLogs);

    const results = await testLogger.searchLogs({ level: 'info' });

    expect(results).toHaveLength(2);
    expect(results.map(r => r.message)).toEqual(['Info message', 'Another info']);
  });

  test('should search logs by category', async () => {
    const mockLogs = [
      { timestamp: '2023-01-01T00:00:00.000Z', level: 'INFO', message: 'Message 1', metadata: { category: 'performance' } },
      { timestamp: '2023-01-01T00:01:00.000Z', level: 'INFO', message: 'Message 2', metadata: { category: 'security' } },
      { timestamp: '2023-01-01T00:02:00.000Z', level: 'INFO', message: 'Message 3', metadata: { category: 'performance' } }
    ];

    testLogger.getRecentLogs = jest.fn().mockResolvedValue(mockLogs);

    const results = await testLogger.searchLogs({ category: 'performance' });

    expect(results).toHaveLength(2);
    expect(results.map(r => r.message)).toEqual(['Message 1', 'Message 3']);
  });

  test('should search logs by text', async () => {
    const mockLogs = [
      { timestamp: '2023-01-01T00:00:00.000Z', level: 'INFO', message: 'User login successful', metadata: {} },
      { timestamp: '2023-01-01T00:01:00.000Z', level: 'ERROR', message: 'User login failed', metadata: {} },
      { timestamp: '2023-01-01T00:02:00.000Z', level: 'INFO', message: 'User logout', metadata: {} }
    ];

    testLogger.getRecentLogs = jest.fn().mockResolvedValue(mockLogs);

    const results = await testLogger.searchLogs({ search: 'login' });

    expect(results).toHaveLength(2);
    expect(results.map(r => r.message)).toEqual(['User login successful', 'User login failed']);
  });

  test('should search logs by date', async () => {
    const mockLogs = [
      { timestamp: '2023-01-01T00:00:00.000Z', level: 'INFO', message: 'Old message', metadata: {} },
      { timestamp: '2023-01-02T00:00:00.000Z', level: 'INFO', message: 'New message', metadata: {} }
    ];

    testLogger.getRecentLogs = jest.fn().mockResolvedValue(mockLogs);

    const results = await testLogger.searchLogs({ since: '2023-01-01T12:00:00.000Z' });

    expect(results).toHaveLength(1);
    expect(results[0].message).toBe('New message');
  });

  test('should handle search errors gracefully', async () => {
    testLogger.getRecentLogs = jest.fn().mockRejectedValue(new Error('Search failed'));

    const results = await testLogger.searchLogs({ level: 'error' });

    expect(results).toEqual([]);
  });

  test('should cleanup old log files', async () => {
    const mockFiles = [
      'secure-2023-01-01.log',
      'secure-2023-01-02.log.1',
      'secure-2023-01-03.log.2',
      'other-file.txt',
      'secure-2023-02-01.log'
    ];

    fs.readdir.mockResolvedValue(mockFiles);

    const oldStats = { mtime: new Date('2023-01-01') };
    const newStats = { mtime: new Date() };

    fs.stat.mockImplementation((filePath) => {
      if (filePath.includes('2023-01-01') || filePath.includes('2023-01-02') || filePath.includes('2023-01-03')) {
        return Promise.resolve(oldStats);
      }
      return Promise.resolve(newStats);
    });

    fs.unlink.mockResolvedValue();

    await testLogger.cleanupOldLogs(30);

    expect(fs.unlink).toHaveBeenCalledTimes(3);
  });

  test('should handle cleanup errors gracefully', async () => {
    fs.readdir.mockRejectedValue(new Error('Directory not found'));

    // This should not throw an error, just handle it gracefully
    await testLogger.cleanupOldLogs(30);

    // Test passes if no exception is thrown
    expect(true).toBe(true);
  });

  test('should shutdown gracefully', async () => {
    testLogger.flushBuffer = jest.fn();

    await testLogger.shutdown();

    expect(testLogger.flushBuffer).toHaveBeenCalled();
  });
});