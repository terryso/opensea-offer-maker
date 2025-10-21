import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ethers } from 'ethers';
import logger from './logger.js';
import { createDecipheriv, scryptSync } from 'crypto';

// Import our new secure encryption utilities
import { deriveEncryptionKey, encryptData, decryptData, secureClear } from './encryptionUtils.js';
import {
  validatePrivateKey,
  DecryptionAttemptLimiter,
  SecureMemoryManager,
  randomDelay,
  SecureSession
} from './securityUtils.js';
import { ENCRYPTION_CONFIG, encryptionValidation } from '../config.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirPath = dirname(currentFilePath);
const KEYS_FILE = path.join(currentDirPath, '../../.keys');

// Security: Attempt limiter for brute force protection
const attemptLimiter = new DecryptionAttemptLimiter();

// Security: Secure memory manager for sensitive data
const memoryManager = new SecureMemoryManager();

// Legacy constants for backward compatibility (removed from production use)
const LEGACY_SALT = Buffer.from('opensea-offer-maker-salt', 'utf8');
const LEGACY_PASSWORD = 'opensea-offer-maker-password';
const LEGACY_ALGORITHM = 'aes-256-gcm';

// Export legacy constants for migration functionality
export const ALGORITHM = LEGACY_ALGORITHM;
export const ENCRYPTION_KEY = scryptSync(LEGACY_PASSWORD, LEGACY_SALT, 32);

/**
 * Detect if key file uses old format (no version field)
 * @param {Object} keyData - Parsed key file data
 * @returns {boolean} True if old format detected
 */
function isLegacyFormat(keyData) {
  return !keyData.version || keyData.version === '1.0';
}

/**
 * Legacy key decryption using hardcoded parameters (for migration only)
 * @param {Object} keyData - Legacy encrypted key data
 * @returns {string} Decrypted private key
 */
function decryptLegacyKey(keyData) {
  const legacyKey = scryptSync(LEGACY_PASSWORD, LEGACY_SALT, 32);
  const iv = Buffer.from(keyData.iv, 'hex');
  const decipher = createDecipheriv(LEGACY_ALGORITHM, legacyKey, iv);
  decipher.setAuthTag(Buffer.from(keyData.authTag, 'hex'));

  let decrypted = decipher.update(keyData.encryptedKey, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Create backup of existing key file
 * @param {Object} originalData - Original key file data
 * @returns {string} Backup file path
 */
async function createKeyFileBackup(originalData) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(currentDirPath, `../../.keys.backup.${timestamp}`);

  try {
    await fs.writeFile(backupPath, JSON.stringify(originalData, null, 2));
    logger.info(`Created backup file: ${backupPath}`);
    return backupPath;
  } catch (error) {
    logger.error('Failed to create backup file:', error);
    throw new Error('Failed to create key file backup');
  }
}

/**
 * Migrate legacy key file to new format
 * @param {Object} legacyData - Legacy key file data
 * @param {Object} session - Secure session
 * @returns {Object} Migrated key data
 */
async function migrateLegacyKeys(legacyData, session) {
  logger.info('Starting migration of legacy encrypted keys...');

  const migratedData = {
    version: '2.0',
    encryptionParams: {
      algorithm: ENCRYPTION_CONFIG.algorithm,
      keyDerivation: 'scrypt',
      iterations: ENCRYPTION_CONFIG.iterations,
      memory: ENCRYPTION_CONFIG.memory,
      parallelism: ENCRYPTION_CONFIG.parallelism
    },
    keys: {},
    migrationInfo: {
      migratedAt: new Date().toISOString(),
      legacyVersion: '1.0'
    }
  };

  let migratedCount = 0;
  const keyNames = Object.keys(legacyData);

  for (const [index, keyName] of keyNames.entries()) {
    try {
      session.recordOperation();

      logger.info(`Migrating key ${index + 1}/${keyNames.length}: ${keyName}`);

      const keyData = legacyData[keyName];
      if (!keyData || !keyData.encryptedKey) {
        logger.warn(`Skipping invalid key: ${keyName}`);
        continue;
      }

      // Decrypt using legacy method
      const privateKey = decryptLegacyKey(keyData);

      // Validate the decrypted key
      const validation = validatePrivateKey(privateKey);
      if (!validation.isValid) {
        logger.error(`Invalid private key during migration: ${keyName}`, validation.errors);
        continue;
      }

      // Re-encrypt using new secure method
      const encryptionKey = deriveEncryptionKey(
        ENCRYPTION_CONFIG.password,
        ENCRYPTION_CONFIG.salt
      );

      const encryptedResult = encryptData(privateKey, encryptionKey);

      // Clear sensitive data immediately
      secureClear(encryptionKey);

      migratedData.keys[keyName] = {
        ...encryptedResult,
        address: keyData.address,
        isActive: keyData.isActive,
        timestamp: keyData.timestamp || new Date().toISOString()
      };

      migratedCount++;
      logger.info(`Successfully migrated key: ${keyName}`);

    } catch (error) {
      logger.error(`Failed to migrate key ${keyName}:`, error.message);
      throw new Error(`Migration failed for key ${keyName}: ${error.message}`);
    }
  }

  if (migratedCount === 0) {
    throw new Error('No valid keys found to migrate');
  }

  logger.info(`Migration completed. Successfully migrated ${migratedCount} keys.`);
  return migratedData;
}

/**
 * Load and possibly migrate key file
 * @param {Object} session - Secure session
 * @returns {Object} Key file data
 */
async function loadKeyFile(session) {
  try {
    const data = await fs.readFile(KEYS_FILE, 'utf8');
    const keyData = JSON.parse(data);

    // Check if migration is needed
    if (isLegacyFormat(keyData)) {
      logger.warn('Legacy key format detected. Starting migration...');

      // Create backup before migration
      await createKeyFileBackup(keyData);

      // Migrate to new format
      const migratedData = await migrateLegacyKeys(keyData, session);

      // Write migrated data
      await fs.writeFile(KEYS_FILE, JSON.stringify(migratedData, null, 2));

      logger.info('Key file migration completed successfully.');
      return migratedData;
    }

    return keyData;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return empty structure
      return {
        version: '2.0',
        encryptionParams: {
          algorithm: ENCRYPTION_CONFIG.algorithm,
          keyDerivation: 'scrypt',
          iterations: ENCRYPTION_CONFIG.iterations,
          memory: ENCRYPTION_CONFIG.memory,
          parallelism: ENCRYPTION_CONFIG.parallelism
        },
        keys: {}
      };
    }
    throw error;
  }
}

