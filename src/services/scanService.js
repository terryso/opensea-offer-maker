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
        const minSales = parseFloat(options.sales);
        const opportunities = [];
        let page = 1;
        let continuation = null;
        const minOpportunities = parseInt(options.minOpportunities);
        const maxPages = 10;

        while (page <= maxPages) {
            logger.info(`Scanning page ${page}...`);
            
            const collections = await this.reservoirApi.getTopCollections(20, {
                minFloorAskPrice: options.minFloor,
                maxFloorAskPrice: options.maxFloor,
                continuation
            });

            const results = await this._processCollections(collections.data, minVolume, minGap, minSales);
            opportunities.push(...results);

            if (opportunities.length >= minOpportunities || !collections.continuation) {
                break;
            }

            continuation = collections.continuation;
            page++;

            await new Promise(resolve => setTimeout(resolve, 500));
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

    async _processCollections(collections, minVolume, minGap, minSales) {
        const opportunities = [];

        for (const collection of collections) {
            try {
                // 检查24小时交易量（如果设置了最小交易量）
                if (minVolume && collection.stats.volume24h < minVolume) {
                    logger.debug(`Skipping ${collection.name} - volume too low (${collection.stats.volume24h} ETH)`);
                    continue;
                }

                // 检查估算销量（如果设置了最小销量）
                if (minSales && collection.stats.estimatedSales < minSales) {
                    logger.debug(`Skipping ${collection.name} - estimated sales too low (${collection.stats.estimatedSales.toFixed(2)})`);
                    continue;
                }

                // 获取地板价和最高出价
                const floorPrice = collection.stats.floorPrice;
                const highestOffer = collection.stats.topBid;

                if (!floorPrice) {
                    logger.debug(`Skipping ${collection.name} - no floor price`);
                    continue;
                }

                if (!highestOffer) {
                    logger.debug(`Skipping ${collection.name} - no offers`);
                    continue;
                }

                // 计算差价百分比
                const gapPercentage = ((floorPrice - highestOffer) / floorPrice) * 100;

                // 如果设置了最小差价，则检查差价
                if (minGap && gapPercentage < minGap) {
                    continue;
                }

                opportunities.push({
                    name: collection.name,
                    slug: collection.slug,
                    floorPrice,
                    highestOffer,
                    gapPercentage,
                    volume24h: collection.stats.volume24h,
                    estimatedSales: collection.stats.estimatedSales,
                    openseaUrl: collection.openseaUrl,
                    reservoirUrl: collection.reservoirUrl,
                    // 添加 blurUrl（如果存在）
                    ...(collection.blurUrl && { blurUrl: collection.blurUrl })
                });

                // 添加调试日志
                logger.debug(`Processing collection: ${collection.name}`);
                logger.debug(`24h Volume: ${collection.stats.volume24h} ETH`);
                logger.debug(`Floor Price: ${floorPrice} ETH`);
                logger.debug(`Highest Offer: ${highestOffer} ETH`);
                logger.debug(`Gap Percentage: ${gapPercentage}%`);
                logger.debug(`Estimated 24h Sales: ${collection.stats.estimatedSales.toFixed(2)}`);
            } catch (error) {
                logger.debug(`Error processing collection ${collection.slug}:`, error);
                continue;
            }
        }

        return opportunities;
    }
} 