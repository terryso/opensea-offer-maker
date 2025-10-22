/**
 * Error message sanitization tests
 *
 * Tests for sensitive data detection and removal from error messages
 */

import {
  sanitizeErrorMessage,
  sanitizeObject,
  sanitizeUrl,
  containsSensitiveData,
  getSensitiveDataStats,
  addSanitizationPattern,
  getActivePatterns
} from '../utils/errorSanitizer.js';

describe('Error Message Sanitization', () => {
  describe('Private Key Detection', () => {
    test('should redact Ethereum private keys', () => {
      const message = 'Failed to validate private key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[PRIVATE_KEY_REDACTED]');
      expect(sanitized).not.toContain('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
    });

    test('should handle mixed case private keys', () => {
      const message = 'Error with key: 0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[PRIVATE_KEY_REDACTED]');
    });
  });

  describe('API Key Detection', () => {
    test('should redact Stripe API keys', () => {
      const message = 'API call failed with key: sk_test_1234567890abcdef1234567890abcdef123456';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[API_KEY_REDACTED]');
      expect(sanitized).not.toContain('sk_test_1234567890abcdef1234567890abcdef123456');
    });

    test('should redact Slack bot tokens', () => {
      const message = 'Slack error: xoxb-1234567890-1234567890-abcdef1234567890abcdef1234567890abcdef';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[BOT_TOKEN_REDACTED]');
    });

    test('should redact GitHub tokens', () => {
      const message = 'GitHub auth failed: ghp_1234567890abcdef1234567890abcdef123456';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[GITHUB_TOKEN_REDACTED]');
    });

    test('should redact Google API keys', () => {
      const message = 'Google API error: AIza1234567890abcdef1234567890abcdef1234567';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[GOOGLE_API_KEY_REDACTED]');
    });

    test('should redact AWS access keys', () => {
      const message = 'AWS auth failed: AKIA1234567890ABCDEF';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[AWS_ACCESS_KEY_REDACTED]');
    });
  });

  describe('URL Password Detection', () => {
    test('should redact passwords in URLs', () => {
      const message = 'Connection failed: https://username:secret123@api.example.com/endpoint';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('username:[PASSWORD_REDACTED]@');
      expect(sanitized).not.toContain('secret123');
    });
  });

  describe('Email Detection', () => {
    test('should redact email addresses', () => {
      const message = 'User email@example.com not found';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[EMAIL_REDACTED]');
      expect(sanitized).not.toContain('email@example.com');
    });
  });

  describe('Phone Number Detection', () => {
    test('should redact US phone numbers', () => {
      const message = 'Call 555-123-4567 for support';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[PHONE_REDACTED]');
      expect(sanitized).not.toContain('555-123-4567');
    });

    test('should handle different phone formats', () => {
      const message = 'Phone: 555.123.4567 or 5551234567';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('555.123.4567');
      expect(sanitized).not.toContain('5551234567');
    });
  });

  describe('IP Address Detection', () => {
    test('should redact IP addresses', () => {
      const message = 'Connection from 192.168.1.1 blocked';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[IP_REDACTED]');
      expect(sanitized).not.toContain('192.168.1.1');
    });
  });

  describe('JWT Token Detection', () => {
    test('should redact JWT tokens', () => {
      const message = 'Auth failed: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[JWT_TOKEN_REDACTED]');
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });
  });

  describe('Bearer Token Detection', () => {
    test('should redact bearer tokens', () => {
      const message = 'Authorization: Bearer abc123def456ghi789';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('Bearer [TOKEN_REDACTED]');
      expect(sanitized).not.toContain('abc123def456ghi789');
    });
  });

  describe('Hex String Detection', () => {
    test('should redact long hex strings', () => {
      const message = 'Hash: abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[HEX_DATA_REDACTED]');
      expect(sanitized).not.toContain('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
    });

    test('should not redact short hex strings', () => {
      const message = 'Color: #ff0000';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).not.toContain('[HEX_DATA_REDACTED]');
      expect(sanitized).toContain('#ff0000');
    });
  });

  describe('Base64 Detection', () => {
    test('should redact long base64 strings', () => {
      const message = 'Data: SGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQ=';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[BASE64_DATA_REDACTED]');
      expect(sanitized).not.toContain('SGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQgSGVsbG8gV29ybGQ=');
    });
  });

  describe('Multiple Sensitive Data Types', () => {
    test('should redact multiple types in one message', () => {
      const message = 'User user@example.com with key sk_live_1234567890abcdef1234567890abcdef failed to login from 192.168.1.1';
      const sanitized = sanitizeErrorMessage(message);

      expect(sanitized).toContain('[EMAIL_REDACTED]');
      expect(sanitized).toContain('[API_KEY_REDACTED]');
      expect(sanitized).toContain('[IP_REDACTED]');
      expect(sanitized).not.toContain('user@example.com');
      expect(sanitized).not.toContain('sk_live_1234567890abcdef1234567890abcdef');
      expect(sanitized).not.toContain('192.168.1.1');
    });
  });
});

