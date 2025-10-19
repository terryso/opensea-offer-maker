/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { OpenSeaApi } from '../services/openseaApi.js';
import { ethers } from 'ethers';

// Mock setTimeout 来避免真实的延迟
const originalSetTimeout = global.setTimeout;
global.setTimeout = (fn, delay) => {
    // 立即执行，不等待
    return originalSetTimeout(fn, 0);
};

describe('OpenSeaApi', () => {
    let api;
    let mockAxiosInstance;

    beforeEach(() => {
        api = new OpenSeaApi('test-api-key', 'https://api.test', { name: 'ethereum' });

        // 直接 mock axiosInstance
        mockAxiosInstance = jest.fn();
        api.axiosInstance = mockAxiosInstance;
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
}); 