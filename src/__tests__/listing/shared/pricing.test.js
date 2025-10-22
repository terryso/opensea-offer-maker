/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

import {
  calculateListingPrice,
  validatePricingParameters,
  getPricingMethodChoices
} from '../../../listing/shared/pricing.js';

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

describe('Listing Shared Pricing', () => {
  const mockOpenseaApi = {
    getCollectionByContract: jest.fn(),
    getCollectionStats: jest.fn(),
    getNFTLastSalePrice: jest.fn()
  };

  const contractAddress = '0xabcdef1234567890abcdef1234567890abcdef12';
  const tokenId = '123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateListingPrice', () => {
    describe('absolute method', () => {
      test('should calculate absolute price', async () => {
        const result = await calculateListingPrice('absolute', '1.5', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        });

        expect(result.listingPrice).toBe(1.5);
        expect(result.pricingInfo).toBe('1.5 ETH (absolute price)');
      });

      test('should handle decimal precision', async () => {
        const result = await calculateListingPrice('absolute', '1.23456789', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        });

        expect(result.listingPrice).toBe(1.234568); // 6 decimal places
      });
    });

    describe('floor-diff method', () => {
      beforeEach(() => {
        mockOpenseaApi.getCollectionByContract.mockResolvedValue({
          collection: 'test-collection'
        });
        mockOpenseaApi.getCollectionStats.mockResolvedValue({
          floor_price: 1.0
        });
      });

      test('should calculate positive absolute diff', async () => {
        const result = await calculateListingPrice('floor-diff', '+0.1', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        });

        expect(result.listingPrice).toBe(1.1);
        expect(result.pricingInfo).toContain('+0.1 from floor');
        expect(result.pricingInfo).toContain('floor: 1 ETH');
      });

      test('should calculate negative absolute diff', async () => {
        const result = await calculateListingPrice('floor-diff', '-0.05', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        });

        expect(result.listingPrice).toBe(0.95);
        expect(result.pricingInfo).toContain('-0.05 from floor');
      });

      test('should calculate positive percentage diff', async () => {
        const result = await calculateListingPrice('floor-diff', '+10%', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        });

        expect(result.listingPrice).toBe(1.1);
        expect(result.pricingInfo).toContain('+10% from floor');
      });

      test('should calculate negative percentage diff', async () => {
        const result = await calculateListingPrice('floor-diff', '-5%', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        });

        expect(result.listingPrice).toBe(0.95);
        expect(result.pricingInfo).toContain('-5% from floor');
      });

      test('should throw error for invalid format', async () => {
        await expect(calculateListingPrice('floor-diff', 'invalid', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        })).rejects.toThrow('Invalid floor-diff format');
      });

      test('should throw error when floor price unavailable', async () => {
        mockOpenseaApi.getCollectionByContract.mockResolvedValue(null);

        await expect(calculateListingPrice('floor-diff', '+0.1', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        })).rejects.toThrow('Could not fetch collection info');
      });

      test('should throw error when floor price missing', async () => {
        mockOpenseaApi.getCollectionStats.mockResolvedValue({});

        await expect(calculateListingPrice('floor-diff', '+0.1', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        })).rejects.toThrow('Could not fetch floor price');
      });
    });

    describe('profit-margin method', () => {
      beforeEach(() => {
        mockOpenseaApi.getNFTLastSalePrice.mockResolvedValue({
          price: 0.8
        });
      });

      test('should calculate profit margin', async () => {
        const result = await calculateListingPrice('profit-margin', '0.1', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        });

        expect(result.listingPrice).toBe(0.9);
        expect(result.pricingInfo).toBe('purchase price (0.8 ETH) + 0.1 ETH margin');
      });

      test('should throw error when purchase price unavailable', async () => {
        mockOpenseaApi.getNFTLastSalePrice.mockResolvedValue(null);

        await expect(calculateListingPrice('profit-margin', '0.1', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        })).rejects.toThrow('Could not fetch last sale price');
      });
    });

    describe('profit-percent method', () => {
      beforeEach(() => {
        mockOpenseaApi.getNFTLastSalePrice.mockResolvedValue({
          price: 0.8
        });
      });

      test('should calculate profit percentage', async () => {
        const result = await calculateListingPrice('profit-percent', '10', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        });

        expect(result.listingPrice).toBe(0.88);
        expect(result.pricingInfo).toContain('purchase price (0.8 ETH) + 10%');
        expect(result.pricingInfo).toContain('(0.080000 ETH)');
      });

      test('should throw error when purchase price unavailable', async () => {
        mockOpenseaApi.getNFTLastSalePrice.mockResolvedValue({});

        await expect(calculateListingPrice('profit-percent', '10', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        })).rejects.toThrow('Could not fetch last sale price');
      });
    });

    describe('general validation', () => {
      test('should throw error for unknown method', async () => {
        await expect(calculateListingPrice('unknown', '1.0', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        })).rejects.toThrow('Unknown pricing method: unknown');
      });

      test('should throw error for zero or negative price', async () => {
        await expect(calculateListingPrice('absolute', '0', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        })).rejects.toThrow('Listing price must be greater than 0');

        await expect(calculateListingPrice('absolute', '-1', {
          openseaApi: mockOpenseaApi,
          contractAddress,
          tokenId
        })).rejects.toThrow('Listing price must be greater than 0');
      });
    });
  });

  describe('validatePricingParameters', () => {
    test('should validate absolute pricing', () => {
      const options = { price: '1.5' };
      const result = validatePricingParameters(options);

      expect(result.method).toBe('absolute');
      expect(result.value).toBe('1.5');
    });

    test('should validate floor-diff pricing', () => {
      const options = { floorDiff: '+0.1' };
      const result = validatePricingParameters(options);

      expect(result.method).toBe('floor-diff');
      expect(result.value).toBe('+0.1');
    });

    test('should validate profit-margin pricing', () => {
      const options = { profitMargin: '0.1' };
      const result = validatePricingParameters(options);

      expect(result.method).toBe('profit-margin');
      expect(result.value).toBe('0.1');
    });

    test('should validate profit-percent pricing', () => {
      const options = { profitPercent: '10' };
      const result = validatePricingParameters(options);

      expect(result.method).toBe('profit-percent');
      expect(result.value).toBe('10');
    });

    test('should throw error for no pricing options', () => {
      const options = {};
      expect(() => validatePricingParameters(options)).toThrow('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
    });

    test('should throw error for multiple pricing options', () => {
      const options = { price: '1.5', floorDiff: '+0.1' };
      expect(() => validatePricingParameters(options)).toThrow('Cannot use multiple pricing options at the same time');
    });
  });

  describe('getPricingMethodChoices', () => {
    test('should return all pricing method choices', () => {
      const choices = getPricingMethodChoices();

      expect(choices).toHaveLength(4);
      expect(choices[0]).toEqual({
        name: 'absolute',
        message: 'Absolute price (e.g., 0.1 ETH)',
        value: 'absolute'
      });
      expect(choices[1]).toEqual({
        name: 'floor-diff',
        message: 'Floor price difference (e.g., +0.1, -5%)',
        value: 'floor-diff'
      });
      expect(choices[2]).toEqual({
        name: 'profit-margin',
        message: 'Profit margin over purchase price (e.g., +0.01 ETH)',
        value: 'profit-margin'
      });
      expect(choices[3]).toEqual({
        name: 'profit-percent',
        message: 'Profit percentage over purchase price (e.g., +10%)',
        value: 'profit-percent'
      });
    });
  });
});
