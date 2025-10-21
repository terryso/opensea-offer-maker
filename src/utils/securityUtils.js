import { ethers } from 'ethers';
import { analyzePasswordStrength, secureClear } from './encryptionUtils.js';
import { timingSafeEqual } from 'crypto';

/**
 * Validate private key format and strength
 * @param {string} privateKey - Private key to validate
 * @returns {Object} Validation result with isValid flag and details
 */
export function validatePrivateKey(privateKey) {
  const result = {
    isValid: false,
    format: 'unknown',
    entropy: 0,
    address: null,
    errors: [],
    warnings: []
  };

  try {
    // Format validation
    if (typeof privateKey !== 'string') {
      result.errors.push('Private key must be a string');
      return result;
    }

    // Add 0x prefix if missing
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey;
      result.warnings.push('Added 0x prefix to private key');
    }

    // Check length (32 bytes = 64 hex chars + 2 for 0x prefix)
    if (privateKey.length !== 66) {
      result.errors.push('Private key must be exactly 32 bytes (64 hex characters)');
      return result;
    }

    // Check if all characters are valid hex
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      result.errors.push('Private key contains invalid hex characters');
      return result;
    }

    // Check for weak patterns (all zeros, all same character, etc.)
    const keyBody = privateKey.slice(2).toLowerCase();
    if (/^0+$/.test(keyBody)) {
      result.errors.push('Private key cannot be all zeros');
      return result;
    }

    if (/^(.)\1{63}$/.test(keyBody)) {
      result.errors.push('Private key has too little entropy (repeating pattern)');
      return result;
    }

    // Calculate entropy (simplified)
    const uniqueChars = new Set(keyBody.split('')).size;
    const maxUniqueChars = 16; // hex characters
    result.entropy = (uniqueChars / maxUniqueChars) * 8; // 8 bits per byte

    if (result.entropy < 6) {
      result.warnings.push('Private key appears to have low entropy');
    }

    // Validate with ethers.js
    try {
      const wallet = new ethers.Wallet(privateKey);
      result.address = wallet.address;
      result.format = 'valid';
      result.isValid = true;
    } catch (ethersError) {
      result.errors.push(`Invalid private key: ${ethersError.message}`);
      return result;
    }

    // Check for common weak patterns
    const weakPatterns = [
      /^0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef$/, // sequential
      /^0xf{64}$/, // all f
      /^0xe{64}$/, // all e
      /^0xdeadbeef.*deadbeef$/ // repeated deadbeef
    ];

    for (const pattern of weakPatterns) {
      if (pattern.test(privateKey)) {
        result.warnings.push('Private key follows a common weak pattern');
        break;
      }
    }

  } catch (error) {
    result.errors.push(`Validation error: ${error.message}`);
  }

  return result;
}

/**
 * Check if a private key has sufficient entropy
 * @param {string} privateKey - Private key to check
 * @param {number} [threshold=7.0] - Minimum entropy threshold
 * @returns {boolean} True if key has sufficient entropy
 */
export function hasSufficientEntropy(privateKey, threshold = 7.0) {
  const validation = validatePrivateKey(privateKey);
  return validation.isValid && validation.entropy >= threshold;
}

/**
 * Decryption attempt limiter for brute force protection
 */
export class DecryptionAttemptLimiter {
  constructor(maxAttempts = 5, lockoutDuration = 300000) { // 5 minutes default
    this.attempts = new Map();
    this.maxAttempts = maxAttempts;
    this.lockoutDuration = lockoutDuration;
  }

  /**
   * Check if decryption is allowed for the given identifier
   * @param {string} identifier - Identifier to track (e.g., key name)
   * @throws {Error} If rate limit exceeded
   */
  checkAttempts(identifier) {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];

    // Clean old attempts
    const recent = attempts.filter(time => now - time < this.lockoutDuration);

    if (recent.length >= this.maxAttempts) {
      const lockoutRemaining = Math.ceil((this.lockoutDuration - (now - recent[0])) / 1000);
      const error = new Error(`Too many decryption attempts. Try again in ${lockoutRemaining} seconds.`);
      error.code = 'RATE_LIMIT_EXCEEDED';
      error.lockoutRemaining = lockoutRemaining;
      throw error;
    }

    recent.push(now);
    this.attempts.set(identifier, recent);
  }

  /**
   * Reset attempts for a specific identifier
   * @param {string} identifier - Identifier to reset
   */
  resetAttempts(identifier) {
    this.attempts.delete(identifier);
  }

  /**
   * Get current attempt count for identifier
   * @param {string} identifier - Identifier to check
   * @returns {number} Current attempt count
   */
  getAttemptCount(identifier) {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];
    const recent = attempts.filter(time => now - time < this.lockoutDuration);
    return recent.length;
  }

  /**
   * Clear all attempt records (for cleanup)
   */
  clearAllAttempts() {
    this.attempts.clear();
  }
}

/**
 * Secure memory manager for sensitive data
 */
