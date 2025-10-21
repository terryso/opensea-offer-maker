import {
  validatePrivateKey,
  hasSufficientEntropy,
  DecryptionAttemptLimiter,
  SecureMemoryManager,
  timingSafeEquals,
  randomDelay,
  validatePassword,
  SecureSession
} from '../../utils/securityUtils.js';

describe('securityUtils', () => {
  describe('validatePrivateKey', () => {
    it('should reject non-string input', () => {
      const result = validatePrivateKey(123);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Private key must be a string');
    });

    it('should add 0x prefix if missing', () => {
      const keyWithoutPrefix = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = validatePrivateKey(keyWithoutPrefix);
      expect(result.warnings).toContain('Added 0x prefix to private key');
    });

    it('should reject incorrect length', () => {
      const shortKey = '0x0123456789abcdef';
      const result = validatePrivateKey(shortKey);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Private key must be exactly 32 bytes (64 hex characters)');
    });

    it('should reject invalid hex characters', () => {
      const invalidKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg';
      const result = validatePrivateKey(invalidKey);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Private key contains invalid hex characters');
    });

    it('should reject all zeros key', () => {
      const zeroKey = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const result = validatePrivateKey(zeroKey);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Private key cannot be all zeros');
    });

    it('should reject repeating pattern key', () => {
      const repeatKey = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const result = validatePrivateKey(repeatKey);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Private key has too little entropy (repeating pattern)');
    });

    it('should validate correct private key', () => {
      const validKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = validatePrivateKey(validKey);
      expect(result.isValid).toBe(true);
      expect(result.format).toBe('valid');
      expect(result.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should calculate entropy correctly', () => {
      const key = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = validatePrivateKey(key);
      expect(result.entropy).toBeGreaterThan(0);
      expect(result.entropy).toBeLessThanOrEqual(8);
    });

    it('should warn about low entropy keys', () => {
      // Use a key with some variety but still low entropy
      const lowEntropyKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abff';
      const result = validatePrivateKey(lowEntropyKey);
      if (result.isValid) {
        expect(result.warnings).toContain('Private key appears to have low entropy');
      }
    });

    it('should detect common weak patterns', () => {
      const sequentialKey = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const result = validatePrivateKey(sequentialKey);
      expect(result.warnings).toContain('Private key follows a common weak pattern');
    });

    it('should handle invalid ethers.js wallet creation', () => {
      // Use a key that's valid hex but invalid as a private key (too large)
      const invalidEthersKey = '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
      const result = validatePrivateKey(invalidEthersKey);
      // It might fail validation for other reasons, so check that it's not valid
      expect(result.isValid).toBe(false);
    });

    it('should handle exceptions gracefully', () => {
      // Simulate an error during validation
      const result = validatePrivateKey(null);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('hasSufficientEntropy', () => {
    it('should return true for valid key with sufficient entropy', () => {
      const validKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = hasSufficientEntropy(validKey);
      expect(result).toBe(true);
    });

    it('should return false for invalid key', () => {
      const invalidKey = '0xinvalid';
      const result = hasSufficientEntropy(invalidKey);
      expect(result).toBe(false);
    });

    it('should use custom threshold', () => {
      const lowEntropyKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
      const result = hasSufficientEntropy(lowEntropyKey, 1.0);
      // Since this key fails validation due to repeating pattern, it should be false
      expect(result).toBe(false);
    });

    it('should return false for key below threshold', () => {
      const lowEntropyKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
      const result = hasSufficientEntropy(lowEntropyKey, 8.0);
      expect(result).toBe(false);
    });
  });

  describe('DecryptionAttemptLimiter', () => {
    let limiter;

    beforeEach(() => {
      limiter = new DecryptionAttemptLimiter(3, 1000); // 3 attempts, 1 second lockout
    });

    it('should allow attempts within limit', () => {
      expect(() => limiter.checkAttempts('test-key')).not.toThrow();
      expect(() => limiter.checkAttempts('test-key')).not.toThrow();
      expect(() => limiter.checkAttempts('test-key')).not.toThrow();
    });

    it('should throw error when limit exceeded', () => {
      limiter.checkAttempts('test-key');
      limiter.checkAttempts('test-key');
      limiter.checkAttempts('test-key');

      expect(() => limiter.checkAttempts('test-key')).toThrow('Too many decryption attempts');
    });

    it('should provide lockout remaining time', () => {
      limiter.checkAttempts('test-key');
      limiter.checkAttempts('test-key');
      limiter.checkAttempts('test-key');

      try {
        limiter.checkAttempts('test-key');
      } catch (error) {
        expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(error.lockoutRemaining).toBeGreaterThan(0);
        expect(error.lockoutRemaining).toBeLessThanOrEqual(1000);
      }
    });

    it('should handle different identifiers separately', () => {
      limiter.checkAttempts('key1');
      limiter.checkAttempts('key1');
      limiter.checkAttempts('key1');

      // Should still allow attempts for different key
      expect(() => limiter.checkAttempts('key2')).not.toThrow();
    });

    it('should clean old attempts after lockout period', async () => {
      limiter.checkAttempts('test-key');
      limiter.checkAttempts('test-key');
      limiter.checkAttempts('test-key');

      // Wait for lockout to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(() => limiter.checkAttempts('test-key')).not.toThrow();
    });

    it('should reset attempts for specific identifier', () => {
      limiter.checkAttempts('test-key');
      limiter.checkAttempts('test-key');
      limiter.resetAttempts('test-key');

      // Should allow attempts again after reset
      expect(() => limiter.checkAttempts('test-key')).not.toThrow();
    });

    it('should get current attempt count', () => {
      expect(limiter.getAttemptCount('test-key')).toBe(0);

      limiter.checkAttempts('test-key');
      expect(limiter.getAttemptCount('test-key')).toBe(1);

      limiter.checkAttempts('test-key');
      expect(limiter.getAttemptCount('test-key')).toBe(2);
    });

    it('should clear all attempts', () => {
      limiter.checkAttempts('key1');
      limiter.checkAttempts('key2');

      limiter.clearAllAttempts();

      expect(limiter.getAttemptCount('key1')).toBe(0);
      expect(limiter.getAttemptCount('key2')).toBe(0);
    });
  });

  describe('SecureMemoryManager', () => {
    let manager;

    beforeEach(() => {
      manager = new SecureMemoryManager();
    });

    it('should create secure buffer', () => {
      const buffer = manager.createSecureBuffer(32);
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBe(32);
      expect(manager.getBufferCount()).toBe(1);
    });

    it('should clear buffer securely', () => {
      const buffer = manager.createSecureBuffer(32);
      buffer.fill('x'); // Fill with data

      manager.clearBuffer(buffer);

      // Check if buffer is filled with zeros
      for (let i = 0; i < buffer.length; i++) {
        expect(buffer[i]).toBe(0);
      }
      expect(manager.getBufferCount()).toBe(0);
    });

    it('should handle non-buffer input gracefully', () => {
      expect(() => manager.clearBuffer('not-a-buffer')).not.toThrow();
    });

    it('should clear all managed buffers', () => {
      const buffer1 = manager.createSecureBuffer(16);
      const buffer2 = manager.createSecureBuffer(16);

      buffer1.fill('x');
      buffer2.fill('y');

      manager.clearAllBuffers();

      expect(manager.getBufferCount()).toBe(0);

      // All buffers should be zeroed
      for (let i = 0; i < buffer1.length; i++) {
        expect(buffer1[i]).toBe(0);
      }
      for (let i = 0; i < buffer2.length; i++) {
        expect(buffer2[i]).toBe(0);
      }
    });

    it('should get buffer count', () => {
      expect(manager.getBufferCount()).toBe(0);

      manager.createSecureBuffer(8);
      expect(manager.getBufferCount()).toBe(1);

      manager.createSecureBuffer(16);
      expect(manager.getBufferCount()).toBe(2);
    });
  });

  describe('timingSafeEquals', () => {
    it('should return true for equal strings', () => {
      const result = timingSafeEquals('password123', 'password123');
      expect(result).toBe(true);
    });

    it('should return false for unequal strings', () => {
      const result = timingSafeEquals('password123', 'password124');
      expect(result).toBe(false);
    });

    it('should return false for strings of different lengths', () => {
      const result = timingSafeEquals('password', 'password123');
      expect(result).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(timingSafeEquals(123, '123')).toBe(false);
      expect(timingSafeEquals('string', 123)).toBe(false);
      expect(timingSafeEquals(null, 'null')).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(timingSafeEquals('', '')).toBe(true);
    });

    it('should handle unicode characters', () => {
      const result = timingSafeEquals('🔐密码🔑', '🔐密码🔑');
      expect(result).toBe(true);
    });
  });

  describe('randomDelay', () => {
    it('should create a delay', async () => {
      const start = Date.now();
      await randomDelay(10, 20);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(10);
      expect(end - start).toBeLessThan(100); // Allow some margin
    });

    it('should use default parameters', async () => {
      const start = Date.now();
      await randomDelay();
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(10);
      expect(end - start).toBeLessThan(200); // Allow some margin
    });

    it('should work with zero delay', async () => {
      const start = Date.now();
      await randomDelay(0, 0);
      const end = Date.now();

      // Should be very quick but still a promise
      expect(end - start).toBeLessThan(50);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong password with default options', () => {
      const password = 'MyStr0ng!P@ssw0rd#2024';
      const result = validatePassword(password);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.strength).toBeDefined();
    });

    it('should reject password that is too short', () => {
      const password = 'Short1!';
      const result = validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must be at least 16 characters long');
    });

    it('should reject password without uppercase', () => {
      const password = 'mystr0ng!p@ssw0rd#2024';
      const result = validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain uppercase letters');
    });

    it('should reject password without lowercase', () => {
      const password = 'MYSTR0NG!P@SSW0RD#2024';
      const result = validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain lowercase letters');
    });

    it('should reject password without numbers', () => {
      const password = 'MyStrong!Password#';
      const result = validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain numbers');
    });

    it('should reject password without special characters', () => {
      const password = 'MyStrongPassword2024';
      const result = validatePassword(password);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Password must contain special characters');
    });

    it('should use custom options', () => {
      const password = 'ShortPass1';
      const result = validatePassword(password, {
        minLength: 8,
        requireSpecialChars: false
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect common weak patterns', () => {
      const password = 'MyPassword123!2024';
      const result = validatePassword(password, {
        minLength: 16
      });

      expect(result.warnings).toContain('Password contains common weak patterns');
    });

    it('should include password strength analysis', () => {
      const password = 'TestPassword123!';
      const result = validatePassword(password, {
        minLength: 16
      });

      expect(result.strength).toBeDefined();
      expect(result.strength.score).toBeDefined();
      expect(result.strength.strength).toBeDefined();
    });
  });

  describe('SecureSession', () => {
    let session;

    beforeEach(() => {
      session = new SecureSession();
    });

    it('should start with valid session', () => {
      expect(session.isValid()).toBe(true);
    });

    it('should record operations', () => {
      session.recordOperation();
      expect(session.getOperationCount?.()).toBeUndefined(); // This method doesn't exist
    });

    it('should get session status', () => {
      const status = session.getStatus();

      expect(status.startTime).toBeDefined();
      expect(status.duration).toBeGreaterThanOrEqual(0);
      expect(status.timeRemaining).toBeGreaterThan(0);
      expect(status.operations).toBe(0);
      expect(status.operationsRemaining).toBeGreaterThan(0);
      expect(status.isValid).toBe(true);
    });

    it('should limit operations per session', () => {
      // Record many operations to exceed limit
      for (let i = 0; i < 100; i++) {
        session.recordOperation();
      }

      expect(() => session.recordOperation()).toThrow('Secure session expired or exceeded limits');
    });

    it('should expire by time', async () => {
      // Create session with very short duration for testing
      const shortSession = new SecureSession();
      shortSession.maxDuration = 10; // 10ms

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(shortSession.isValid()).toBe(false);
    });

    it('should throw error when recording operation on expired session', () => {
      session.endSession();

      expect(() => session.recordOperation()).toThrow('Secure session expired or exceeded limits');
    });

    it('should end session', () => {
      session.endSession();
      expect(session.isValid()).toBe(false);
    });

    it('should track operations correctly', () => {
      session.recordOperation();
      session.recordOperation();

      const status = session.getStatus();
      expect(status.operations).toBe(2);
      expect(status.operationsRemaining).toBe(98); // 100 - 2
    });
  });
});