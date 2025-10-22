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

const mockGetWallet = jest.fn();
const mockGetEffectiveChain = jest.fn();
const mockGetPricingMethodChoices = jest.fn();
const mockCreateListingData = jest.fn();
const mockCalculateListingPrice = jest.fn();
const mockGetListingInformation = jest.fn();
const mockExecuteOpenSeaListing = jest.fn();
const mockHandleListingConfirmation = jest.fn();
const mockPrompt = jest.fn();

jest.unstable_mockModule('../../../utils/logger.js', () => ({
  logger: mockLogger
}));

jest.unstable_mockModule('../../../utils/commandUtils.js', () => ({
  getWallet: mockGetWallet,
  getEffectiveChain: mockGetEffectiveChain
}));

jest.unstable_mockModule('../../../listing/shared/pricing.js', () => ({
  getPricingMethodChoices: mockGetPricingMethodChoices
}));

jest.unstable_mockModule('../../../listing/orchestrator.js', () => ({
  createListingData: mockCreateListingData,
  calculateListingPrice: mockCalculateListingPrice,
  getListingInformation: mockGetListingInformation,
  executeOpenSeaListing: mockExecuteOpenSeaListing,
  handleListingConfirmation: mockHandleListingConfirmation
}));

jest.unstable_mockModule('enquirer', () => ({
  default: { prompt: mockPrompt },
  prompt: mockPrompt
}));

const {
  BACK_SIGNAL,
  CANCEL_SIGNAL,
  FLOW_STEPS,
  executeInteractiveMode
} = await import('../../../listing/modes/InteractiveMode.js');

