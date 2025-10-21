import {
  deriveEncryptionKey,
  encryptData,
  decryptData,
  createHMAC,
  verifyHMAC,
  generateRandomHex,
  secureClear,
  analyzePasswordStrength,
  constantTimeEquals
} from '../../utils/encryptionUtils.js';
import { randomBytes } from 'crypto';

describe('encryptionUtils', () => {
  describe('deriveEncryptionKey', () => {
    it('should derive encryption key with default parameters', () => {
      const password = 'test-password';
      const salt = 'test-salt';
      const key = deriveEncryptionKey(password, salt);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32); // 256 bits
    });

    it('should derive encryption key with custom parameters', () => {
      const password = 'test-password';
      const salt = 'test-salt';
      const options = {
        iterations: 16384,
        keyLength: 64
      };
      const key = deriveEncryptionKey(password, salt, options);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(64);
    });

    it('should handle Buffer salt input', () => {
      const password = 'test-password';
      const salt = Buffer.from('test-salt', 'utf8');
      const key = deriveEncryptionKey(password, salt);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should produce different keys for different salts', () => {
      const password = 'test-password';
      const salt1 = 'salt1';
      const salt2 = 'salt2';
      const key1 = deriveEncryptionKey(password, salt1);
      const key2 = deriveEncryptionKey(password, salt2);

      expect(key1.toString('hex')).not.toBe(key2.toString('hex'));
    });
  });

  describe('encryptData', () => {
    let testKey;

    beforeEach(() => {
      testKey = randomBytes(32);
    });

    it('should encrypt data successfully', () => {
      const data = 'test-encryption-data';
      const result = encryptData(data, testKey);

      expect(result).toHaveProperty('encryptedData');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');
      expect(result).toHaveProperty('salt');
      expect(result).toHaveProperty('algorithm');
      expect(result).toHaveProperty('timestamp');

      expect(typeof result.encryptedData).toBe('string');
      expect(typeof result.iv).toBe('string');
      expect(typeof result.authTag).toBe('string');
      expect(typeof result.salt).toBe('string');
      expect(result.algorithm).toBe('aes-256-gcm');
      expect(result.encryptedData).not.toBe(data);
    });

    it('should use provided salt', () => {
      const data = 'test-data';
      const customSalt = randomBytes(16);
      const result = encryptData(data, testKey, customSalt);

      expect(result.salt).toBe(customSalt.toString('hex'));
    });

    it('should generate different encrypted data for same input', () => {
      const data = 'test-data';
      const result1 = encryptData(data, testKey);
      const result2 = encryptData(data, testKey);

      expect(result1.encryptedData).not.toBe(result2.encryptedData);
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.authTag).not.toBe(result2.authTag);
      expect(result1.salt).not.toBe(result2.salt);
    });
  });

  describe('decryptData', () => {
    let testKey;

    beforeEach(() => {
      testKey = randomBytes(32);
    });

    it('should decrypt data successfully', () => {
      const originalData = 'test-decryption-data';
      const encrypted = encryptData(originalData, testKey);
      const decrypted = decryptData(encrypted, testKey);

      expect(decrypted).toBe(originalData);
    });

    it('should handle empty string data', () => {
      const originalData = '';
      const encrypted = encryptData(originalData, testKey);
      const decrypted = decryptData(encrypted, testKey);

      expect(decrypted).toBe(originalData);
    });

    it('should throw error for invalid auth tag', () => {
      const validEncrypted = encryptData('test-data', testKey);
      const tamperedData = {
        ...validEncrypted,
        authTag: 'invalid' + validEncrypted.authTag.slice(6)
      };

      expect(() => decryptData(tamperedData, testKey)).toThrow('Invalid authentication tag');
    });

    it('should throw error for invalid IV', () => {
      const validEncrypted = encryptData('test-data', testKey);
      const tamperedData = {
        ...validEncrypted,
        iv: 'invalid' + validEncrypted.iv.slice(6)
      };

      expect(() => decryptData(tamperedData, testKey)).toThrow();
    });

    it('should throw error for invalid encrypted data', () => {
      const validEncrypted = encryptData('test-data', testKey);
      const tamperedData = {
        ...validEncrypted,
        encryptedData: 'invalid' + validEncrypted.encryptedData.slice(6)
      };

      expect(() => decryptData(tamperedData, testKey)).toThrow();
    });
  });

  describe('encryptData/decryptData integration', () => {
    it('should work with long data', () => {
      const longData = 'x'.repeat(10000);
      const testKey = randomBytes(32);

      const encrypted = encryptData(longData, testKey);
      const decrypted = decryptData(encrypted, testKey);

      expect(decrypted).toBe(longData);
    });

    it('should work with unicode characters', () => {
      const unicodeData = '🔐 测试加密 🌟 𝔘𝔫𝔦𝔠𝔬𝔡𝔢 🔑';
      const testKey = randomBytes(32);

      const encrypted = encryptData(unicodeData, testKey);
      const decrypted = decryptData(encrypted, testKey);

      expect(decrypted).toBe(unicodeData);
    });
  });

  describe('createHMAC', () => {
    let testKey;

    beforeEach(() => {
      testKey = randomBytes(32);
    });

    it('should create HMAC for string data', () => {
      const data = 'test-data';
      const hmac = createHMAC(data, testKey);

      expect(typeof hmac).toBe('string');
      expect(hmac.length).toBe(64); // SHA256 hex length
    });

    it('should create HMAC for Buffer data', () => {
      const data = Buffer.from('test-data', 'utf8');
      const hmac = createHMAC(data, testKey);

      expect(typeof hmac).toBe('string');
      expect(hmac.length).toBe(64);
    });

    it('should produce different HMAC for different keys', () => {
      const data = 'test-data';
      const key1 = randomBytes(32);
      const key2 = randomBytes(32);
      const hmac1 = createHMAC(data, key1);
      const hmac2 = createHMAC(data, key2);

      expect(hmac1).not.toBe(hmac2);
    });

    it('should produce different HMAC for different data', () => {
      const key = randomBytes(32);
      const data1 = 'data1';
      const data2 = 'data2';
      const hmac1 = createHMAC(data1, key);
      const hmac2 = createHMAC(data2, key);

      expect(hmac1).not.toBe(hmac2);
    });
  });

  describe('verifyHMAC', () => {
    let testKey;

    beforeEach(() => {
      testKey = randomBytes(32);
    });

    it('should verify correct HMAC', () => {
      const data = 'test-data';
      const hmac = createHMAC(data, testKey);

      const isValid = verifyHMAC(data, hmac, testKey);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect HMAC', () => {
      const data = 'test-data';
      const wrongHmac = createHMAC('different-data', testKey);

      const isValid = verifyHMAC(data, wrongHmac, testKey);
      expect(isValid).toBe(false);
    });

    it('should reject HMAC with wrong key', () => {
      const data = 'test-data';
      const hmac = createHMAC(data, testKey);
      const wrongKey = randomBytes(32);

      const isValid = verifyHMAC(data, hmac, wrongKey);
      expect(isValid).toBe(false);
    });

    it('should handle verification errors gracefully', () => {
      const data = 'test-data';
      const invalidHmac = 'invalid-hmac';

      const isValid = verifyHMAC(data, invalidHmac, testKey);
      expect(isValid).toBe(false);
    });
  });

  describe('generateRandomHex', () => {
    it('should generate hex string of correct length', () => {
      const hex = generateRandomHex(16);
      expect(typeof hex).toBe('string');
      expect(hex.length).toBe(32); // 16 bytes * 2 hex chars
    });

    it('should generate different values', () => {
      const hex1 = generateRandomHex(16);
      const hex2 = generateRandomHex(16);
      expect(hex1).not.toBe(hex2);
    });

    it('should handle zero bytes', () => {
      const hex = generateRandomHex(0);
      expect(hex).toBe('');
    });

    it('should work with various byte counts', () => {
      expect(generateRandomHex(1).length).toBe(2);
      expect(generateRandomHex(8).length).toBe(16);
      expect(generateRandomHex(32).length).toBe(64);
    });
  });

  describe('secureClear', () => {
    it('should clear Buffer data', () => {
      const data = Buffer.from('sensitive-data', 'utf8');
      secureClear(data);

      // Check if buffer is filled with zeros
      for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBe(0);
      }
    });

    it('should handle string data (no operation)', () => {
      const data = 'sensitive-data';

      // Should not throw error
      expect(() => secureClear(data)).not.toThrow();
    });

    it('should handle empty Buffer', () => {
      const data = Buffer.alloc(0);

      expect(() => secureClear(data)).not.toThrow();
    });
  });

  describe('analyzePasswordStrength', () => {
    it('should reject null/undefined password', () => {
      expect(analyzePasswordStrength(null)).toEqual({
        score: 0,
        feedback: 'Password is required'
      });

      expect(analyzePasswordStrength(undefined)).toEqual({
        score: 0,
        feedback: 'Password is required'
      });
    });

    it('should analyze weak password', () => {
      const weakPassword = '123456';
      const result = analyzePasswordStrength(weakPassword);

      expect(result.score).toBeLessThan(4);
      expect(result.strength).toBe('weak');
      expect(result.feedback).toEqual(expect.arrayContaining([expect.stringContaining('12 characters')]));
      expect(result.recommendation).toContain('longer, more complex');
    });

    it('should analyze moderate password', () => {
      const moderatePassword = 'Password123';
      const result = analyzePasswordStrength(moderatePassword);

      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(result.strength).toMatch(/^(weak|moderate|strong)$/);
      expect(result.entropy).toBeGreaterThan(0);
    });

    it('should analyze strong password', () => {
      const strongPassword = 'MyStr0ng!P@ssw0rd#2024';
      const result = analyzePasswordStrength(strongPassword);

      expect(result.score).toBeGreaterThanOrEqual(5);
      expect(result.strength).toBe('strong');
      expect(result.feedback).toHaveLength(0);
      expect(result.recommendation).toBe('Password strength is acceptable');
    });

    it('should calculate entropy correctly', () => {
      const password = 'abc123'; // lowercase + numbers
      const result = analyzePasswordStrength(password);

      expect(result.entropy).toBeGreaterThan(0);
      expect(typeof result.entropy).toBe('number');
    });

    it('should handle very long password', () => {
      const longPassword = 'x'.repeat(20) + 'ABC123!@#';
      const result = analyzePasswordStrength(longPassword);

      expect(result.score).toBeGreaterThanOrEqual(2); // length bonus
      expect(result.strength).toBe('strong');
    });
  });

  describe('constantTimeEquals', () => {
    it('should compare equal Buffer values', () => {
      const buf1 = Buffer.from('test-data', 'utf8');
      const buf2 = Buffer.from('test-data', 'utf8');

      expect(constantTimeEquals(buf1, buf2)).toBe(true);
    });

    it('should compare unequal Buffer values', () => {
      const buf1 = Buffer.from('data1', 'utf8');
      const buf2 = Buffer.from('data2', 'utf8');

      expect(constantTimeEquals(buf1, buf2)).toBe(false);
    });

    it('should compare equal string values', () => {
      const str1 = 'test-data';
      const str2 = 'test-data';

      expect(constantTimeEquals(str1, str2)).toBe(true);
    });

    it('should compare unequal string values', () => {
      const str1 = 'data1';
      const str2 = 'data2';

      expect(constantTimeEquals(str1, str2)).toBe(false);
    });

    it('should compare Buffer and string', () => {
      const buf = Buffer.from('test-data', 'utf8');
      const str = 'test-data';

      expect(constantTimeEquals(buf, str)).toBe(true);
    });

    it('should handle different length values', () => {
      const buf1 = Buffer.from('short', 'utf8');
      const buf2 = Buffer.from('longer-data', 'utf8');

      expect(constantTimeEquals(buf1, buf2)).toBe(false);
    });

    it('should handle empty values', () => {
      const emptyBuf1 = Buffer.alloc(0);
      const emptyBuf2 = Buffer.alloc(0);
      const emptyStr1 = '';
      const emptyStr2 = '';

      expect(constantTimeEquals(emptyBuf1, emptyBuf2)).toBe(true);
      expect(constantTimeEquals(emptyStr1, emptyStr2)).toBe(true);
      expect(constantTimeEquals(emptyBuf1, emptyStr1)).toBe(true);
    });
  });
});