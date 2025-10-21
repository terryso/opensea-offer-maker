import dotenv from 'dotenv';
import { OPENSEA_API_KEY, ALCHEMY_API_KEY } from './utils/env.js';
import { SUPPORTED_CHAINS, FALLBACK_DEFAULT_CHAIN } from './constants/chains.js';

dotenv.config();

// Re-export environment variables
export { OPENSEA_API_KEY, ALCHEMY_API_KEY };

// Validate environment variables
if (!OPENSEA_API_KEY || !ALCHEMY_API_KEY) {
  const error = new Error('Missing environment variables. Please set OPENSEA_API_KEY and ALCHEMY_API_KEY.');
  error.code = 'ENV_MISSING';
  throw error;
}

// ===================================================================
// ENCRYPTION CONFIGURATION
// ===================================================================

// Encryption environment variables with fallback to secure defaults
// These defaults are used for backward compatibility only
// New installations should set their own values in .env
const DEFAULT_ENCRYPTION_PASSWORD = 'opensea-offer-maker-default-password-change-this';
const DEFAULT_ENCRYPTION_SALT = 'opensea-offer-maker-default-salt-change-this';

export const ENCRYPTION_PASSWORD = process.env.ENCRYPTION_PASSWORD || DEFAULT_ENCRYPTION_PASSWORD;
export const ENCRYPTION_SALT = process.env.ENCRYPTION_SALT || DEFAULT_ENCRYPTION_SALT;
export const ENCRYPTION_ITERATIONS = parseInt(process.env.ENCRYPTION_ITERATIONS || '32768', 10);
export const ENCRYPTION_MEMORY = parseInt(process.env.ENCRYPTION_MEMORY || '134217728', 10); // 128MB
export const ENCRYPTION_PARALLELISM = parseInt(process.env.ENCRYPTION_PARALLELISM || '1', 10);

// Encryption configuration object for easier access
export const ENCRYPTION_CONFIG = {
  password: ENCRYPTION_PASSWORD,
  salt: ENCRYPTION_SALT,
  iterations: ENCRYPTION_ITERATIONS,
  memory: ENCRYPTION_MEMORY,
  parallelism: ENCRYPTION_PARALLELISM,
  keyLength: 32, // 256 bits for AES-256
  algorithm: 'aes-256-gcm'
};

// Validate encryption configuration
export function validateEncryptionConfig() {
  const errors = [];

  // Password validation
  if (ENCRYPTION_PASSWORD.length < 16) {
    errors.push('ENCRYPTION_PASSWORD must be at least 16 characters long');
  }
  if (ENCRYPTION_PASSWORD === DEFAULT_ENCRYPTION_PASSWORD) {
    errors.push('Using default ENCRYPTION_PASSWORD - please set a custom password for production');
  }

  // Salt validation
  if (ENCRYPTION_SALT.length < 8) {
    errors.push('ENCRYPTION_SALT must be at least 8 characters long');
  }
  if (ENCRYPTION_SALT === DEFAULT_ENCRYPTION_SALT) {
    errors.push('Using default ENCRYPTION_SALT - please set a custom salt for production');
  }

  // Iterations validation (scrypt N parameter)
  if (ENCRYPTION_ITERATIONS < 16384) {
    errors.push('ENCRYPTION_ITERATIONS must be at least 16384 for security');
  }

  // Memory validation
  if (ENCRYPTION_MEMORY < 64 * 1024 * 1024) { // 64MB minimum
    errors.push('ENCRYPTION_MEMORY must be at least 64MB for security');
  }

  // Parallelism validation
  if (ENCRYPTION_PARALLELISM < 1 || ENCRYPTION_PARALLELISM > 32) {
    errors.push('ENCRYPTION_PARALLELISM must be between 1 and 32');
  }

  // If using defaults for backward compatibility, warn but don't fail
  const isUsingDefaults = ENCRYPTION_PASSWORD === DEFAULT_ENCRYPTION_PASSWORD ||
                          ENCRYPTION_SALT === DEFAULT_ENCRYPTION_SALT;

  if (errors.length > 0) {
    const error = new Error('Encryption configuration validation failed:\n' + errors.join('\n'));
    error.code = 'ENCRYPTION_CONFIG_INVALID';
    error.details = errors;
    throw error;
  }

  return {
    isValid: true,
    isUsingDefaults,
    warnings: isUsingDefaults ? [
      'Using default encryption parameters - consider setting custom values for better security'
    ] : []
  };
}

// Perform validation on module load (only in non-test environment)
let encryptionValidation;
try {
  encryptionValidation = validateEncryptionConfig();
} catch (error) {
  if (error.code === 'ENCRYPTION_CONFIG_INVALID' && !process.env.NODE_ENV?.includes('test')) {
    console.error('❌ Encryption Configuration Error:');
    console.error(error.details.map(d => `  • ${d}`).join('\n'));
    console.error('\n💡 To fix this, update your .env file with secure encryption parameters.');
    console.error('   See .env.example for guidance.');
    process.exit(1);
  }
  // In test environment, we want to continue and handle the error gracefully
  if (process.env.NODE_ENV?.includes('test')) {
    encryptionValidation = {
      isValid: false,
      isUsingDefaults: true,
      warnings: [`Test environment: ${error.message}`]
    };
  } else {
    throw error;
  }
}

// Export validation results for informational purposes
export { encryptionValidation };

// Re-export chain configurations
export { SUPPORTED_CHAINS };

// Default chain (fallback value if no config file)
export const DEFAULT_CHAIN = FALLBACK_DEFAULT_CHAIN;

// OpenSea API configuration
export const OPENSEA_API_BASE_URL = 'https://api.opensea.io';
export const OPENSEA_SEAPORT_ADDRESS = '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC';

// WETH ABI
export const WETH_ABI = [
  // Read-only functions
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',

  // Write functions
  'function deposit() payable',
  'function withdraw(uint256 wad)',
  'function approve(address guy, uint256 wad) returns (bool)',
  'function transfer(address dst, uint256 wad) returns (bool)',

  // Events
  'event Deposit(address indexed dst, uint256 wad)',
  'event Withdrawal(address indexed src, uint256 wad)',
  'event Approval(address indexed src, address indexed guy, uint256 wad)',
  'event Transfer(address indexed src, address indexed dst, uint256 wad)'
];

// Supported marketplaces
export const SUPPORTED_MARKETPLACES = {
  ethereum: ['opensea'],
  base: ['opensea'],
  sepolia: ['opensea']
};
