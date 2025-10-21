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

    describe('encryption configuration', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'test';
            process.env.OPENSEA_API_KEY = 'test-opensea-key';
            process.env.ALCHEMY_API_KEY = 'test-alchemy-key';
        });

        it('should export encryption configuration with defaults', async () => {
            jest.unstable_mockModule('../utils/env.js', () => ({
                OPENSEA_API_KEY: 'test-opensea-key',
                ALCHEMY_API_KEY: 'test-alchemy-key'
            }));

            const config = await import('../config.js');

            expect(config.ENCRYPTION_PASSWORD).toBeDefined();
            expect(config.ENCRYPTION_SALT).toBeDefined();
            expect(config.ENCRYPTION_ITERATIONS).toBe(32768);
            expect(config.ENCRYPTION_MEMORY).toBe(134217728);
            expect(config.ENCRYPTION_PARALLELISM).toBe(1);
        });

        it('should use custom encryption environment variables when provided', async () => {
            process.env.ENCRYPTION_PASSWORD = 'custom-password-12345678';
            process.env.ENCRYPTION_SALT = 'custom-salt';
            process.env.ENCRYPTION_ITERATIONS = '65536';
            process.env.ENCRYPTION_MEMORY = '268435456';
            process.env.ENCRYPTION_PARALLELISM = '2';

            jest.unstable_mockModule('../utils/env.js', () => ({
                OPENSEA_API_KEY: 'test-opensea-key',
                ALCHEMY_API_KEY: 'test-alchemy-key'
            }));

            const config = await import('../config.js');

            expect(config.ENCRYPTION_PASSWORD).toBe('custom-password-12345678');
            expect(config.ENCRYPTION_SALT).toBe('custom-salt');
            expect(config.ENCRYPTION_ITERATIONS).toBe(65536);
            expect(config.ENCRYPTION_MEMORY).toBe(268435456);
            expect(config.ENCRYPTION_PARALLELISM).toBe(2);
        });

        it('should export encryption configuration object', async () => {
            jest.unstable_mockModule('../utils/env.js', () => ({
                OPENSEA_API_KEY: 'test-opensea-key',
                ALCHEMY_API_KEY: 'test-alchemy-key'
            }));

            const config = await import('../config.js');

            expect(config.ENCRYPTION_CONFIG).toMatchObject({
                password: expect.any(String),
                salt: expect.any(String),
                iterations: expect.any(Number),
                memory: expect.any(Number),
                parallelism: expect.any(Number),
                keyLength: 32,
                algorithm: 'aes-256-gcm'
            });
        });

        it('should handle encryption validation in test environment', async () => {
            process.env.ENCRYPTION_PASSWORD = 'short';
            process.env.ENCRYPTION_SALT = 'short';

            jest.unstable_mockModule('../utils/env.js', () => ({
                OPENSEA_API_KEY: 'test-opensea-key',
                ALCHEMY_API_KEY: 'test-alchemy-key'
            }));

            // Should not throw in test environment
            const config = await import('../config.js');

            expect(config.encryptionValidation).toBeDefined();
            expect(config.encryptionValidation.isValid).toBe(false);
            expect(config.encryptionValidation.warnings).toBeDefined();
        });

        it('should validate successful encryption configuration', async () => {
            process.env.ENCRYPTION_PASSWORD = 'this-is-a-very-long-and-secure-password-123';
            process.env.ENCRYPTION_SALT = 'secure-salt-123';
            process.env.ENCRYPTION_ITERATIONS = '65536';
            process.env.ENCRYPTION_MEMORY = '134217728';
            process.env.ENCRYPTION_PARALLELISM = '4';

            jest.unstable_mockModule('../utils/env.js', () => ({
                OPENSEA_API_KEY: 'test-opensea-key',
                ALCHEMY_API_KEY: 'test-alchemy-key'
            }));

            const config = await import('../config.js');
            expect(config.encryptionValidation.isValid).toBe(true);
        });

        it('should handle missing environment variables gracefully', async () => {
            jest.unstable_mockModule('../utils/env.js', () => ({
                OPENSEA_API_KEY: undefined,
                ALCHEMY_API_KEY: undefined
            }));

            try {
                await import('../config.js');
                fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toContain('Missing environment variables');
                expect(error.code).toBe('ENV_MISSING');
            }
        });

        it('should export chain configuration', async () => {
            jest.unstable_mockModule('../utils/env.js', () => ({
                OPENSEA_API_KEY: 'test-opensea-key',
                ALCHEMY_API_KEY: 'test-alchemy-key'
            }));

            const config = await import('../config.js');

            expect(config.SUPPORTED_CHAINS).toBeDefined();
            expect(config.DEFAULT_CHAIN).toBeDefined();
            expect(typeof config.SUPPORTED_CHAINS).toBe('object');
            expect(config.SUPPORTED_CHAINS !== null).toBe(true);
        });

        it('should export OpenSea API configuration', async () => {
            jest.unstable_mockModule('../utils/env.js', () => ({
                OPENSEA_API_KEY: 'test-opensea-key',
                ALCHEMY_API_KEY: 'test-alchemy-key'
            }));

            const config = await import('../config.js');

            expect(config.OPENSEA_API_BASE_URL).toBe('https://api.opensea.io');
            expect(config.OPENSEA_SEAPORT_ADDRESS).toBe('0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC');
        });
    });
});
