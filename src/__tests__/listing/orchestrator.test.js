/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Mock dependencies
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockGetWallet = jest.fn();
const mockGetEffectiveChain = jest.fn();
const mockCalculatePrice = jest.fn();
const mockCalculateFees = jest.fn();
const mockFormatFeeBreakdown = jest.fn();
const mockParseExpirationTime = jest.fn();
const mockParseMarketplaces = jest.fn();
const mockFormatExpirationDisplay = jest.fn();

jest.unstable_mockModule('../../utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../utils/commandUtils.js', () => ({
  getWallet: mockGetWallet,
  getEffectiveChain: mockGetEffectiveChain
}));

jest.unstable_mockModule('../../listing/shared/pricing.js', () => ({
  calculateListingPrice: mockCalculatePrice
}));

jest.unstable_mockModule('../../listing/shared/fees.js', () => ({
  calculateFeeBreakdown: mockCalculateFees,
  formatFeeBreakdown: mockFormatFeeBreakdown
}));

jest.unstable_mockModule('../../listing/shared/utils.js', () => ({
  parseExpirationTime: mockParseExpirationTime,
  parseMarketplaces: mockParseMarketplaces,
  formatExpirationDisplay: mockFormatExpirationDisplay
}));

const {
  createApiContext,
  createListingData,
  calculateListingPrice,
  calculateFeeBreakdown,
  getListingInformation,
  executeOpenSeaListing,
  handleListingConfirmation
} = await import('../../listing/orchestrator.js');

