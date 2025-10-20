/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

describe('config.js', () => {
    let originalEnv;

    beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };

        // Clear module cache
        jest.resetModules();
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    it('should export configuration when environment variables are set', async () => {
        // Set required environment variables
        process.env.OPENSEA_API_KEY = 'test-opensea-key';
        process.env.ALCHEMY_API_KEY = 'test-alchemy-key';

        // Mock the env module
        jest.unstable_mockModule('../utils/env.js', () => ({
            OPENSEA_API_KEY: 'test-opensea-key',
            ALCHEMY_API_KEY: 'test-alchemy-key'
        }));

        const config = await import('../config.js');

        expect(config.OPENSEA_API_KEY).toBe('test-opensea-key');
        expect(config.ALCHEMY_API_KEY).toBe('test-alchemy-key');
        expect(config.OPENSEA_API_BASE_URL).toBe('https://api.opensea.io');
        expect(config.OPENSEA_SEAPORT_ADDRESS).toBe('0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC');
        expect(config.SUPPORTED_CHAINS).toBeDefined();
        expect(config.DEFAULT_CHAIN).toBeDefined();
        expect(config.WETH_ABI).toBeDefined();
        expect(config.SUPPORTED_MARKETPLACES).toBeDefined();
    });

    it('should throw error when OPENSEA_API_KEY is missing', async () => {
        // Mock env module with missing OPENSEA_API_KEY
        jest.unstable_mockModule('../utils/env.js', () => ({
            OPENSEA_API_KEY: undefined,
            ALCHEMY_API_KEY: 'test-alchemy-key'
        }));

        await expect(async () => {
            await import('../config.js');
        }).rejects.toThrow('Missing environment variables');
    });

    it('should throw error when ALCHEMY_API_KEY is missing', async () => {
        // Mock env module with missing ALCHEMY_API_KEY
        jest.unstable_mockModule('../utils/env.js', () => ({
            OPENSEA_API_KEY: 'test-opensea-key',
            ALCHEMY_API_KEY: undefined
        }));

        await expect(async () => {
            await import('../config.js');
        }).rejects.toThrow('Missing environment variables');
    });

    it('should throw error with ENV_MISSING code when both keys are missing', async () => {
        // Mock env module with both missing
        jest.unstable_mockModule('../utils/env.js', () => ({
            OPENSEA_API_KEY: undefined,
            ALCHEMY_API_KEY: undefined
        }));

        try {
            await import('../config.js');
            // Should not reach here
            expect(true).toBe(false);
        } catch (error) {
            expect(error.message).toContain('Missing environment variables');
            expect(error.code).toBe('ENV_MISSING');
        }
    });

    it('should export correct WETH_ABI structure', async () => {
        process.env.OPENSEA_API_KEY = 'test-opensea-key';
        process.env.ALCHEMY_API_KEY = 'test-alchemy-key';

        jest.unstable_mockModule('../utils/env.js', () => ({
            OPENSEA_API_KEY: 'test-opensea-key',
            ALCHEMY_API_KEY: 'test-alchemy-key'
        }));

        const config = await import('../config.js');

        expect(Array.isArray(config.WETH_ABI)).toBe(true);
        expect(config.WETH_ABI.length).toBeGreaterThan(0);
        expect(config.WETH_ABI.some(abi => abi.includes('balanceOf'))).toBe(true);
        expect(config.WETH_ABI.some(abi => abi.includes('deposit'))).toBe(true);
    });

    it('should export correct supported marketplaces', async () => {
        process.env.OPENSEA_API_KEY = 'test-opensea-key';
        process.env.ALCHEMY_API_KEY = 'test-alchemy-key';

        jest.unstable_mockModule('../utils/env.js', () => ({
            OPENSEA_API_KEY: 'test-opensea-key',
            ALCHEMY_API_KEY: 'test-alchemy-key'
        }));

        const config = await import('../config.js');

        expect(config.SUPPORTED_MARKETPLACES).toEqual({
            ethereum: ['opensea'],
            base: ['opensea'],
            sepolia: ['opensea']
        });
    });
});
