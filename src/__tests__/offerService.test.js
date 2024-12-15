/**
 * @jest-environment node
 */

import { OpenSeaSDK } from 'opensea-js';
import { ethers } from 'ethers';

describe('OfferService', () => {
    let service;
    let mockSdk;
    let mockProvider;
    let mockWallet;

    beforeEach(() => {
        mockProvider = new ethers.JsonRpcProvider();
        mockWallet = new ethers.Wallet('0x' + '0'.repeat(64), mockProvider);
        mockSdk = new OpenSeaSDK(mockWallet, {
            chain: 'base',
            apiKey: 'test-api-key'
        });
        
        const chainConfig = {
            chain: 'base',
            wethAddress: '0x4200000000000000000000000000000000000006'
        };

        service = new OfferService(mockSdk, chainConfig);
    });

    // ... 测试代码保持不变
}); 