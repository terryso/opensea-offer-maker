import { ethers } from 'ethers';
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

      // 如果订单已经过期或不存在，清除记录
      if (orderStatus.expired || orderStatus.status === 'not_found') {
        logger.info('Previous offer expired or not found, clearing record', {
          orderHash: this.lastOrderHash,
          status: orderStatus.status
        });
        this.lastOrderHash = null;
        return false;
      }

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
    const checkTime = new Date().toISOString();
    logger.info(`[${checkTime}] Starting offer check...`);

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

        logger.debug('Best offer check result:', {
          hasBestOffer: !!bestOffer,
          iAmTopBidder: bestOffer?.iAmTopBidder,
          shouldCreateOffer: !bestOffer || !bestOffer.iAmTopBidder
        });

        // 如果没有 offer，或者自己不是最高价之一，则创建新的 offer
        if (!bestOffer || !bestOffer.iAmTopBidder) {
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
        } else {
          logger.info('Already among top bidders, skipping offer creation');
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

        // 首先找出最高单价
        let highestUnitPrice = BigInt(0);
        for (const offer of offers.offers) {
          const quantity = parseInt(offer.protocol_data.parameters.consideration[0].startAmount) || 1;
          const value = BigInt(offer.price.value);
          const unitValue = value / BigInt(quantity);

          if (unitValue > highestUnitPrice) {
            highestUnitPrice = unitValue;
          }
        }

        // 找出所有最高价的 offers
        const topOffers = offers.offers.filter(offer => {
          const quantity = parseInt(offer.protocol_data.parameters.consideration[0].startAmount) || 1;
          const value = BigInt(offer.price.value);
          const unitValue = value / BigInt(quantity);
          return unitValue === highestUnitPrice;
        });

        // 检查自己是否在最高价的 offers 中
        const myWalletLower = this.walletAddress.toLowerCase();
        const topOfferers = topOffers.map(offer =>
          offer.protocol_data.parameters.offerer.toLowerCase()
        );
        const iAmTopBidder = topOfferers.includes(myWalletLower);

        logger.debug('Top bidder check:', {
          myWallet: myWalletLower,
          topOfferers: topOfferers,
          iAmTopBidder: iAmTopBidder,
          topOffersCount: topOffers.length
        });

        // 选择一个代表性的最高价 offer（当单价相等时，选择数量最多的）
        const bestOffer = topOffers.reduce((best, current) => {
          const bestQuantity = parseInt(best.protocol_data.parameters.consideration[0].startAmount) || 1;
          const currentQuantity = parseInt(current.protocol_data.parameters.consideration[0].startAmount) || 1;
          return currentQuantity > bestQuantity ? current : best;
        });

        logger.debug('Best collection offer found:', {
          quantity: bestOffer.protocol_data.parameters.consideration[0].startAmount,
          unitPrice: ethers.formatEther(BigInt(bestOffer.price.value) / BigInt(bestOffer.protocol_data.parameters.consideration[0].startAmount)),
          maker: bestOffer.protocol_data.parameters.offerer,
          topBiddersCount: topOffers.length,
          iAmTopBidder: iAmTopBidder
        });

        return {
          maker: {
            address: bestOffer.protocol_data.parameters.offerer
          },
          price: {
            value: bestOffer.price.value,
            quantity: bestOffer.protocol_data.parameters.consideration[0].startAmount
          },
          iAmTopBidder: iAmTopBidder
        };
      } else {
        // 获取单个 token 的最佳 offer
        const bestOffer = await this.openSeaApi.getBestNFTOffer(params.collectionSlug, params.tokenId);

        if (!bestOffer) {
          logger.debug('No NFT offers found');
          return null;
        }

        const quantity = bestOffer.protocol_data.parameters.consideration[0].startAmount || '1';
        const iAmTopBidder = bestOffer.protocol_data.parameters.offerer.toLowerCase() === this.walletAddress.toLowerCase();

        logger.debug('Best token offer found:', {
          totalPrice: ethers.formatEther(bestOffer.price.value),
          quantity: quantity,
          maker: bestOffer.protocol_data.parameters.offerer,
          iAmTopBidder: iAmTopBidder
        });

        return {
          maker: {
            address: bestOffer.protocol_data.parameters.offerer
          },
          price: {
            value: bestOffer.price.value,
            quantity: quantity
          },
          iAmTopBidder: iAmTopBidder
        };
      }
    } catch (error) {
      logger.error('Error fetching best offer:', error);
      logger.debug('Params:', params);
      return null;
    }
  }

  start(params) {
    if (this.running) {return;}

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
