/**
 * @jest-environment node
 */

// Mock ethers before importing
const mockBalanceOf = jest.fn().mockImplementation(async (address) => {
    return Promise.resolve(BigInt('1000000000000000000'));
});

const mockWethContract = {
    balanceOf: mockBalanceOf,
    address: '0xWETH'
};

const mockContract = jest.fn().mockReturnValue(mockWethContract);

jest.mock('ethers', () => ({
    Contract: mockContract,
    formatUnits: jest.fn((value) => value.toString())
}));

import { jest } from '@jest/globals';
import { OfferService } from '../services/offerService.js';

describe('OfferService Core Logic', () => {
    let service;
    let mockSdk;
    let originalConsole;

    beforeEach(() => {
        // Save original console
        originalConsole = { ...console };
        // Mock console methods
        console.log = jest.fn();
        console.error = jest.fn();
        // console.warn = jest.fn();

        // Reset all mocks
        jest.clearAllMocks();

        mockSdk = {
            createOffer: jest.fn().mockResolvedValue({ orderHash: 'test-hash' }),
            createCollectionOffer: jest.fn().mockResolvedValue({
                order_hash: 'test-collection-hash',
                criteria: {
                    collection: { slug: 'test-slug' },
                    contract: { address: '0xtest' }
                },
                price: {
                    value: BigInt('100000000000000000'),
                    decimals: 18,
                    currency: 'WETH'
                },
                chain: 'base'
            })
        };
        service = new OfferService(null, mockSdk, 'mockWallet');
    });

    afterEach(() => {
        // Restore original console
        Object.assign(console, originalConsole);
    });

    describe('validateBalance', () => {
        it('should pass when balance is sufficient', () => {
            expect(service.validateBalance('1.0', '0.5')).toBe(true);
            expect(service.validateBalance('0.1', '0.1')).toBe(true);
            expect(service.validateBalance('1.234', '1.0')).toBe(true);
        });

        it('should throw when balance is insufficient', () => {
            expect(() => service.validateBalance('0.1', '0.2'))
                .toThrow('Insufficient WETH balance');
            expect(() => service.validateBalance('0', '0.1'))
                .toThrow('Insufficient WETH balance');
            expect(() => service.validateBalance('0.999', '1.0'))
                .toThrow('Insufficient WETH balance');
        });

        it('should handle string number inputs correctly', () => {
            expect(service.validateBalance('1.000', '0.999')).toBe(true);
            expect(service.validateBalance('1', '0.999999')).toBe(true);
            expect(() => service.validateBalance('0.999999', '1'))
                .toThrow('Insufficient WETH balance');
        });
    });

    describe('validateCollectionOffer', () => {
        it('should pass with valid collection slug', () => {
            expect(service.validateCollectionOffer('valid-slug')).toBe(true);
            expect(service.validateCollectionOffer('another-valid-slug')).toBe(true);
            expect(service.validateCollectionOffer('12345')).toBe(true);
        });

        it('should throw with invalid collection slug', () => {
            expect(() => service.validateCollectionOffer(''))
                .toThrow('Collection slug is required');
            expect(() => service.validateCollectionOffer(null))
                .toThrow('Collection slug is required');
            expect(() => service.validateCollectionOffer(undefined))
                .toThrow('Collection slug is required');
        });
    });

    describe('validateIndividualOffer', () => {
        it('should pass with valid token address and ID', () => {
            expect(service.validateIndividualOffer('0x123', '456')).toBe(true);
            expect(service.validateIndividualOffer('0xabc', '0')).toBe(true);
            expect(service.validateIndividualOffer('0x789', '999999')).toBe(true);
        });

        it('should throw when token address is missing', () => {
            expect(() => service.validateIndividualOffer('', '123'))
                .toThrow('Token address and token ID are required');
            expect(() => service.validateIndividualOffer(null, '123'))
                .toThrow('Token address and token ID are required');
            expect(() => service.validateIndividualOffer(undefined, '123'))
                .toThrow('Token address and token ID are required');
        });

        it('should throw when token ID is missing', () => {
            expect(() => service.validateIndividualOffer('0x123', ''))
                .toThrow('Token address and token ID are required');
            expect(() => service.validateIndividualOffer('0x123', null))
                .toThrow('Token address and token ID are required');
            expect(() => service.validateIndividualOffer('0x123', undefined))
                .toThrow('Token address and token ID are required');
        });

        it('should throw when both token address and ID are missing', () => {
            expect(() => service.validateIndividualOffer('', ''))
                .toThrow('Token address and token ID are required');
            expect(() => service.validateIndividualOffer(null, null))
                .toThrow('Token address and token ID are required');
            expect(() => service.validateIndividualOffer(undefined, undefined))
                .toThrow('Token address and token ID are required');
        });
    });

    describe('getWETHBalance', () => {
        it('should format balance correctly', async () => {
            const mockWethContract = {
                balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000000000000')) // 1 WETH
            };
            const mockWalletAddress = '0xMockAddress';

            const balance = await service.getWETHBalance(mockWethContract, mockWalletAddress);
            expect(balance).toBe('1.0');
            expect(mockWethContract.balanceOf).toHaveBeenCalledWith(mockWalletAddress);
        });

        it('should handle zero balance', async () => {
            const mockWethContract = {
                balanceOf: jest.fn().mockResolvedValue(BigInt('0'))
            };

            const balance = await service.getWETHBalance(mockWethContract, '0xMockAddress');
            expect(balance).toBe('0.0');
        });

        it('should handle small balances', async () => {
            const mockWethContract = {
                balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000000000')) // 0.001 WETH
            };

            const balance = await service.getWETHBalance(mockWethContract, '0xMockAddress');
            expect(balance).toBe('0.001');
        });

        it('should log WETH balance correctly', async () => {
            const mockWethContract = {
                balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000000000000'))
            };

            await service.getWETHBalance(mockWethContract, 'mockWallet');
            expect(console.log).toHaveBeenCalledWith('WETH Balance: 1.0');
        });
    });

    describe('createCollectionOffer', () => {
        it('should create collection offer successfully', async () => {
            const mockWethContract = {
                balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000000000000')),
                address: '0xWETH'
            };

            const params = {
                collectionSlug: 'test-collection',
                offerAmount: '0.1',
                expirationMinutes: 15,
                wethContract: mockWethContract,
                walletAddress: 'mockWallet'
            };

            const result = await service.createCollectionOffer(params);

            expect(result).toBe('test-collection-hash');
            expect(mockSdk.createCollectionOffer).toHaveBeenCalledWith({
                collectionSlug: 'test-collection',
                accountAddress: 'mockWallet',
                amount: '0.1',
                expirationTime: expect.any(Number),
                paymentTokenAddress: '0xWETH'
            });
        });

        it('should handle collection offer response details correctly', async () => {
            const mockWethContract = {
                balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000000000000')),
                address: '0xWETH'
            };

            const params = {
                collectionSlug: 'test-collection',
                offerAmount: '0.1',
                expirationMinutes: 15,
                wethContract: mockWethContract,
                walletAddress: 'mockWallet'
            };

            await service.createCollectionOffer(params);
        });

        it('should handle different order hash formats', async () => {
            const mockWethContract = {
                balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000000000000')),
                address: '0xWETH'
            };

            // Test order_hash format
            mockSdk.createCollectionOffer.mockResolvedValueOnce({
                order_hash: 'test-hash-1',
                criteria: { collection: { slug: 'test' }, contract: { address: '0x' } },
                price: { value: BigInt('1'), decimals: 18, currency: 'WETH' },
                chain: 'base'
            });
            let result = await service.createCollectionOffer({
                collectionSlug: 'test',
                offerAmount: '0.1',
                expirationMinutes: 15,
                wethContract: mockWethContract,
                walletAddress: 'mockWallet'
            });
            expect(result).toBe('test-hash-1');

            // Test orderHash format
            mockSdk.createCollectionOffer.mockResolvedValueOnce({
                orderHash: 'test-hash-2',
                criteria: { collection: { slug: 'test' }, contract: { address: '0x' } },
                price: { value: BigInt('1'), decimals: 18, currency: 'WETH' },
                chain: 'base'
            });
            result = await service.createCollectionOffer({
                collectionSlug: 'test',
                offerAmount: '0.1',
                expirationMinutes: 15,
                wethContract: mockWethContract,
                walletAddress: 'mockWallet'
            });
            expect(result).toBe('test-hash-2');

            // Test order.orderHash format
            mockSdk.createCollectionOffer.mockResolvedValueOnce({
                order: { orderHash: 'test-hash-3' },
                criteria: { collection: { slug: 'test' }, contract: { address: '0x' } },
                price: { value: BigInt('1'), decimals: 18, currency: 'WETH' },
                chain: 'base'
            });
            result = await service.createCollectionOffer({
                collectionSlug: 'test',
                offerAmount: '0.1',
                expirationMinutes: 15,
                wethContract: mockWethContract,
                walletAddress: 'mockWallet'
            });
            expect(result).toBe('test-hash-3');

            // Test default values
            mockSdk.createCollectionOffer.mockResolvedValueOnce({
                criteria: { collection: { slug: 'test' }, contract: { address: '0x' } },
                price: { value: BigInt('1'), decimals: 18, currency: 'WETH' },
                chain: 'base'
            });
            result = await service.createCollectionOffer({
                collectionSlug: 'test',
                offerAmount: '0.1',
                expirationMinutes: 15,
                wethContract: mockWethContract,
                walletAddress: 'mockWallet'
            });
            expect(result).toBe('Unknown');
        });

        // it('should use default wethContract and walletAddress', async () => {
        //     const params = {
        //         collectionSlug: 'test-collection',
        //         offerAmount: '0.1',
        //         expirationMinutes: 15
        //         // Don't provide wethContract and walletAddress, use defaults
        //     };

        //     // Set new return value
        //     mockBalanceOf.mockImplementationOnce(async () => {
        //         return Promise.resolve(BigInt('1000000000000000000'));
        //     });

        //     const result = await service.createCollectionOffer(params);

        //     expect(result).toBe('test-collection-hash');
        //     expect(mockContract).toHaveBeenCalledWith(
        //         expect.any(String), // WETH_ADDRESS
        //         expect.any(Array),  // WETH_ABI
        //         null               // this.provider
        //     );
        //     expect(mockBalanceOf).toHaveBeenCalledWith('mockWallet');
        //     expect(mockSdk.createCollectionOffer).toHaveBeenCalledWith({
        //         collectionSlug: 'test-collection',
        //         accountAddress: 'mockWallet',
        //         amount: '0.1',
        //         expirationTime: expect.any(Number),
        //         paymentTokenAddress: '0xWETH'
        //     });
        // });
    });

    describe('createIndividualOffer', () => {
        it('should create individual offer successfully', async () => {
            const mockWethContract = {
                balanceOf: jest.fn().mockResolvedValue(BigInt('1000000000000000000')),
                address: '0xWETH'
            };

            const params = {
                tokenAddress: '0xNFT',
                tokenId: '123',
                offerAmount: '0.1',
                expirationMinutes: 15,
                wethContract: mockWethContract,
                walletAddress: 'mockWallet'
            };

            const result = await service.createIndividualOffer(params);

            expect(result).toBe('test-hash');
            expect(mockSdk.createOffer).toHaveBeenCalledWith({
                asset: {
                    tokenAddress: '0xNFT',
                    tokenId: '123'
                },
                accountAddress: 'mockWallet',
                startAmount: '0.1',
                expirationTime: expect.any(Number),
                paymentTokenAddress: '0xWETH'
            });
        });

        // it('should use default wethContract and walletAddress', async () => {
        //     const params = {
        //         tokenAddress: '0xNFT',
        //         tokenId: '123',
        //         offerAmount: '0.1',
        //         expirationMinutes: 15
        //         // Don't provide wethContract and walletAddress, use defaults
        //     };

        //     // Set new return value
        //     mockBalanceOf.mockImplementationOnce(async () => {
        //         return Promise.resolve(BigInt('1000000000000000000'));
        //     });

        //     const result = await service.createIndividualOffer(params);

        //     expect(result).toBe('test-hash');
        //     expect(mockContract).toHaveBeenCalledWith(
        //         expect.any(String), // WETH_ADDRESS
        //         expect.any(Array),  // WETH_ABI
        //         null               // this.provider
        //     );
        //     expect(mockBalanceOf).toHaveBeenCalledWith('mockWallet');
        //     expect(mockSdk.createOffer).toHaveBeenCalledWith({
        //         asset: {
        //             tokenAddress: '0xNFT',
        //             tokenId: '123'
        //         },
        //         accountAddress: 'mockWallet',
        //         startAmount: '0.1',
        //         expirationTime: expect.any(Number),
        //         paymentTokenAddress: '0xWETH'
        //     });
        // });
    });
}); 