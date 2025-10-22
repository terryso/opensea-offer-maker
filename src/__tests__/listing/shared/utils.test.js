/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

import {
  parseExpirationTime,
  formatExpirationDisplay,
  parseMarketplaces,
  formatPrice,
  formatTimestamp,
  calculateTimeRemaining,
  normalizeEthAddress,
  normalizeTokenId,
  pickFields,
  omitFields,
  delay,
  retryWithBackoff
} from '../../../listing/shared/utils.js';

// Mock logger to avoid console output in tests
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

jest.unstable_mockModule('../../../utils/logger.js', () => ({
  logger: mockLogger
}));

describe('Listing Shared Utils', () => {
  describe('parseExpirationTime', () => {
    beforeEach(() => {
      // Mock Date.now to return a consistent timestamp
      jest.spyOn(Date, 'now').mockReturnValue(1609459200000); // 2021-01-01 00:00:00 UTC
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should parse days correctly', () => {
      const result = parseExpirationTime('30d');
      const expected = Math.floor(1609459200000 / 1000 + 30 * 24 * 60 * 60);
      expect(result).toBe(expected);
    });

    test('should parse hours correctly', () => {
      const result = parseExpirationTime('12h');
      const expected = Math.floor(1609459200000 / 1000 + 12 * 60 * 60);
      expect(result).toBe(expected);
    });

    test('should parse minutes correctly', () => {
      const result = parseExpirationTime('45m');
      const expected = Math.floor(1609459200000 / 1000 + 45 * 60);
      expect(result).toBe(expected);
    });

    test('should throw error for invalid format', () => {
      expect(() => parseExpirationTime('invalid')).toThrow('Invalid expiration format');
      expect(() => parseExpirationTime('30x')).toThrow('Invalid expiration format');
      expect(() => parseExpirationTime('30')).toThrow('Invalid expiration format');
    });
  });

  describe('formatExpirationDisplay', () => {
    test('should format days correctly', () => {
      expect(formatExpirationDisplay('30d')).toBe('30 days');
    });

    test('should format hours correctly', () => {
      expect(formatExpirationDisplay('12h')).toBe('12 hours');
    });

    test('should format minutes correctly', () => {
      expect(formatExpirationDisplay('45m')).toBe('45 minutes');
    });

    test('should return as-is for invalid format', () => {
      expect(formatExpirationDisplay('invalid')).toBe('invalid');
    });
  });

  describe('parseMarketplaces', () => {
    test('should parse single marketplace', () => {
      expect(parseMarketplaces('opensea')).toEqual(['opensea']);
    });

    test('should parse multiple marketplaces', () => {
      expect(parseMarketplaces('opensea,rarible')).toEqual(['opensea', 'rarible']);
    });

    test('should handle whitespace', () => {
      expect(parseMarketplaces(' opensea , rarible ')).toEqual(['opensea', 'rarible']);
    });

    test('should handle empty input', () => {
      expect(parseMarketplaces('')).toEqual([]);
      expect(parseMarketplaces(null)).toEqual([]);
      expect(parseMarketplaces(undefined)).toEqual([]);
    });

    test('should convert to lowercase', () => {
      expect(parseMarketplaces('OpenSea,RARIBLE')).toEqual(['opensea', 'rarible']);
    });
  });

  describe('formatPrice', () => {
    test('should format valid price', () => {
      expect(formatPrice(1.23456789)).toBe('1.234568 ETH');
    });

    test('should use custom decimals', () => {
      expect(formatPrice(1.23456789, 2)).toBe('1.23 ETH');
    });

    test('should handle invalid price', () => {
      expect(formatPrice(NaN)).toBe('0 ETH');
      expect(formatPrice('invalid')).toBe('0 ETH');
      expect(formatPrice(null)).toBe('0 ETH');
      expect(formatPrice(undefined)).toBe('0 ETH');
    });
  });

  describe('formatTimestamp', () => {
    test('should format timestamp to readable date', () => {
      const timestamp = 1609459200; // 2021-01-01 00:00:00 UTC
      const result = formatTimestamp(timestamp);
      expect(result).toContain('2021');
    });
  });

  describe('calculateTimeRemaining', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(1609459200000);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('should calculate time remaining for future timestamp', () => {
      const futureTimestamp = Math.floor(1609459200000 / 1000) + 2 * 24 * 60 * 60 + 3 * 60 * 60 + 45 * 60;
      const result = calculateTimeRemaining(futureTimestamp);

      expect(result.days).toBe(2);
      expect(result.hours).toBe(3);
      expect(result.minutes).toBe(45);
      expect(result.formatted).toBe('2d 3h 45m');
    });

    test('should handle past timestamp', () => {
      const pastTimestamp = Math.floor(1609459200000 / 1000) - 1000;
      const result = calculateTimeRemaining(pastTimestamp);

      expect(result.totalSeconds).toBe(0);
      expect(result.days).toBe(0);
      expect(result.hours).toBe(0);
      expect(result.minutes).toBe(0);
      expect(result.formatted).toBe('0m');
    });

    test('should format minutes only', () => {
      const futureTimestamp = Math.floor(1609459200000 / 1000) + 45 * 60;
      const result = calculateTimeRemaining(futureTimestamp);

      expect(result.formatted).toBe('45m');
    });
  });

  describe('normalizeEthAddress', () => {
    test('should normalize valid address', () => {
      expect(normalizeEthAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });

    test('should handle whitespace', () => {
      expect(normalizeEthAddress(' 0xABCDEF1234567890ABCDEF1234567890ABCDEF12 ')).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });

    test('should throw error for invalid address', () => {
      expect(() => normalizeEthAddress('invalid')).toThrow('Invalid Ethereum address format');
      expect(() => normalizeEthAddress('0xinvalid')).toThrow('Invalid Ethereum address format');
      expect(() => normalizeEthAddress('ABCDEF1234567890ABCDEF1234567890ABCDEF12')).toThrow('Invalid Ethereum address format');
      expect(() => normalizeEthAddress('')).toThrow('Invalid address: must be a non-empty string');
      expect(() => normalizeEthAddress(null)).toThrow('Invalid address: must be a non-empty string');
      expect(() => normalizeEthAddress(undefined)).toThrow('Invalid address: must be a non-empty string');
    });
  });

  describe('normalizeTokenId', () => {
    test('should normalize integer token ID', () => {
      expect(normalizeTokenId(123)).toBe('123');
      expect(normalizeTokenId('123')).toBe('123');
    });

    test('should normalize hex token ID', () => {
      expect(normalizeTokenId('0x7B')).toBe('0x7B');
      expect(normalizeTokenId('0x7b')).toBe('0x7b');
    });

    test('should throw error for invalid token ID', () => {
      expect(() => normalizeTokenId(null)).toThrow('Token ID cannot be null or undefined');
      expect(() => normalizeTokenId(undefined)).toThrow('Token ID cannot be null or undefined');
      expect(() => normalizeTokenId('')).toThrow('Token ID cannot be empty');
      expect(() => normalizeTokenId('invalid')).toThrow('Invalid token ID format');
      expect(() => normalizeTokenId(-1)).toThrow('Invalid token ID format');
    });
  });

  describe('pickFields', () => {
    test('should pick specified fields', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pickFields(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    test('should handle non-existent fields', () => {
      const obj = { a: 1, b: 2 };
      expect(pickFields(obj, ['a', 'd'])).toEqual({ a: 1 });
    });

    test('should handle empty fields array', () => {
      const obj = { a: 1, b: 2 };
      expect(pickFields(obj, [])).toEqual({});
    });
  });

  describe('omitFields', () => {
    test('should omit specified fields', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omitFields(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });

    test('should handle non-existent fields', () => {
      const obj = { a: 1, b: 2 };
      expect(omitFields(obj, ['d'])).toEqual({ a: 1, b: 2 });
    });

    test('should handle empty fields array', () => {
      const obj = { a: 1, b: 2 };
      expect(omitFields(obj, [])).toEqual({ a: 1, b: 2 });
    });
  });

  describe('delay', () => {
    test('should delay execution', async () => {
      const startTime = Date.now();
      await delay(100);
      const endTime = Date.now();
      expect(endTime - startTime).toBeGreaterThanOrEqual(90);
    });
  });

  describe('retryWithBackoff', () => {
    test('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(mockFn);
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should retry on failure', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('failure'))
        .mockResolvedValue('success');

      const result = await retryWithBackoff(mockFn, 2, 10);
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    test('should throw after max retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('failure'));

      await expect(retryWithBackoff(mockFn, 2, 10)).rejects.toThrow('failure');
      expect(mockFn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    test('should use exponential backoff', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('failure1'))
        .mockRejectedValueOnce(new Error('failure2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await retryWithBackoff(mockFn, 3, 50);
      const endTime = Date.now();

      // Should have delayed: 50ms (1st retry) + 100ms (2nd retry)
      expect(endTime - startTime).toBeGreaterThanOrEqual(140);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });
});
