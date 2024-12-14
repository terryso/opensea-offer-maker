import { logger } from '../utils/logger.js';
import { ethers } from 'ethers';

export class ScanService {
    constructor(reservoirApi, openSeaApi) {
        this.reservoirApi = reservoirApi;
        this.openSeaApi = openSeaApi;
    }

    async scanTopCollections(options) {
        const minVolume = parseFloat(options.volume);
        const minGap = parseFloat(options.gap);
        const opportunities = [];
        let page = 1;
        let continuation = null;
        const minOpportunities = parseInt(options.minOpportunities);
        const maxPages = 5;

        while (page <= maxPages) {
            logger.debug(`Scanning page ${page}...`);
            
            const collections = await this.reservoirApi.getTopCollections(20, {
                minFloorAskPrice: options.minFloor,
                maxFloorAskPrice: options.maxFloor,
                continuation
            });

            const results = await this._processCollections(collections.data, minVolume, minGap);
            opportunities.push(...results);

            if (opportunities.length >= minOpportunities || !collections.continuation) {
                break;
            }

            continuation = collections.continuation;
            page++;
        }

        return {
            scannedPages: page,
            opportunities
        };
    }

    async scanTrendingCollections(options) {
        const collections = await this.reservoirApi.getTrendingCollections({
            limit: options.limit,
            period: options.period
        });

        return {
            collections: collections.data
        };
    }

    async _processCollections(collections, minVolume, minGap) {
        const opportunities = [];

        for (const collection of collections) {
            try {
                // 检查24小时交易量
                if (collection.stats.volume24h < minVolume) {
                    logger.debug(`Skipping ${collection.name} - volume too low (${collection.stats.volume24h} ETH)`);
                    continue;
                }

                // 获取地板价
                const floorPrice = collection.stats.floorPrice;
                if (!floorPrice) {
                    logger.debug(`Skipping ${collection.name} - no floor price`);
                    continue;
                }

                // 获取最高出价
                const offers = await this.openSeaApi.getCollectionOffers(collection.slug);
                if (!offers?.offers?.length) {
                    logger.debug(`Skipping ${collection.name} - no offers`);
                    continue;
                }

                // 计算最高offer
                const highestOffer = offers.offers.reduce((max, offer) => {
                    const quantity = parseInt(offer.protocol_data.parameters.consideration[0].startAmount) || 1;
                    const price = parseFloat(ethers.formatEther(BigInt(offer.price.value) / BigInt(quantity)));
                    return price > max ? price : max;
                }, 0);

                // 计算差价百分比
                const gapPercentage = ((floorPrice - highestOffer) / floorPrice) * 100;

                if (gapPercentage >= minGap) {
                    opportunities.push({
                        name: collection.name,
                        slug: collection.slug,
                        floorPrice,
                        highestOffer,
                        gapPercentage,
                        volume24h: collection.stats.volume24h,
                        openseaUrl: collection.openseaUrl
                    });
                }

                // 添加调试日志
                logger.debug(`Processing collection: ${collection.name}`);
                logger.debug(`24h Volume: ${collection.stats.volume24h} ETH`);
                logger.debug(`Floor Price: ${floorPrice} ETH`);
                logger.debug(`Highest Offer: ${highestOffer} ETH`);
                logger.debug(`Gap Percentage: ${gapPercentage}%`);
            } catch (error) {
                logger.debug(`Error processing collection ${collection.slug}:`, error);
                continue;
            }
        }

        return opportunities;
    }
} 