export class KeyManager {
  /**
   * Encrypt and store a private key using secure environment-based encryption
   * @param {string} privateKey - Private key to encrypt
   * @param {string} name - Key name (default: 'default')
   * @returns {Promise<Object>} Key information with address
   */
  static async encryptKey(privateKey, name = 'default') {
    const session = new SecureSession();
    let encryptionKey = null;

    try {
      session.recordOperation();

      // Validate private key format and strength
      const validation = validatePrivateKey(privateKey);
      if (!validation.isValid) {
        throw new Error(`Invalid private key: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        logger.warn('Private key warnings:', validation.warnings);
      }

      // Get wallet address
      const wallet = new ethers.Wallet(privateKey);
      const address = await wallet.getAddress();

      // Derive encryption key using secure scrypt
      encryptionKey = deriveEncryptionKey(
        ENCRYPTION_CONFIG.password,
        ENCRYPTION_CONFIG.salt
      );

      // Encrypt the private key
      const encryptedResult = encryptData(privateKey, encryptionKey);

      // Clear encryption key from memory immediately
      secureClear(encryptionKey);

      // Load existing key file
      const keyData = await loadKeyFile(session);

      // Check if there's already an active key
      const hasActiveKey = Object.values(keyData.keys).some(k => k.isActive);

      // Add or update the key
      keyData.keys[name] = {
        ...encryptedResult,
        address,
        isActive: !hasActiveKey && Object.keys(keyData.keys).length === 0,
        timestamp: new Date().toISOString()
      };

      // Write updated key file
      await fs.writeFile(KEYS_FILE, JSON.stringify(keyData, null, 2));

      logger.info(`Successfully encrypted and stored key "${name}" for address: ${address}`);
      return { name, address };

    } catch (error) {
      // Ensure we clear any sensitive data on error
      if (encryptionKey) {
        secureClear(encryptionKey);
      }

      logger.error('Failed to encrypt private key:', error.message);
      throw new Error(`Failed to encrypt key: ${error.message}`);
    }
  }

  /**
   * Decrypt and retrieve a private key with timing attack protection
   * @param {string} name - Key name (null for active key)
   * @returns {Promise<string>} Decrypted private key
   */
  static async decryptKey(name = null) {
    const session = new SecureSession();
    let encryptionKey = null;

    try {
      session.recordOperation();

      // Check rate limiting for brute force protection
      attemptLimiter.checkAttempts(name || 'default');

      // Load key file (handles migration if needed)
      const keyData = await loadKeyFile(session);

      // Find the requested key
      if (!name) {
        // Use active key if no name specified
        const activeEntry = Object.entries(keyData.keys).find(([, k]) => k.isActive);
        if (!activeEntry) {
          throw new Error('No active key found. Use the key command to set an active key.');
        }
        name = activeEntry[0];
      }

      const keyEntry = keyData.keys[name];
      if (!keyEntry) {
        throw new Error(`Key "${name}" not found`);
      }

      // Derive encryption key
      encryptionKey = deriveEncryptionKey(
        ENCRYPTION_CONFIG.password,
        ENCRYPTION_CONFIG.salt
      );

      // Add timing attack protection
      await randomDelay(10, 50);

      // Decrypt the private key
      let privateKey;
      try {
        privateKey = decryptData(keyEntry, encryptionKey);
      } catch (decryptError) {
        // Reset attempts on failed decryption
        attemptLimiter.resetAttempts(name);
        throw new Error(`Failed to decrypt key "${name}": ${decryptError.message}`);
      }

      // Verify the decrypted key is valid
      const validation = validatePrivateKey(privateKey);
      if (!validation.isValid) {
        secureClear(encryptionKey);
        attemptLimiter.resetAttempts(name);
        throw new Error(`Decrypted key validation failed: ${validation.errors.join(', ')}`);
      }

      // Clear encryption key from memory
      secureClear(encryptionKey);

      // Reset successful attempts
      attemptLimiter.resetAttempts(name);

      logger.debug(`Successfully decrypted key "${name}" for address: ${keyEntry.address}`);
      return privateKey;

    } catch (error) {
      // Ensure we clear any sensitive data on error
      if (encryptionKey) {
        secureClear(encryptionKey);
      }

      logger.error('Failed to decrypt private key:', error.message);
      throw error;
    }
  }

  /**
   * List all stored keys with their metadata
   * @returns {Promise<Array>} Array of key information
   */
  static async listKeys() {
    const session = new SecureSession();

    try {
      session.recordOperation();

      const keyData = await loadKeyFile(session);

      return Object.entries(keyData.keys)
        .filter(([name, data]) => data && (data.encryptedKey || data.encryptedData) && data.address)
        .map(([name, data]) => ({
          name,
          address: data.address,
          isActive: data.isActive,
          timestamp: data.timestamp,
          algorithm: keyData.encryptionParams?.algorithm || 'unknown',
          version: keyData.version || '1.0'
        }));
    } catch (error) {
      logger.error('Failed to list keys:', error.message);
      return [];
    }
  }

  /**
   * Set a key as active
   * @param {string} name - Key name to set as active
   * @returns {Promise<Object>} Updated key information
   */
  static async setActiveKey(name) {
    const session = new SecureSession();

    try {
      session.recordOperation();

      const keyData = await loadKeyFile(session);

      if (!keyData.keys[name]) {
        throw new Error(`Key "${name}" not found`);
      }

      // Set all keys to inactive
      for (const key of Object.values(keyData.keys)) {
        key.isActive = false;
      }

      // Set specified key as active
      keyData.keys[name].isActive = true;

      await fs.writeFile(KEYS_FILE, JSON.stringify(keyData, null, 2));

      logger.info(`Set key "${name}" as active for address: ${keyData.keys[name].address}`);
      return {
        name,
        address: keyData.keys[name].address
      };

    } catch (error) {
      logger.error('Failed to set active key:', error.message);
      throw new Error(`Failed to set active key: ${error.message}`);
    }
  }

  /**
   * Remove a stored key
   * @param {string} name - Key name to remove
   * @returns {Promise<void>}
   */
  static async removeKey(name) {
    const session = new SecureSession();

    try {
      session.recordOperation();

      const keyData = await loadKeyFile(session);

      if (!keyData.keys[name]) {
        throw new Error(`Key "${name}" not found`);
      }

      delete keyData.keys[name];

      // If removed key was active and other keys exist, set first key as active
      const remainingKeys = Object.keys(keyData.keys);
      if (remainingKeys.length > 0) {
        // Find if any key is already active
        const activeKey = Object.entries(keyData.keys).find(([, k]) => k.isActive);
        if (!activeKey) {
          // No active key found, set first one as active
          keyData.keys[remainingKeys[0]].isActive = true;
        }
      }

      await fs.writeFile(KEYS_FILE, JSON.stringify(keyData, null, 2));
      logger.info(`Successfully removed key: ${name}`);

    } catch (error) {
      logger.error('Failed to remove key:', error.message);
      throw new Error(`Failed to remove key: ${error.message}`);
    }
  }

  /**
   * Check if any keys are stored
   * @returns {Promise<boolean>} True if keys are stored
   */
  static async isKeyStored() {
    const session = new SecureSession();

    try {
      session.recordOperation();

      const keyData = await loadKeyFile(session);
      return Object.keys(keyData.keys).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get encryption configuration status
   * @returns {Object} Configuration information
   */
  static getEncryptionInfo() {
    return {
      algorithm: ENCRYPTION_CONFIG.algorithm,
      keyDerivation: ENCRYPTION_CONFIG.keyDerivation,
      iterations: ENCRYPTION_CONFIG.iterations,
      memory: ENCRYPTION_CONFIG.memory,
      parallelism: ENCRYPTION_CONFIG.parallelism,
      usingDefaults: encryptionValidation.isUsingDefaults,
      warnings: encryptionValidation.warnings || []
    };
  }

  /**
   * Cleanup sensitive data and reset security features
   * @returns {void}
   */
  static cleanup() {
    attemptLimiter.clearAllAttempts();
    memoryManager.clearAllBuffers();
    logger.debug('KeyManager security cleanup completed');
  }
}

// Cleanup on process exit
process.on('exit', () => {
  KeyManager.cleanup();
});

process.on('SIGINT', () => {
  KeyManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  KeyManager.cleanup();
  process.exit(0);
});