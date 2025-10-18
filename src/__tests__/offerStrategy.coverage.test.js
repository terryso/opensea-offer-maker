import { jest } from '@jest/globals';
import { OfferStrategy } from '../services/offerStrategy.js';

describe('OfferStrategy - Coverage Tests', () => {
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

    describe('getBestOffer - line 263 coverage', () => {
        it('should return best offer when unit prices equal but quantities differ', async () => {
            // 测试行 262: if (currentUnitValue === bestUnitValue && currentQuantity > bestQuantity) return current;
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
            // 当单价相等时，应选择数量更多的
            expect(result.price.quantity).toBe('2');
        });

        it('should return best offer when current has lower unit price than best', async () => {
            // 测试行 263: return best; (当 currentUnitValue < bestUnitValue 时)
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
            // 应该返回单价更高的 offer
            expect(result.maker.address).toBe('0xhigher');
        });
    });

    describe('getBestOffer - line 291-298 coverage (individual token)', () => {
        it('should handle individual token offers with null startAmount', async () => {
            // 测试行 291: const quantity = bestOffer.protocol_data.parameters.consideration[0].startAmount || '1';
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
            expect(result.price.quantity).toBe('1'); // 应该使用默认值 '1'
        });
    });

    describe('start method - lines 320-325 coverage', () => {
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

        it('should call checkAndCreateOffer immediately and set interval', () => {
            const spy = jest.spyOn(offerStrategy, 'checkAndCreateOffer').mockResolvedValue(null);

            const params = { collectionSlug: 'test', type: 'collection' };
            offerStrategy.start(params);

            // 立即调用一次
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith(params);

            // 应该设置 running 为 true
            expect(offerStrategy.running).toBe(true);

            // 应该设置定时器
            expect(offerStrategy.timerId).not.toBeNull();

            spy.mockRestore();
        });

        it('should call checkAndCreateOffer repeatedly via interval when running is true', () => {
            const spy = jest.spyOn(offerStrategy, 'checkAndCreateOffer').mockResolvedValue(null);

            const params = { collectionSlug: 'test', type: 'collection' };
            offerStrategy.start(params);

            expect(spy).toHaveBeenCalledTimes(1);

            // 快进时间，触发定时器
            jest.advanceTimersByTime(60000);
            expect(spy).toHaveBeenCalledTimes(2);

            jest.advanceTimersByTime(60000);
            expect(spy).toHaveBeenCalledTimes(3);

            spy.mockRestore();
        });

        it('should not call checkAndCreateOffer when running is false', () => {
            const spy = jest.spyOn(offerStrategy, 'checkAndCreateOffer').mockResolvedValue(null);

            const params = { collectionSlug: 'test', type: 'collection' };
            offerStrategy.start(params);

            expect(spy).toHaveBeenCalledTimes(1);

            // 停止后不应再调用
            offerStrategy.stop();
            jest.advanceTimersByTime(60000);
            expect(spy).toHaveBeenCalledTimes(1); // 仍然是 1

            spy.mockRestore();
        });
    });

    describe('checkAndCreateOffer - lines 148-151 coverage (process.exit)', () => {
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
    });

    describe('checkAndCreateOffer - line 161 coverage (missing contract address)', () => {
        it('should return null when contracts array is null', async () => {
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

        it('should return null when contracts array is empty', async () => {
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
    });

    describe('checkAndCreateOffer - lines 233-234 coverage (outer catch)', () => {
        it('should catch and return null on critical errors', async () => {
            // 模拟一个会在外层 try-catch 中被捕获的错误
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
});
