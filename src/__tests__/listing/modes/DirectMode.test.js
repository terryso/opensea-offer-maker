/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Mock logger to avoid console output in tests
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockValidatePricingOptions = jest.fn();
const mockCreateListingData = jest.fn();
const mockCalculateListingPrice = jest.fn();
const mockGetListingInformation = jest.fn();
const mockExecuteOpenSeaListing = jest.fn();
const mockHandleListingConfirmation = jest.fn();

jest.unstable_mockModule('../../../utils/logger.js', () => ({
  logger: mockLogger
}));

// Mock validators
jest.unstable_mockModule('../../../listing/shared/validators.js', () => ({
  validatePricingOptions: mockValidatePricingOptions
}));

// Mock orchestrator
jest.unstable_mockModule('../../../listing/orchestrator.js', () => ({
  createListingData: mockCreateListingData,
  calculateListingPrice: mockCalculateListingPrice,
  getListingInformation: mockGetListingInformation,
  executeOpenSeaListing: mockExecuteOpenSeaListing,
  handleListingConfirmation: mockHandleListingConfirmation
}));

const {
  validateDirectModeParameters,
  extractListingParameters,
  getPricingMethodAndValue,
  executeDirectMode
} = await import('../../../listing/modes/DirectMode.js');

describe('Direct Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDirectModeParameters', () => {
    test('should validate valid direct mode parameters', async () => {
      const { validatePricingOptions } = await import('../../../listing/shared/validators.js');
      validatePricingOptions.mockReturnValue({ isValid: true, errors: [] });

      const options = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenId: '123',
        price: '1.5'
      };

      const result = validateDirectModeParameters(options);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should reject missing address', async () => {
      const { validatePricingOptions } = await import('../../../listing/shared/validators.js');
      validatePricingOptions.mockReturnValue({ isValid: true, errors: [] });

      const options = {
        tokenId: '123',
        price: '1.5'
      };

      const result = validateDirectModeParameters(options);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('--address is required in direct mode');
    });

    test('should reject missing token ID', async () => {
      const { validatePricingOptions } = await import('../../../listing/shared/validators.js');
      validatePricingOptions.mockReturnValue({ isValid: true, errors: [] });

      const options = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        price: '1.5'
      };

      const result = validateDirectModeParameters(options);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('--token-id is required in direct mode');
    });

    test('should include pricing validation errors', async () => {
      const { validatePricingOptions } = await import('../../../listing/shared/validators.js');
      validatePricingOptions.mockReturnValue({
        isValid: false,
        errors: ['Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent']
      });

      const options = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenId: '123'
      };

      const result = validateDirectModeParameters(options);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
    });
  });

  describe('extractListingParameters', () => {
    test('should extract all listing parameters', () => {
      const options = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenId: '123',
        price: '1.5',
        expiration: '30d',
        marketplaces: 'opensea',
        payOptionalRoyalties: true,
        skipConfirm: true
      };

      const result = extractListingParameters(options);

      expect(result).toEqual({
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenId: '123',
        price: '1.5',
        floorDiff: undefined,
        profitMargin: undefined,
        profitPercent: undefined,
        expiration: '30d',
        marketplaces: 'opensea',
        payOptionalRoyalties: true,
        skipConfirm: true
      });
    });

    test('should use default values', () => {
      const options = {
        address: '0xabcdef1234567890abcdef1234567890abcdef12',
        tokenId: '123',
        price: '1.5'
      };

      const result = extractListingParameters(options);

      expect(result.expiration).toBe('1h');
      expect(result.marketplaces).toBe('opensea');
      expect(result.payOptionalRoyalties).toBe(false);
      expect(result.skipConfirm).toBe(false);
    });
  });

  describe('getPricingMethodAndValue', () => {
    test('should return absolute pricing method', () => {
      const options = { price: '1.5' };
      const result = getPricingMethodAndValue(options);

      expect(result.method).toBe('absolute');
      expect(result.value).toBe('1.5');
    });

    test('should return floor-diff pricing method', () => {
      const options = { floorDiff: '+0.1' };
      const result = getPricingMethodAndValue(options);

      expect(result.method).toBe('floor-diff');
      expect(result.value).toBe('+0.1');
    });

    test('should return profit-margin pricing method', () => {
      const options = { profitMargin: '0.1' };
      const result = getPricingMethodAndValue(options);

      expect(result.method).toBe('profit-margin');
      expect(result.value).toBe('0.1');
    });

    test('should return profit-percent pricing method', () => {
      const options = { profitPercent: '10' };
      const result = getPricingMethodAndValue(options);

      expect(result.method).toBe('profit-percent');
      expect(result.value).toBe('10');
    });

    test('should throw error when no pricing method specified', () => {
      const options = {};

      expect(() => getPricingMethodAndValue(options)).toThrow('No pricing method specified');
    });

    test('should prioritize price over other methods', () => {
      const options = {
        price: '1.5',
        floorDiff: '+0.1',
        profitMargin: '0.1',
        profitPercent: '10'
      };
      const result = getPricingMethodAndValue(options);

      expect(result.method).toBe('absolute');
      expect(result.value).toBe('1.5');
    });
  });

  describe('executeDirectMode', () => {
    test('should execute direct mode successfully', async () => {
      mockValidatePricingOptions.mockReturnValue({ isValid: true, errors: [] });
      mockCalculateListingPrice.mockResolvedValue({
        listingPrice: 1.5,
        pricingInfo: '1.5 ETH (absolute)'
      });
      mockCreateListingData.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.5,
        wallet: { address: '0x123' }
      });
      mockGetListingInformation.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.5,
        feeBreakdown: { feeInfo: {} }
      });
      mockHandleListingConfirmation.mockResolvedValue(true);
      mockExecuteOpenSeaListing.mockResolvedValue({ success: true });

      const options = {
        address: '0xabc',
        tokenId: '123',
        price: '1.5',
        expiration: '1h',
        marketplaces: 'opensea',
        payOptionalRoyalties: false,
        skipConfirm: false
      };

      const context = {
        apiContext: { openseaApi: {} },
        cacheService: {}
      };

      const result = await executeDirectMode(options, context);

      expect(result.success).toBe(true);
      expect(mockCalculateListingPrice).toHaveBeenCalled();
      expect(mockCreateListingData).toHaveBeenCalled();
      expect(mockGetListingInformation).toHaveBeenCalled();
      expect(mockHandleListingConfirmation).toHaveBeenCalled();
      expect(mockExecuteOpenSeaListing).toHaveBeenCalled();
    });

    test('should handle user cancellation', async () => {
      mockValidatePricingOptions.mockReturnValue({ isValid: true, errors: [] });
      mockCalculateListingPrice.mockResolvedValue({
        listingPrice: 1.5,
        pricingInfo: '1.5 ETH'
      });
      mockCreateListingData.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.5
      });
      mockGetListingInformation.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.5,
        feeBreakdown: { feeInfo: {} }
      });
      mockHandleListingConfirmation.mockResolvedValue(false);

      const options = {
        address: '0xabc',
        tokenId: '123',
        price: '1.5'
      };

      const context = {
        apiContext: { openseaApi: {} },
        cacheService: {}
      };

      const result = await executeDirectMode(options, context);

      expect(result.cancelled).toBe(true);
      expect(mockExecuteOpenSeaListing).not.toHaveBeenCalled();
    });

    test('should throw error for invalid pricing options', async () => {
      mockValidatePricingOptions.mockReturnValue({
        isValid: false,
        errors: ['Invalid pricing']
      });

      const options = {
        address: '0xabc',
        tokenId: '123'
      };

      const context = {
        apiContext: { openseaApi: {} },
        cacheService: {}
      };

      await expect(executeDirectMode(options, context)).rejects.toThrow('Invalid pricing');
    });

    test('should handle errors during execution', async () => {
      mockValidatePricingOptions.mockReturnValue({ isValid: true, errors: [] });
      mockCalculateListingPrice.mockRejectedValue(new Error('API error'));

      const options = {
        address: '0xabc',
        tokenId: '123',
        price: '1.5'
      };

      const context = {
        apiContext: { openseaApi: {} },
        cacheService: {}
      };

      await expect(executeDirectMode(options, context)).rejects.toThrow('API error');
      expect(mockLogger.error).toHaveBeenCalledWith('Direct mode error:', 'API error');
    });
  });
});
