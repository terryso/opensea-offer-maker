/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Mock axios before importing OpenSeaApi
const mockAxiosInstance = jest.fn();
const mockAxiosCreate = jest.fn(() => mockAxiosInstance);

jest.unstable_mockModule('axios', () => ({
    default: {
        create: mockAxiosCreate
    }
}));

// Mock other dependencies
jest.unstable_mockModule('https-proxy-agent', () => ({
    HttpsProxyAgent: jest.fn()
}));

jest.unstable_mockModule('@opensea/seaport-js', () => ({
    Seaport: jest.fn()
}));

jest.unstable_mockModule('@opensea/seaport-js/lib/constants.js', () => ({
    ItemType: {}
}));

const mockFilterNFTs = jest.fn();

jest.unstable_mockModule('../services/cacheService.js', () => ({
    CacheService: jest.fn(() => ({
        _filterNFTs: mockFilterNFTs
    }))
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
    logger: {
        debug: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    }
}));

// Now import the module under test
const { OpenSeaApi } = await import('../services/openseaApi.js');
const { CacheService } = await import('../services/cacheService.js');

// Mock setTimeout to avoid real delays
const originalSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay) => {
    return originalSetTimeout(fn, 0);
};

describe('OpenSeaApi', () => {
    let api;
    let mockCacheService;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        mockAxiosInstance.mockReset();
        mockAxiosCreate.mockReset();
        mockAxiosCreate.mockReturnValue(mockAxiosInstance);
        mockFilterNFTs.mockReset();

        api = new OpenSeaApi('test-api-key', 'https://api.test', { name: 'ethereum' });

        // Set up reference to mock methods and replace the instance
        mockCacheService = {
            _filterNFTs: mockFilterNFTs
        };
        api.cacheService = mockCacheService;
    });

    describe('fetchWithRetry', () => {
        it('should retry on failure', async () => {
            mockAxiosInstance
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    data: { data: 'test' }
                });

            const result = await api.fetchWithRetry('https://api.test/endpoint', {}, 3, 10);
            expect(result).toEqual({ data: 'test' });
            expect(mockAxiosInstance).toHaveBeenCalledTimes(3);
        });

        it('should throw after max retries', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('Network error'));

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}, 3, 10))
                .rejects
                .toThrow();
            expect(mockAxiosInstance).toHaveBeenCalledTimes(3);
        });

        it('should return data on first success', async () => {
            mockAxiosInstance.mockResolvedValue({
                data: { result: 'success' }
            });

            const result = await api.fetchWithRetry('https://api.test/endpoint', {});
            expect(result).toEqual({ result: 'success' });
            expect(mockAxiosInstance).toHaveBeenCalledTimes(1);
        });

        it('should handle empty response', async () => {
            mockAxiosInstance.mockResolvedValue({});

            const result = await api.fetchWithRetry('https://api.test/endpoint', {});
            expect(result).toBeUndefined();
        });

        it('should return empty offers on 404 error', async () => {
            const error = new Error('Not Found');
            error.response = { status: 404 };
            mockAxiosInstance.mockRejectedValue(error);

            const result = await api.fetchWithRetry('https://api.test/endpoint', {}, 1, 0);
            expect(result).toEqual({ offers: [] });
        });

        it('should throw on 401 unauthorized error', async () => {
            const error = new Error('Unauthorized');
            error.response = { status: 401, data: 'Invalid API key' };
            mockAxiosInstance.mockRejectedValue(error);

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}, 1, 0))
                .rejects
                .toThrow('Invalid API key');
        });

        it('should retry on 500 error and throw after retries', async () => {
            const error = new Error('Server Error');
            error.response = { status: 500, data: 'Internal error' };
            mockAxiosInstance.mockRejectedValue(error);

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}, 2, 0))
                .rejects
                .toThrow('HTTP error! status: 500');
            expect(mockAxiosInstance).toHaveBeenCalledTimes(2);
        });

        it('should handle ECONNABORTED timeout error', async () => {
            const error = new Error('Timeout');
            error.code = 'ECONNABORTED';
            mockAxiosInstance.mockRejectedValue(error);

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}, 2, 0))
                .rejects
                .toThrow('Timeout');
        });

        it('should handle network error with code', async () => {
            const error = new Error('Network failed');
            error.code = 'ENETUNREACH';
            mockAxiosInstance.mockRejectedValue(error);

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}, 2, 0))
                .rejects
                .toThrow('Network failed');
        });
    });

    describe('getCollectionStats', () => {
        it('should fetch and return collection stats', async () => {
            const mockStats = {
                total: { floor_price: 1.5 }
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockStats
            });

            const result = await api.getCollectionStats('test-collection');
            expect(result).toEqual({
                ...mockStats,
                floor_price: 1.5
            });
        });

        it('should handle API errors', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            await expect(api.getCollectionStats('test-collection'))
                .rejects
                .toThrow('API Error');
        });
    });

    describe('getCollectionInfo', () => {
        it('should fetch and return collection info', async () => {
            const mockInfo = {
                collection: 'test-data'
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockInfo
            });

            const result = await api.getCollectionInfo('test-collection');
            expect(result).toEqual(mockInfo);
        });

        it('should handle empty collection data', async () => {
            mockAxiosInstance.mockResolvedValue({
                data: {}
            });

            const result = await api.getCollectionInfo('test-collection');
            expect(result).toEqual({});
        });
    });

    describe('getCollectionOffers', () => {
        it('should fetch collection offers', async () => {
            const mockOffers = {
                offers: [{ id: 1 }, { id: 2 }]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockOffers
            });

            const result = await api.getCollectionOffers('test-collection');
            expect(result).toEqual(mockOffers);
        });

        it('should handle empty offers', async () => {
            mockAxiosInstance.mockResolvedValue({
                data: { offers: [] }
            });

            const result = await api.getCollectionOffers('test-collection');
            expect(result.offers).toEqual([]);
        });
    });

    describe('getBestNFTOffer', () => {
        it('should return response for NFT', async () => {
            const mockResponse = {
                offers: [{ price: '1000000' }]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getBestNFTOffer('test-collection', '123');
            expect(result).toEqual(mockResponse);
        });

        it('should return null on API error', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getBestNFTOffer('test-collection', '123');
            expect(result).toBe(null);
        });

        it('should handle empty offers response', async () => {
            mockAxiosInstance.mockResolvedValue({
                data: { offers: [] }
            });

            const result = await api.getBestNFTOffer('test-collection', '123');
            expect(result).toEqual({ offers: [] });
        });
    });

    describe('getOrderStatus', () => {
        it('should return response with order status', async () => {
            const mockResponse = {
                orders: [{ fulfilled: true }],
                status: undefined,
                fulfilled: false
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getOrderStatus('order-hash');
            expect(result).toEqual(mockResponse);
        });

        it('should return response when no orders', async () => {
            const mockResponse = {
                orders: [],
                status: undefined,
                fulfilled: false
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getOrderStatus('order-hash');
            expect(result).toEqual(mockResponse);
        });

        it('should handle API errors', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getOrderStatus('order-hash');
            expect(result).toEqual({
                fulfilled: false,
                status: 'error',
                error: 'API Error'
            });
        });

        it('should handle 404 errors (expired orders)', async () => {
            mockAxiosInstance.mockRejectedValue({
                response: {
                    status: 404,
                    data: 'Not found'
                }
            });

            const result = await api.getOrderStatus('order-hash');
            expect(result).toEqual({
                fulfilled: false,
                status: 'not_found',
                expired: true
            });
        });
    });

    describe('constructor', () => {
        it('should initialize with API key and base URL', () => {
            expect(api.apiKey).toBe('test-api-key');
            expect(api.baseUrl).toBe('https://api.test');
        });

        it('should store chain config', () => {
            expect(api.chainConfig).toEqual({ name: 'ethereum' });
        });

        it('should create axios instance', () => {
            const newApi = new OpenSeaApi('key', 'https://api.test', { name: 'test' });
            expect(newApi.axiosInstance).toBeDefined();
        });
    });

    describe('error handling', () => {
        it('should handle network timeouts', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('ETIMEDOUT'));

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}, 1, 10))
                .rejects
                .toThrow('ETIMEDOUT');
        });

        it('should handle invalid JSON responses', async () => {
            mockAxiosInstance.mockResolvedValue({
                data: 'invalid json'
            });

            const result = await api.fetchWithRetry('https://api.test/endpoint', {});
            expect(result).toBe('invalid json');
        });

        it('should return empty offers for 404 errors', async () => {
            mockAxiosInstance.mockRejectedValue({
                response: {
                    status: 404,
                    data: 'Not found'
                }
            });

            const result = await api.fetchWithRetry('https://api.test/endpoint', {});
            expect(result).toEqual({ offers: [] });
        });

        it('should throw error for 401 unauthorized', async () => {
            mockAxiosInstance.mockRejectedValue({
                response: {
                    status: 401,
                    data: 'Unauthorized'
                }
            });

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}))
                .rejects
                .toThrow('Invalid API key');
        });

        it('should throw error for other HTTP errors after retries', async () => {
            mockAxiosInstance.mockRejectedValue({
                response: {
                    status: 500,
                    data: { error: 'Internal server error' }
                }
            });

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}, 1, 10))
                .rejects
                .toThrow('HTTP error! status: 500');
        });

        it('should handle ECONNABORTED error', async () => {
            const error = new Error('Connection aborted');
            error.code = 'ECONNABORTED';
            mockAxiosInstance.mockRejectedValue(error);

            await expect(api.fetchWithRetry('https://api.test/endpoint', {}, 1, 10))
                .rejects
                .toThrow('Connection aborted');
        });
    });

    describe('getNFTOffers', () => {
        it('should fetch NFT offers successfully', async () => {
            const mockOffers = {
                orders: [{ id: 1 }]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockOffers
            });

            const result = await api.getNFTOffers('0xcontract', '123', 5);
            expect(result).toEqual(mockOffers);
        });
    });

    describe('getAllCollectionOffers', () => {
        it('should fetch all collection offers successfully', async () => {
            const mockOffers = {
                offers: [{ id: 1 }, { id: 2 }]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockOffers
            });

            const result = await api.getAllCollectionOffers('test-collection', 50);
            expect(result).toEqual(mockOffers);
        });

        it('should return empty offers on error', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getAllCollectionOffers('test-collection');
            expect(result).toEqual({ offers: [] });
        });
    });

    describe('getBestListings', () => {
        it('should fetch best listings successfully', async () => {
            const mockListings = {
                listings: [{ id: 1 }]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockListings
            });

            const result = await api.getBestListings('test-collection', 10);
            expect(result).toEqual(mockListings);
        });

        it('should return empty listings on error', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getBestListings('test-collection');
            expect(result).toEqual({ listings: [] });
        });
    });

    describe('getCollectionInfo error handling', () => {
        it('should return null on error', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getCollectionInfo('test-collection');
            expect(result).toBe(null);
        });
    });

    describe('getWalletNFTs', () => {
        const mockNFT1 = {
            contract: '0x123',
            identifier: '1',
            name: 'Test NFT #1',
            collection: { name: 'Test Collection', slug: 'test-collection' },
            image_url: 'https://example.com/1.png',
            token_standard: 'erc721'
        };

        const mockNFT2 = {
            contract: '0x456',
            identifier: '2',
            name: 'Test NFT #2',
            collection: { name: 'Another Collection', slug: 'another-collection' },
            image_url: 'https://example.com/2.png',
            token_standard: 'erc721'
        };

        beforeEach(() => {
            // Setup default filter behavior
            mockCacheService._filterNFTs.mockImplementation(async (chain, nfts) => ({
                filtered: nfts,
                filteredCount: 0
            }));
        });

        it('should fetch wallet NFTs successfully with single page', async () => {
            const mockResponse = {
                nfts: [mockNFT1, mockNFT2],
                next: null
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getWalletNFTs('0xwallet123');

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                contract: '0x123',
                tokenId: '1',
                name: 'Test NFT #1',
                collection: 'Test Collection',
                collectionSlug: 'test-collection',
                imageUrl: 'https://example.com/1.png',
                tokenStandard: 'erc721'
            });
            expect(mockCacheService._filterNFTs).toHaveBeenCalledWith('ethereum', expect.any(Array));
        });

        it('should handle pagination correctly', async () => {
            const mockResponse1 = {
                nfts: [mockNFT1],
                next: 'page2'
            };

            const mockResponse2 = {
                nfts: [mockNFT2],
                next: null
            };

            mockAxiosInstance
                .mockResolvedValueOnce({ data: mockResponse1 })
                .mockResolvedValueOnce({ data: mockResponse2 });

            const result = await api.getWalletNFTs('0xwallet123');

            expect(result).toHaveLength(2);
            expect(mockAxiosInstance).toHaveBeenCalledTimes(2);

            // Check first call URL
            expect(mockAxiosInstance).toHaveBeenCalledWith({
                url: 'https://api.test/api/v2/chain/ethereum/account/0xwallet123/nfts?limit=50',
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': 'test-api-key'
                }
            });

            // Check second call URL with next parameter
            expect(mockAxiosInstance).toHaveBeenCalledWith({
                url: 'https://api.test/api/v2/chain/ethereum/account/0xwallet123/nfts?limit=50&next=page2',
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': 'test-api-key'
                }
            });
        });

        it('should call progress callback during pagination', async () => {
            const mockResponse1 = {
                nfts: [mockNFT1],
                next: 'page2'
            };

            const mockResponse2 = {
                nfts: [mockNFT2],
                next: null
            };

            mockAxiosInstance
                .mockResolvedValueOnce({ data: mockResponse1 })
                .mockResolvedValueOnce({ data: mockResponse2 });

            const onProgress = jest.fn();
            await api.getWalletNFTs('0xwallet123', { onProgress });

            expect(onProgress).toHaveBeenCalledTimes(2);
            expect(onProgress).toHaveBeenCalledWith({
                page: 1,
                currentPageCount: 1,
                totalCount: 1,
                hasMore: true
            });
            expect(onProgress).toHaveBeenCalledWith({
                page: 2,
                currentPageCount: 1,
                totalCount: 2,
                hasMore: false
            });
        });

        it('should apply collection filtering', async () => {
            const mockResponse = {
                nfts: [mockNFT1, mockNFT2],
                next: null
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            // Mock filtering to remove one NFT
            mockCacheService._filterNFTs.mockResolvedValue({
                filtered: [
                    {
                        contract: '0x123',
                        tokenId: '1',
                        name: 'Test NFT #1',
                        collection: 'Test Collection',
                        collectionSlug: 'test-collection',
                        imageUrl: 'https://example.com/1.png',
                        tokenStandard: 'erc721'
                    }
                ],
                filteredCount: 1
            });

            const result = await api.getWalletNFTs('0xwallet123');

            expect(result).toHaveLength(1);
            expect(mockCacheService._filterNFTs).toHaveBeenCalledWith('ethereum', expect.arrayContaining([
                expect.objectContaining({ collectionSlug: 'test-collection' }),
                expect.objectContaining({ collectionSlug: 'another-collection' })
            ]));
        });

        it('should handle custom chain and limit options', async () => {
            const mockResponse = {
                nfts: [mockNFT1],
                next: null
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            await api.getWalletNFTs('0xwallet123', {
                chain: 'base',
                limit: 100
            });

            expect(mockAxiosInstance).toHaveBeenCalledWith({
                url: 'https://api.test/api/v2/chain/base/account/0xwallet123/nfts?limit=100',
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': 'test-api-key'
                }
            });
        });

        it('should enforce maximum limit of 200', async () => {
            const mockResponse = {
                nfts: [mockNFT1],
                next: null
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            await api.getWalletNFTs('0xwallet123', { limit: 500 });

            expect(mockAxiosInstance).toHaveBeenCalledWith({
                url: 'https://api.test/api/v2/chain/ethereum/account/0xwallet123/nfts?limit=200',
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': 'test-api-key'
                }
            });
        });

        it('should handle array response format', async () => {
            mockAxiosInstance.mockResolvedValue({
                data: [mockNFT1, mockNFT2]
            });

            const result = await api.getWalletNFTs('0xwallet123');

            expect(result).toHaveLength(2);
            expect(result[0].tokenId).toBe('1');
        });

        it('should handle unexpected response format', async () => {
            mockAxiosInstance.mockResolvedValue({
                data: { unexpected: 'format' }
            });

            const result = await api.getWalletNFTs('0xwallet123');

            expect(result).toEqual([]);
        });

        it('should stop pagination at 100 pages maximum', async () => {
            // Mock response that always has a next page
            const mockResponse = {
                nfts: [mockNFT1],
                next: 'next-page'
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            await api.getWalletNFTs('0xwallet123');

            // Should stop at 100 pages
            expect(mockAxiosInstance).toHaveBeenCalledTimes(100);
        });

        it('should throw error for invalid wallet address', async () => {
            await expect(api.getWalletNFTs('')).rejects.toThrow('Valid wallet address is required');
            await expect(api.getWalletNFTs(null)).rejects.toThrow('Valid wallet address is required');
            await expect(api.getWalletNFTs(123)).rejects.toThrow('Valid wallet address is required');
        });

        it('should handle API errors', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            await expect(api.getWalletNFTs('0xwallet123')).rejects.toThrow('API Error');
        });

        it('should transform NFT data correctly with missing fields', async () => {
            const incompleteNFT = {
                contract: '0x789',
                identifier: '3'
                // Missing other fields
            };

            const mockResponse = {
                nfts: [incompleteNFT],
                next: null
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getWalletNFTs('0xwallet123');

            expect(result[0]).toEqual({
                contract: '0x789',
                tokenId: '3',
                name: 'Unknown Collection #3',
                collection: 'Unknown Collection',
                collectionSlug: '',
                imageUrl: '',
                tokenStandard: 'erc721'
            });
        });
    });

    describe('_transformNFTForCache', () => {
        it('should transform OpenSea NFT response correctly', () => {
            const openSeaNFT = {
                contract: '0x123',
                identifier: '456',
                name: 'Test NFT',
                collection: { name: 'Test Collection', slug: 'test-collection' },
                image_url: 'https://example.com/image.png',
                token_standard: 'ERC721'
            };

            const result = api._transformNFTForCache(openSeaNFT);

            expect(result).toEqual({
                contract: '0x123',
                tokenId: '456',
                name: 'Test NFT',
                collection: 'Test Collection',
                collectionSlug: 'test-collection',
                imageUrl: 'https://example.com/image.png',
                tokenStandard: 'erc721'
            });
        });

        it('should handle alternative field names', () => {
            const altFormatNFT = {
                asset_contract: { address: '0x456', schema_name: 'ERC1155' },
                token_id: '789',
                collection: { name: 'Alt Collection', slug: 'alt-collection' },
                image_preview_url: 'https://example.com/preview.png'
            };

            const result = api._transformNFTForCache(altFormatNFT);

            expect(result).toEqual({
                contract: '0x456',
                tokenId: '789',
                name: 'Alt Collection #789',
                collection: 'Alt Collection',
                collectionSlug: 'alt-collection',
                imageUrl: 'https://example.com/preview.png',
                tokenStandard: 'erc1155'
            });
        });

        it('should handle missing fields with defaults', () => {
            const incompleteNFT = {
                contract: '0x789'
            };

            const result = api._transformNFTForCache(incompleteNFT);

            expect(result).toEqual({
                contract: '0x789',
                tokenId: '',
                name: 'Unknown Collection #',
                collection: 'Unknown Collection',
                collectionSlug: '',
                imageUrl: '',
                tokenStandard: 'erc721'
            });
        });

        it('should handle string collection field (OpenSea API v2)', () => {
            const v2NFT = {
                contract: '0xabc',
                identifier: '999',
                collection: 'my-collection-slug',
                image_url: 'https://example.com/img.png',
                token_standard: 'ERC721'
            };

            const result = api._transformNFTForCache(v2NFT);

            expect(result).toEqual({
                contract: '0xabc',
                tokenId: '999',
                name: 'my-collection-slug #999',
                collection: 'my-collection-slug',
                collectionSlug: 'my-collection-slug',
                imageUrl: 'https://example.com/img.png',
                tokenStandard: 'erc721'
            });
        });

        it('should use collection_name and collection_slug fields', () => {
            const nft = {
                contract: '0xdef',
                identifier: '111',
                collection: 'slug-value',
                collection_name: 'Proper Collection Name',
                collection_slug: 'proper-slug',
                image_url: 'https://example.com/proper.png',
                token_standard: 'ERC1155'
            };

            const result = api._transformNFTForCache(nft);

            expect(result).toEqual({
                contract: '0xdef',
                tokenId: '111',
                name: 'Proper Collection Name #111',
                collection: 'Proper Collection Name',
                collectionSlug: 'proper-slug',
                imageUrl: 'https://example.com/proper.png',
                tokenStandard: 'erc1155'
            });
        });

        it('should use display_image_url and image_thumbnail_url as fallbacks', () => {
            const nft1 = {
                contract: '0x111',
                identifier: '1',
                display_image_url: 'https://example.com/display.png',
                token_standard: 'ERC721'
            };

            const result1 = api._transformNFTForCache(nft1);
            expect(result1.imageUrl).toBe('https://example.com/display.png');

            const nft2 = {
                contract: '0x222',
                identifier: '2',
                image_thumbnail_url: 'https://example.com/thumb.png',
                token_standard: 'ERC721'
            };

            const result2 = api._transformNFTForCache(nft2);
            expect(result2.imageUrl).toBe('https://example.com/thumb.png');
        });
    });

    describe('getCollectionByContract', () => {
        it('should fetch collection by contract address', async () => {
            const mockResponse = {
                collection: 'test-collection',
                name: 'Test Collection'
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getCollectionByContract('0x123');
            expect(result).toEqual(mockResponse);
            expect(mockAxiosInstance).toHaveBeenCalled();
        });

        it('should return null on error', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getCollectionByContract('0x123');
            expect(result).toBe(null);
        });
    });

    describe('getCollectionFees', () => {
        it('should fetch and parse collection fees with required creator fees', async () => {
            const mockCollectionInfo = {
                fees: [
                    { fee: 2.5, recipient: '0xCreator1', required: true },
                    { fee: 1.0, recipient: '0xCreator2', required: true }
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockCollectionInfo
            });

            const result = await api.getCollectionFees('test-collection');

            expect(result).toEqual({
                openseaFeePercent: 1.0,
                requiredCreatorFeePercent: 3.5,
                optionalCreatorFeePercent: 0,
                totalCreatorFeePercent: 3.5,
                requiredCreatorFees: [
                    { percent: 2.5, recipient: '0xCreator1', required: true },
                    { percent: 1.0, recipient: '0xCreator2', required: true }
                ],
                optionalCreatorFees: [],
                hasRequiredCreatorFees: true,
                hasOptionalCreatorFees: false,
                creatorFeePercent: 3.5,
                creatorFees: [
                    { percent: 2.5, recipient: '0xCreator1', required: true },
                    { percent: 1.0, recipient: '0xCreator2', required: true }
                ],
                totalFeePercent: 4.5,
                hasCreatorFees: true
            });
        });

        it('should handle optional creator fees', async () => {
            const mockCollectionInfo = {
                fees: [
                    { fee: 2.5, recipient: '0xCreator1', required: true },
                    { fee: 1.0, recipient: '0xCreator2', required: false }
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockCollectionInfo
            });

            const result = await api.getCollectionFees('test-collection');

            expect(result.requiredCreatorFeePercent).toBe(2.5);
            expect(result.optionalCreatorFeePercent).toBe(1.0);
            expect(result.totalCreatorFeePercent).toBe(3.5);
            expect(result.hasRequiredCreatorFees).toBe(true);
            expect(result.hasOptionalCreatorFees).toBe(true);
            expect(result.requiredCreatorFees).toHaveLength(1);
            expect(result.optionalCreatorFees).toHaveLength(1);
        });

        it('should handle no creator fees', async () => {
            const mockCollectionInfo = {
                fees: []
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockCollectionInfo
            });

            const result = await api.getCollectionFees('test-collection');

            expect(result.requiredCreatorFeePercent).toBe(0);
            expect(result.optionalCreatorFeePercent).toBe(0);
            expect(result.totalCreatorFeePercent).toBe(0);
            expect(result.hasRequiredCreatorFees).toBe(false);
            expect(result.hasOptionalCreatorFees).toBe(false);
            expect(result.totalFeePercent).toBe(1.0); // Only OpenSea fee
        });

        it('should handle missing fees array', async () => {
            const mockCollectionInfo = {};

            mockAxiosInstance.mockResolvedValue({
                data: mockCollectionInfo
            });

            const result = await api.getCollectionFees('test-collection');

            expect(result.totalCreatorFeePercent).toBe(0);
            expect(result.hasCreatorFees).toBe(false);
        });

        it('should handle null collection info', async () => {
            mockAxiosInstance.mockResolvedValue({
                data: null
            });

            const result = await api.getCollectionFees('test-collection');

            expect(result).toBe(null);
        });

        it('should return null on error', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getCollectionFees('test-collection');
            expect(result).toBe(null);
        });

        it('should skip fees without fee property', async () => {
            const mockCollectionInfo = {
                fees: [
                    { fee: 2.5, recipient: '0xCreator1', required: true },
                    { recipient: '0xNoFee', required: true }, // Missing fee
                    { fee: null, recipient: '0xNullFee', required: false } // Null fee
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockCollectionInfo
            });

            const result = await api.getCollectionFees('test-collection');

            expect(result.requiredCreatorFeePercent).toBe(2.5);
            expect(result.requiredCreatorFees).toHaveLength(1);
            expect(result.optionalCreatorFees).toHaveLength(0);
        });
    });

    describe('getListingByTokenId', () => {
        it('should fetch and return listing by token ID', async () => {
            const mockResponse = {
                orders: [
                    {
                        current_price: '1000000000000000000',
                        maker: { address: '0xSeller' },
                        protocol_data: {}
                    }
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getListingByTokenId('0xContract', '123');

            expect(result).toBeDefined();
            expect(result.price_value).toBe('1000000000000000000');
            expect(result.price).toBe(1.0);
        });

        it('should return null when no listings exist', async () => {
            const mockResponse = {
                orders: []
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getListingByTokenId('0xContract', '123');
            expect(result).toBe(null);
        });

        it('should return null on error', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getListingByTokenId('0xContract', '123');
            expect(result).toBe(null);
        });

        it('should handle listing without current_price', async () => {
            const mockResponse = {
                orders: [
                    {
                        maker: { address: '0xSeller' },
                        protocol_data: {}
                    }
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getListingByTokenId('0xContract', '123');
            expect(result).toBeDefined();
            expect(result.price_value).toBeUndefined();
            expect(result.price).toBeUndefined();
        });
    });

    describe('getNFTLastSalePrice', () => {
        it('should fetch and return last sale price', async () => {
            const mockResponse = {
                asset_events: [
                    {
                        event_timestamp: '2024-01-01T00:00:00Z',
                        payment: {
                            quantity: '2000000000000000000'
                        },
                        from_address: '0xSeller',
                        to_address: '0xBuyer',
                        transaction: '0xTxHash'
                    }
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getNFTLastSalePrice('0xContract', '123');

            expect(result).toEqual({
                price: 2.0,
                eventTimestamp: '2024-01-01T00:00:00Z',
                fromAddress: '0xSeller',
                toAddress: '0xBuyer',
                transaction: '0xTxHash'
            });
        });

        it('should return null when no sale events exist', async () => {
            const mockResponse = {
                asset_events: []
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getNFTLastSalePrice('0xContract', '123');
            expect(result).toBe(null);
        });

        it('should return null when no payment information exists', async () => {
            const mockResponse = {
                asset_events: [
                    {
                        event_timestamp: '2024-01-01T00:00:00Z',
                        from_address: '0xSeller',
                        to_address: '0xBuyer'
                    }
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getNFTLastSalePrice('0xContract', '123');
            expect(result).toBe(null);
        });

        it('should return null on error', async () => {
            mockAxiosInstance.mockRejectedValue(new Error('API Error'));

            const result = await api.getNFTLastSalePrice('0xContract', '123');
            expect(result).toBe(null);
        });

        it('should handle payment with value field', async () => {
            const mockResponse = {
                asset_events: [
                    {
                        event_timestamp: '2024-01-01T00:00:00Z',
                        payment: {
                            value: '3000000000000000000'
                        }
                    }
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getNFTLastSalePrice('0xContract', '123');
            expect(result.price).toBe(3.0);
        });

        it('should use seller and winner_account fields as fallbacks', async () => {
            const mockResponse = {
                asset_events: [
                    {
                        event_timestamp: '2024-01-01T00:00:00Z',
                        payment: {
                            quantity: '1000000000000000000'
                        },
                        seller: '0xSellerAlt',
                        winner_account: { address: '0xWinner' }
                    }
                ]
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockResponse
            });

            const result = await api.getNFTLastSalePrice('0xContract', '123');
            expect(result.fromAddress).toBe('0xSellerAlt');
            expect(result.toAddress).toBe('0xWinner');
        });
    });

    describe('getCollectionStats error handling', () => {
        it('should throw error when floor price is missing', async () => {
            const mockStats = {
                total: {}
            };

            mockAxiosInstance.mockResolvedValue({
                data: mockStats
            });

            await expect(api.getCollectionStats('test-collection'))
                .rejects
                .toThrow('Floor price not available');
        });

        it('should throw error when total is missing', async () => {
            const mockStats = {};

            mockAxiosInstance.mockResolvedValue({
                data: mockStats
            });

            await expect(api.getCollectionStats('test-collection'))
                .rejects
                .toThrow('Floor price not available');
        });
    });
});