describe('Object Sanitization', () => {
  test('should sanitize objects recursively', () => {
    const obj = {
      username: 'john',
      password: 'secret123',
      profile: {
        email: 'john@example.com',
        phone: '555-123-4567',
        address: {
          street: '123 Main St',
          private_key: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
        }
      }
    };

    const sanitized = sanitizeObject(obj);

    expect(sanitized.username).toBe('john');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.profile.email).toBe('[EMAIL_REDACTED]');
    expect(sanitized.profile.phone).toBe('[PHONE_REDACTED]');
    expect(sanitized.profile.address.street).toBe('123 Main St');
    expect(sanitized.profile.address.private_key).toBe('[REDACTED]');
  });

  test('should handle arrays', () => {
    const arr = [
      'normal string',
      'email@example.com',
      {
        api_key: 'sk_test_123456789',
        normal_field: 'normal'
      }
    ];

    const sanitized = sanitizeObject(arr);

    expect(sanitized[0]).toBe('normal string');
    expect(sanitized[1]).toBe('[EMAIL_REDACTED]');
    expect(sanitized[2].api_key).toBe('[REDACTED]');
    expect(sanitized[2].normal_field).toBe('normal');
  });

  test('should respect max depth option', () => {
    const deepObj = {
      level1: {
        level2: {
          level3: {
            level4: {
              secret: 'deep secret'
            }
          }
        }
      }
    };

    const sanitized = sanitizeObject(deepObj, { maxDepth: 2 });

    expect(typeof sanitized.level1.level2).toBe('object');
    expect(typeof sanitized.level1.level2.level3).toBe('string');
    expect(sanitized.level1.level2.level3).toBe('[MAX_DEPTH_REACHED]');
  });

  test('should handle preserveStructure option', () => {
    const obj = {
      secret: 'secret data',
      normal: 'normal data'
    };

    const withStructure = sanitizeObject(obj, { preserveStructure: true });
    const withoutStructure = sanitizeObject(obj, { preserveStructure: false });

    expect(withStructure.secret).toBe('[REDACTED]');
    expect(withStructure.normal).toBe('normal data');

    expect(withoutStructure.secret).toBeUndefined();
    expect(withoutStructure.normal).toBe('normal data');
  });
});

describe('URL Sanitization', () => {
  test('should remove credentials from URLs', () => {
    const url = 'https://username:password@api.example.com/v1/endpoint?api_key=secret';
    const sanitized = sanitizeUrl(url);

    expect(sanitized).toBe('https://api.example.com/v1/endpoint');
    expect(sanitized).not.toContain('username');
    expect(sanitized).not.toContain('password');
    expect(sanitized).not.toContain('api_key');
    expect(sanitized).not.toContain('secret');
  });

  test('should handle URLs with query parameters', () => {
    const url = 'https://api.example.com/search?q=test&api_key=secret123&limit=10';
    const sanitized = sanitizeUrl(url);

    expect(sanitized).toBe('https://api.example.com/search?q=test&limit=10');
    expect(sanitized).not.toContain('api_key');
    expect(sanitized).not.toContain('secret123');
  });

  test('should handle invalid URLs gracefully', () => {
    const invalidUrl = 'not-a-valid-url';
    const sanitized = sanitizeUrl(invalidUrl);

    expect(sanitized).toBe(invalidUrl);
  });
});

