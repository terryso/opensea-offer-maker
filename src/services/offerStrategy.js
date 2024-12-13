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
    }

    async checkAndCreateOffer(params) {
        try {
            const collectionInfo = await this.openSeaApi.getCollectionInfo(params.collectionSlug);
            if (!collectionInfo?.contracts?.[0]?.address) {
                throw new Error('Unable to get collection contract address');
            }
            const contractAddress = collectionInfo.contracts[0].address;
            
            const bestOffer = await this.getBestOffer(params);
            
            if (!bestOffer || bestOffer.maker.address.toLowerCase() !== this.walletAddress.toLowerCase()) {
                const newUnitPrice = await this.calculateNewOfferPrice(bestOffer?.price, params.collectionSlug);
                
                if (!newUnitPrice) {
                    logger.info('New price exceeds limit (either max price or floor price percentage)');
                    return null;
                }

                logger.info(`Creating new offer, unit price: ${newUnitPrice} WETH`);

                if (params.collectionSlug) {
                    const offerParams = {
                        collectionSlug: params.collectionSlug,
                        tokenAddress: contractAddress,
                        offerAmount: newUnitPrice,
                        quantity: 1,
                        expirationMinutes: 15
                    };

                    logger.debug('Creating collection offer with params:', offerParams);

                    try {
                        return await this.offerService.createCollectionOffer(offerParams);
                    } catch (error) {
                        logger.error('Failed to create collection offer:', error);
                        logger.debug('Offer params:', offerParams);
                        throw error;
                    }
                } else {
                    return await this.offerService.createIndividualOffer({
                        ...params,
                        offerAmount: newUnitPrice,
                        expirationMinutes: 15
                    });
                }
            }
            
            return null;
        } catch (error) {
            logger.error('Error in checkAndCreateOffer:', error);
            throw error;
        }
    }

    async getBestOffer(params) {
        try {
            let offers;
            if (params.collectionSlug) {
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

                logger.debug('Best offer found:', {
                    // value: bestOffer.price.value,
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
                offers = await this.openSeaApi.getNFTOffers(params.tokenAddress, params.tokenId);
            }

            if (!offers || !offers.orders || offers.orders.length === 0) {
                return null;
            }

            const bestOffer = offers.orders[0];
            return {
                maker: {
                    address: bestOffer.maker.address
                },
                price: {
                    value: ethers.formatEther(bestOffer.current_price)
                }
            };
        } catch (error) {
            logger.error('Error fetching best offer:', error);
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