describe('Listing Orchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createApiContext', () => {
    test('should return the same chainConfig passed in', () => {
      const chainConfig = { name: 'sepolia', chainId: 11155111 };
      const context = createApiContext(chainConfig);

      expect(context).toHaveProperty('chainConfig');
      expect(context.chainConfig).toBe(chainConfig);
      expect(context.chainConfig.name).toBe('sepolia');
      expect(context.chainConfig.chainId).toBe(11155111);
    });

    test('should create openseaApi instance', () => {
      const chainConfig = { name: 'ethereum', chainId: 1 };
      const context = createApiContext(chainConfig);

      expect(context).toHaveProperty('openseaApi');
      expect(context).toHaveProperty('chainConfig');
      expect(context.chainConfig).toBe(chainConfig);
    });

    test('should create API context for different chains', () => {
      const chainConfig = { name: 'base', chainId: 8453 };
      const context = createApiContext(chainConfig);

      expect(context.chainConfig).toBe(chainConfig);
      expect(context.chainConfig.name).toBe('base');
      expect(context.chainConfig.chainId).toBe(8453);
    });

    test('should create API context with ethereum chain', () => {
      const chainConfig = { name: 'ethereum', chainId: 1 };
      const context = createApiContext(chainConfig);

      expect(context).toHaveProperty('openseaApi');
      expect(context).toHaveProperty('chainConfig');
      expect(context.chainConfig).toBe(chainConfig);
    });
  });

  describe('createListingData', () => {
    test('should create listing data with all parameters', async () => {
      const mockWallet = { address: '0x123' };
      const mockChain = { name: 'ethereum', chainId: 1 };

      mockGetWallet.mockResolvedValue(mockWallet);
      mockGetEffectiveChain.mockResolvedValue(mockChain);
      mockParseExpirationTime.mockReturnValue(1234567890);
      mockFormatExpirationDisplay.mockReturnValue('1 hour');
      mockParseMarketplaces.mockReturnValue(['opensea']);

      const params = {
        address: '0xabc',
        tokenId: '123',
        price: 1.5,
        expiration: '1h',
        marketplaces: 'opensea',
        payOptionalRoyalties: true
      };

      const result = await createListingData(params, {});

      expect(result).toEqual({
        nft: {
          address: '0xabc',
          tokenId: '123',
          chain: mockChain
        },
        price: 1.5,
        expirationTime: 1234567890,
        expirationDisplay: '1 hour',
        marketplaces: ['opensea'],
        payOptionalRoyalties: true,
        wallet: mockWallet
      });

      expect(mockGetWallet).toHaveBeenCalledWith({});
      expect(mockGetEffectiveChain).toHaveBeenCalledWith({});
      expect(mockParseExpirationTime).toHaveBeenCalledWith('1h');
      expect(mockFormatExpirationDisplay).toHaveBeenCalledWith('1h');
      expect(mockParseMarketplaces).toHaveBeenCalledWith('opensea');
    });

    test('should handle false payOptionalRoyalties', async () => {
      const mockWallet = { address: '0x123' };
      const mockChain = { name: 'ethereum', chainId: 1 };

      mockGetWallet.mockResolvedValue(mockWallet);
      mockGetEffectiveChain.mockResolvedValue(mockChain);
      mockParseExpirationTime.mockReturnValue(1234567890);
      mockFormatExpirationDisplay.mockReturnValue('1 hour');
      mockParseMarketplaces.mockReturnValue(['opensea']);

      const params = {
        address: '0xabc',
        tokenId: '123',
        price: 1.5,
        expiration: '1h',
        marketplaces: 'opensea',
        payOptionalRoyalties: false
      };

      const result = await createListingData(params, {});

      expect(result.payOptionalRoyalties).toBe(false);
    });
  });

  describe('calculateListingPrice', () => {
    test('should calculate listing price with all parameters', async () => {
      const mockResult = { listingPrice: 1.5, pricingInfo: 'test' };
      mockCalculatePrice.mockResolvedValue(mockResult);

      const params = {
        method: 'absolute',
        value: '1.5',
        contractAddress: '0xabc',
        tokenId: '123',
        openseaApi: {}
      };

      const result = await calculateListingPrice(params);

      expect(result).toEqual(mockResult);
      expect(mockCalculatePrice).toHaveBeenCalledWith(
        'absolute',
        '1.5',
        {
          openseaApi: {},
          contractAddress: '0xabc',
          tokenId: '123'
        }
      );
    });
  });

  describe('calculateFeeBreakdown', () => {
    test('should calculate fee breakdown', async () => {
      const mockFees = { total: 0.1 };
      mockCalculateFees.mockResolvedValue(mockFees);

      const params = {
        listingPrice: 1.5,
        collectionSlug: 'test-collection',
        openseaApi: {},
        payOptionalRoyalties: true
      };

      const result = await calculateFeeBreakdown(params);

      expect(result).toEqual(mockFees);
      expect(mockCalculateFees).toHaveBeenCalledWith(
        1.5,
        'test-collection',
        { openseaApi: {} },
        true
      );
    });
  });

  describe('getListingInformation', () => {
    test('should get comprehensive listing information', async () => {
      const mockOpenseaApi = {
        getCollectionByContract: jest.fn().mockResolvedValue({
          collection: 'test-collection'
        })
      };

      const mockFeeBreakdown = { total: 0.1, feeInfo: {} };
      mockCalculateFees.mockResolvedValue(mockFeeBreakdown);
      mockFormatFeeBreakdown.mockReturnValue('Fee: 0.1 ETH');

      const listingData = {
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.5,
        expirationDisplay: '1 hour',
        marketplaces: ['opensea'],
        payOptionalRoyalties: true
      };

      const result = await getListingInformation(listingData, { openseaApi: mockOpenseaApi });

      expect(result).toEqual({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.5,
        pricingInfo: '1.5 ETH',
        expirationDisplay: '1 hour',
        marketplaces: 'opensea',
        feeBreakdown: mockFeeBreakdown,
        feeDisplay: 'Fee: 0.1 ETH',
        payOptionalRoyalties: true,
        collectionSlug: 'test-collection'
      });

      expect(mockOpenseaApi.getCollectionByContract).toHaveBeenCalledWith('0xabc');
    });

    test('should throw error if collection not found', async () => {
      const mockOpenseaApi = {
        getCollectionByContract: jest.fn().mockResolvedValue(null)
      };

      const listingData = {
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.5,
        expirationDisplay: '1 hour',
        marketplaces: ['opensea'],
        payOptionalRoyalties: true
      };

      await expect(
        getListingInformation(listingData, { openseaApi: mockOpenseaApi })
      ).rejects.toThrow('Could not fetch collection information');
    });
  });

  describe('executeOpenSeaListing', () => {
    test('should execute listing successfully', async () => {
      const mockOpenseaApi = {
        createListing: jest.fn().mockResolvedValue({ success: true })
      };

      const listingData = {
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.5,
        expirationTime: 1234567890,
        payOptionalRoyalties: true,
        wallet: { address: '0x123' }
      };

      const apiContext = {
        openseaApi: mockOpenseaApi,
        feeInfo: {}
      };

      const result = await executeOpenSeaListing(listingData, apiContext, {});

      expect(result).toEqual({ success: true });
      expect(mockOpenseaApi.createListing).toHaveBeenCalledWith({
        contractAddress: '0xabc',
        tokenId: '123',
        price: '1.5',
        expirationTime: 1234567890,
        wallet: { address: '0x123' },
        walletAddress: '0x123',
        feeInfo: {},
        payOptionalRoyalties: true
      });
    });
  });

  describe('handleListingConfirmation', () => {
    test('should skip confirmation when skipConfirm is true', async () => {
      const listingInfo = {
        nft: { address: '0xabc', tokenId: '123' },
        pricingInfo: '1.5 ETH',
        expirationDisplay: '1 hour',
        marketplaces: 'opensea',
        payOptionalRoyalties: true,
        feeDisplay: 'Fee: 0.1 ETH'
      };

      const result = await handleListingConfirmation(listingInfo, true);

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('⏭️ Skipping confirmation as requested');
    });

    test('should display listing information when not skipping', async () => {
      // Mock enquirer
      const mockPrompt = jest.fn().mockResolvedValue({ confirm: 'yes' });
      jest.unstable_mockModule('enquirer', () => ({
        default: { prompt: mockPrompt },
        prompt: mockPrompt
      }));

      const listingInfo = {
        nft: { address: '0xabc', tokenId: '123' },
        pricingInfo: '1.5 ETH',
        expirationDisplay: '1 hour',
        marketplaces: 'opensea',
        payOptionalRoyalties: true,
        feeDisplay: 'Fee: 0.1 ETH'
      };

      const result = await handleListingConfirmation(listingInfo, false);

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Listing Summary'));
    });
  });
});
