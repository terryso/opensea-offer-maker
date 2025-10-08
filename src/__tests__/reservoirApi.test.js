import { ReservoirApi } from '../services/reservoirApi.js';

// Mock setTimeout 来避免真实的延迟
const originalSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay) => {
    // 立即执行，不等待
    return originalSetTimeout(fn, 0);
};

// Mock fetch globally
global.fetch = async () => ({
    ok: true,
    json: async () => ({ collections: [], orders: [] })
});

describe('ReservoirApi', () => {
    let reservoirApi;
    const mockApiKey = 'test-api-key';
    const mockChainConfig = { chain: 'ethereum' };

    beforeEach(() => {
        reservoirApi = new ReservoirApi(mockApiKey, mockChainConfig);
    });

    describe('constructor', () => {
        it('should initialize with mainnet URL for ethereum chain', () => {
            const api = new ReservoirApi(mockApiKey, { chain: 'ethereum' });
            expect(api.baseUrl).toBe('https://api.reservoir.tools');
        });

        it('should initialize with mainnet URL for unknown chain', () => {
            const api = new ReservoirApi(mockApiKey, { chain: 'unknown' });
            expect(api.baseUrl).toBe('https://api.reservoir.tools');
        });

        it('should store API key', () => {
            expect(reservoirApi.apiKey).toBe(mockApiKey);
        });

        it('should store chain config', () => {
            expect(reservoirApi.chainConfig).toEqual(mockChainConfig);
        });
    });

    describe('URL selection', () => {
        it('should use Base URL for Base chain', () => {
            const api = new ReservoirApi(mockApiKey, { chain: 'base' });
            expect(api.baseUrl).toBe('https://api-base.reservoir.tools');
        });

        it('should use Sepolia URL for Sepolia chain', () => {
            const api = new ReservoirApi(mockApiKey, { chain: 'sepolia' });
            expect(api.baseUrl).toBe('https://api-sepolia.reservoir.tools');
        });

        it('should handle case sensitivity', () => {
            const api1 = new ReservoirApi(mockApiKey, { chain: 'BASE' });
            expect(api1.baseUrl).toBe('https://api.reservoir.tools');
        });
    });

    describe('API configuration', () => {
        it('should accept different API keys', () => {
            const api1 = new ReservoirApi('key1', mockChainConfig);
            const api2 = new ReservoirApi('key2', mockChainConfig);

            expect(api1.apiKey).toBe('key1');
            expect(api2.apiKey).toBe('key2');
        });

        it('should handle null API key', () => {
            const api = new ReservoirApi(null, mockChainConfig);
            expect(api.apiKey).toBe(null);
        });

        it('should handle undefined API key', () => {
            const api = new ReservoirApi(undefined, mockChainConfig);
            expect(api.apiKey).toBe(undefined);
        });
    });

    describe('getTopCollections', () => {
        it('should return empty data on error', async () => {
            // Mock fetch to throw error
            const originalFetch = global.fetch;
            global.fetch = async () => { throw new Error('Network error'); };

            const result = await reservoirApi.getTopCollections();

            expect(result).toEqual({
                data: [],
                continuation: null
            });

            global.fetch = originalFetch;
        });

        it('should handle empty response', async () => {
            global.fetch = async () => ({
                ok: true,
                json: async () => ({ collections: [] })
            });

            const result = await reservoirApi.getTopCollections();

            expect(result.data).toEqual([]);
            expect(result.continuation).toBe(undefined);
        });

        it('should build correct URL with options', async () => {
            let capturedUrl = '';
            global.fetch = async (url) => {
                capturedUrl = url;
                return {
                    ok: true,
                    json: async () => ({ collections: [] })
                };
            };

            await reservoirApi.getTopCollections(10, {
                minFloorAskPrice: '0.5',
                maxFloorAskPrice: '2.0',
                continuation: 'token123'
            });

            expect(capturedUrl).toContain('limit=10');
            expect(capturedUrl).toContain('minFloorAskPrice=0.5');
            expect(capturedUrl).toContain('maxFloorAskPrice=2.0');
            expect(capturedUrl).toContain('continuation=token123');
        });

        it('should handle contractAddress option', async () => {
            let capturedUrl = '';
            global.fetch = async (url) => {
                capturedUrl = url;
                return {
                    ok: true,
                    json: async () => ({ collections: [] })
                };
            };

            await reservoirApi.getTopCollections(10, {
                contractAddress: '0xabc123'
            });

            expect(capturedUrl).toContain('id=0xabc123');
            expect(capturedUrl).not.toContain('limit=');
        });
    });

    describe('getCollectionOffers', () => {
        it('should return empty offers on error', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => { throw new Error('API error'); };

            const result = await reservoirApi.getCollectionOffers('test-collection');

            expect(result).toEqual({ offers: [] });

            global.fetch = originalFetch;
        });

        it('should transform orders to offers format', async () => {
            global.fetch = async () => ({
                ok: true,
                json: async () => ({
                    orders: [{
                        price: { amount: { raw: '1000000000000000000' } }
                    }]
                })
            });

            const result = await reservoirApi.getCollectionOffers('test');

            expect(result.offers).toHaveLength(1);
            expect(result.offers[0]).toHaveProperty('price');
            expect(result.offers[0]).toHaveProperty('protocol_data');
        });
    });

    describe('getTrendingCollections', () => {
        it('should return empty data on error', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => { throw new Error('API error'); };

            const result = await reservoirApi.getTrendingCollections();

            expect(result).toEqual({ data: [] });

            global.fetch = originalFetch;
        });

        it('should filter by volume', async () => {
            global.fetch = async () => ({
                ok: true,
                json: async () => ({
                    collections: [
                        {
                            name: 'High',
                            collectionVolume: { '1day': 200 },
                            floorAsk: { price: { amount: { decimal: 1 } } },
                            tokenCount: 100,
                            id: '1'
                        },
                        {
                            name: 'Low',
                            collectionVolume: { '1day': 50 },
                            floorAsk: { price: { amount: { decimal: 1 } } },
                            tokenCount: 100,
                            id: '2'
                        }
                    ]
                })
            });

            const result = await reservoirApi.getTrendingCollections({ volume: '100' });

            expect(result.data).toHaveLength(1);
            expect(result.data[0].name).toBe('High');
        });
    });

    describe('getListingStatus', () => {
        it('should throw on API error', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => { throw new Error('API error'); };

            await expect(
                reservoirApi.getListingStatus('order-123')
            ).rejects.toThrow();

            global.fetch = originalFetch;
        });

        it('should return first order from response', async () => {
            global.fetch = async () => ({
                ok: true,
                json: async () => ({
                    orders: [{ id: 'order-1', status: 'active' }]
                })
            });

            const result = await reservoirApi.getListingStatus('order-1');

            expect(result).toEqual({ id: 'order-1', status: 'active' });
        });
    });

    describe('getNFTRoyalties', () => {
        it('should return null on error', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => { throw new Error('API error'); };

            const result = await reservoirApi.getNFTRoyalties('0xabc', '123');

            expect(result).toBe(null);

            global.fetch = originalFetch;
        });

        it('should extract royalty data', async () => {
            global.fetch = async () => ({
                ok: true,
                json: async () => ({
                    tokens: [{
                        token: {
                            royalties: [{ bps: 500 }],
                            onChainRoyalties: [{ bps: 250 }],
                            royaltyBps: 750
                        }
                    }]
                })
            });

            const result = await reservoirApi.getNFTRoyalties('0xabc', '123');

            expect(result.royalties).toHaveLength(1);
            expect(result.royaltyBps).toBe(750);
        });

        it('should handle missing token data', async () => {
            global.fetch = async () => ({
                ok: true,
                json: async () => ({ tokens: [] })
            });

            const result = await reservoirApi.getNFTRoyalties('0xabc', '123');

            expect(result.royalties).toEqual([]);
        });
    });

    describe('getListingDetails', () => {
        it('should return null on error', async () => {
            const originalFetch = global.fetch;
            global.fetch = async () => { throw new Error('API error'); };

            const result = await reservoirApi.getListingDetails('0xabc', '123');

            expect(result).toBe(null);

            global.fetch = originalFetch;
        });

        it('should return null when no orders found', async () => {
            global.fetch = async () => ({
                ok: true,
                json: async () => ({ orders: [] })
            });

            const result = await reservoirApi.getListingDetails('0xabc', '123');

            expect(result).toBe(null);
        });

        it('should extract listing details from first order', async () => {
            global.fetch = async () => ({
                ok: true,
                json: async () => ({
                    orders: [{
                        price: { netAmount: { native: 1.5 } },
                        source: { name: 'OpenSea' },
                        fees: [{ amount: 0.025 }],
                        royalties: [{ amount: 0.05 }],
                        rawData: { test: 'data' }
                    }]
                })
            });

            const result = await reservoirApi.getListingDetails('0xabc', '123');

            expect(result.price).toBe(1.5);
            expect(result.marketplace).toBe('OpenSea');
            expect(result.fees).toHaveLength(1);
        });
    });

    describe('fetchWithRetry', () => {
        it('should include API key in headers', async () => {
            let capturedHeaders;
            global.fetch = async (url, options) => {
                capturedHeaders = options.headers;
                return {
                    ok: true,
                    json: async () => ({})
                };
            };

            await reservoirApi.fetchWithRetry('https://test.com', {});

            expect(capturedHeaders['x-api-key']).toBe(mockApiKey);
            expect(capturedHeaders['Accept']).toBe('application/json');
        });

        it('should merge custom headers', async () => {
            let capturedHeaders;
            global.fetch = async (url, options) => {
                capturedHeaders = options.headers;
                return {
                    ok: true,
                    json: async () => ({})
                };
            };

            await reservoirApi.fetchWithRetry('https://test.com', {
                headers: { 'Custom-Header': 'value' }
            });

            expect(capturedHeaders['Custom-Header']).toBe('value');
            expect(capturedHeaders['x-api-key']).toBe(mockApiKey);
        });
    });
});
