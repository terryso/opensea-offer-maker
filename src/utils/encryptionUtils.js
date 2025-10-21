import { scryptSync, randomBytes, createCipheriv, createDecipheriv, createHash, timingSafeEqual } from 'crypto';
import { ENCRYPTION_CONFIG } from '../config.js';

/**
 * Derive encryption key using scrypt key derivation function
 * @param {string} password - The password for key derivation
 * @param {Buffer|string} salt - The salt for key derivation
 * @param {Object} options - scrypt parameters
 * @returns {Buffer} Derived encryption key
 */
export function deriveEncryptionKey(password, salt, options = {}) {
  const {
    iterations = ENCRYPTION_CONFIG.iterations,
    memory = ENCRYPTION_CONFIG.memory,
    parallelism = ENCRYPTION_CONFIG.parallelism,
    keyLength = ENCRYPTION_CONFIG.keyLength
  } = options;

  // Convert string salt to Buffer if needed
  const saltBuffer = typeof salt === 'string' ? Buffer.from(salt, 'utf8') : salt;

  return scryptSync(password, saltBuffer, keyLength, {
    N: iterations,
    r: 8, // blockSize (scrypt standard)
    p: parallelism,
    maxmem: memory
  });
}

/**
 * Encrypt data using AES-256-GCM with authenticated encryption
 * @param {string} data - Data to encrypt (typically a private key)
 * @param {Buffer} key - 256-bit encryption key
 * @param {Buffer} [salt] - Optional salt for additional entropy (randomly generated if not provided)
 * @returns {Object} Encrypted data with IV, authTag, and salt
 */
export function encryptData(data, key, salt = null) {
  // Generate random IV (Initialization Vector)
  const iv = randomBytes(16);

  // Generate random salt if not provided (for per-encryption uniqueness)
  const encryptionSalt = salt || randomBytes(16);

  // Create cipher
  const cipher = createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);

  // Encrypt data
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get authentication tag for integrity verification
  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    salt: encryptionSalt.toString('hex'),
    algorithm: ENCRYPTION_CONFIG.algorithm,
    timestamp: new Date().toISOString()
  };
}

/**
 * Decrypt data using AES-256-GCM with integrity verification
 * @param {Object} encryptedData - Encrypted data object
 * @param {Buffer} key - 256-bit encryption key
 * @returns {string} Decrypted data
 */
export function decryptData(encryptedData, key) {
  const { encryptedData: encrypted, iv, authTag } = encryptedData;

  // Create decipher
  const decipher = createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, Buffer.from(iv, 'hex'));

  // Set authentication tag for integrity verification
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  try {
    // Decrypt data
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    // Handle authentication failures or other decryption errors
    if (error.message.includes('auth tag')) {
      throw new Error('Decryption failed: Invalid authentication tag (possible data corruption or tampering)');
    }
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Create HMAC for data integrity verification
 * @param {string|Buffer} data - Data to sign
 * @param {Buffer} key - HMAC key
 * @returns {string} HMAC hex string
 */
export function createHMAC(data, key) {
  const hmac = createHash('sha256');
  hmac.update(key);
  const hmacKey = hmac.digest();

  const dataHmac = createHash('sha256');
  dataHmac.update(data);
  dataHmac.update(hmacKey);
  return dataHmac.digest('hex');
}

/**
 * Verify HMAC for data integrity
 * @param {string|Buffer} data - Original data
 * @param {string} expectedHmac - Expected HMAC
 * @param {Buffer} key - HMAC key
 * @returns {boolean} True if data integrity is verified
 */
export function verifyHMAC(data, expectedHmac, key) {
  try {
    const actualHmac = createHMAC(data, key);
    return timingSafeEqual(Buffer.from(actualHmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
  } catch (error) {
    return false;
  }
}

/**
 * Generate cryptographically secure random bytes as hex string
 * @param {number} byteCount - Number of bytes to generate
 * @returns {string} Hex string
 */
export function generateRandomHex(byteCount) {
  return randomBytes(byteCount).toString('hex');
}

/**
 * Securely clear sensitive data from memory
 * @param {Buffer|string} data - Sensitive data to clear
 */
export function secureClear(data) {
  if (Buffer.isBuffer(data)) {
    data.fill(0);
  } else if (typeof data === 'string') {
    // For strings, we can't directly clear the memory
    // This is a limitation of Node.js string immutability
    // In a production environment, consider using a secure string library
    return;
  }
}

/**
 * Estimate the strength of a password based on entropy
 * @param {string} password - Password to evaluate
 * @returns {Object} Password strength analysis
 */
export function analyzePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return { score: 0, feedback: 'Password is required' };
  }

  let score = 0;
  const feedback = [];

  // Length scoring
  if (password.length >= 16) {score += 2;} else if (password.length >= 12) {score += 1;} else {feedback.push('Password should be at least 12 characters long');}

  // Character variety
  if (/[a-z]/.test(password)) {score += 1;} else {feedback.push('Include lowercase letters');}

  if (/[A-Z]/.test(password)) {score += 1;} else {feedback.push('Include uppercase letters');}

  if (/[0-9]/.test(password)) {score += 1;} else {feedback.push('Include numbers');}

  if (/[^a-zA-Z0-9]/.test(password)) {score += 1;} else {feedback.push('Include special characters');}

  // Entropy calculation (simplified)
  const charset = [
    /[a-z]/.test(password) ? 26 : 0,
    /[A-Z]/.test(password) ? 26 : 0,
    /[0-9]/.test(password) ? 10 : 0,
    /[^a-zA-Z0-9]/.test(password) ? 32 : 0
  ].reduce((sum, count) => sum + count, 0);

  const entropy = password.length * Math.log2(charset);

  let strength = 'weak';
  if (entropy >= 60) {strength = 'strong';} else if (entropy >= 40) {strength = 'moderate';}

  return {
    score: Math.min(score, 6),
    entropy,
    strength,
    feedback,
    recommendation: strength === 'weak' ? 'Consider using a longer, more complex password' : 'Password strength is acceptable'
  };
}

/**
 * Constant-time comparison for timing attack protection
 * @param {string|Buffer} a - First value
 * @param {string|Buffer} b - Second value
 * @returns {boolean} True if equal
 */
export function constantTimeEquals(a, b) {
  if (Buffer.isBuffer(a) && Buffer.isBuffer(b)) {
    if (a.length !== b.length) {return false;}
    return timingSafeEqual(a, b);
  }

  // For strings, convert to buffers
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a, 'utf8');
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b, 'utf8');

  if (bufA.length !== bufB.length) {return false;}
  return timingSafeEqual(bufA, bufB);
}
