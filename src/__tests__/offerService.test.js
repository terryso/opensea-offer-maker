import { OfferService } from '../services/offerService.js';

describe('OfferService', () => {
    let mockSdk;
    let mockChainConfig;

    beforeEach(() => {
        mockSdk = {
            provider: {},
            wallet: {}
        };

        mockChainConfig = {
            wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            name: 'ethereum'
        };
    });

    describe('constructor', () => {
        it('should throw error when SDK is not provided', () => {
            expect(() => new OfferService(null, mockChainConfig)).toThrow('SDK is required');
        });

        it('should throw error when SDK is undefined', () => {
            expect(() => new OfferService(undefined, mockChainConfig)).toThrow('SDK is required');
        });

        it('should throw error when chainConfig is not provided', () => {
            expect(() => new OfferService(mockSdk, null)).toThrow('Chain config with WETH address is required');
        });

        it('should throw error when chainConfig wethAddress is missing', () => {
            const invalidConfig = { name: 'ethereum' };
            expect(() => new OfferService(mockSdk, invalidConfig)).toThrow('Chain config with WETH address is required');
        });

        it('should throw error when WETH address is invalid', () => {
            const invalidConfig = {
                wethAddress: 'invalid-address',
                name: 'ethereum'
            };
            expect(() => new OfferService(mockSdk, invalidConfig)).toThrow('Invalid WETH address');
        });

        it('should create instance with valid SDK and chainConfig', () => {
            const service = new OfferService(mockSdk, mockChainConfig);
            expect(service.sdk).toBe(mockSdk);
            expect(service.provider).toBe(mockSdk.provider);
            expect(service.chainConfig).toBe(mockChainConfig);
        });

        it('should initialize WETH contract', () => {
            const service = new OfferService(mockSdk, mockChainConfig);
            expect(service.wethContract).toBeDefined();
        });
    });

    describe('validateBalance', () => {
        let service;

        beforeEach(() => {
            service = new OfferService(mockSdk, mockChainConfig);
        });

        it('should throw error when balance is insufficient', () => {
            expect(() => service.validateBalance('1.0', '2.0')).toThrow('Insufficient WETH balance');
        });

        it('should return true when balance is sufficient', () => {
            expect(service.validateBalance('2.0', '1.0')).toBe(true);
        });

        it('should return true when balance equals offer amount', () => {
            expect(service.validateBalance('1.0', '1.0')).toBe(true);
        });

        it('should handle string numbers correctly', () => {
            expect(service.validateBalance('10.5', '5.25')).toBe(true);
        });

        it('should handle very small amounts', () => {
            expect(service.validateBalance('0.001', '0.0001')).toBe(true);
        });

        it('should throw for very small balances with larger offers', () => {
            expect(() => service.validateBalance('0.0001', '0.001')).toThrow('Insufficient WETH balance');
        });
    });

    describe('validateCollectionOffer', () => {
        let service;

        beforeEach(() => {
            service = new OfferService(mockSdk, mockChainConfig);
        });

        it('should throw error when collection slug is missing', () => {
            expect(() => service.validateCollectionOffer()).toThrow('Collection slug is required for collection offer');
        });

        it('should throw error when collection slug is null', () => {
            expect(() => service.validateCollectionOffer(null)).toThrow('Collection slug is required for collection offer');
        });

        it('should throw error when collection slug is empty string', () => {
            expect(() => service.validateCollectionOffer('')).toThrow('Collection slug is required for collection offer');
        });

        it('should return true when collection slug is provided', () => {
            expect(service.validateCollectionOffer('test-collection')).toBe(true);
        });

        it('should accept collection slug with hyphens', () => {
            expect(service.validateCollectionOffer('my-test-collection')).toBe(true);
        });

        it('should accept collection slug with numbers', () => {
            expect(service.validateCollectionOffer('collection123')).toBe(true);
        });
    });

    describe('validateIndividualOffer', () => {
        let service;

        beforeEach(() => {
            service = new OfferService(mockSdk, mockChainConfig);
        });

        it('should throw error when token address is missing', () => {
            expect(() => service.validateIndividualOffer(null, '123')).toThrow('Token address is required for individual offer');
        });

        it('should throw error when token ID is missing', () => {
            expect(() => service.validateIndividualOffer('0xabc', null)).toThrow('Token ID is required for individual offer');
        });

        it('should throw error when both are missing', () => {
            expect(() => service.validateIndividualOffer()).toThrow('Token address is required for individual offer');
        });

        it('should return true when both are provided', () => {
            expect(service.validateIndividualOffer('0xabc123', '456')).toBe(true);
        });

        it('should accept numeric token IDs', () => {
            expect(service.validateIndividualOffer('0xabc', 123)).toBe(true);
        });

        it('should accept string token IDs', () => {
            expect(service.validateIndividualOffer('0xabc', '123')).toBe(true);
        });

        it('should accept full Ethereum address', () => {
            expect(service.validateIndividualOffer('0x1234567890123456789012345678901234567890', '1')).toBe(true);
        });
    });

    describe('logCollectionOfferDetails', () => {
        let service;

        beforeEach(() => {
            service = new OfferService(mockSdk, mockChainConfig);
        });

        it('should log collection offer details without throwing', () => {
            const mockResponse = {
                criteria: {
                    collection: { slug: 'test-collection' },
                    contract: { address: '0xabc' }
                },
                price: {
                    value: '1000000000000000000',
                    decimals: 18,
                    currency: 'WETH'
                },
                chain: 'ethereum'
            };

            expect(() => service.logCollectionOfferDetails(
                mockResponse,
                'test-collection',
                '0xorderhash'
            )).not.toThrow();
        });
    });

    describe('getWETHBalance', () => {
        let service;

        beforeEach(() => {
            service = new OfferService(mockSdk, mockChainConfig);
        });

        it('should get WETH balance from contract', async () => {
            const mockWethContract = {
                balanceOf: async () => '1000000000000000000' // 1 WETH
            };
            const walletAddress = '0x1234567890123456789012345678901234567890';

            const balance = await service.getWETHBalance(mockWethContract, walletAddress);
            expect(balance).toBe('1.0');
        });

        it('should handle zero balance', async () => {
            const mockWethContract = {
                balanceOf: async () => '0'
            };
            const walletAddress = '0x1234567890123456789012345678901234567890';

            const balance = await service.getWETHBalance(mockWethContract, walletAddress);
            expect(balance).toBe('0.0');
        });

        it('should handle small balances correctly', async () => {
            const mockWethContract = {
                balanceOf: async () => '1000000000000000' // 0.001 WETH
            };
            const walletAddress = '0x1234567890123456789012345678901234567890';

            const balance = await service.getWETHBalance(mockWethContract, walletAddress);
            expect(balance).toBe('0.001');
        });
    });

    describe('createCollectionOffer validation', () => {
        let service;

        beforeEach(() => {
            service = new OfferService(mockSdk, mockChainConfig);
        });

        it('should throw error when walletAddress is missing', async () => {
            const params = {
                collectionSlug: 'test',
                offerAmount: '1.0'
            };

            await expect(service.createCollectionOffer(params)).rejects.toThrow('Wallet address is required');
        });

        it('should throw error when collection slug is missing', async () => {
            const params = {
                offerAmount: '1.0',
                walletAddress: '0xabc'
            };

            await expect(service.createCollectionOffer(params)).rejects.toThrow('Collection slug is required');
        });

        it('should create collection offer successfully', async () => {
            const mockResponse = {
                order_hash: '0xmockorderhash',
                criteria: {
                    collection: { slug: 'test-collection' },
                    contract: { address: '0xabc' }
                },
                price: {
                    value: '1000000000000000000',
                    decimals: 18,
                    currency: 'WETH'
                },
                chain: 'ethereum'
            };

            mockSdk.createCollectionOffer = async () => mockResponse;
            service.wethContract.balanceOf = async () => '2000000000000000000'; // 2 WETH

            const params = {
                collectionSlug: 'test-collection',
                offerAmount: '1.0',
                walletAddress: '0x1234567890123456789012345678901234567890'
            };

            const orderHash = await service.createCollectionOffer(params);
            expect(orderHash).toBe('0xmockorderhash');
        });

        it('should handle orderHash from different response formats', async () => {
            const mockResponse = {
                orderHash: '0xaltorderhash',
                criteria: {
                    collection: { slug: 'test' },
                    contract: { address: '0xabc' }
                },
                price: {
                    value: '1000000000000000000',
                    decimals: 18,
                    currency: 'WETH'
                },
                chain: 'ethereum'
            };

            mockSdk.createCollectionOffer = async () => mockResponse;
            service.wethContract.balanceOf = async () => '2000000000000000000';

            const params = {
                collectionSlug: 'test',
                offerAmount: '1.0',
                walletAddress: '0x1234567890123456789012345678901234567890'
            };

            const orderHash = await service.createCollectionOffer(params);
            expect(orderHash).toBe('0xaltorderhash');
        });
    });

    describe('createIndividualOffer', () => {
        let service;

        beforeEach(() => {
            service = new OfferService(mockSdk, mockChainConfig);
        });

        it('should create individual offer successfully', async () => {
            const mockResponse = {
                orderHash: '0xindividualorderhash'
            };

            mockSdk.createOffer = async () => mockResponse;

            const mockWethContract = {
                balanceOf: async () => '2000000000000000000', // 2 WETH
                address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
            };

            const params = {
                tokenAddress: '0x1234567890123456789012345678901234567890',
                tokenId: '123',
                offerAmount: '1.0',
                wethContract: mockWethContract,
                walletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
            };

            const orderHash = await service.createIndividualOffer(params);
            expect(orderHash).toBe('0xindividualorderhash');
        });

        it('should throw error when tokenAddress is missing', async () => {
            const params = {
                tokenId: '123',
                offerAmount: '1.0',
                walletAddress: '0xabc'
            };

            await expect(service.createIndividualOffer(params)).rejects.toThrow('Token address is required for individual offer');
        });

        it('should throw error when tokenId is missing', async () => {
            const params = {
                tokenAddress: '0x1234567890123456789012345678901234567890',
                offerAmount: '1.0',
                walletAddress: '0xabc'
            };

            await expect(service.createIndividualOffer(params)).rejects.toThrow('Token ID is required for individual offer');
        });
    });
});
