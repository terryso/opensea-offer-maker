import { createOfferService } from '../services/offerService.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { Chain, OpenSeaSDK } from 'opensea-js';

// 加载环境变量
dotenv.config();

// 验证必要的环境变量
const requiredEnvVars = ['OPENSEA_API_KEY', 'WALLET_PRIV_KEY', 'ALCHEMY_API_KEY'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
    }
});

// 创建真实的配置
const provider = new ethers.AlchemyProvider("base", process.env.ALCHEMY_API_KEY);
const wallet = new ethers.Wallet(process.env.WALLET_PRIV_KEY, provider);
const sdk = new OpenSeaSDK(wallet, {
    chain: Chain.Base,
    apiKey: process.env.OPENSEA_API_KEY
});

const realConfig = {
    provider,
    sdk,
    wallet: wallet.address
};

describe('OfferService Integration', () => {
    let service;

    beforeAll(() => {
        service = createOfferService(realConfig);
    });

    describe('Individual NFT Offer', () => {
        // 使用一个已知存在的 NFT
        const TEST_NFT = {
            tokenAddress: '0x47F2EB74246D51601E57d017FA3320C79eE8880c', // 替换为实际的 NFT 合约地址
            tokenId: '3252',                                             // 替换为实际的 token ID
        };

        it('should successfully create an individual NFT offer', async () => {
            const params = {
                tokenAddress: TEST_NFT.tokenAddress,
                tokenId: TEST_NFT.tokenId,
                offerAmount: '0.0001', // 最小金额
                expirationMinutes: 15
            };

            const result = await service.createIndividualOffer(params);
            expect(result).toBeTruthy(); // 应该返回一个有效的 orderHash
            console.log('Individual Offer created with hash:', result);
        });
    });

    describe('Collection Offer', () => {
        // 使用一个已知存在的 Collection
        const TEST_COLLECTION = {
            slug: 'scribblebears', // 替换为实际的 collection slug
        };

        it('should successfully create a collection offer', async () => {
            const params = {
                collectionSlug: TEST_COLLECTION.slug,
                offerAmount: '0.0001', // 最小金额
                expirationMinutes: 15
            };

            const result = await service.createCollectionOffer(params);
            expect(result).toBeTruthy(); // 应该返回一个有效的 orderHash
            console.log('Collection Offer created with hash:', result);
        });
    });

    // 错误情况测试
    describe('Error Cases', () => {
        it('should fail when collection slug is invalid', async () => {
            const params = {
                collectionSlug: 'non-existent-collection-' + Date.now(),
                offerAmount: '0.0001',
                expirationMinutes: 15
            };

            await expect(service.createCollectionOffer(params))
                .rejects
                .toBeTruthy(); // 应该抛出错误
        });

        it('should fail when NFT does not exist', async () => {
            const params = {
                tokenAddress: '0x1234567890123456789012345678901234567890',
                tokenId: '999999999',
                offerAmount: '0.0001',
                expirationMinutes: 15
            };

            await expect(service.createIndividualOffer(params))
                .rejects
                .toBeTruthy(); // 应该抛出错误
        });
    });
}); 