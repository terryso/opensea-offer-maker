/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

import {
  validateOptions,
  validateMarketplaces,
  validatePricingOptions,
  validateFloorDiffFormat,
  validateProfitMarginFormat,
  validateProfitPercentFormat,
  validateExpirationFormat,
  validateEthAddress,
  validateTokenId
} from '../../../listing/shared/validators.js';

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

describe('Listing Shared Validators', () => {
  describe('validateOptions', () => {
    test('should validate valid interactive options', () => {
      const options = {
        interactive: true,
        marketplaces: 'opensea',
        expiration: '30d'
      };

      const result = validateOptions(options);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should reject interactive mode with address/token-id', () => {
      const options = {
        interactive: true,
        address: '0x123...',
        tokenId: '123'
      };

      const result = validateOptions(options);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cannot use --interactive with --address or --token-id. Choose either interactive mode or manual input.');
    });

    test('should validate valid direct mode options', () => {
      const options = {
        interactive: false,
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenId: '123',
        price: '1.5',
        marketplaces: 'opensea',
        expiration: '30d'
      };

      const result = validateOptions(options);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should require address and token-id in direct mode', () => {
      const options = {
        interactive: false,
        marketplaces: 'opensea'
      };

      const result = validateOptions(options);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('--address is required in direct mode');
      expect(result.errors).toContain('--token-id is required in direct mode');
    });

    test('should require pricing options in direct mode', () => {
      const options = {
        interactive: false,
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenId: '123',
        marketplaces: 'opensea'
      };

      const result = validateOptions(options);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
    });
  });

  describe('validateMarketplaces', () => {
    test('should validate opensea marketplace', () => {
      const result = validateMarketplaces('opensea');
      expect(result.isValid).toBe(true);
      expect(result.marketplaces).toEqual(['opensea']);
    });

    test('should reject empty marketplaces', () => {
      const result = validateMarketplaces('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Marketplaces cannot be empty');
    });

    test('should reject invalid marketplaces', () => {
      const result = validateMarketplaces('invalid,another');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid marketplaces: invalid, another');
    });

    test('should handle mixed case', () => {
      const result = validateMarketplaces('OpenSea');
      expect(result.isValid).toBe(true);
      expect(result.marketplaces).toEqual(['opensea']);
    });
  });

  describe('validatePricingOptions', () => {
    test('should validate single pricing option', () => {
      const options = { price: '1.5' };
      const result = validatePricingOptions(options);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should reject no pricing options', () => {
      const options = {};
      const result = validatePricingOptions(options);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
    });

    test('should reject multiple pricing options', () => {
      const options = { price: '1.5', floorDiff: '+0.1' };
      const result = validatePricingOptions(options);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Cannot use multiple pricing options at the same time. Choose only one: --price, --floor-diff, --profit-margin, or --profit-percent');
    });

    test('should validate floor-diff format', () => {
      const options = { floorDiff: 'invalid' };
      const result = validatePricingOptions(options);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid floor-diff format. Use format like "+0.1", "-0.1", "+10%", or "-5%"');
    });

    test('should validate profit-margin format', () => {
      const options = { profitMargin: 'invalid' };
      const result = validatePricingOptions(options);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid profit-margin value. Must be a number (e.g., 0.01)');
    });

    test('should validate profit-percent format', () => {
      const options = { profitPercent: 'invalid' };
      const result = validatePricingOptions(options);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid profit-percent value. Must be a number (e.g., 10 for 10%)');
    });
  });

  describe('validateFloorDiffFormat', () => {
    test('should validate positive absolute diff', () => {
      const result = validateFloorDiffFormat('+0.1');
      expect(result.isValid).toBe(true);
      expect(result.sign).toBe('+');
      expect(result.value).toBe(0.1);
      expect(result.isPercentage).toBe(false);
    });

    test('should validate negative absolute diff', () => {
      const result = validateFloorDiffFormat('-0.05');
      expect(result.isValid).toBe(true);
      expect(result.sign).toBe('-');
      expect(result.value).toBe(0.05);
      expect(result.isPercentage).toBe(false);
    });

    test('should validate positive percentage diff', () => {
      const result = validateFloorDiffFormat('+10%');
      expect(result.isValid).toBe(true);
      expect(result.sign).toBe('+');
      expect(result.value).toBe(10);
      expect(result.isPercentage).toBe(true);
    });

    test('should validate negative percentage diff', () => {
      const result = validateFloorDiffFormat('-5%');
      expect(result.isValid).toBe(true);
      expect(result.sign).toBe('-');
      expect(result.value).toBe(5);
      expect(result.isPercentage).toBe(true);
    });

    test('should reject empty diff', () => {
      const result = validateFloorDiffFormat('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Floor difference cannot be empty');
    });

    test('should reject invalid format', () => {
      const result = validateFloorDiffFormat('invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid floor-diff format. Use format like "+0.1", "-0.1", "+10%", or "-5%"');
    });

    test('should reject negative values', () => {
      const result = validateFloorDiffFormat('+-0.1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid floor-diff format. Use format like "+0.1", "-0.1", "+10%", or "-5%"');
    });
  });

  describe('validateProfitMarginFormat', () => {
    test('should validate valid margin', () => {
      const result = validateProfitMarginFormat('0.01');
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(0.01);
    });

    test('should reject empty margin', () => {
      const result = validateProfitMarginFormat('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Profit margin cannot be empty');
    });

    test('should reject invalid margin', () => {
      const result = validateProfitMarginFormat('invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid profit-margin value. Must be a number (e.g., 0.01)');
    });
  });

  describe('validateProfitPercentFormat', () => {
    test('should validate valid percent', () => {
      const result = validateProfitPercentFormat('10');
      expect(result.isValid).toBe(true);
      expect(result.value).toBe(10);
    });

    test('should reject empty percent', () => {
      const result = validateProfitPercentFormat('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Profit percentage cannot be empty');
    });

    test('should reject invalid percent', () => {
      const result = validateProfitPercentFormat('invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid profit-percent value. Must be a number (e.g., 10 for 10%)');
    });
  });

  describe('validateExpirationFormat', () => {
    test('should validate days', () => {
      const result = validateExpirationFormat('30d');
      expect(result.isValid).toBe(true);
      expect(result.amount).toBe(30);
      expect(result.unit).toBe('d');
    });

    test('should validate hours', () => {
      const result = validateExpirationFormat('12h');
      expect(result.isValid).toBe(true);
      expect(result.amount).toBe(12);
      expect(result.unit).toBe('h');
    });

    test('should validate minutes', () => {
      const result = validateExpirationFormat('45m');
      expect(result.isValid).toBe(true);
      expect(result.amount).toBe(45);
      expect(result.unit).toBe('m');
    });

    test('should reject empty expiration', () => {
      const result = validateExpirationFormat('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Expiration time cannot be empty');
    });

    test('should reject invalid format', () => {
      const result = validateExpirationFormat('invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid expiration format. Use format like "30d" (days), "12h" (hours), or "45m" (minutes)');
    });

    test('should reject zero or negative values', () => {
      const result = validateExpirationFormat('0d');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Expiration time must be greater than 0');
    });
  });

  describe('validateEthAddress', () => {
    test('should validate valid address', () => {
      const result = validateEthAddress('0xabcdef1234567890abcdef1234567890abcdef12');
      expect(result.isValid).toBe(true);
      expect(result.address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });

    test('should handle uppercase address', () => {
      const result = validateEthAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
      expect(result.isValid).toBe(true);
      expect(result.address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });

    test('should reject empty address', () => {
      const result = validateEthAddress('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Address cannot be empty');
    });

    test('should reject invalid format', () => {
      const result = validateEthAddress('invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid Ethereum address format. Must start with 0x followed by 40 hex characters');
    });

    test('should reject address without 0x prefix', () => {
      const result = validateEthAddress('abcdef1234567890abcdef1234567890abcdef12');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid Ethereum address format. Must start with 0x followed by 40 hex characters');
    });
  });

  describe('validateTokenId', () => {
    test('should validate integer token ID', () => {
      const result = validateTokenId('123');
      expect(result.isValid).toBe(true);
      expect(result.tokenId).toBe('123');
    });

    test('should validate hex token ID', () => {
      const result = validateTokenId('0x7B');
      expect(result.isValid).toBe(true);
      expect(result.tokenId).toBe('0x7B');
    });

    test('should reject empty token ID', () => {
      const result = validateTokenId('');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Token ID cannot be empty');
    });

    test('should reject invalid format', () => {
      const result = validateTokenId('invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid token ID format. Must be a positive integer or hex string (e.g., 123 or 0x7b)');
    });

    test('should reject negative integer', () => {
      const result = validateTokenId('-1');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid token ID format. Must be a positive integer or hex string (e.g., 123 or 0x7b)');
    });
  });
});
