import { ethers } from "ethers";
import { logger, LogLevel } from '../utils/logger.js';

export class OfferStrategy {
    constructor(offerService, openSeaApi, config = {}) {
        this.offerService = offerService;
        this.openSeaApi = openSeaApi;
        this.minPrice = config.minPrice || '0';
        this.maxPrice = config.maxPrice || '0';
        this.increment = config.increment || '0.0001';
        this.checkIntervalSeconds = config.checkIntervalSeconds || 60;
        this.walletAddress = config.walletAddress;
        this.floorPricePercentage = config.floorPricePercentage || null;
        this.running = false;
        this.timerId = null;
        this.retryCount = config.retryCount || 3;
        this.retryDelay = config.retryDelay || 1000;
        this.lastOrderHash = null;
    }

    validatePriceRange(price) {
        const priceNum = parseFloat(price);
        const minNum = parseFloat(this.minPrice);
        const maxNum = parseFloat(this.maxPrice);
        
        logger.debug('Price validation:', {
            price: priceNum,
            min: minNum,
            max: maxNum,
            isValid: priceNum >= minNum && priceNum <= maxNum
        });
        
        return priceNum >= minNum && priceNum <= maxNum;
    }

    async validateFloorPriceLimit(price, collectionSlug) {
        if (!this.floorPricePercentage) {
            return true;
        }

        try {
            const stats = await this.openSeaApi.getCollectionStats(collectionSlug);
            const floorPrice = stats.floor_price;
            
            if (!floorPrice) {
                logger.warn('Unable to get floor price for collection');
                return true;
            }

            const maxAllowedPrice = floorPrice * (this.floorPricePercentage / 100);
            const offerPrice = parseFloat(price);

            logger.debug('Floor price validation:', {
                floorPrice,
                percentage: this.floorPricePercentage,
                maxAllowedPrice,
                offerPrice,
                isValid: offerPrice <= maxAllowedPrice
            });

            return offerPrice <= maxAllowedPrice;
        } catch (error) {
            logger.error('Error validating floor price limit:', error);
            return true; // 发生错误时，默认允许offer
        }
    }

    async calculateNewOfferPrice(currentBestOffer, collectionSlug) {
        if (!currentBestOffer) {
            logger.debug('No current best offer, using min price:', this.minPrice);
            return this.minPrice;
        }

        try {
            // 确保必要的字段存在
            if (!currentBestOffer.value || !currentBestOffer.quantity) {
                logger.debug('Invalid offer format, using min price:', {
                    value: currentBestOffer.value,
                    quantity: currentBestOffer.quantity
                });
                return this.minPrice;
            }

            const currentQuantity = BigInt(currentBestOffer.quantity);
            const currentTotalPrice = BigInt(currentBestOffer.value);
            const currentUnitPrice = ethers.formatEther(currentTotalPrice / currentQuantity);
            
            const newUnitPrice = (parseFloat(currentUnitPrice) + parseFloat(this.increment)).toFixed(4);
            
            logger.debug('Price calculation:', {
                currentTotalPrice: ethers.formatEther(currentTotalPrice),
                currentQuantity: currentQuantity.toString(),
                currentUnitPrice,
                newUnitPrice,
                increment: this.increment,
                minPrice: this.minPrice,
                maxPrice: this.maxPrice,
                floorPricePercentage: this.floorPricePercentage
            });

            const isInPriceRange = this.validatePriceRange(newUnitPrice);
            const isInFloorPriceLimit = await this.validateFloorPriceLimit(newUnitPrice, collectionSlug);

            if (!isInPriceRange || !isInFloorPriceLimit) {
                logger.debug('New unit price validation failed:', {
                    newUnitPrice,
                    isInPriceRange,
                    isInFloorPriceLimit,
                    minPrice: this.minPrice,
                    maxPrice: this.maxPrice,
                    floorPricePercentage: this.floorPricePercentage
                });
                return null;
            }
            
            return newUnitPrice;
        } catch (error) {
            logger.error('Error calculating new offer price:', error);
            logger.debug('Current best offer:', currentBestOffer);
            return this.minPrice;
        }
    }

    async checkLastOffer() {
        if (!this.lastOrderHash) {
            return false;
        }

        try {
            const orderStatus = await this.openSeaApi.getOrderStatus(this.lastOrderHash);
            if (orderStatus.fulfilled) {
                logger.info('Previous offer was accepted!', {
                    orderHash: this.lastOrderHash
                });
                return true;
            }
            return false;
        } catch (error) {
            logger.error('Failed to check order status:', error);
            return false;
        }
    }