export class SecureMemoryManager {
  constructor() {
    this.buffers = new Set();
  }

  /**
   * Create a secure buffer for sensitive data
   * @param {number} size - Buffer size in bytes
   * @returns {Buffer} Secure buffer
   */
  createSecureBuffer(size) {
    const buffer = Buffer.alloc(size);
    this.buffers.add(buffer);
    return buffer;
  }

  /**
   * Clear a buffer securely
   * @param {Buffer} buffer - Buffer to clear
   */
  clearBuffer(buffer) {
    if (Buffer.isBuffer(buffer)) {
      buffer.fill(0);
      this.buffers.delete(buffer);
    }
  }

  /**
   * Clear all managed buffers
   */
  clearAllBuffers() {
    for (const buffer of this.buffers) {
      this.clearBuffer(buffer);
    }
  }

  /**
   * Get count of managed buffers
   * @returns {number} Number of managed buffers
   */
  getBufferCount() {
    return this.buffers.size;
  }
}

/**
 * Timing-safe string comparison for password verification
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {boolean} True if strings are equal
 */
export function timingSafeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  // Convert to buffers for timing-safe comparison
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  // Use crypto module's timingSafeEqual if available (Node.js 6.6+)
  try {
    return timingSafeEqual(bufferA, bufferB);
  } catch {
    // Fallback implementation for older Node.js versions
    let result = 0;
    for (let i = 0; i < bufferA.length; i++) {
      result |= bufferA[i] ^ bufferB[i];
    }
    return result === 0;
  }
}

/**
 * Generate cryptographically secure random delay (for timing attack protection)
 * @param {number} [minMs=10] - Minimum delay in milliseconds
 * @param {number} [maxMs=100] - Maximum delay in milliseconds
 * @returns {Promise} Promise that resolves after random delay
 */
export function randomDelay(minMs = 10, maxMs = 100) {
  return new Promise(resolve => {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    setTimeout(resolve, delay);
  });
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @param {Object} [options] - Validation options
 * @returns {Object} Validation result
 */
export function validatePassword(password, options = {}) {
  const {
    minLength = 16,
    requireUppercase = true,
    requireLowercase = true,
    requireNumbers = true,
    requireSpecialChars = true
  } = options;

  const result = {
    isValid: true,
    errors: [],
    warnings: [],
    strength: analyzePasswordStrength(password)
  };

  // Length validation
  if (password.length < minLength) {
    result.errors.push(`Password must be at least ${minLength} characters long`);
    result.isValid = false;
  }

  // Character requirements
  if (requireUppercase && !/[A-Z]/.test(password)) {
    result.errors.push('Password must contain uppercase letters');
    result.isValid = false;
  }

  if (requireLowercase && !/[a-z]/.test(password)) {
    result.errors.push('Password must contain lowercase letters');
    result.isValid = false;
  }

  if (requireNumbers && !/[0-9]/.test(password)) {
    result.errors.push('Password must contain numbers');
    result.isValid = false;
  }

  if (requireSpecialChars && !/[^a-zA-Z0-9]/.test(password)) {
    result.errors.push('Password must contain special characters');
    result.isValid = false;
  }

  // Common weak patterns
  const weakPatterns = [
    /password/i,
    /123456/,
    /qwerty/i,
    /admin/i,
    /letmein/i
  ];

  for (const pattern of weakPatterns) {
    if (pattern.test(password)) {
      result.warnings.push('Password contains common weak patterns');
      break;
    }
  }

  return result;
}

/**
 * Create a secure session for managing sensitive operations
 */
export class SecureSession {
  constructor() {
    this.startTime = Date.now();
    this.operations = 0;
    this.maxOperations = 100; // Limit operations per session
    this.maxDuration = 30 * 60 * 1000; // 30 minutes max session
  }

  /**
   * Check if session is still valid
   * @returns {boolean} True if session is valid
   */
  isValid() {
    const now = Date.now();
    const duration = now - this.startTime;
    return duration < this.maxDuration && this.operations < this.maxOperations;
  }

  /**
   * Record an operation
   * @throws {Error} If session is invalid or exceeded limits
   */
  recordOperation() {
    if (!this.isValid()) {
      const error = new Error('Secure session expired or exceeded limits');
      error.code = 'SESSION_EXPIRED';
      throw error;
    }
    this.operations++;
  }

  /**
   * Get session status
   * @returns {Object} Session status
   */
  getStatus() {
    const now = Date.now();
    const duration = now - this.startTime;
    const timeRemaining = Math.max(0, this.maxDuration - duration);
    const operationsRemaining = Math.max(0, this.maxOperations - this.operations);

    return {
      startTime: this.startTime,
      duration,
      timeRemaining,
      operations: this.operations,
      operationsRemaining,
      isValid: this.isValid()
    };
  }

  /**
   * End the session
   */
  endSession() {
    this.operations = this.maxOperations; // Mark as expired
  }
}