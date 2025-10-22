/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import {
    validatePrice,
    checkSufficientBalance,
    buySpecificNFT,
    buyFloorNFT,
    estimateGasFee,
    confirmPurchase
} from '../services/buyService.js';
import { ethers } from 'ethers';
import enquirer from 'enquirer';
import { logger } from '../utils/logger.js';

describe('BuyService', () => {
    describe('validatePrice', () => {
        it('should not throw when actual price is less than max price', () => {
            expect(() => validatePrice(1.0, 2.0)).not.toThrow();
        });

        it('should not throw when actual price equals max price', () => {
            expect(() => validatePrice(1.0, 1.0)).not.toThrow();
        });

        it('should throw when actual price exceeds max price', () => {
            expect(() => validatePrice(2.0, 1.0)).toThrow('Price 2 ETH exceeds maximum acceptable price 1 ETH');
        });

        it('should handle decimal prices correctly', () => {
            expect(() => validatePrice(0.05, 0.1)).not.toThrow();
            expect(() => validatePrice(0.15, 0.1)).toThrow();
        });

        it('should handle very small price differences', () => {
            expect(() => validatePrice(0.001, 0.002)).not.toThrow();
            expect(() => validatePrice(0.002, 0.001)).toThrow();
        });

        it('should handle string max price parameter', () => {
            expect(() => validatePrice(1.0, '2.0')).not.toThrow();
            expect(() => validatePrice(2.0, '1.0')).toThrow();
        });
    });

    describe('checkSufficientBalance', () => {
        let mockWallet;

        beforeEach(() => {
            mockWallet = {
                address: '0x1234567890123456789012345678901234567890',
                provider: {
                    getBalance: jest.fn()
                }
            };
        });

        it('should not throw when balance is sufficient', async () => {
            // 2 ETH balance, need 1 ETH + (0.001 * 1.2) gas = 1.0012 ETH
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('2.0'));

            await expect(checkSufficientBalance(mockWallet, 1.0, 0.001)).resolves.not.toThrow();
        });

        it('should throw when balance is insufficient', async () => {
            // 0.5 ETH balance, need 1 ETH + (0.001 * 1.2) gas = 1.0012 ETH
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));

            await expect(checkSufficientBalance(mockWallet, 1.0, 0.001))
                .rejects.toThrow('Insufficient balance');
        });

        it('should account for gas with 20% buffer in calculation', async () => {
            // 1.001 ETH balance, need 1 ETH + (0.002 * 1.2) gas = 1.0024 ETH
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('1.001'));

            await expect(checkSufficientBalance(mockWallet, 1.0, 0.002))
                .rejects.toThrow('Insufficient balance');
        });

        it('should pass when balance exactly covers required amount + gas with buffer', async () => {
            // 1.0012 ETH balance, need 1 ETH + (0.001 * 1.2) gas = 1.0012 ETH
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('1.0012'));

            await expect(checkSufficientBalance(mockWallet, 1.0, 0.001)).resolves.not.toThrow();
        });

        it('should handle very small required amounts', async () => {
            // 0.002 ETH balance, need 0.001 ETH + (0.0001 * 1.2) gas = 0.00112 ETH
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('0.002'));

            await expect(checkSufficientBalance(mockWallet, 0.001, 0.0001)).resolves.not.toThrow();
        });

        it('should throw with correct error message showing balance and required', async () => {
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('0.5'));

            await expect(checkSufficientBalance(mockWallet, 1.0, 0.001))
                .rejects.toThrow(/0\.5 ETH < .* ETH/);
        });
    });

    describe('Floor NFT selection logic', () => {
        it('should select the last NFT from cheapest batch', () => {
            // 模拟地板NFT选择逻辑 - 使用与实际 OpenSea API 返回相同的数据结构
            const mockListings = [
                { price: { current: { value: ethers.parseEther('1.0').toString() } } },
                { price: { current: { value: ethers.parseEther('1.0').toString() } } },
                { price: { current: { value: ethers.parseEther('1.0').toString() } } },
                { price: { current: { value: ethers.parseEther('1.5').toString() } } },
                { price: { current: { value: ethers.parseEther('2.0').toString() } } },
            ];

            // 找出最低价格
            const prices = mockListings.map(l => parseFloat(ethers.formatEther(l.price.current.value)));
            const minPrice = Math.min(...prices);

            // 过滤出最便宜的那批
            const cheapestListings = mockListings.filter((l) => {
                const price = parseFloat(ethers.formatEther(l.price.current.value));
                return price === minPrice;
            });

            // 选择排序靠后的那个
            const selectedListing = cheapestListings[cheapestListings.length - 1];

            expect(cheapestListings.length).toBe(3);
            expect(selectedListing).toBe(mockListings[2]);
        });

        it('should select the only NFT when there is one at floor price', () => {
            const mockListings = [
                { price: { current: { value: ethers.parseEther('1.0').toString() } } },
                { price: { current: { value: ethers.parseEther('1.5').toString() } } },
                { price: { current: { value: ethers.parseEther('2.0').toString() } } },
            ];

            const prices = mockListings.map(l => parseFloat(ethers.formatEther(l.price.current.value)));
            const minPrice = Math.min(...prices);
            const cheapestListings = mockListings.filter(l => {
                const price = parseFloat(ethers.formatEther(l.price.current.value));
                return price === minPrice;
            });
            const selectedListing = cheapestListings[cheapestListings.length - 1];

            expect(cheapestListings.length).toBe(1);
            expect(selectedListing).toBe(mockListings[0]);
        });

        it('should handle all listings at the same price', () => {
            const mockListings = [
                { price: { current: { value: ethers.parseEther('1.0').toString() } } },
                { price: { current: { value: ethers.parseEther('1.0').toString() } } },
                { price: { current: { value: ethers.parseEther('1.0').toString() } } },
            ];

            const prices = mockListings.map(l => parseFloat(ethers.formatEther(l.price.current.value)));
            const minPrice = Math.min(...prices);
            const cheapestListings = mockListings.filter(l => {
                const price = parseFloat(ethers.formatEther(l.price.current.value));
                return price === minPrice;
            });
            const selectedListing = cheapestListings[cheapestListings.length - 1];

            expect(cheapestListings.length).toBe(3);
            expect(selectedListing).toBe(mockListings[2]);
        });
    });

    describe('estimateGasFee', () => {
        let mockProvider;

        beforeEach(() => {
            mockProvider = {
                getFeeData: jest.fn()
            };
        });

        it('should estimate gas fee correctly', async () => {
            const mockFeeData = {
                maxFeePerGas: ethers.parseUnits('2', 'gwei'),
                gasPrice: ethers.parseUnits('1', 'gwei')
            };
            mockProvider.getFeeData.mockResolvedValue(mockFeeData);

            const estimatedGas = await estimateGasFee(mockProvider);

            expect(estimatedGas).toBeGreaterThan(0);
            expect(typeof estimatedGas).toBe('number');
        });

        it('should return default value on error', async () => {
            mockProvider.getFeeData.mockRejectedValue(new Error('Network error'));

            const estimatedGas = await estimateGasFee(mockProvider);

            expect(estimatedGas).toBe(0.002);
        });

        it('should handle legacy gas price', async () => {
            const mockFeeData = {
                maxFeePerGas: null,
                gasPrice: ethers.parseUnits('1.5', 'gwei')
            };
            mockProvider.getFeeData.mockResolvedValue(mockFeeData);

            const estimatedGas = await estimateGasFee(mockProvider);

            expect(estimatedGas).toBeGreaterThan(0);
        });
    });

    describe('Price and seller extraction fallbacks', () => {
        it('should extract price from current_price field', () => {
            const listing = {
                current_price: ethers.parseEther('1.5').toString()
            };

            const priceValue = listing.price?.current?.value || listing.current_price || '0';
            const priceInETH = parseFloat(ethers.formatEther(priceValue));

            expect(priceInETH).toBe(1.5);
        });

        it('should use default 0 when no price fields exist', () => {
            const listing = {};

            const priceValue = listing.price?.current?.value || listing.current_price || '0';
            const priceInETH = parseFloat(ethers.formatEther(priceValue));

            expect(priceInETH).toBe(0);
        });

        it('should extract seller from maker.address field', () => {
            const listing = {
                maker: {
                    address: '0xMakerAddress'
                }
            };

            const seller = listing.protocol_data?.parameters?.offerer || listing.maker?.address || listing.maker_address || 'Unknown';

            expect(seller).toBe('0xMakerAddress');
        });

        it('should extract seller from maker_address field', () => {
            const listing = {
                maker_address: '0xMakerAddressAlt'
            };

            const seller = listing.protocol_data?.parameters?.offerer || listing.maker?.address || listing.maker_address || 'Unknown';

            expect(seller).toBe('0xMakerAddressAlt');
        });

        it('should use Unknown when no seller fields exist', () => {
            const listing = {};

            const seller = listing.protocol_data?.parameters?.offerer || listing.maker?.address || listing.maker_address || 'Unknown';

            expect(seller).toBe('Unknown');
        });
    });

    describe('buySpecificNFT', () => {
        let mockSdk, mockWallet, mockOpenseaApi, mockOptions;

        beforeEach(() => {
            mockSdk = {
                fulfillOrder: jest.fn()
            };

            mockWallet = {
                address: '0x1234567890123456789012345678901234567890',
                provider: {
                    getBalance: jest.fn(),
                    getFeeData: jest.fn()
                },
                getAddress: jest.fn()
            };

            mockOpenseaApi = {
                getListingByTokenId: jest.fn()
            };

            mockOptions = {
                skipConfirm: true
            };

            // Setup default mocks
            mockWallet.getAddress.mockResolvedValue('0x1234567890123456789012345678901234567890');
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('10.0'));
            mockWallet.provider.getFeeData.mockResolvedValue({
                maxFeePerGas: ethers.parseUnits('1', 'gwei'),
                gasPrice: ethers.parseUnits('1', 'gwei')
            });
        });

        it('should successfully buy a specific NFT', async () => {
            const mockListing = {
                price: {
                    current: {
                        value: ethers.parseEther('1.0').toString()
                    }
                },
                protocol_data: {
                    parameters: {
                        offerer: '0xSellerAddress'
                    }
                },
                order: { /* order data */ }
            };

            mockOpenseaApi.getListingByTokenId.mockResolvedValue(mockListing);
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');

            const result = await buySpecificNFT(
                mockSdk,
                '0xContractAddress',
                '123',
                mockWallet,
                mockOpenseaApi,
                mockOptions
            );

            expect(result).toBe('0xtxhash');
            expect(mockSdk.fulfillOrder).toHaveBeenCalled();
        });

        it('should throw error when no listing found', async () => {
            mockOpenseaApi.getListingByTokenId.mockResolvedValue(null);

            await expect(
                buySpecificNFT(
                    mockSdk,
                    '0xContractAddress',
                    '123',
                    mockWallet,
                    mockOpenseaApi,
                    mockOptions
                )
            ).rejects.toThrow('No active listing found');
        });

        it('should throw error when price exceeds max price', async () => {
            const mockListing = {
                price: {
                    current: {
                        value: ethers.parseEther('2.0').toString()
                    }
                },
                protocol_data: {
                    parameters: {
                        offerer: '0xSellerAddress'
                    }
                }
            };

            mockOpenseaApi.getListingByTokenId.mockResolvedValue(mockListing);
            mockOptions.maxPrice = 1.0;

            await expect(
                buySpecificNFT(
                    mockSdk,
                    '0xContractAddress',
                    '123',
                    mockWallet,
                    mockOpenseaApi,
                    mockOptions
                )
            ).rejects.toThrow('exceeds maximum acceptable price');
        });

        it('should throw error when balance is insufficient', async () => {
            const mockListing = {
                price: {
                    current: {
                        value: ethers.parseEther('5.0').toString()
                    }
                },
                protocol_data: {
                    parameters: {
                        offerer: '0xSellerAddress'
                    }
                }
            };

            mockOpenseaApi.getListingByTokenId.mockResolvedValue(mockListing);
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('1.0'));

            await expect(
                buySpecificNFT(
                    mockSdk,
                    '0xContractAddress',
                    '123',
                    mockWallet,
                    mockOpenseaApi,
                    mockOptions
                )
            ).rejects.toThrow('Insufficient balance');
        });

        it('should handle listing with current_price field instead of price.current.value', async () => {
            const mockListing = {
                current_price: ethers.parseEther('1.0').toString(),
                maker: {
                    address: '0xMakerAddress'
                },
                order: {}
            };

            mockOpenseaApi.getListingByTokenId.mockResolvedValue(mockListing);
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');

            const result = await buySpecificNFT(
                mockSdk,
                '0xContractAddress',
                '123',
                mockWallet,
                mockOpenseaApi,
                mockOptions
            );

            expect(result).toBe('0xtxhash');
        });

        it('should handle listing with maker_address field', async () => {
            const mockListing = {
                current_price: ethers.parseEther('1.0').toString(),
                maker_address: '0xMakerAddressField',
                order: {}
            };

            mockOpenseaApi.getListingByTokenId.mockResolvedValue(mockListing);
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');

            const result = await buySpecificNFT(
                mockSdk,
                '0xContractAddress',
                '123',
                mockWallet,
                mockOpenseaApi,
                mockOptions
            );

            expect(result).toBe('0xtxhash');
        });

        it('should handle listing with no order field', async () => {
            const mockListing = {
                current_price: ethers.parseEther('1.0').toString(),
                maker_address: '0xMaker'
            };

            mockOpenseaApi.getListingByTokenId.mockResolvedValue(mockListing);
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');

            const result = await buySpecificNFT(
                mockSdk,
                '0xContractAddress',
                '123',
                mockWallet,
                mockOpenseaApi,
                mockOptions
            );

            expect(result).toBe('0xtxhash');
            expect(mockSdk.fulfillOrder).toHaveBeenCalledWith({
                order: mockListing,
                accountAddress: '0x1234567890123456789012345678901234567890',
                domain: 'opensea-offer-maker'
            });
        });
    });

    describe('buyFloorNFT', () => {
        let mockSdk, mockWallet, mockOpenseaApi, mockOptions;

        beforeEach(() => {
            mockSdk = {
                fulfillOrder: jest.fn()
            };

            mockWallet = {
                address: '0x1234567890123456789012345678901234567890',
                provider: {
                    getBalance: jest.fn(),
                    getFeeData: jest.fn()
                },
                getAddress: jest.fn()
            };

            mockOpenseaApi = {
                getBestListings: jest.fn()
            };

            mockOptions = {
                skipConfirm: true
            };

            // Setup default mocks
            mockWallet.getAddress.mockResolvedValue('0x1234567890123456789012345678901234567890');
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('10.0'));
            mockWallet.provider.getFeeData.mockResolvedValue({
                maxFeePerGas: ethers.parseUnits('1', 'gwei'),
                gasPrice: ethers.parseUnits('1', 'gwei')
            });
        });

        it('should successfully buy floor NFT', async () => {
            const mockListings = [
                {
                    price: {
                        current: {
                            value: ethers.parseEther('1.0').toString()
                        }
                    },
                    protocol_data: {
                        parameters: {
                            offerer: '0xSeller1',
                            offer: [{
                                token: '0xContractAddress',
                                identifierOrCriteria: '123'
                            }]
                        }
                    },
                    order: {}
                },
                {
                    price: {
                        current: {
                            value: ethers.parseEther('1.5').toString()
                        }
                    },
                    protocol_data: {
                        parameters: {
                            offerer: '0xSeller2',
                            offer: [{
                                token: '0xContractAddress',
                                identifierOrCriteria: '124'
                            }]
                        }
                    },
                    order: {}
                }
            ];

            mockOpenseaApi.getBestListings.mockResolvedValue({ listings: mockListings });
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');

            const result = await buyFloorNFT(
                mockSdk,
                'test-collection',
                mockWallet,
                mockOpenseaApi,
                mockOptions
            );

            expect(result).toBe('0xtxhash');
            expect(mockSdk.fulfillOrder).toHaveBeenCalled();
        });

        it('should throw error when no listings found', async () => {
            mockOpenseaApi.getBestListings.mockResolvedValue({ listings: [] });

            await expect(
                buyFloorNFT(
                    mockSdk,
                    'test-collection',
                    mockWallet,
                    mockOpenseaApi,
                    mockOptions
                )
            ).rejects.toThrow('No active listings found');
        });

        it('should select the last NFT from floor price batch', async () => {
            const mockListings = [
                {
                    price: {
                        current: {
                            value: ethers.parseEther('1.0').toString()
                        }
                    },
                    protocol_data: {
                        parameters: {
                            offerer: '0xSeller1',
                            offer: [{
                                token: '0xContract',
                                identifierOrCriteria: '100'
                            }]
                        }
                    },
                    order: {}
                },
                {
                    price: {
                        current: {
                            value: ethers.parseEther('1.0').toString()
                        }
                    },
                    protocol_data: {
                        parameters: {
                            offerer: '0xSeller2',
                            offer: [{
                                token: '0xContract',
                                identifierOrCriteria: '101'
                            }]
                        }
                    },
                    order: {}
                },
                {
                    price: {
                        current: {
                            value: ethers.parseEther('2.0').toString()
                        }
                    },
                    protocol_data: {
                        parameters: {
                            offerer: '0xSeller3',
                            offer: [{
                                token: '0xContract',
                                identifierOrCriteria: '102'
                            }]
                        }
                    },
                    order: {}
                }
            ];

            mockOpenseaApi.getBestListings.mockResolvedValue({ listings: mockListings });
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');

            await buyFloorNFT(
                mockSdk,
                'test-collection',
                mockWallet,
                mockOpenseaApi,
                mockOptions
            );

            // Should select the second listing (last one at floor price)
            const fulfillCall = mockSdk.fulfillOrder.mock.calls[0][0];
            expect(fulfillCall.order).toBe(mockListings[1].order);
        });

        it('should throw error when floor price exceeds max price', async () => {
            const mockListings = [{
                price: {
                    current: {
                        value: ethers.parseEther('2.0').toString()
                    }
                },
                protocol_data: {
                    parameters: {
                        offerer: '0xSeller',
                        offer: [{
                            token: '0xContract',
                            identifierOrCriteria: '123'
                        }]
                    }
                },
                order: {}
            }];

            mockOpenseaApi.getBestListings.mockResolvedValue({ listings: mockListings });
            mockOptions.maxPrice = 1.0;

            await expect(
                buyFloorNFT(
                    mockSdk,
                    'test-collection',
                    mockWallet,
                    mockOpenseaApi,
                    mockOptions
                )
            ).rejects.toThrow('exceeds maximum acceptable price');
        });

        it('should handle listings with current_price field', async () => {
            const mockListings = [
                {
                    current_price: ethers.parseEther('1.0').toString(),
                    protocol_data: {
                        parameters: {
                            offerer: '0xSeller',
                            offer: [{
                                token: '0xContract',
                                identifierOrCriteria: '100'
                            }]
                        }
                    },
                    order: {}
                },
                {
                    current_price: ethers.parseEther('1.5').toString(),
                    protocol_data: {
                        parameters: {
                            offerer: '0xSeller2',
                            offer: [{
                                token: '0xContract',
                                identifierOrCriteria: '101'
                            }]
                        }
                    },
                    order: {}
                }
            ];

            mockOpenseaApi.getBestListings.mockResolvedValue({ listings: mockListings });
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');

            const result = await buyFloorNFT(
                mockSdk,
                'test-collection',
                mockWallet,
                mockOpenseaApi,
                mockOptions
            );

            expect(result).toBe('0xtxhash');
        });

        it('should handle listings with maker.address field', async () => {
            const mockListings = [{
                current_price: ethers.parseEther('1.0').toString(),
                maker: {
                    address: '0xMakerAddress'
                },
                protocol_data: {
                    parameters: {
                        offer: [{
                            token: '0xContract',
                            identifierOrCriteria: '123'
                        }]
                    }
                },
                order: {}
            }];

            mockOpenseaApi.getBestListings.mockResolvedValue({ listings: mockListings });
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');

            const result = await buyFloorNFT(
                mockSdk,
                'test-collection',
                mockWallet,
                mockOpenseaApi,
                mockOptions
            );

            expect(result).toBe('0xtxhash');
        });
    });

    describe('confirmPurchase', () => {
        let mockPrompt;
        let mockLoggerInfo;

        beforeEach(() => {
            // Mock logger.info to avoid cluttering test output
            mockLoggerInfo = jest.spyOn(logger, 'info').mockImplementation(() => {});

            // Mock enquirer prompt
            mockPrompt = jest.spyOn(enquirer, 'prompt');
        });

        afterEach(() => {
            mockLoggerInfo.mockRestore();
            mockPrompt.mockRestore();
        });

        it('should not throw when user confirms purchase', async () => {
            mockPrompt.mockResolvedValue({ confirmed: true });

            const nftInfo = {
                type: 'Specific NFT',
                contractAddress: '0xContract',
                tokenId: '123',
                price: 1.5,
                seller: '0xSeller'
            };

            await expect(confirmPurchase(nftInfo, 0.001)).resolves.not.toThrow();
            expect(mockPrompt).toHaveBeenCalled();
        });

        it('should throw error when user cancels purchase', async () => {
            mockPrompt.mockResolvedValue({ confirmed: false });

            const nftInfo = {
                type: 'Floor NFT',
                collection: 'test-collection',
                contractAddress: '0xContract',
                tokenId: '456',
                price: 2.0,
                seller: '0xSeller'
            };

            await expect(confirmPurchase(nftInfo, 0.002))
                .rejects.toThrow('Purchase cancelled by user');
        });

        it('should display collection name for floor NFT', async () => {
            mockPrompt.mockResolvedValue({ confirmed: true });

            const nftInfo = {
                type: 'Floor NFT',
                collection: 'cool-nfts',
                contractAddress: '0xContract',
                tokenId: '789',
                price: 0.5,
                seller: '0xSeller'
            };

            await confirmPurchase(nftInfo, 0.0001);

            // Verify logger.info was called with collection info
            expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Collection: cool-nfts'));
        });

        it('should format gas fee correctly for small amounts (< 0.0001 ETH)', async () => {
            mockPrompt.mockResolvedValue({ confirmed: true });

            const nftInfo = {
                type: 'Specific NFT',
                contractAddress: '0xContract',
                tokenId: '100',
                price: 1.0,
                seller: '0xSeller'
            };

            await confirmPurchase(nftInfo, 0.00005);

            // Check that gas was formatted in gwei
            expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('gwei'));
        });

        it('should format gas fee correctly for larger amounts (>= 0.0001 ETH)', async () => {
            mockPrompt.mockResolvedValue({ confirmed: true });

            const nftInfo = {
                type: 'Specific NFT',
                contractAddress: '0xContract',
                tokenId: '200',
                price: 1.0,
                seller: '0xSeller'
            };

            await confirmPurchase(nftInfo, 0.001);

            // Check that gas was formatted in ETH (without gwei)
            const gasLogCall = mockLoggerInfo.mock.calls.find(call =>
                call[0] && call[0].includes('Estimated Gas:')
            );
            expect(gasLogCall).toBeDefined();
            expect(gasLogCall[0]).toMatch(/0\.001000 ETH/);
        });
    });

    describe('buySpecificNFT with confirmation', () => {
        let mockSdk, mockWallet, mockOpenseaApi, mockPrompt;

        beforeEach(() => {
            mockSdk = {
                fulfillOrder: jest.fn()
            };

            mockWallet = {
                address: '0x1234567890123456789012345678901234567890',
                provider: {
                    getBalance: jest.fn(),
                    getFeeData: jest.fn()
                },
                getAddress: jest.fn()
            };

            mockOpenseaApi = {
                getListingByTokenId: jest.fn()
            };

            jest.spyOn(logger, 'info').mockImplementation(() => {});
            mockPrompt = jest.spyOn(enquirer, 'prompt');

            // Setup default mocks
            mockWallet.getAddress.mockResolvedValue('0x1234567890123456789012345678901234567890');
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('10.0'));
            mockWallet.provider.getFeeData.mockResolvedValue({
                maxFeePerGas: ethers.parseUnits('1', 'gwei'),
                gasPrice: ethers.parseUnits('1', 'gwei')
            });
        });

        afterEach(() => {
            mockPrompt.mockRestore();
        });

        it('should prompt for confirmation when skipConfirm is false', async () => {
            const mockListing = {
                price: {
                    current: {
                        value: ethers.parseEther('1.0').toString()
                    }
                },
                protocol_data: {
                    parameters: {
                        offerer: '0xSellerAddress'
                    }
                },
                order: {}
            };

            mockOpenseaApi.getListingByTokenId.mockResolvedValue(mockListing);
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');
            mockPrompt.mockResolvedValue({ confirmed: true });

            const result = await buySpecificNFT(
                mockSdk,
                '0xContractAddress',
                '123',
                mockWallet,
                mockOpenseaApi,
                { skipConfirm: false }
            );

            expect(result).toBe('0xtxhash');
            expect(mockPrompt).toHaveBeenCalled();
        });

        it('should cancel purchase when user rejects confirmation', async () => {
            const mockListing = {
                price: {
                    current: {
                        value: ethers.parseEther('1.0').toString()
                    }
                },
                protocol_data: {
                    parameters: {
                        offerer: '0xSellerAddress'
                    }
                },
                order: {}
            };

            mockOpenseaApi.getListingByTokenId.mockResolvedValue(mockListing);
            mockPrompt.mockResolvedValue({ confirmed: false });

            await expect(
                buySpecificNFT(
                    mockSdk,
                    '0xContractAddress',
                    '123',
                    mockWallet,
                    mockOpenseaApi,
                    { skipConfirm: false }
                )
            ).rejects.toThrow('Purchase cancelled by user');

            expect(mockSdk.fulfillOrder).not.toHaveBeenCalled();
        });
    });

    describe('buyFloorNFT with confirmation', () => {
        let mockSdk, mockWallet, mockOpenseaApi, mockPrompt;

        beforeEach(() => {
            mockSdk = {
                fulfillOrder: jest.fn()
            };

            mockWallet = {
                address: '0x1234567890123456789012345678901234567890',
                provider: {
                    getBalance: jest.fn(),
                    getFeeData: jest.fn()
                },
                getAddress: jest.fn()
            };

            mockOpenseaApi = {
                getBestListings: jest.fn()
            };

            jest.spyOn(logger, 'info').mockImplementation(() => {});
            mockPrompt = jest.spyOn(enquirer, 'prompt');

            // Setup default mocks
            mockWallet.getAddress.mockResolvedValue('0x1234567890123456789012345678901234567890');
            mockWallet.provider.getBalance.mockResolvedValue(ethers.parseEther('10.0'));
            mockWallet.provider.getFeeData.mockResolvedValue({
                maxFeePerGas: ethers.parseUnits('1', 'gwei'),
                gasPrice: ethers.parseUnits('1', 'gwei')
            });
        });

        afterEach(() => {
            mockPrompt.mockRestore();
        });

        it('should prompt for confirmation when skipConfirm is false', async () => {
            const mockListings = [{
                price: {
                    current: {
                        value: ethers.parseEther('1.0').toString()
                    }
                },
                protocol_data: {
                    parameters: {
                        offerer: '0xSeller',
                        offer: [{
                            token: '0xContract',
                            identifierOrCriteria: '123'
                        }]
                    }
                },
                order: {}
            }];

            mockOpenseaApi.getBestListings.mockResolvedValue({ listings: mockListings });
            mockSdk.fulfillOrder.mockResolvedValue('0xtxhash');
            mockPrompt.mockResolvedValue({ confirmed: true });

            const result = await buyFloorNFT(
                mockSdk,
                'test-collection',
                mockWallet,
                mockOpenseaApi,
                { skipConfirm: false }
            );

            expect(result).toBe('0xtxhash');
            expect(mockPrompt).toHaveBeenCalled();
        });

        it('should cancel purchase when user rejects confirmation', async () => {
            const mockListings = [{
                price: {
                    current: {
                        value: ethers.parseEther('1.0').toString()
                    }
                },
                protocol_data: {
                    parameters: {
                        offerer: '0xSeller',
                        offer: [{
                            token: '0xContract',
                            identifierOrCriteria: '123'
                        }]
                    }
                },
                order: {}
            }];

            mockOpenseaApi.getBestListings.mockResolvedValue({ listings: mockListings });
            mockPrompt.mockResolvedValue({ confirmed: false });

            await expect(
                buyFloorNFT(
                    mockSdk,
                    'test-collection',
                    mockWallet,
                    mockOpenseaApi,
                    { skipConfirm: false }
                )
            ).rejects.toThrow('Purchase cancelled by user');

            expect(mockSdk.fulfillOrder).not.toHaveBeenCalled();
        });
    });
});
