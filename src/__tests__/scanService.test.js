import { ScanService } from '../services/scanService.js';

// Mock setTimeout 来避免真实的延迟
const originalSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay) => {
    // 立即执行，不等待
    return originalSetTimeout(fn, 0);
};

describe('ScanService', () => {
    let scanService;
    let mockReservoirApi;
    let mockOpenSeaApi;

    beforeEach(() => {
        mockReservoirApi = {
            getTopCollections: async () => ({ data: [], continuation: null }),
            getTrendingCollections: async () => ({ data: [] })
        };

        mockOpenSeaApi = {};

        scanService = new ScanService(mockReservoirApi, mockOpenSeaApi);
    });

    describe('constructor', () => {
        it('should initialize with reservoir and opensea APIs', () => {
            expect(scanService.reservoirApi).toBe(mockReservoirApi);
            expect(scanService.openSeaApi).toBe(mockOpenSeaApi);
        });

        it('should accept null APIs', () => {
            const service = new ScanService(null, null);
            expect(service.reservoirApi).toBe(null);
            expect(service.openSeaApi).toBe(null);
        });
    });

    describe('_processCollections', () => {
        it('should return empty array for empty input', async () => {
            const result = await scanService._processCollections([], 0, 0, 0);
            expect(result).toEqual([]);
        });

        it('should filter collections without floor price', async () => {
            const collections = [
                {
                    name: 'No Floor',
                    slug: 'no-floor',
                    stats: {
                        volume24h: 100,
                        floorPrice: null,
                        topBid: 0.8,
                        estimatedSales: 100
                    }
                }
            ];

            const result = await scanService._processCollections(collections, 0, 0, 0);
            expect(result).toEqual([]);
        });

        it('should filter collections without offers', async () => {
            const collections = [
                {
                    name: 'No Offers',
                    slug: 'no-offers',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: null,
                        estimatedSales: 100
                    }
                }
            ];

            const result = await scanService._processCollections(collections, 0, 0, 0);
            expect(result).toEqual([]);
        });

        it('should calculate gap percentage correctly', async () => {
            const collections = [
                {
                    name: 'Test Gap',
                    slug: 'test-gap',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 100
                    },
                    openseaUrl: 'https://opensea.io/collection/test-gap',
                    reservoirUrl: 'https://reservoir.tools/test-gap'
                }
            ];

            const result = await scanService._processCollections(collections, 0, 0, 0);
            expect(result).toHaveLength(1);
            expect(result[0].gapPercentage).toBeCloseTo(20, 1); // (1.0 - 0.8) / 1.0 * 100
        });

        it('should filter collections by volume threshold', async () => {
            const collections = [
                {
                    name: 'High Volume',
                    slug: 'high-volume',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 100
                    },
                    openseaUrl: 'https://opensea.io/collection/high-volume',
                    reservoirUrl: 'https://reservoir.tools/high-volume'
                },
                {
                    name: 'Low Volume',
                    slug: 'low-volume',
                    stats: {
                        volume24h: 10,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 10
                    },
                    openseaUrl: 'https://opensea.io/collection/low-volume',
                    reservoirUrl: 'https://reservoir.tools/low-volume'
                }
            ];

            const result = await scanService._processCollections(collections, 50, 0, 0);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('high-volume');
        });

        it('should filter collections by gap threshold', async () => {
            const collections = [
                {
                    name: 'Big Gap',
                    slug: 'big-gap',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.7,
                        estimatedSales: 100
                    },
                    openseaUrl: 'https://opensea.io/collection/big-gap',
                    reservoirUrl: 'https://reservoir.tools/big-gap'
                },
                {
                    name: 'Small Gap',
                    slug: 'small-gap',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.95,
                        estimatedSales: 100
                    },
                    openseaUrl: 'https://opensea.io/collection/small-gap',
                    reservoirUrl: 'https://reservoir.tools/small-gap'
                }
            ];

            const result = await scanService._processCollections(collections, 0, 10, 0);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('big-gap');
        });

        it('should filter collections by sales threshold', async () => {
            const collections = [
                {
                    name: 'High Sales',
                    slug: 'high-sales',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 100
                    },
                    openseaUrl: 'https://opensea.io/collection/high-sales',
                    reservoirUrl: 'https://reservoir.tools/high-sales'
                },
                {
                    name: 'Low Sales',
                    slug: 'low-sales',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 10
                    },
                    openseaUrl: 'https://opensea.io/collection/low-sales',
                    reservoirUrl: 'https://reservoir.tools/low-sales'
                }
            ];

            const result = await scanService._processCollections(collections, 0, 0, 50);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('high-sales');
        });

        it('should include blurUrl when provided', async () => {
            const collections = [
                {
                    name: 'With Blur',
                    slug: 'with-blur',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 100
                    },
                    openseaUrl: 'https://opensea.io/collection/with-blur',
                    reservoirUrl: 'https://reservoir.tools/with-blur',
                    blurUrl: 'https://blur.io/collection/with-blur'
                }
            ];

            const result = await scanService._processCollections(collections, 0, 0, 0);
            expect(result).toHaveLength(1);
            expect(result[0]).toHaveProperty('blurUrl');
            expect(result[0].blurUrl).toBe('https://blur.io/collection/with-blur');
        });

        it('should not include blurUrl when not provided', async () => {
            const collections = [
                {
                    name: 'Without Blur',
                    slug: 'without-blur',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 100
                    },
                    openseaUrl: 'https://opensea.io/collection/without-blur',
                    reservoirUrl: 'https://reservoir.tools/without-blur'
                }
            ];

            const result = await scanService._processCollections(collections, 0, 0, 0);
            expect(result).toHaveLength(1);
            expect(result[0]).not.toHaveProperty('blurUrl');
        });

        it('should handle errors gracefully and continue processing', async () => {
            const collections = [
                {
                    name: 'Error Collection',
                    slug: 'error-collection',
                    stats: null // This will cause an error
                },
                {
                    name: 'Valid Collection',
                    slug: 'valid-collection',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 100
                    },
                    openseaUrl: 'https://opensea.io/collection/valid-collection',
                    reservoirUrl: 'https://reservoir.tools/valid-collection'
                }
            ];

            const result = await scanService._processCollections(collections, 0, 0, 0);
            expect(result).toHaveLength(1);
            expect(result[0].slug).toBe('valid-collection');
        });

        it('should include all required fields in output', async () => {
            const collections = [
                {
                    name: 'Complete',
                    slug: 'complete',
                    stats: {
                        volume24h: 123.45,
                        floorPrice: 2.5,
                        topBid: 2.0,
                        estimatedSales: 50
                    },
                    openseaUrl: 'https://opensea.io/collection/complete',
                    reservoirUrl: 'https://reservoir.tools/complete'
                }
            ];

            const result = await scanService._processCollections(collections, 0, 0, 0);
            expect(result).toHaveLength(1);

            const opportunity = result[0];
            expect(opportunity).toHaveProperty('name', 'Complete');
            expect(opportunity).toHaveProperty('slug', 'complete');
            expect(opportunity).toHaveProperty('floorPrice', 2.5);
            expect(opportunity).toHaveProperty('highestOffer', 2.0);
            expect(opportunity).toHaveProperty('gapPercentage', 20);
            expect(opportunity).toHaveProperty('volume24h', 123.45);
            expect(opportunity).toHaveProperty('estimatedSales', 50);
            expect(opportunity).toHaveProperty('openseaUrl');
            expect(opportunity).toHaveProperty('reservoirUrl');
        });
    });

    describe('scanTopCollections', () => {
        it('should scan and return opportunities', async () => {
            mockReservoirApi.getTopCollections = async () => ({
                data: [
                    {
                        name: 'Test Collection',
                        slug: 'test-collection',
                        stats: {
                            volume24h: 100,
                            floorPrice: 1.0,
                            topBid: 0.8,
                            estimatedSales: 50
                        },
                        openseaUrl: 'https://opensea.io/test',
                        reservoirUrl: 'https://reservoir.tools/test'
                    }
                ],
                continuation: null
            });

            const result = await scanService.scanTopCollections({
                minOpportunities: 10
            });

            expect(result).toHaveProperty('scannedPages', 1);
            expect(result.opportunities).toHaveLength(1);
        });

        it('should stop when reaching min opportunities', async () => {
            let callCount = 0;
            mockReservoirApi.getTopCollections = async () => {
                callCount++;
                return {
                    data: [{
                        name: `Collection ${callCount}`,
                        slug: `collection-${callCount}`,
                        stats: {
                            volume24h: 100,
                            floorPrice: 1.0,
                            topBid: 0.8,
                            estimatedSales: 50
                        },
                        openseaUrl: 'https://opensea.io/test',
                        reservoirUrl: 'https://reservoir.tools/test'
                    }],
                    continuation: callCount < 5 ? 'next' : null
                };
            };

            const result = await scanService.scanTopCollections({
                minOpportunities: 3
            });

            expect(result.opportunities).toHaveLength(3);
            expect(callCount).toBe(3);
        });

        it('should stop when no more pages', async () => {
            mockReservoirApi.getTopCollections = async () => ({
                data: [{
                    name: 'Test Collection',
                    slug: 'test-collection',
                    stats: {
                        volume24h: 100,
                        floorPrice: 1.0,
                        topBid: 0.8,
                        estimatedSales: 50
                    },
                    openseaUrl: 'https://opensea.io/test',
                    reservoirUrl: 'https://reservoir.tools/test'
                }],
                continuation: null
            });

            const result = await scanService.scanTopCollections({
                minOpportunities: 100
            });

            expect(result.scannedPages).toBe(1);
            expect(result.opportunities).toHaveLength(1);
        });

        it('should pass floor price filters to API', async () => {
            let capturedOptions;
            mockReservoirApi.getTopCollections = async (limit, options) => {
                capturedOptions = options;
                return {
                    data: [],
                    continuation: null
                };
            };

            await scanService.scanTopCollections({
                minFloor: '0.1',
                maxFloor: '10',
                minOpportunities: 10
            });

            expect(capturedOptions).toHaveProperty('minFloorAskPrice', '0.1');
            expect(capturedOptions).toHaveProperty('maxFloorAskPrice', '10');
        });
    });

    describe('scanTrendingCollections', () => {
        it('should fetch and return trending collections', async () => {
            mockReservoirApi.getTrendingCollections = async () => ({
                data: [
                    { name: 'Trending 1', slug: 'trending-1' },
                    { name: 'Trending 2', slug: 'trending-2' }
                ]
            });

            const result = await scanService.scanTrendingCollections({
                limit: 20,
                period: '24h'
            });

            expect(result.collections).toHaveLength(2);
            expect(result.collections[0].name).toBe('Trending 1');
        });

        it('should pass options to API', async () => {
            let capturedOptions;
            mockReservoirApi.getTrendingCollections = async (options) => {
                capturedOptions = options;
                return { data: [] };
            };

            await scanService.scanTrendingCollections({
                limit: 50,
                period: '7d'
            });

            expect(capturedOptions).toHaveProperty('limit', 50);
            expect(capturedOptions).toHaveProperty('period', '7d');
        });

        it('should handle empty results', async () => {
            mockReservoirApi.getTrendingCollections = async () => ({
                data: []
            });

            const result = await scanService.scanTrendingCollections({
                limit: 10,
                period: '1h'
            });

            expect(result.collections).toEqual([]);
        });
    });
});
