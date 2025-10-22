/**
 * Secure logging system with dual-level logging
 *
 * This module provides secure logging with different levels for users vs developers,
 * ensuring sensitive information is protected while maintaining debugging capabilities.
 */

import fs from 'fs/promises';
import path from 'path';
import { hostname } from 'os';
import { sanitizeErrorMessage, sanitizeObject } from './errorSanitizer.js';
import { isCustomError } from './errors.js';
import logger from './logger.js';

/**
 * Configuration for secure logging
 */
const LOG_CONFIG = {
  // Directory for secure logs
  secureLogDir: '.logs',
  // Maximum log file size (5MB)
  maxLogSize: 5 * 1024 * 1024,
  // Number of backup files to keep
  maxBackupFiles: 5,
  // Log file permissions (owner read/write only)
  filePermissions: 0o600,
  // Buffer size for async writes
  bufferSize: 100,
  // Flush interval in milliseconds
  flushInterval: 5000
};

/**
 * Secure logger with dual-level logging capabilities
 */
export class SecureLogger {
  constructor(options = {}) {
    this.config = { ...LOG_CONFIG, ...options };
    this.logBuffer = [];
    this.isWriting = false;
    this.initialized = false;

    // Initialize logger
    this.init();
  }

  /**
   * Initialize secure logger
   */
  async init() {
    try {
      await this.ensureLogDirectory();
      this.startFlushTimer();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize secure logger:', error.message);
    }
  }

  /**
   * Ensure log directory exists with proper permissions
   */
  async ensureLogDirectory() {
    try {
      await fs.mkdir(this.config.secureLogDir, { recursive: true, mode: 0o700 });
    } catch (error) {
      throw new Error(`Failed to create log directory: ${error.message}`);
    }
  }

