import { logger } from '../utils/logger.js';
import { Chain } from "opensea-js";

export class ReservoirApi {
    constructor(apiKey, chainConfig) {
        this.apiKey = apiKey;
        this.chainConfig = chainConfig;
        
        // 根据链选择正确的 API endpoint
        switch (chainConfig.chain) {
            case Chain.Base:
                this.baseUrl = 'https://api-base.reservoir.tools';
                break;
            case Chain.Sepolia:
                this.baseUrl = 'https://api-sepolia.reservoir.tools';
                break;
            default:
                this.baseUrl = 'https://api.reservoir.tools';
        }
    }

    async fetchWithRetry(url, options, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'x-api-key': this.apiKey,
                        'Accept': 'application/json',
                        ...options.headers
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error(`API Error: ${response.status}`, errorText);
                    throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                logger.error(`Attempt ${i + 1} failed:`, error.message);
                if (i === retries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async getTopCollections(limit = 20, options = {}) {
        try {
            const url = new URL(`${this.baseUrl}/collections/v7`);

            // 如果提供了合约地址，就只查询这个合约
            if (options.contractAddress) {
                url.searchParams.append('id', options.contractAddress);
            } else {
                // 否则使用常规的查询参数
                url.searchParams.append('limit', limit.toString());
                url.searchParams.append('sortBy', '1DayVolume');
                url.searchParams.append('excludeSpam', 'true');
                
                if (options.maxFloorAskPrice) {
                    url.searchParams.append('maxFloorAskPrice', options.maxFloorAskPrice.toString());
                }
                if (options.minFloorAskPrice) {
                    url.searchParams.append('minFloorAskPrice', options.minFloorAskPrice.toString());
                }
                if (options.continuation) {
                    url.searchParams.append('continuation', options.continuation);
                }
            }
            
            logger.debug('Fetching top collections:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET'
            });

            return {
                data: (response.collections || [])
                    .map(collection => ({
                        slug: collection.slug,
                        name: collection.name,
                        stats: {
                            volume24h: collection.volume?.["1day"] || 0,
                            floorPrice: collection.floorAsk?.price?.amount?.native || 0,
                            topBid: collection.topBid?.price?.amount?.native || 0,
                            totalSupply: collection.tokenCount,
                            estimatedSales: collection.volume?.["1day"] / (collection.floorAsk?.price?.amount?.native || 1)
                        },
                        openseaUrl: `https://opensea.io/collection/${collection.slug}`,
                        reservoirUrl: `https://explorer.reservoir.tools/${this.chainConfig.chain}/collection/${collection.id}`
                    })),
                continuation: options.contractAddress ? null : response.continuation
            };
        } catch (error) {
            logger.error('Failed to fetch top collections:', error);
            return {
                data: [],
                continuation: null
            };
        }
    }

    async getCollectionOffers(collectionId) {
        try {
            const url = new URL(`${this.baseUrl}/orders/bids/v6`);
            url.searchParams.append('collection', collectionId);
            url.searchParams.append('sortBy', 'price');
            url.searchParams.append('limit', '1');
            
            logger.debug('Fetching collection offers:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET'
            });

            return {
                offers: response.orders.map(order => ({
                    price: {
                        value: order.price.amount.raw
                    },
                    protocol_data: {
                        parameters: {
                            consideration: [{
                                startAmount: "1"
                            }]
                        }
                    }
                }))
            };
        } catch (error) {
            logger.error('Failed to fetch collection offers:', error);
            return { offers: [] };
        }
    }

    async getTrendingCollections(options = {}) {
        try {
            const url = new URL(`${this.baseUrl}/collections/trending/v1`);
            
            url.searchParams.append('limit', options.limit?.toString() || '20');
            url.searchParams.append('period', options.period || '24h');
            url.searchParams.append('sortBy', 'volume');
            url.searchParams.append('normalizeRoyalties', 'false');
            url.searchParams.append('useNonFlaggedFloorAsk', 'true');
            
            logger.debug('Fetching trending collections:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET'
            });

            return {
                data: (response.collections || [])
                    .map(collection => ({
                        name: collection.name,
                        stats: {
                            volume24h: collection.collectionVolume?.["1day"] || collection.volume || 0,
                            floorPrice: collection.floorAsk?.price?.amount?.decimal || 0,
                            totalSupply: collection.tokenCount,
                            volumeChange: collection.volumeChange?.["1day"] || collection.volumePercentChange || 0,
                            floorPriceChange: collection.floorAskPercentChange || 0,
                            onSaleCount: collection.onSaleCount || 0,
                            ownerCount: collection.ownerCount || 0
                        },
                        reservoirUrl: `https://explorer.reservoir.tools/${this.chainConfig.chain}/collection/${collection.id}`
                    }))
                    .filter(collection => collection.stats.volume24h >= parseFloat(options.volume || 0))
            };
        } catch (error) {
            logger.error('Failed to fetch trending collections:', error);
            return {
                data: []
            };
        }
    }



    async getListingStatus(orderId) {
        try {
            const url = new URL(`${this.baseUrl}/orders/status/v1`);
            url.searchParams.append('ids', orderId);
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET'
            });

            return response.orders[0];
        } catch (error) {
            logger.error('Failed to get listing status:', error);
            throw error;
        }
    }

    async getNFTRoyalties(contractAddress, tokenId) {
        try {
            const url = new URL(`${this.baseUrl}/tokens/details/v6`);
            url.searchParams.append('contract', contractAddress);
            url.searchParams.append('tokenId', tokenId);
            
            logger.debug('Fetching NFT royalties:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET'
            });

            return {
                royalties: response.tokens?.[0]?.token?.royalties || [],
                onChainRoyalties: response.tokens?.[0]?.token?.onChainRoyalties || [],
                royaltyBps: response.tokens?.[0]?.token?.royaltyBps
            };
        } catch (error) {
            logger.error('Failed to fetch NFT royalties:', error);
            return null;
        }
    }

    async getListingDetails(contractAddress, tokenId) {
        try {
            const url = new URL(`${this.baseUrl}/orders/asks/v4`);
            url.searchParams.append('contract', contractAddress);
            url.searchParams.append('tokenId', tokenId);
            url.searchParams.append('includeRawData', 'true');
            url.searchParams.append('sortBy', 'createdAt');
            url.searchParams.append('limit', '1');
            
            logger.debug('Fetching listing details:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET'
            });

            if (!response.orders?.length) {
                return null;
            }

            const order = response.orders[0];
            return {
                price: order.price?.netAmount?.native || 0,
                marketplace: order.source?.name || 'unknown',
                fees: order.fees || [],
                royalties: order.royalties || [],
                rawData: order.rawData
            };
        } catch (error) {
            logger.error('Failed to fetch listing details:', error);
            return null;
        }
    }

    // 可以添加更多 Reservoir 特有的方法
    // 比如取收藏品详情、交易历史等
} 