/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { OfferStrategy } from '../services/offerStrategy.js';

describe('OfferStrategy', () => {
    let strategy;
    let mockOfferService;
    let mockOpenSeaApi;
    
    beforeEach(() => {
        mockOfferService = {
            createCollectionOffer: jest.fn(),
            createIndividualOffer: jest.fn()
        };
        
        mockOpenSeaApi = {
            getCollectionOffers: jest.fn(),
            getNFTOffers: jest.fn()
        };
        
        strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
            minPrice: '0.1',
            maxPrice: '1.0',
            increment: '0.0001',
            checkIntervalSeconds: 60,
            walletAddress: '0xMockWallet'
        });
    });

    describe('validatePriceRange', () => {
        it('should validate prices within range', () => {
            expect(strategy.validatePriceRange('0.5')).toBe(true);
            expect(strategy.validatePriceRange('0.1')).toBe(true);
            expect(strategy.validatePriceRange('1.0')).toBe(true);
        });

        it('should reject prices outside range', () => {
            expect(strategy.validatePriceRange('0.05')).toBe(false);
            expect(strategy.validatePriceRange('1.1')).toBe(false);
        });
    });

    describe('calculateNewOfferPrice', () => {
        it('should return minPrice when no current offer exists', () => {
            expect(strategy.calculateNewOfferPrice(null)).toBe('0.1');
        });

        it('should increment current price correctly', () => {
            expect(strategy.calculateNewOfferPrice('0.5')).toBe('0.5001');
        });

        it('should return null when new price would exceed max', () => {
            expect(strategy.calculateNewOfferPrice('0.9999')).toBe(null);
        });
    });

    describe('checkAndCreateOffer', () => {
        beforeEach(() => {
            strategy.getBestOffer = jest.fn();
        });

        it('should create new offer when no current offers exist', async () => {
            strategy.getBestOffer.mockResolvedValue(null);
            mockOfferService.createCollectionOffer.mockResolvedValue('test-hash');

            const result = await strategy.checkAndCreateOffer({
                collectionSlug: 'test-collection'
            });

            expect(result).toBe('test-hash');
            expect(mockOfferService.createCollectionOffer).toHaveBeenCalledWith({
                collectionSlug: 'test-collection',
                offerAmount: '0.1'
            });
        });

        it('should create new offer when current best offer is not from us', async () => {
            strategy.getBestOffer.mockResolvedValue({
                maker: { address: '0xOtherWallet' },
                price: { value: '0.5' }
            });

            await strategy.checkAndCreateOffer({
                collectionSlug: 'test-collection'
            });

            expect(mockOfferService.createCollectionOffer).toHaveBeenCalledWith({
                collectionSlug: 'test-collection',
                offerAmount: '0.5001'
            });
        });

        it('should not create offer when best offer is ours', async () => {
            strategy.getBestOffer.mockResolvedValue({
                maker: { address: '0xmockwallet' },
                price: { value: '0.5' }
            });

            const result = await strategy.checkAndCreateOffer({
                collectionSlug: 'test-collection'
            });

            expect(result).toBeNull();
            expect(mockOfferService.createCollectionOffer).not.toHaveBeenCalled();
        });
    });

    describe('start/stop', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should start and stop monitoring correctly', () => {
            const params = { collectionSlug: 'test-collection' };
            strategy.checkAndCreateOffer = jest.fn();

            strategy.start(params);
            expect(strategy.running).toBe(true);
            expect(strategy.checkAndCreateOffer).toHaveBeenCalledWith(params);

            jest.advanceTimersByTime(60000);
            expect(strategy.checkAndCreateOffer).toHaveBeenCalledTimes(2);

            strategy.stop();
            expect(strategy.running).toBe(false);

            jest.advanceTimersByTime(60000);
            expect(strategy.checkAndCreateOffer).toHaveBeenCalledTimes(2);
        });
    });

    describe('getBestOffer', () => {
        it('should return null when no offers exist', async () => {
            mockOpenSeaApi.getCollectionOffers.mockResolvedValue({ orders: [] });
            const result = await strategy.getBestOffer({ collectionSlug: 'test' });
            expect(result).toBeNull();
        });

        it('should return formatted best offer for collection', async () => {
            mockOpenSeaApi.getCollectionOffers.mockResolvedValue({
                orders: [{
                    maker: { address: '0xtest' },
                    current_price: '1000000000000000000' // 1 ETH
                }]
            });

            const result = await strategy.getBestOffer({ collectionSlug: 'test' });
            expect(result).toEqual({
                maker: { address: '0xtest' },
                price: { value: '1.0' }
            });
        });
    });
}); 