describe('Interactive Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  describe('Exported Constants', () => {
    test('should export FLOW_STEPS constants', () => {
      expect(FLOW_STEPS).toBeDefined();
      expect(FLOW_STEPS.SELECT_COLLECTION).toBe('select-collection');
      expect(FLOW_STEPS.SELECT_NFT).toBe('select-nft');
      expect(FLOW_STEPS.SELECT_PRICING_METHOD).toBe('select-pricing-method');
      expect(FLOW_STEPS.INPUT_PRICING_VALUE).toBe('input-pricing-value');
      expect(FLOW_STEPS.CONFIRM).toBe('confirm');
      expect(FLOW_STEPS.DONE).toBe('done');
      expect(FLOW_STEPS.CANCELLED).toBe('cancelled');
    });

    test('should export BACK_SIGNAL symbol', () => {
      expect(BACK_SIGNAL).toBeDefined();
      expect(typeof BACK_SIGNAL).toBe('symbol');
      expect(BACK_SIGNAL.toString()).toBe('Symbol(BACK)');
    });

    test('should export CANCEL_SIGNAL symbol', () => {
      expect(CANCEL_SIGNAL).toBeDefined();
      expect(typeof CANCEL_SIGNAL).toBe('symbol');
      expect(CANCEL_SIGNAL.toString()).toBe('Symbol(CANCEL)');
    });

    test('should have unique signal symbols', () => {
      expect(BACK_SIGNAL).not.toBe(CANCEL_SIGNAL);
    });

    test('should have all expected flow steps', () => {
      const expectedSteps = [
        'select-collection',
        'select-nft',
        'select-pricing-method',
        'input-pricing-value',
        'confirm',
        'done',
        'cancelled'
      ];

      const actualSteps = Object.values(FLOW_STEPS);
      expect(actualSteps).toEqual(expect.arrayContaining(expectedSteps));
      expect(actualSteps).toHaveLength(expectedSteps.length);
    });
  });

  describe('Signal Usage', () => {
    test('BACK_SIGNAL should be unique and identifiable', () => {
      expect(BACK_SIGNAL.description).toBe('BACK');
    });

    test('CANCEL_SIGNAL should be unique and identifiable', () => {
      expect(CANCEL_SIGNAL.description).toBe('CANCEL');
    });

    test('signals should not equal any flow step values', () => {
      const flowStepValues = Object.values(FLOW_STEPS);

      expect(flowStepValues).not.toContain(BACK_SIGNAL);
      expect(flowStepValues).not.toContain(CANCEL_SIGNAL);
    });
  });

  describe('executeInteractiveMode', () => {
    const mockCacheService = {
      getCachedCollections: jest.fn(),
      getCachedNFTs: jest.fn()
    };

    const mockApiContext = {
      openseaApi: {
        getCollectionByContract: jest.fn(),
        getCollectionStats: jest.fn(),
        getNFTLastSalePrice: jest.fn()
      },
      chainConfig: { name: 'ethereum', chainId: 1 }
    };

    beforeEach(() => {
      mockGetWallet.mockResolvedValue({ address: '0x123' });
      mockGetEffectiveChain.mockResolvedValue({ name: 'ethereum', chainId: 1 });
      mockGetPricingMethodChoices.mockReturnValue([
        { name: 'absolute', message: 'Absolute price' },
        { name: 'floor-diff', message: 'Floor difference' }
      ]);
    });

    test('should handle user cancellation at collection selection', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockPrompt.mockResolvedValue({ collection: '__cancel__' });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result).toBe(CANCEL_SIGNAL);
      expect(mockLogger.info).toHaveBeenCalledWith('❌ Listing cancelled by user');
    });

    test('should handle no cached collections error', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([]);

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      await expect(executeInteractiveMode(options, context)).rejects.toThrow(
        'No cached collections found'
      );
    });

    test('should handle successful listing flow', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([
        { contract: '0xabc', tokenId: '123', name: 'NFT #123' }
      ]);

      mockPrompt
        .mockResolvedValueOnce({ collection: 'collection1' })
        .mockResolvedValueOnce({ nft: '0xabc:123' })
        .mockResolvedValueOnce({ method: 'absolute' })
        .mockResolvedValueOnce({ price: '1.5' });

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
      mockHandleListingConfirmation.mockResolvedValue(true);
      mockExecuteOpenSeaListing.mockResolvedValue({ success: true });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result.success).toBe(true);
      expect(mockExecuteOpenSeaListing).toHaveBeenCalled();
    });

    test('should handle back navigation from NFT to collection', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([
        { contract: '0xabc', tokenId: '123', name: 'NFT #123' }
      ]);

      mockPrompt
        .mockResolvedValueOnce({ collection: 'collection1' })
        .mockResolvedValueOnce({ nft: '__back__' })
        .mockResolvedValueOnce({ collection: '__cancel__' });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result).toBe(CANCEL_SIGNAL);
    });

    test('should handle cancel at NFT selection', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([
        { contract: '0xabc', tokenId: '123', name: 'NFT #123' }
      ]);

      mockPrompt
        .mockResolvedValueOnce({ collection: 'collection1' })
        .mockResolvedValueOnce({ nft: '__cancel__' });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result).toBe(CANCEL_SIGNAL);
    });

    test('should handle errors during execution', async () => {
      mockCacheService.getCachedCollections.mockRejectedValue(new Error('Cache error'));

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      await expect(executeInteractiveMode(options, context)).rejects.toThrow('Cache error');
      expect(mockLogger.error).toHaveBeenCalledWith('Interactive mode error:', 'Cache error');
    });

    test('should handle floor-diff pricing method', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([
        { contract: '0xabc', tokenId: '123', name: 'NFT #123' }
      ]);

      mockApiContext.openseaApi.getCollectionByContract.mockResolvedValue({
        collection: 'collection1'
      });
      mockApiContext.openseaApi.getCollectionStats.mockResolvedValue({
        floor_price: 1.0
      });

      mockPrompt
        .mockResolvedValueOnce({ collection: 'collection1' })
        .mockResolvedValueOnce({ nft: '0xabc:123' })
        .mockResolvedValueOnce({ method: 'floor-diff' })
        .mockResolvedValueOnce({ diff: '+0.1' });

      mockCalculateListingPrice.mockResolvedValue({
        listingPrice: 1.1,
        pricingInfo: '1.1 ETH (floor + 0.1)'
      });
      mockCreateListingData.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.1
      });
      mockGetListingInformation.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.1,
        feeBreakdown: { feeInfo: {} }
      });
      mockHandleListingConfirmation.mockResolvedValue(true);
      mockExecuteOpenSeaListing.mockResolvedValue({ success: true });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result.success).toBe(true);
      expect(mockApiContext.openseaApi.getCollectionStats).toHaveBeenCalled();
    });

    test('should handle profit-margin pricing method', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([
        { contract: '0xabc', tokenId: '123', name: 'NFT #123' }
      ]);

      mockApiContext.openseaApi.getNFTLastSalePrice.mockResolvedValue({
        price: 1.0
      });

      mockPrompt
        .mockResolvedValueOnce({ collection: 'collection1' })
        .mockResolvedValueOnce({ nft: '0xabc:123' })
        .mockResolvedValueOnce({ method: 'profit-margin' })
        .mockResolvedValueOnce({ margin: '0.2' });

      mockCalculateListingPrice.mockResolvedValue({
        listingPrice: 1.2,
        pricingInfo: '1.2 ETH (cost + 0.2)'
      });
      mockCreateListingData.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.2
      });
      mockGetListingInformation.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.2,
        feeBreakdown: { feeInfo: {} }
      });
      mockHandleListingConfirmation.mockResolvedValue(true);
      mockExecuteOpenSeaListing.mockResolvedValue({ success: true });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result.success).toBe(true);
      expect(mockApiContext.openseaApi.getNFTLastSalePrice).toHaveBeenCalled();
    });

    test('should handle profit-percent pricing method', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([
        { contract: '0xabc', tokenId: '123', name: 'NFT #123' }
      ]);

      mockApiContext.openseaApi.getNFTLastSalePrice.mockResolvedValue({
        price: 1.0
      });

      mockPrompt
        .mockResolvedValueOnce({ collection: 'collection1' })
        .mockResolvedValueOnce({ nft: '0xabc:123' })
        .mockResolvedValueOnce({ method: 'profit-percent' })
        .mockResolvedValueOnce({ percent: '20' });

      mockCalculateListingPrice.mockResolvedValue({
        listingPrice: 1.2,
        pricingInfo: '1.2 ETH (cost + 20%)'
      });
      mockCreateListingData.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.2
      });
      mockGetListingInformation.mockResolvedValue({
        nft: { address: '0xabc', tokenId: '123' },
        price: 1.2,
        feeBreakdown: { feeInfo: {} }
      });
      mockHandleListingConfirmation.mockResolvedValue(true);
      mockExecuteOpenSeaListing.mockResolvedValue({ success: true });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result.success).toBe(true);
      expect(mockApiContext.openseaApi.getNFTLastSalePrice).toHaveBeenCalled();
    });

    test('should handle prompt cancellation with ESC', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);

      const error = new Error('Prompt cancelled');
      error.name = 'promptcancelled';
      mockPrompt.mockRejectedValue(error);

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result).toBe(CANCEL_SIGNAL);
    });

    test('should handle back from pricing to NFT selection', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([
        { contract: '0xabc', tokenId: '123', name: 'NFT #123' }
      ]);

      mockPrompt
        .mockResolvedValueOnce({ collection: 'collection1' })
        .mockResolvedValueOnce({ nft: '0xabc:123' })
        .mockResolvedValueOnce({ method: '__back__' })
        .mockResolvedValueOnce({ nft: '__cancel__' });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result).toBe(CANCEL_SIGNAL);
    });

    test('should handle cancel at pricing method selection', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([
        { contract: '0xabc', tokenId: '123', name: 'NFT #123' }
      ]);

      mockPrompt
        .mockResolvedValueOnce({ collection: 'collection1' })
        .mockResolvedValueOnce({ nft: '0xabc:123' })
        .mockResolvedValueOnce({ method: '__cancel__' });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      const result = await executeInteractiveMode(options, context);

      expect(result).toBe(CANCEL_SIGNAL);
    });

    test('should handle no cached NFTs error', async () => {
      mockCacheService.getCachedCollections.mockResolvedValue([
        { slug: 'collection1', name: 'Collection 1', nft_count: 10 }
      ]);
      mockCacheService.getCachedNFTs.mockResolvedValue([]);

      mockPrompt.mockResolvedValueOnce({ collection: 'collection1' });

      const options = {};
      const context = { cacheService: mockCacheService, apiContext: mockApiContext };

      await expect(executeInteractiveMode(options, context)).rejects.toThrow(
        'No cached NFTs found'
      );
    });
  });
});
