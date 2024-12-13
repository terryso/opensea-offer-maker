/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { OpenSeaApi } from '../services/openseaApi.js';

describe('OpenSeaApi', () => {
    let api;
    let mockFetch;

    beforeEach(() => {
        global.fetch = mockFetch = jest.fn();
        api = new OpenSeaApi('test-api-key', 'https://api.test');
    });

    describe('fetchWithRetry', () => {
        it('should retry on failure', async () => {
            mockFetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ data: 'test' })
                });

            const result = await api.fetchWithRetry('test-url', {}, 3, 10);
            expect(result).toEqual({ data: 'test' });
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        it('should throw after max retries', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            await expect(api.fetchWithRetry('test-url', {}, 3, 10))
                .rejects
                .toThrow('Network error');
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });
    });

    // ... 添加更多测试 ...
}); 