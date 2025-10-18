import { jest } from '@jest/globals';
import { OfferStrategy } from '../services/offerStrategy.js';

describe('OfferStrategy', () => {
    let offerStrategy;
    let mockOfferService;
    let mockOpenSeaApi;

    beforeEach(() => {
        mockOfferService = {};
        mockOpenSeaApi = {};

        offerStrategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
            minPrice: '0.01',
            maxPrice: '1.0',
            increment: '0.001',
            checkIntervalSeconds: 60,
            walletAddress: '0x1234567890123456789012345678901234567890',
            floorPricePercentage: 80
        });
    });

    describe('constructor', () => {
        it('should initialize with provided config', () => {
            expect(offerStrategy.minPrice).toBe('0.01');
            expect(offerStrategy.maxPrice).toBe('1.0');
            expect(offerStrategy.increment).toBe('0.001');
            expect(offerStrategy.checkIntervalSeconds).toBe(60);
            expect(offerStrategy.walletAddress).toBe('0x1234567890123456789012345678901234567890');
            expect(offerStrategy.floorPricePercentage).toBe(80);
        });

        it('should use default values when config not provided', () => {
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi);
            expect(strategy.minPrice).toBe('0');
            expect(strategy.maxPrice).toBe('0');
            expect(strategy.increment).toBe('0.0001');
            expect(strategy.checkIntervalSeconds).toBe(60);
        });

        it('should initialize running state as false', () => {
            expect(offerStrategy.running).toBe(false);
        });

        it('should initialize timerId as null', () => {
            expect(offerStrategy.timerId).toBe(null);
        });

        it('should set default retryCount', () => {
            expect(offerStrategy.retryCount).toBe(3);
        });

        it('should set default retryDelay', () => {
            expect(offerStrategy.retryDelay).toBe(1000);
        });

        it('should allow custom retryCount', () => {
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                retryCount: 5
            });
            expect(strategy.retryCount).toBe(5);
        });

        it('should allow custom retryDelay', () => {
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                retryDelay: 2000
            });
            expect(strategy.retryDelay).toBe(2000);
        });
    });

    describe('validatePriceRange', () => {
        it('should return true for price within range', () => {
            expect(offerStrategy.validatePriceRange('0.5')).toBe(true);
        });

        it('should return false for price below minimum', () => {
            expect(offerStrategy.validatePriceRange('0.005')).toBe(false);
        });

        it('should return false for price above maximum', () => {
            expect(offerStrategy.validatePriceRange('2.0')).toBe(false);
        });

        it('should return true for price equal to minimum', () => {
            expect(offerStrategy.validatePriceRange('0.01')).toBe(true);
        });

        it('should return true for price equal to maximum', () => {
            expect(offerStrategy.validatePriceRange('1.0')).toBe(true);
        });

        it('should handle string numbers', () => {
            expect(offerStrategy.validatePriceRange('0.25')).toBe(true);
        });

        it('should handle very small prices', () => {
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                minPrice: '0.0001',
                maxPrice: '0.001'
            });
            expect(strategy.validatePriceRange('0.0005')).toBe(true);
        });

        it('should handle large prices', () => {
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                minPrice: '1',
                maxPrice: '1000'
            });
            expect(strategy.validatePriceRange('500')).toBe(true);
        });
    });

    describe('stop', () => {
        it('should set running to false', () => {
            offerStrategy.running = true;
            offerStrategy.stop();
            expect(offerStrategy.running).toBe(false);
        });

        it('should clear timerId when it exists', () => {
            offerStrategy.timerId = setTimeout(() => {}, 1000);
            const timerIdBefore = offerStrategy.timerId;

            offerStrategy.stop();

            expect(offerStrategy.timerId).toBe(null);
            expect(timerIdBefore).not.toBe(null);
        });

        it('should not throw when timerId is null', () => {
            offerStrategy.timerId = null;
            expect(() => offerStrategy.stop()).not.toThrow();
        });

        it('should be callable multiple times', () => {
            offerStrategy.stop();
            expect(() => offerStrategy.stop()).not.toThrow();
        });
    });

    describe('lastOrderHash', () => {
        it('should initialize as null', () => {
            expect(offerStrategy.lastOrderHash).toBe(null);
        });

        it('should be settable', () => {
            offerStrategy.lastOrderHash = '0xabcdef';
            expect(offerStrategy.lastOrderHash).toBe('0xabcdef');
        });
    });

    describe('config validation', () => {
        it('should handle null floorPricePercentage', () => {
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                floorPricePercentage: null
            });
            expect(strategy.floorPricePercentage).toBe(null);
        });

        it('should handle zero values for prices', () => {
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                minPrice: '0',
                maxPrice: '0'
            });
            expect(strategy.minPrice).toBe('0');
            expect(strategy.maxPrice).toBe('0');
        });

        it('should use default checkIntervalSeconds when zero is provided', () => {
            // Zero is falsy, so default value is used
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                checkIntervalSeconds: 0
            });
            expect(strategy.checkIntervalSeconds).toBe(60);
        });

        it('should accept custom increment', () => {
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                increment: '0.01'
            });
            expect(strategy.increment).toBe('0.01');
        });
    });

    describe('validateFloorPriceLimit', () => {
        it('should return true when no floor price percentage set', async () => {
            offerStrategy.floorPricePercentage = null;
            const result = await offerStrategy.validateFloorPriceLimit('0.5', 'test');
            expect(result).toBe(true);
        });

        it('should return true on API error', async () => {
            mockOpenSeaApi.getCollectionStats = async () => {
                throw new Error('API error');
            };

            const result = await offerStrategy.validateFloorPriceLimit('0.5', 'test');
            expect(result).toBe(true);
        });

        it('should return true when floor price is missing', async () => {
            mockOpenSeaApi.getCollectionStats = async () => ({
                floor_price: null
            });

            const result = await offerStrategy.validateFloorPriceLimit('0.5', 'test');
            expect(result).toBe(true);
        });

        it('should validate price against floor price percentage', async () => {
            mockOpenSeaApi.getCollectionStats = async () => ({
                floor_price: 1.0
            });

            // 80% of 1.0 = 0.8
            expect(await offerStrategy.validateFloorPriceLimit('0.7', 'test')).toBe(true);
            expect(await offerStrategy.validateFloorPriceLimit('0.9', 'test')).toBe(false);
        });
    });

    describe('calculateNewOfferPrice', () => {
        beforeEach(() => {
            mockOpenSeaApi.getCollectionStats = async () => ({
                floor_price: 2.0
            });
        });

        it('should return minPrice when no current offer', async () => {
            const result = await offerStrategy.calculateNewOfferPrice(null, 'test');
            expect(result).toBe('0.01');
        });

        it('should return minPrice for invalid offer format', async () => {
            const result = await offerStrategy.calculateNewOfferPrice({}, 'test');
            expect(result).toBe('0.01');
        });

        it('should return minPrice when value is missing', async () => {
            const result = await offerStrategy.calculateNewOfferPrice(
                { quantity: '1' },
                'test'
            );
            expect(result).toBe('0.01');
        });

        it('should return minPrice when quantity is missing', async () => {
            const result = await offerStrategy.calculateNewOfferPrice(
                { value: '1000000000000000000' },
                'test'
            );
            expect(result).toBe('0.01');
        });

        it('should return minPrice on calculation error', async () => {
            const result = await offerStrategy.calculateNewOfferPrice(
                { value: 'invalid', quantity: '1' },
                'test'
            );
            expect(result).toBe('0.01');
        });

        it('should return null when new price exceeds max', async () => {
            offerStrategy.maxPrice = '0.5';
            const result = await offerStrategy.calculateNewOfferPrice(
                { value: '500000000000000000', quantity: '1' }, // 0.5 ETH
                'test'
            );
            expect(result).toBe(null);
        });
    });

    describe('checkLastOffer', () => {
        it('should return false when no last order hash', async () => {
            offerStrategy.lastOrderHash = null;
            const result = await offerStrategy.checkLastOffer();
            expect(result).toBe(false);
        });

        it('should return true when order is fulfilled', async () => {
            offerStrategy.lastOrderHash = 'hash123';
            mockOpenSeaApi.getOrderStatus = async () => ({
                fulfilled: true
            });

            const result = await offerStrategy.checkLastOffer();
            expect(result).toBe(true);
        });

        it('should return false when order is not fulfilled', async () => {
            offerStrategy.lastOrderHash = 'hash123';
            mockOpenSeaApi.getOrderStatus = async () => ({
                fulfilled: false
            });

            const result = await offerStrategy.checkLastOffer();
            expect(result).toBe(false);
        });

        it('should return false on API error', async () => {
            offerStrategy.lastOrderHash = 'hash123';
            mockOpenSeaApi.getOrderStatus = async () => {
                throw new Error('API error');
            };

            const result = await offerStrategy.checkLastOffer();
            expect(result).toBe(false);
        });
    });

    describe('getBestOffer', () => {
        it('should return null when no offers available', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => ({
                offers: []
            });

            const result = await offerStrategy.getBestOffer({
                collectionSlug: 'test',
                type: 'collection'
            });

            expect(result).toBe(null);
        });

        it('should return null on API error', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => {
                throw new Error('API error');
            };

            const result = await offerStrategy.getBestOffer({
                collectionSlug: 'test',
                type: 'collection'
            });

            expect(result).toBe(null);
        });

        it('should return null when no NFT offers', async () => {
            mockOpenSeaApi.getBestNFTOffer = async () => null;

            const result = await offerStrategy.getBestOffer({
                collectionSlug: 'test',
                tokenId: '123',
                type: 'token'
            });

            expect(result).toBe(null);
        });

        it('should handle collection offers', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => ({
                offers: [{
                    price: { value: '1000000000000000000' },
                    protocol_data: {
                        parameters: {
                            offerer: '0xabc',
                            consideration: [{ startAmount: '1' }]
                        }
                    }
                }]
            });

            const result = await offerStrategy.getBestOffer({
                collectionSlug: 'test',
                type: 'collection'
            });

            expect(result).toBeTruthy();
            expect(result.maker.address).toBe('0xabc');
        });

        it('should select offer with higher quantity when unit prices are equal', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => ({
                offers: [
                    {
                        price: { value: '1000000000000000000' }, // 1 ETH total, quantity 1
                        protocol_data: {
                            parameters: {
                                offerer: '0xabc',
                                consideration: [{ startAmount: '1' }]
                            }
                        }
                    },
                    {
                        price: { value: '2000000000000000000' }, // 2 ETH total, quantity 2 (same unit price)
                        protocol_data: {
                            parameters: {
                                offerer: '0xdef',
                                consideration: [{ startAmount: '2' }]
                            }
                        }
                    }
                ]
            });

            const result = await offerStrategy.getBestOffer({
                collectionSlug: 'test',
                type: 'collection'
            });

            expect(result).not.toBeNull();
            expect(result.price.quantity).toBe('2');
        });

        it('should select offer with higher unit price when quantities are equal', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => ({
                offers: [
                    {
                        price: { value: '2000000000000000000' }, // 2 ETH (higher unit price)
                        protocol_data: {
                            parameters: {
                                offerer: '0xhigher',
                                consideration: [{ startAmount: '1' }]
                            }
                        }
                    },
                    {
                        price: { value: '1000000000000000000' }, // 1 ETH (lower unit price)
                        protocol_data: {
                            parameters: {
                                offerer: '0xlower',
                                consideration: [{ startAmount: '1' }]
                            }
                        }
                    }
                ]
            });

            const result = await offerStrategy.getBestOffer({
                collectionSlug: 'test',
                type: 'collection'
            });

            expect(result).not.toBeNull();
            expect(result.maker.address).toBe('0xhigher');
        });

        it('should use default quantity of 1 when startAmount is null for individual offers', async () => {
            mockOpenSeaApi.getBestNFTOffer = async () => ({
                price: { value: '1000000000000000000' },
                protocol_data: {
                    parameters: {
                        offerer: '0xabc',
                        consideration: [{ startAmount: null }]
                    }
                }
            });

            const result = await offerStrategy.getBestOffer({
                collectionSlug: 'test',
                tokenId: '123',
                type: 'token'
            });

            expect(result).not.toBeNull();
            expect(result.price.quantity).toBe('1');
        });
    });

    describe('start', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.clearAllTimers();
            jest.useRealTimers();
            if (offerStrategy.timerId) {
                offerStrategy.stop();
            }
        });

        it('should not start if already running', () => {
            offerStrategy.running = true;
            offerStrategy.start({ collectionSlug: 'test' });
            expect(offerStrategy.timerId).toBe(null);
        });

        it('should call checkAndCreateOffer immediately and set up interval', () => {
            const spy = jest.spyOn(offerStrategy, 'checkAndCreateOffer').mockResolvedValue(null);

            const params = { collectionSlug: 'test', type: 'collection' };
            offerStrategy.start(params);

            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith(params);
            expect(offerStrategy.running).toBe(true);
            expect(offerStrategy.timerId).not.toBeNull();

            spy.mockRestore();
        });

        it('should call checkAndCreateOffer repeatedly via interval', () => {
            const spy = jest.spyOn(offerStrategy, 'checkAndCreateOffer').mockResolvedValue(null);

            const params = { collectionSlug: 'test', type: 'collection' };
            offerStrategy.start(params);

            expect(spy).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(60000);
            expect(spy).toHaveBeenCalledTimes(2);

            jest.advanceTimersByTime(60000);
            expect(spy).toHaveBeenCalledTimes(3);

            spy.mockRestore();
        });

        it('should not call checkAndCreateOffer when stopped', () => {
            const spy = jest.spyOn(offerStrategy, 'checkAndCreateOffer').mockResolvedValue(null);

            const params = { collectionSlug: 'test', type: 'collection' };
            offerStrategy.start(params);

            expect(spy).toHaveBeenCalledTimes(1);

            offerStrategy.stop();
            jest.advanceTimersByTime(60000);
            expect(spy).toHaveBeenCalledTimes(1);

            spy.mockRestore();
        });

        it('should clean up timer on stop', () => {
            offerStrategy.timerId = 123;
            offerStrategy.stop();
            expect(offerStrategy.timerId).toBe(null);
            expect(offerStrategy.running).toBe(false);
        });
    });

    describe('calculateNewOfferPrice - success cases', () => {
        beforeEach(() => {
            mockOpenSeaApi.getCollectionStats = async () => ({
                floor_price: 10.0
            });
        });

        it('should calculate new price successfully when within limits', async () => {
            offerStrategy.minPrice = '0.1';
            offerStrategy.maxPrice = '5.0';
            offerStrategy.increment = '0.1';

            const result = await offerStrategy.calculateNewOfferPrice(
                { value: '1000000000000000000', quantity: '1' }, // 1 ETH
                'test'
            );
            // 1 + 0.1 = 1.1000
            expect(parseFloat(result)).toBeCloseTo(1.1, 2);
        });

        it('should return new price when below max', async () => {
            offerStrategy.minPrice = '0.1';
            offerStrategy.maxPrice = '2.0';
            offerStrategy.increment = '0.05';

            const result = await offerStrategy.calculateNewOfferPrice(
                { value: '500000000000000000', quantity: '1' }, // 0.5 ETH
                'test'
            );
            // 0.5 + 0.05 = 0.55
            expect(parseFloat(result)).toBeCloseTo(0.55, 2);
        });
    });

    describe('checkAndCreateOffer', () => {
        beforeEach(() => {
            mockOpenSeaApi.getCollectionInfo = async () => ({
                contracts: [{ address: '0xcontractaddress' }]
            });
            mockOpenSeaApi.getOrderStatus = async () => ({
                fulfilled: false
            });
            mockOpenSeaApi.getCollectionStats = async () => ({
                floor_price: 10.0
            });
        });

        it('should create offer when no current best offer', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => ({
                offers: []
            });

            mockOfferService.createCollectionOffer = async () => '0xorderhash';

            const params = {
                type: 'collection',
                collectionSlug: 'test-collection'
            };

            const result = await offerStrategy.checkAndCreateOffer(params);
            expect(result).toBe('0xorderhash');
            expect(offerStrategy.lastOrderHash).toBe('0xorderhash');
        });

        it('should return null when best offer is from own wallet', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => ({
                offers: [{
                    protocol_data: {
                        parameters: {
                            offerer: '0x1234567890123456789012345678901234567890',
                            consideration: [{ startAmount: '1' }]
                        }
                    },
                    price: {
                        value: '1000000000000000000'
                    }
                }]
            });

            const params = {
                type: 'collection',
                collectionSlug: 'test-collection'
            };

            const result = await offerStrategy.checkAndCreateOffer(params);
            expect(result).toBe(null);
        });

        it('should handle collection info fetch error', async () => {
            mockOpenSeaApi.getCollectionInfo = async () => {
                throw new Error('API error');
            };

            const params = {
                type: 'collection',
                collectionSlug: 'test-collection'
            };

            const result = await offerStrategy.checkAndCreateOffer(params);
            expect(result).toBe(null);
        });

        it('should handle individual offer type', async () => {
            mockOpenSeaApi.getNFTOffers = async () => ({
                orders: []
            });

            mockOfferService.createIndividualOffer = async () => '0xindividualorderhash';

            const params = {
                type: 'individual',
                tokenAddress: '0xcontractaddress',
                tokenId: '123',
                collectionSlug: 'test'
            };

            const result = await offerStrategy.checkAndCreateOffer(params);
            expect(result).toBe('0xindividualorderhash');
        });

        it('should return null when new price exceeds limit', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => ({
                offers: [{
                    protocol_data: {
                        parameters: {
                            offerer: '0xdifferentaddress',
                            consideration: [{ startAmount: '1' }]
                        }
                    },
                    price: {
                        value: '900000000000000000000' // 900 ETH, much higher than max
                    }
                }]
            });

            const params = {
                type: 'collection',
                collectionSlug: 'test-collection'
            };

            const result = await offerStrategy.checkAndCreateOffer(params);
            expect(result).toBe(null);
        });

        it('should handle createCollectionOffer error gracefully', async () => {
            mockOpenSeaApi.getCollectionOffers = async () => ({
                offers: []
            });

            mockOfferService.createCollectionOffer = async () => {
                throw new Error('SDK error');
            };

            const params = {
                type: 'collection',
                collectionSlug: 'test-collection'
            };

            const result = await offerStrategy.checkAndCreateOffer(params);
            expect(result).toBe(null);
        });

        it('should handle createIndividualOffer error gracefully', async () => {
            mockOpenSeaApi.getNFTOffers = async () => ({
                orders: []
            });

            mockOfferService.createIndividualOffer = async () => {
                throw new Error('SDK error');
            };

            const params = {
                type: 'individual',
                tokenAddress: '0xcontractaddress',
                tokenId: '123',
                collectionSlug: 'test'
            };

            const result = await offerStrategy.checkAndCreateOffer(params);
            expect(result).toBe(null);
        });

        it('should call stop and exit when offer is accepted', async () => {
            offerStrategy.lastOrderHash = '0xhash123';

            mockOpenSeaApi.getOrderStatus = async () => ({
                fulfilled: true
            });

            const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('exit called');
            });
            const stopSpy = jest.spyOn(offerStrategy, 'stop');

            const params = { collectionSlug: 'test', type: 'collection' };

            try {
                await offerStrategy.checkAndCreateOffer(params);
            } catch (e) {
                expect(e.message).toBe('exit called');
            }

            expect(stopSpy).toHaveBeenCalled();
            expect(exitSpy).toHaveBeenCalledWith(0);

            exitSpy.mockRestore();
            stopSpy.mockRestore();
        });

        it('should return null when collection contracts array is null', async () => {
            mockOpenSeaApi.getOrderStatus = async () => ({ fulfilled: false });
            mockOpenSeaApi.getCollectionInfo = async () => ({
                contracts: null
            });

            const result = await offerStrategy.checkAndCreateOffer({
                type: 'collection',
                collectionSlug: 'test'
            });

            expect(result).toBeNull();
        });

        it('should return null when collection contracts array is empty', async () => {
            mockOpenSeaApi.getOrderStatus = async () => ({ fulfilled: false });
            mockOpenSeaApi.getCollectionInfo = async () => ({
                contracts: []
            });

            const result = await offerStrategy.checkAndCreateOffer({
                type: 'collection',
                collectionSlug: 'test'
            });

            expect(result).toBeNull();
        });

        it('should return null when contract address is missing', async () => {
            mockOpenSeaApi.getOrderStatus = async () => ({ fulfilled: false });
            mockOpenSeaApi.getCollectionInfo = async () => ({
                contracts: [{ address: null }]
            });

            const result = await offerStrategy.checkAndCreateOffer({
                type: 'collection',
                collectionSlug: 'test'
            });

            expect(result).toBeNull();
        });

        it('should handle critical errors gracefully', async () => {
            offerStrategy.checkLastOffer = async () => {
                throw new Error('Unexpected critical error');
            };

            const result = await offerStrategy.checkAndCreateOffer({
                type: 'collection',
                collectionSlug: 'test'
            });

            expect(result).toBeNull();
        });
    });

    describe('checkLastOffer', () => {
        it('should return false when no lastOrderHash', async () => {
            offerStrategy.lastOrderHash = null;
            const result = await offerStrategy.checkLastOffer();
            expect(result).toBe(false);
        });

        it('should return true when order is fulfilled', async () => {
            offerStrategy.lastOrderHash = '0xorderhash';
            mockOpenSeaApi.getOrderStatus = async () => ({
                fulfilled: true
            });

            const result = await offerStrategy.checkLastOffer();
            expect(result).toBe(true);
        });

        it('should return false when order is not fulfilled', async () => {
            offerStrategy.lastOrderHash = '0xorderhash';
            mockOpenSeaApi.getOrderStatus = async () => ({
                fulfilled: false
            });

            const result = await offerStrategy.checkLastOffer();
            expect(result).toBe(false);
        });
    });

    describe('error handling', () => {
        it('should return true when OpenSeaApi methods are undefined', async () => {
            mockOpenSeaApi = {};
            const strategy = new OfferStrategy(mockOfferService, mockOpenSeaApi, {
                floorPricePercentage: 80
            });

            // Should return true (allow offer) when API method is missing
            const result = await strategy.validateFloorPriceLimit('0.5', 'test');
            expect(result).toBe(true);
        });
    });
});