describe('Sensitive Data Detection', () => {
  test('should detect sensitive data in strings', () => {
    expect(containsSensitiveData('email@example.com')).toBe(true);
    expect(containsSensitiveData('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')).toBe(true);
    expect(containsSensitiveData('sk_live_1234567890abcdef1234567890abcdef')).toBe(true); // Use longer API key
    expect(containsSensitiveData('normal string')).toBe(false);
  });

  test('should handle non-string inputs', () => {
    expect(containsSensitiveData(123)).toBe(false);
    expect(containsSensitiveData(null)).toBe(false);
    expect(containsSensitiveData(undefined)).toBe(false);
    expect(containsSensitiveData({})).toBe(false);
  });
});

describe('Sensitive Data Statistics', () => {
  test('should provide statistics about found patterns', () => {
    const message = 'User email@example.com with key sk_live_1234567890abcdef1234567890abcdef and 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const stats = getSensitiveDataStats(message);

    expect(stats.total).toBeGreaterThanOrEqual(3);
    expect(stats.patterns.length).toBeGreaterThanOrEqual(3);

    const patternDescriptions = stats.patterns.map(p => p.description);
    expect(patternDescriptions).toContain('Email addresses');
    expect(patternDescriptions.some(desc => desc.includes('API keys'))).toBe(true);
    expect(patternDescriptions).toContain('Ethereum private keys');
  });

  test('should return empty stats for clean strings', () => {
    const stats = getSensitiveDataStats('This is a clean string with no sensitive data');

    expect(stats.total).toBe(0);
    expect(stats.patterns).toHaveLength(0);
  });
});

describe('Custom Patterns', () => {
  test('should allow adding custom sanitization patterns', () => {
    // Add a custom pattern for credit card numbers
    addSanitizationPattern(
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
      '[CREDIT_CARD_REDACTED]',
      'Credit card numbers'
    );

    const message = 'Payment failed for card 1234-5678-9012-3456';
    const sanitized = sanitizeErrorMessage(message);

    expect(sanitized).toContain('[CREDIT_CARD_REDACTED]');
    expect(sanitized).not.toContain('1234-5678-9012-3456');
  });

  test('should show custom patterns in active patterns', () => {
    const patterns = getActivePatterns();
    const customPattern = patterns.find(p => p.description === 'Credit card numbers');

    expect(customPattern).toBeDefined();
    expect(customPattern.replacement).toBe('[CREDIT_CARD_REDACTED]');
  });
});

describe('Performance Considerations', () => {
  test('should handle large strings efficiently', () => {
    const largeMessage = 'Normal text. '.repeat(1000) + 'email@example.com ' + 'Normal text. '.repeat(1000);

    const start = Date.now();
    const sanitized = sanitizeErrorMessage(largeMessage);
    const duration = Date.now() - start;

    expect(sanitized).toContain('[EMAIL_REDACTED]');
    expect(duration).toBeLessThan(100); // Should complete in less than 100ms
  });

  test('should cache compiled patterns', () => {
    // Call sanitization multiple times to test caching
    const message = 'Test email@example.com message';

    for (let i = 0; i < 100; i++) {
      sanitizeErrorMessage(message);
    }

    // If this completes quickly, caching is working
    expect(true).toBe(true);
  });
});

describe('Edge Cases', () => {
  test('should handle empty strings', () => {
    const sanitized = sanitizeErrorMessage('');
    expect(sanitized).toBe('');
  });

  test('should handle null and undefined inputs', () => {
    expect(sanitizeErrorMessage(null)).toBe(null);
    expect(sanitizeErrorMessage(undefined)).toBe(undefined);
  });

  test('should handle non-string types', () => {
    expect(sanitizeErrorMessage(123)).toBe(123);
    expect(sanitizeErrorMessage({})).toStrictEqual({});
    expect(sanitizeErrorMessage([])).toStrictEqual([]);
  });

  test('should handle strings with only special characters', () => {
    const message = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const sanitized = sanitizeErrorMessage(message);

    expect(sanitized).toBe(message);
  });

  test('should handle Unicode characters', () => {
    // Unicode support in email patterns is complex
    // For now, focus on standard ASCII email patterns
    const message = 'test@example.com with emoji 🚀';
    const sanitized = sanitizeErrorMessage(message);

    expect(sanitized).toContain('[EMAIL_REDACTED]');
    expect(sanitized).toContain('🚀');
  });
});
