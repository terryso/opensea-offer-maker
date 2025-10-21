/**
 * Error message sanitization system
 *
 * This module provides secure sanitization of error messages to prevent
 * leakage of sensitive information like private keys, API keys, passwords, etc.
 */

/**
 * Sensitive data patterns for detection and replacement
 */
const SENSITIVE_PATTERNS = [
  // Private keys (0x + 64 hex chars) - most specific first
  {
    pattern: /0x[a-fA-F0-9]{64}/gi,
    replacement: '[PRIVATE_KEY_REDACTED]',
    description: 'Ethereum private keys'
  },

  // JWT tokens (very specific pattern)
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi,
    replacement: '[JWT_TOKEN_REDACTED]',
    description: 'JWT tokens'
  },

  // API keys - specific formats first, then generic
  {
    pattern: /sk_(live|test)_[a-zA-Z0-9]{24,}/gi,
    replacement: '[API_KEY_REDACTED]',
    description: 'Stripe API keys'
  },
  {
    pattern: /xoxb-[0-9]{10,}-[0-9]{10,}-[a-zA-Z0-9]{24}/gi,
    replacement: '[BOT_TOKEN_REDACTED]',
    description: 'Slack bot tokens'
  },
  {
    pattern: /ghp_[a-zA-Z0-9]{36}/gi,
    replacement: '[GITHUB_TOKEN_REDACTED]',
    description: 'GitHub personal access tokens'
  },
  {
    pattern: /gho_[a-zA-Z0-9]{36}/gi,
    replacement: '[GITHUB_TOKEN_REDACTED]',
    description: 'GitHub OAuth tokens'
  },
  {
    pattern: /ghu_[a-zA-Z0-9]{36}/gi,
    replacement: '[GITHUB_TOKEN_REDACTED]',
    description: 'GitHub user tokens'
  },
  {
    pattern: /ghs_[a-zA-Z0-9]{36}/gi,
    replacement: '[GITHUB_TOKEN_REDACTED]',
    description: 'GitHub server tokens'
  },
  {
    pattern: /ghr_[a-zA-Z0-9]{36}/gi,
    replacement: '[GITHUB_TOKEN_REDACTED]',
    description: 'GitHub refresh tokens'
  },
  {
    pattern: /AIza[0-9A-Za-z_-]{35}/gi,
    replacement: '[GOOGLE_API_KEY_REDACTED]',
    description: 'Google API keys'
  },
  {
    pattern: /AKIA[0-9A-Z]{16}/gi,
    replacement: '[AWS_ACCESS_KEY_REDACTED]',
    description: 'AWS access keys'
  },

  // Passwords in URLs
  {
    pattern: /\/\/([^:]+):([^@]+)@/gi,
    replacement: '//$1:[PASSWORD_REDACTED]@',
    description: 'URL passwords'
  },

  // Email addresses (more precise pattern)
  {
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi,
    replacement: '[EMAIL_REDACTED]',
    description: 'Email addresses'
  },

  // Phone numbers (US format)
  {
    pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
    description: 'US phone numbers'
  },

  // IP addresses (basic detection)
  {
    pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
    replacement: '[IP_REDACTED]',
    description: 'IP addresses'
  },

  // JWT tokens (basic pattern)
  {
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi,
    replacement: '[JWT_TOKEN_REDACTED]',
    description: 'JWT tokens'
  },

  // Bearer tokens
  {
    pattern: /Bearer\s+[a-zA-Z0-9_-]+/gi,
    replacement: 'Bearer [TOKEN_REDACTED]',
    description: 'Bearer tokens'
  },

  // Hex strings that might be sensitive (64+ chars, but not private keys)
  {
    pattern: /\b[a-fA-F0-9]{64,}\b(?!(?:.*0x))/gi,
    replacement: '[HEX_DATA_REDACTED]',
    description: 'Long hex strings'
  },

  // Base64 encoded data that might be sensitive (80+ chars)
  {
    pattern: /[A-Za-z0-9+/]{80,}={0,2}/gi,
    replacement: '[BASE64_DATA_REDACTED]',
    description: 'Long base64 strings'
  }
];

/**
 * Cache for compiled regex patterns (performance optimization)
 */
const COMPILED_PATTERNS = new Map();

/**
 * Get compiled regex pattern with caching
 * @param {RegExp} pattern - Regex pattern
 * @returns {RegExp} Compiled pattern
 */
function getCompiledPattern(pattern) {
  const patternStr = pattern.toString();

  if (!COMPILED_PATTERNS.has(patternStr)) {
    COMPILED_PATTERNS.set(patternStr, new RegExp(pattern.source, pattern.flags));
  }

  return COMPILED_PATTERNS.get(patternStr);
}

/**
 * Sanitize a string message by removing sensitive information
 * @param {string} message - Message to sanitize
 * @returns {string} Sanitized message
 */
