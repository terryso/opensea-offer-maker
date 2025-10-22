/**
 * Utility functions for listing operations
 * Pure functions for common operations like time parsing, formatting, etc.
 */

import { logger } from '../../utils/logger.js';

/**
 * Parse expiration time string to timestamp
 * @param {string} expiration - Expiration time string (e.g., "30d", "12h", "45m")
 * @returns {number} Unix timestamp for expiration
 */
export function parseExpirationTime(expiration) {
  const match = expiration.match(/^(\d+)([dhm])$/);
  if (!match) {
    throw new Error('Invalid expiration format. Use format like "30d" for days, "12h" for hours, or "45m" for minutes');
  }

  const [, timeValue, timeUnit] = match;
  const timeValueNum = parseInt(timeValue, 10);

  const expirationSeconds = timeUnit === 'd'
    ? timeValueNum * 24 * 60 * 60
    : timeUnit === 'h'
      ? timeValueNum * 60 * 60
      : timeValueNum * 60;  // minutes

  const expirationTime = Math.floor(Date.now() / 1000 + expirationSeconds);

  logger.debug(`Parsed expiration: ${expiration} -> ${expirationTime} (unix timestamp)`);

  return expirationTime;
}

/**
 * Format expiration time for display
 * @param {string} expiration - Expiration time string (e.g., "30d", "12h", "45m")
 * @returns {string} Formatted display string
 */
export function formatExpirationDisplay(expiration) {
  const match = expiration.match(/^(\d+)([dhm])$/);
  if (!match) {
    return expiration; // Return as-is if format is unexpected
  }

  const [, timeValue, timeUnit] = match;

  return timeUnit === 'd' ? `${timeValue} days` :
    timeUnit === 'h' ? `${timeValue} hours` :
      `${timeValue} minutes`;
}

/**
 * Parse marketplace list string to array
 * @param {string} marketplacesStr - Comma-separated marketplaces string
 * @returns {Array<string>} Array of marketplace names
 */
export function parseMarketplaces(marketplacesStr) {
  if (!marketplacesStr) {
    return [];
  }

  return marketplacesStr
    .toLowerCase()
    .split(',')
    .map(m => m.trim())
    .filter(m => m.length > 0);
}

/**
 * Format price for display with proper precision
 * @param {number} price - Price in ETH
 * @param {number} decimals - Number of decimal places to show
 * @returns {string} Formatted price string
 */
export function formatPrice(price, decimals = 6) {
  if (typeof price !== 'number' || isNaN(price)) {
    return '0 ETH';
  }

  return `${price.toFixed(decimals)} ETH`;
}

/**
 * Format timestamp to readable date
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date string
 */
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString();
}

/**
 * Calculate time remaining from timestamp
 * @param {number} timestamp - Unix timestamp
 * @returns {Object} Time remaining breakdown
 */
export function calculateTimeRemaining(timestamp) {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, timestamp - now);

  const days = Math.floor(remaining / (24 * 60 * 60));
  const hours = Math.floor((remaining % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((remaining % (60 * 60)) / 60);

  return {
    totalSeconds: remaining,
    days,
    hours,
    minutes,
    formatted: formatTimeRemaining(days, hours, minutes)
  };
}

/**
 * Format time remaining for display
 * @param {number} days - Number of days
 * @param {number} hours - Number of hours
 * @param {number} minutes - Number of minutes
 * @returns {string} Formatted time remaining string
 */
function formatTimeRemaining(days, hours, minutes) {
  const parts = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(' ');
}

/**
 * Validate and normalize Ethereum address
 * @param {string} address - Ethereum address
 * @returns {string} Normalized lowercase address
 */
export function normalizeEthAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('Invalid address: must be a non-empty string');
  }

  // Remove whitespace and convert to lowercase
  const normalized = address.trim().toLowerCase();

  // Basic validation
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    throw new Error('Invalid Ethereum address format');
  }

  return normalized;
}

/**
 * Validate and normalize token ID
 * @param {string|number} tokenId - Token ID
 * @returns {string} Normalized token ID as string
 */
export function normalizeTokenId(tokenId) {
  if (tokenId === null || tokenId === undefined) {
    throw new Error('Token ID cannot be null or undefined');
  }

  // Convert to string
  const tokenIdStr = tokenId.toString();

  if (!tokenIdStr || tokenIdStr.length === 0) {
    throw new Error('Token ID cannot be empty');
  }

  // Validate format (positive integer or hex)
  const intRegex = /^\d+$/;
  const hexRegex = /^0x[a-fA-F0-9]+$/;

  if (!intRegex.test(tokenIdStr) && !hexRegex.test(tokenIdStr)) {
    throw new Error('Invalid token ID format. Must be a positive integer or hex string');
  }

  return tokenIdStr;
}

/**
 * Create a safe copy of an object with selected fields
 * @param {Object} obj - Source object
 * @param {Array<string>} fields - Fields to include
 * @returns {Object} New object with only selected fields
 */
export function pickFields(obj, fields) {
  const result = {};
  for (const field of fields) {
    if (obj[field] !== undefined) {
      result[field] = obj[field];
    }
  }
  return result;
}

/**
 * Create a safe copy of an object excluding selected fields
 * @param {Object} obj - Source object
 * @param {Array<string>} fields - Fields to exclude
 * @returns {Object} New object without selected fields
 */
export function omitFields(obj, fields) {
  const result = { ...obj };
  for (const field of fields) {
    delete result[field];
  }
  return result;
}

/**
 * Delay execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Function result
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      const delayMs = baseDelay * Math.pow(2, attempt);
      logger.debug(`Retrying after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await delay(delayMs);
    }
  }

  throw lastError;
}