  /**
   * Get log file path for current date
   * @returns {string} Log file path
   */
  getLogFilePath() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.config.secureLogDir, `secure-${today}.log`);
  }

  /**
   * Rotate log file if it exceeds size limit
   * @param {string} filePath - Log file path
   */
  async rotateLogFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size < this.config.maxLogSize) {
        return; // No rotation needed
      }

      // Rotate existing files
      for (let i = this.config.maxBackupFiles - 1; i >= 1; i--) {
        const oldFile = `${filePath}.${i}`;
        const newFile = `${filePath}.${i + 1}`;

        try {
          await fs.access(oldFile);
          if (i === this.config.maxBackupFiles - 1) {
            await fs.unlink(oldFile); // Delete oldest backup
          } else {
            await fs.rename(oldFile, newFile);
          }
        } catch {
          // File doesn't exist, continue
        }
      }

      // Move current file to .1
      await fs.rename(filePath, `${filePath}.1`);
    } catch (error) {
      // Log rotation failed, but continue with current file
      logger.warn('Log rotation failed:', error.message);
    }
  }

  /**
   * Write log entry to file
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  async writeToSecureLog(level, message, metadata = {}) {
    if (!this.initialized) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: sanitizeErrorMessage(message),
      metadata: sanitizeObject(metadata),
      pid: process.pid,
      hostname: hostname()
    };

    this.logBuffer.push(logEntry);

    // Flush immediately for error levels
    if (level === 'error' || level === 'warn') {
      await this.flushBuffer();
    } else if (this.logBuffer.length >= this.config.bufferSize) {
      await this.flushBuffer();
    }
  }

  /**
   * Flush log buffer to file
   */
  async flushBuffer() {
    if (this.isWriting || this.logBuffer.length === 0) {
      return;
    }

    this.isWriting = true;

    try {
      const filePath = this.getLogFilePath();
      await this.rotateLogFile(filePath);

      const logLines = this.logBuffer.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await fs.appendFile(filePath, logLines, { mode: this.config.filePermissions });

      this.logBuffer = [];
    } catch (error) {
      console.error('Failed to write to secure log:', error.message);
    } finally {
      this.isWriting = false;
    }
  }

  /**
   * Start periodic flush timer
   */
  startFlushTimer() {
    setInterval(() => {
      this.flushBuffer();
    }, this.config.flushInterval);
  }

  /**
   * Log error with dual-level output
   * @param {Error} error - Error to log
   * @param {Object} context - Additional context
   */
  logError(error, context = {}) {
    const errorInfo = this.extractErrorInfo(error);
    const metadata = { ...context, ...errorInfo };

    // User-facing log (sanitized)
    if (isCustomError(error)) {
      logger.error(`${error.name}: ${error.message} (ID: ${error.id})`);
    } else {
      logger.error('An error occurred (Check logs for details)');
    }

    // Developer log (detailed, secure)
    this.writeToSecureLog('error', error.message, metadata);
  }

  /**
   * Log security event with enhanced tracking
   * @param {Object} event - Security event data
   * @param {string} severity - Event severity (low, medium, high, critical)
   */
  logSecurityEvent(event, severity = 'medium') {
    const securityMetadata = {
      ...event,
      severity,
      timestamp: new Date().toISOString(),
      category: 'security',
      sessionId: this.generateSessionId()
    };

    // Security events always logged to both levels
    logger.warn(`Security event detected (ID: ${event.id || 'unknown'})`);

    // Enhanced security logging
    this.writeToSecureLog('security', `Security event: ${event.message}`, securityMetadata);

    // High severity events trigger immediate alerts
    if (severity === 'high' || severity === 'critical') {
      this.triggerSecurityAlert(securityMetadata);
    }
  }

  /**
   * Log performance metrics
   * @param {string} operation - Operation name
   * @param {number} duration - Duration in milliseconds
   * @param {Object} metadata - Additional metrics
   */
  logPerformance(operation, duration, metadata = {}) {
    const performanceMetadata = {
      operation,
      duration,
      timestamp: new Date().toISOString(),
      category: 'performance',
      ...metadata
    };

    // Performance issues to developer log
    if (duration > 5000) { // 5 seconds threshold
      this.writeToSecureLog('warn', `Slow operation: ${operation}`, performanceMetadata);
    } else {
      this.writeToSecureLog('info', `Performance: ${operation}`, performanceMetadata);
    }
  }

  /**
   * Log user action for audit trail
   * @param {string} action - Action performed
   * @param {Object} context - Action context
   */
  logUserAction(action, context = {}) {
    const auditMetadata = {
      action,
      timestamp: new Date().toISOString(),
      category: 'audit',
      sessionId: this.generateSessionId(),
      ...context
    };

    // Audit trail to secure log only
    this.writeToSecureLog('info', `User action: ${action}`, auditMetadata);
  }

  /**
   * Extract error information safely
   * @param {Error} error - Error to extract info from
   * @returns {Object} Error information
   */
  extractErrorInfo(error) {
    if (isCustomError(error)) {
      return {
        errorId: error.id,
        errorName: error.name,
        errorCode: error.code,
        message: error.message,
        context: error.context,
        timestamp: error.timestamp
      };
    }

    return {
      errorName: error.name || 'Error',
      message: error.message || 'Unknown error',
      stack: error.stack,
      code: error.code
    };
  }

  /**
   * Generate session ID for tracking
   * @returns {string} Session ID
   */
  generateSessionId() {
    // This could be enhanced to persist across commands
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Trigger security alert for high-severity events
   * @param {Object} event - Security event data
   */
  triggerSecurityAlert(event) {
    // In a production environment, this could trigger:
    // - Email notifications
    // - Slack alerts
    // - SIEM integration
    // - Incident response workflows

    console.error('\n🚨 SECURITY ALERT 🚨');
    console.error(`Severity: ${event.severity}`);
    console.error(`Event: ${event.message}`);
    console.error(`Timestamp: ${event.timestamp}`);
    console.error(`Session ID: ${event.sessionId}`);
    console.error('Please review the secure logs for more details.\n');

    // Log the alert itself
    this.writeToSecureLog('alert', 'Security alert triggered', event);
  }

  /**
   * Get recent logs for debugging
   * @param {number} lines - Number of lines to retrieve
   * @returns {Array} Array of log entries
   */
  async getRecentLogs(lines = 100) {
    try {
      const filePath = this.getLogFilePath();
      const content = await fs.readFile(filePath, 'utf8');
      const logLines = content.trim().split('\n');

      const recentLines = logLines.slice(-lines);
      return recentLines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { timestamp: new Date().toISOString(), level: 'info', message: line };
        }
      });
    } catch {
      return [];
    }
  }

  /**
   * Search logs by criteria
   * @param {Object} criteria - Search criteria
   * @returns {Array} Matching log entries
   */
  async searchLogs(criteria = {}) {
    try {
      const logs = await this.getRecentLogs(1000); // Get more logs for searching

      return logs.filter(log => {
        if (criteria.level && log.level !== criteria.level.toUpperCase()) {
          return false;
        }
        if (criteria.category && log.metadata.category !== criteria.category) {
          return false;
        }
        if (criteria.search && !JSON.stringify(log).toLowerCase().includes(criteria.search.toLowerCase())) {
          return false;
        }
        if (criteria.since && new Date(log.timestamp) < new Date(criteria.since)) {
          return false;
        }
        return true;
      });
    } catch {
      return [];
    }
  }

  /**
   * Cleanup old log files
   * @param {number} days - Number of days to keep logs
   */
  async cleanupOldLogs(days = 30) {
    try {
      const files = await fs.readdir(this.config.secureLogDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      for (const file of files) {
        if (file.endsWith('.log') || file.endsWith('.log.1') || file.endsWith('.log.2')) {
          const filePath = path.join(this.config.secureLogDir, file);
          const stats = await fs.stat(filePath);

          if (stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
          }
        }
      }
    } catch (error) {
      logger.warn('Log cleanup failed:', error.message);
    }
  }

  /**
   * Graceful shutdown - flush remaining logs
   */
  async shutdown() {
    await this.flushBuffer();
  }
}

// Global secure logger instance
const secureLogger = new SecureLogger();

// Ensure logs are flushed on process exit
process.on('SIGINT', async () => {
  await secureLogger.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await secureLogger.shutdown();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  secureLogger.logError(error, { type: 'uncaughtException' });
  await secureLogger.shutdown();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  secureLogger.logError(new Error(`Unhandled rejection: ${reason}`), {
    type: 'unhandledRejection',
    promise: promise.toString()
  });
});

export default secureLogger;
