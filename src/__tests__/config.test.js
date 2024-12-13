/**
 * @jest-environment node
 */

// Mock dotenv before any other imports
jest.mock('dotenv', () => ({
    config: jest.fn()
}));

// 首先创建所有的 mock 函数
const mockCreateOffer = jest.fn();
const mockCreateCollectionOffer = jest.fn();

// 设置 mock
jest.mock('ethers', () => ({
    AlchemyProvider: jest.fn().mockReturnValue({
        getNetwork: jest.fn().mockResolvedValue({ chainId: 8453, name: 'base' })
    }),
    Wallet: jest.fn().mockReturnValue({
        address: '0x1234567890123456789012345678901234567890'
    })
}));

jest.mock('opensea-js', () => ({
    Chain: { Base: 'base' },
    OpenSeaSDK: jest.fn().mockReturnValue({
        createOffer: mockCreateOffer,
        createCollectionOffer: mockCreateCollectionOffer
    })
}));

import { jest } from '@jest/globals';

describe('Config', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        // 完全重置环境变量
        process.env = {};
        // 确保 dotenv.config() 不会加载任何环境变量
        jest.requireMock('dotenv').config.mockImplementation(() => ({}));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('should throw error when environment variables are missing', async () => {
        await expect(import('../config.js'))
            .rejects
            .toThrow('缺少环境变量');
    });

    it('should initialize provider and wallet', async () => {
        // 设置必要的环境变量
        process.env = {
            OPENSEA_API_KEY: 'test-api-key',
            WALLET_PRIV_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
            ALCHEMY_API_KEY: 'test-alchemy-key'
        };

        const { provider, wallet, WALLET_ADDRESS } = await import('../config.js');
        
        expect(provider).toBeDefined();
        expect(wallet).toBeDefined();
        expect(WALLET_ADDRESS).toBeDefined();
        expect(typeof WALLET_ADDRESS).toBe('string');
        expect(WALLET_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    it('should initialize OpenSea SDK', async () => {
        // 设置必要的环境变量
        process.env = {
            OPENSEA_API_KEY: 'test-api-key',
            WALLET_PRIV_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
            ALCHEMY_API_KEY: 'test-alchemy-key'
        };

        const { sdk } = await import('../config.js');
        
        expect(sdk).toBeDefined();
        expect(sdk.createOffer).toBe(mockCreateOffer);
        expect(sdk.createCollectionOffer).toBe(mockCreateCollectionOffer);
    });

    it('should define WETH constants', async () => {
        // 设置必要的环境变量
        process.env = {
            OPENSEA_API_KEY: 'test-api-key',
            WALLET_PRIV_KEY: '0000000000000000000000000000000000000000000000000000000000000001',
            ALCHEMY_API_KEY: 'test-alchemy-key'
        };

        const { WETH_ADDRESS, WETH_ABI } = await import('../config.js');
        
        expect(WETH_ADDRESS).toBeDefined();
        expect(WETH_ADDRESS).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(WETH_ABI).toBeDefined();
        expect(Array.isArray(WETH_ABI)).toBe(true);
        expect(WETH_ABI.length).toBeGreaterThan(0);
    });
}); 