    async checkAndCreateOffer(params) {
        try {
            // 检查上一个 offer 是否被接受
            if (await this.checkLastOffer()) {
                logger.info('Offer was accepted, stopping auto offer...');
                this.stop();
                process.exit(0);  // 这里是正常退出
                return;
            }

            let contractAddress;
            const offerType = params.type || 'collection';
            
            try {
                if (offerType === 'collection') {
                    const collectionInfo = await this.openSeaApi.getCollectionInfo(params.collectionSlug);
                    if (!collectionInfo?.contracts?.[0]?.address) {
                        throw new Error('Unable to get collection contract address');
                    }
                    contractAddress = collectionInfo.contracts[0].address;
                } else {
                    contractAddress = params.tokenAddress;
                }
                
                const bestOffer = await this.getBestOffer(params);
                
                if (!bestOffer || bestOffer.maker.address.toLowerCase() !== this.walletAddress.toLowerCase()) {
                    const newUnitPrice = await this.calculateNewOfferPrice(bestOffer?.price, params.collectionSlug);
                    
                    if (!newUnitPrice) {
                        logger.info('New price exceeds limit (either max price or floor price percentage)');
                        return null;
                    }

                    logger.info(`Creating new offer, unit price: ${newUnitPrice} WETH`);

                    let result;
                    if (offerType === 'collection') {
                        const offerParams = {
                            collectionSlug: params.collectionSlug,
                            tokenAddress: contractAddress,
                            offerAmount: newUnitPrice,
                            quantity: 1,
                            expirationMinutes: 10,
                            walletAddress: this.walletAddress
                        };

                        logger.debug('Creating collection offer with params:', offerParams);

                        try {
                            result = await this.offerService.createCollectionOffer(offerParams);
                        } catch (error) {
                            logger.error('Failed to create collection offer:', error);
                            logger.debug('Offer params:', offerParams);
                            return null;  // 继续运行，不抛出错误
                        }
                    } else {
                        const offerParams = {
                            ...params,
                            offerAmount: newUnitPrice,
                            expirationMinutes: 10,
                            walletAddress: this.walletAddress
                        };

                        logger.debug('Creating individual offer with params:', offerParams);

                        try {
                            result = await this.offerService.createIndividualOffer(offerParams);
                        } catch (error) {
                            logger.error('Failed to create individual offer:', error);
                            logger.debug('Offer params:', offerParams);
                            return null;  // 继续运行，不抛出错误
                        }
                    }

                    // 保存新创建的 offer 的 hash
                    if (result) {
                        this.lastOrderHash = result;
                    }

                    return result;
                }
                
                return null;
            } catch (error) {
                logger.error('Error in offer creation process:', error);
                return null;  // 继续运行，不抛出错误
            }
        } catch (error) {
            logger.error('Critical error in checkAndCreateOffer:', error);
            return null;  // 继续运行，不抛出错误
        }
    }

    async getBestOffer(params) {
        try {
            let offers;
            const offerType = params.type || 'collection';

            if (offerType === 'collection') {
                offers = await this.openSeaApi.getCollectionOffers(params.collectionSlug);
                
                if (!offers?.offers?.length) {
                    return null;
                }

                const bestOffer = offers.offers.reduce((best, current) => {
                    const currentQuantity = parseInt(current.protocol_data.parameters.consideration[0].startAmount) || 1;
                    const currentValue = BigInt(current.price.value);
                    const currentUnitValue = currentValue / BigInt(currentQuantity);
                    
                    if (!best) return current;
                    
                    const bestQuantity = parseInt(best.protocol_data.parameters.consideration[0].startAmount) || 1;
                    const bestValue = BigInt(best.price.value);
                    const bestUnitValue = bestValue / BigInt(bestQuantity);

                    if (currentUnitValue > bestUnitValue) return current;
                    if (currentUnitValue === bestUnitValue && currentQuantity > bestQuantity) return current;
                    return best;
                }, null);

                logger.debug('Best collection offer found:', {
                    quantity: bestOffer.protocol_data.parameters.consideration[0].startAmount,
                    unitPrice: ethers.formatEther(BigInt(bestOffer.price.value) / BigInt(bestOffer.protocol_data.parameters.consideration[0].startAmount)),
                    maker: bestOffer.protocol_data.parameters.offerer,
                    myself: bestOffer.protocol_data.parameters.offerer.toLowerCase() === this.walletAddress.toLowerCase()
                });

                return {
                    maker: {
                        address: bestOffer.protocol_data.parameters.offerer
                    },
                    price: {
                        value: bestOffer.price.value,
                        quantity: bestOffer.protocol_data.parameters.consideration[0].startAmount
                    }
                };
            } else {
                // 获取单个 token 的最佳 offer
                const bestOffer = await this.openSeaApi.getBestNFTOffer(params.collectionSlug, params.tokenId);
                
                if (!bestOffer) {
                    logger.debug('No NFT offers found');
                    return null;
                }

                const quantity = bestOffer.protocol_data.parameters.consideration[0].startAmount || '1';

                logger.debug('Best token offer found:', {
                    totalPrice: ethers.formatEther(bestOffer.price.value),
                    quantity: quantity,
                    maker: bestOffer.protocol_data.parameters.offerer,
                    myself: bestOffer.protocol_data.parameters.offerer.toLowerCase() === this.walletAddress.toLowerCase()
                });

                return {
                    maker: {
                        address: bestOffer.protocol_data.parameters.offerer
                    },
                    price: {
                        value: bestOffer.price.value,
                        quantity: quantity
                    }
                };
            }
        } catch (error) {
            logger.error('Error fetching best offer:', error);
            logger.debug('Params:', params);
            return null;
        }
    }

    start(params) {
        if (this.running) return;
        
        this.running = true;
        this.checkAndCreateOffer(params);
        
        this.timerId = setInterval(() => {
            if (this.running) {
                this.checkAndCreateOffer(params);
            }
        }, this.checkIntervalSeconds * 1000);
    }

    stop() {
        this.running = false;
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
} 