export function sanitizeErrorMessage(message) {
  if (typeof message !== 'string') {
    return message;
  }

  let sanitized = message;

  // Apply all sanitization patterns
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    const compiledPattern = getCompiledPattern(pattern);
    sanitized = sanitized.replace(compiledPattern, replacement);
  }

  return sanitized;
}

/**
 * Sanitize an object recursively
 * @param {any} data - Data to sanitize
 * @param {Object} options - Sanitization options
 * @returns {any} Sanitized data
 */
export function sanitizeObject(data, options = {}) {
  const {
    maxDepth = 10,
    currentDepth = 0,
    preserveStructure = true
  } = options;

  // Prevent infinite recursion
  if (currentDepth > maxDepth) {
    return preserveStructure ? '[MAX_DEPTH_REACHED]' : null;
  }

  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle strings
  if (typeof data === 'string') {
    return sanitizeErrorMessage(data);
  }

  // Handle numbers and booleans (leave unchanged)
  if (typeof data !== 'object') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeObject(item, {
      ...options,
      currentDepth: currentDepth + 1
    }));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized = {};

    for (const [key, value] of Object.entries(data)) {
      // Skip potentially sensitive keys entirely
      if (isSensitiveKey(key)) {
        if (preserveStructure) {
          sanitized[key] = '[REDACTED]';
        }
        continue;
      }

      // Recursively sanitize the value
      sanitized[key] = sanitizeObject(value, {
        ...options,
        currentDepth: currentDepth + 1
      });
    }

    return sanitized;
  }

  return data;
}

/**
 * Check if a key name suggests sensitive data
 * @param {string} key - Key name to check
 * @returns {boolean} True if key appears to be sensitive
 */
function isSensitiveKey(key) {
  if (typeof key !== 'string') {
    return false;
  }

  const sensitiveKeywords = [
    'password', 'passwd', 'pwd',
    'secret', 'private', 'confidential',
    'token', 'key', 'api', 'auth',
    'credential', 'credentials',
    'privatekey', 'private_key', 'private-key',
    'apikey', 'api_key', 'api-key',
    'accesstoken', 'access_token', 'access-token',
    'refreshtoken', 'refresh_token', 'refresh-token'
  ];

  const lowerKey = key.toLowerCase();
  return sensitiveKeywords.some(keyword => lowerKey.includes(keyword));
}

/**
 * Sanitize URL by removing credentials and sensitive parameters
 * @param {string} url - URL to sanitize
 * @returns {string} Sanitized URL
 */
export function sanitizeUrl(url) {
  if (typeof url !== 'string') {
    return url;
  }

  try {
    const urlObj = new URL(url);

    // Remove credentials from URL
    urlObj.username = '';
    urlObj.password = '';

    // Remove sensitive query parameters
    const sensitiveParams = ['api_key', 'apikey', 'token', 'secret', 'password'];
    sensitiveParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });

    return urlObj.toString();
  } catch {
    // If URL parsing fails, just apply general sanitization
    return sanitizeErrorMessage(url);
  }
}

/**
 * Check if a string contains sensitive information
 * @param {string} str - String to check
 * @returns {boolean} True if sensitive data detected
 */
export function containsSensitiveData(str) {
  if (typeof str !== 'string') {
    return false;
  }

  return SENSITIVE_PATTERNS.some(({ pattern }) => {
    const compiledPattern = getCompiledPattern(pattern);
    return compiledPattern.test(str);
  });
}

/**
 * Get statistics about sensitive data patterns found
 * @param {string} str - String to analyze
 * @returns {Object} Statistics about found patterns
 */
export function getSensitiveDataStats(str) {
  if (typeof str !== 'string') {
    return { total: 0, patterns: [] };
  }

  const stats = { total: 0, patterns: [] };

  for (const { pattern, description, replacement } of SENSITIVE_PATTERNS) {
    const compiledPattern = getCompiledPattern(pattern);
    const matches = str.match(compiledPattern);

    if (matches) {
      stats.patterns.push({
        description,
        count: matches.length,
        replacement
      });
      stats.total += matches.length;
    }
  }

  return stats;
}

/**
 * Add custom sanitization pattern
 * @param {RegExp} pattern - Regex pattern to add
 * @param {string} replacement - Replacement string
 * @param {string} description - Description of the pattern
 */
export function addSanitizationPattern(pattern, replacement, description = 'Custom pattern') {
  SENSITIVE_PATTERNS.unshift({
    pattern,
    replacement,
    description
  });

  // Clear cache to ensure new pattern is used
  COMPILED_PATTERNS.clear();
}

// Clear the cache to ensure updated patterns are used
COMPILED_PATTERNS.clear();

/**
 * Get all active sanitization patterns (for debugging)
 * @returns {Array} Array of active patterns
 */
export function getActivePatterns() {
  return [...SENSITIVE_PATTERNS];
}

export default {
  sanitizeErrorMessage,
  sanitizeObject,
  sanitizeUrl,
  containsSensitiveData,
  getSensitiveDataStats,
  addSanitizationPattern,
  getActivePatterns
};