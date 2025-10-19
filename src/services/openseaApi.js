import { logger } from '../utils/logger.js';
import axios from 'axios';
import { ethers } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Seaport } from '@opensea/seaport-js';
import { ItemType } from '@opensea/seaport-js/lib/constants.js';
import { CacheService } from './cacheService.js';

export class OpenSeaApi {
    constructor(apiKey, baseUrl, chainConfig) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.chainConfig = chainConfig;
        this.cacheService = new CacheService();

        // 代理配置
        const proxyUrl = process.env.HTTP_PROXY || 'http://127.0.0.1:7890';
        const httpsAgent = new HttpsProxyAgent(proxyUrl);

        // 创建 axios 实例，支持代理和更长的超时
        this.axiosInstance = axios.create({
            timeout: 60000, // 60秒超时
            httpsAgent: httpsAgent,
            proxy: false, // 禁用默认代理，使用 httpsAgent
            headers: {
                'X-API-KEY': this.apiKey,
                'Accept': 'application/json'
            }
        });
        
        logger.debug(`Using proxy: ${proxyUrl}`);
    }

    async fetchWithRetry(url, options, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await this.axiosInstance({
                    url,
                    method: options.method || 'GET',
                    headers: {
                        ...options.headers
                    }
                });

                return response.data;
            } catch (error) {
                logger.error(`Attempt ${i + 1} failed:`, error.message);
                logger.error(`Error details - URL: ${url}`);

                if (error.response) {
                    // HTTP 错误响应
                    const status = error.response.status;

                    if (status === 404) {
                        return { offers: [] };
                    }

                    if (status === 401) {
                        throw new Error(`Invalid API key: ${error.response.data}`);
                    }

                    logger.error(`API Error: ${status}`, error.response.data);

                    if (i === retries - 1) {
                        throw new Error(`HTTP error! status: ${status}, details: ${JSON.stringify(error.response.data)}`);
                    }
                } else if (error.code === 'ECONNABORTED') {
                    logger.error('Request timeout');
                } else {
                    logger.error('Network error:', error.code);
                }

                if (error.message.includes('Invalid API key')) {
                    throw error;
                }

                if (i === retries - 1) {
                    throw error;
                }

                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async getCollectionOffers(collectionSlug) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/offers/collection/${collectionSlug}`);
            
            logger.debug('Fetching collection offers:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            // logger.debug('Collection offers response:', JSON.stringify(response, null, 2));
            
            return response;
        } catch (error) {
            logger.error('Failed to fetch collection offers:', error);
            return { offers: [] };
        }
    }

    async getNFTOffers(contractAddress, tokenId, limit = 1) {
        const url = new URL(`${this.baseUrl}/api/v2/orders/${this.chainConfig.name}/seaport/offers`);
        url.searchParams.append('asset_contract_address', contractAddress);
        url.searchParams.append('token_ids', tokenId);
        url.searchParams.append('limit', limit.toString());
        
        return this.fetchWithRetry(url.toString(), { 
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'X-API-KEY': this.apiKey
            }
        });
    }

    async getAllCollectionOffers(collectionSlug, limit = 100) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/offers/collection/${collectionSlug}/all`);
            url.searchParams.append('limit', limit.toString());
            
            logger.debug('Fetching all collection offers:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), { 
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            logger.debug('All collection offers response:', JSON.stringify(response, null, 2));
            return response;
        } catch (error) {
            logger.error('Failed to fetch all collection offers:', error);
            return { offers: [] };
        }
    }

    async getBestNFTOffer(collectionSlug, tokenId) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/offers/collection/${collectionSlug}/nfts/${tokenId}/best`);
            
            logger.debug('Fetching best NFT offer:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            return response;
        } catch (error) {
            logger.error('Failed to fetch best NFT offer:', error);
            return null;
        }
    }

    async getCollectionByContract(contractAddress) {
        try {
            // OpenSea API v2 使用 contract address 作为 identifier
            const url = new URL(`${this.baseUrl}/api/v2/chain/${this.chainConfig.name}/contract/${contractAddress}`);
            
            logger.debug('Fetching collection by contract:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            logger.debug('Collection by contract response:', JSON.stringify(response, null, 2));
            return response;
        } catch (error) {
            logger.error('Failed to fetch collection by contract:', error);
            return null;
        }
    }

    async getCollectionInfo(collectionSlug) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/collections/${collectionSlug}`);
            
            // logger.debug('Fetching collection info:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            // logger.debug('Collection info response:', JSON.stringify(response, null, 2));
            return response;
        } catch (error) {
            logger.error('Failed to fetch collection info:', error);
            return null;
        }
    }

    async getCollectionStats(collectionSlug) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/collections/${collectionSlug}/stats`);
            
            logger.debug('Fetching collection stats:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            // logger.debug('Collection stats response:', JSON.stringify(response, null, 2));
            
            if (!response?.total?.floor_price) {
                logger.error('Floor price not found in response:', response);
                throw new Error('Floor price not available');
            }

            return {
                ...response,
                floor_price: response.total.floor_price
            };
        } catch (error) {
            logger.error('Failed to fetch collection stats:', error);
            throw error;
        }
    }

    async getBestListings(collectionSlug, limit = 1) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/listings/collection/${collectionSlug}/best`);
            if (limit) {
                url.searchParams.append('limit', limit.toString());
            }

            logger.debug('Fetching best listings:', url.toString());

            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            return response;
        } catch (error) {
            logger.error('Failed to fetch best listings:', error);
            return { listings: [] };
        }
    }

    async getListingByTokenId(contractAddress, tokenId) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/orders/${this.chainConfig.name}/seaport/listings`);
            url.searchParams.append('asset_contract_address', contractAddress);
            url.searchParams.append('token_ids', tokenId);
            url.searchParams.append('limit', '1');

            logger.debug('Fetching listing by token ID:', url.toString());

            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            // 返回第一个listing，如果存在的话
            if (response && response.orders && response.orders.length > 0) {
                const listing = response.orders[0];

                // 添加价格信息以便于使用
                if (listing.current_price) {
                    listing.price_value = listing.current_price;
                    listing.price = parseFloat(ethers.formatEther(listing.current_price));
                }

                return listing;
            }

            return null;
        } catch (error) {
            logger.error('Failed to fetch listing by token ID:', error);
            return null;
        }
    }

    async getOrderStatus(orderHash) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/orders/${this.chainConfig.name}/seaport/${orderHash}`);

            logger.debug('Fetching order status:', url.toString());

            const response = await this.axiosInstance({
                url: url.toString(),
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            return {
                fulfilled: response.data.order_status === 'fulfilled',
                status: response.data.order_status,
                ...response.data
            };
        } catch (error) {
            // 404 表示订单不存在（可能已过期或被取消）
            if (error.response?.status === 404) {
                logger.warn(`Order ${orderHash} not found (expired or cancelled)`);
                return {
                    fulfilled: false,
                    status: 'not_found',
                    expired: true
                };
            }

            logger.error('Failed to fetch order status:', error.message);
            // 其他错误也返回默认状态，避免程序中断
            return {
                fulfilled: false,
                status: 'error',
                error: error.message
            };
        }
    }

    async getNFTLastSalePrice(contractAddress, tokenId) {
        try {
            // 使用 events API 获取最后的销售事件
            const url = new URL(`${this.baseUrl}/api/v2/events/chain/${this.chainConfig.name}/contract/${contractAddress}/nfts/${tokenId}`);
            url.searchParams.append('event_type', 'sale');
            url.searchParams.append('limit', '1');

            logger.debug('Fetching NFT last sale event:', url.toString());

            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            logger.debug('NFT events response:', JSON.stringify(response, null, 2));

            // 检查是否有销售事件
            const events = response?.asset_events;
            if (!events || events.length === 0) {
                logger.warn('No sale events found for this NFT');
                return null;
            }

            // 获取第一个（最新的）销售事件
            const lastSale = events[0];

            // 提取价格信息
            const payment = lastSale.payment;
            if (!payment) {
                logger.warn('No payment information in last sale event');
                return null;
            }

            // 价格可能在 payment.quantity 或其他字段中
            const priceValue = payment.quantity || payment.value || '0';

            // 转换为ETH
            const priceInETH = parseFloat(ethers.formatEther(priceValue));

            logger.debug(`Last sale price: ${priceInETH} ETH`);
            logger.debug(`Sale event timestamp: ${lastSale.event_timestamp}`);

            return {
                price: priceInETH,
                eventTimestamp: lastSale.event_timestamp,
                fromAddress: lastSale.from_address || lastSale.seller,
                toAddress: lastSale.to_address || lastSale.winner_account?.address,
                transaction: lastSale.transaction
            };
        } catch (error) {
            logger.error('Failed to fetch NFT last sale price:', error.message);
            return null;
        }
    }

    async createListing(params) {
        const { contractAddress, tokenId, price, expirationTime, wallet, walletAddress } = params;
        
        try {
            logger.info('Building listing order with Seaport.js...');

            // 创建 Seaport 实例
            const seaport = new Seaport(wallet);
            
            // Base 链上的 listing 使用 ETH 而不是 WETH
            const useNativeToken = this.chainConfig.chain === 'base';
            
            logger.debug('Order parameters:', {
                contractAddress,
                tokenId,
                price,
                expirationTime,
                walletAddress,
                chain: this.chainConfig.chain,
                useNativeToken
            });

            // 计算 OpenSea fee (1% = 100 basis points)
            const priceInWei = ethers.parseEther(price.toString());
            const openseaFeeRecipient = '0x0000a26b00c1F0DF003000390027140000fAa719';
            const openseaFeeAmount = priceInWei * BigInt(100) / BigInt(10000);
            const sellerAmount = priceInWei - openseaFeeAmount;

            logger.info('Creating order with Seaport.js...');
            
            // 使用 Seaport.js 创建 order
            // OpenSea conduit key
            const openseaConduitKey = '0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000';
            
            const { executeAllActions } = await seaport.createOrder({
                conduitKey: openseaConduitKey,
                offer: [
                    {
                        itemType: ItemType.ERC721,
                        token: contractAddress,
                        identifier: tokenId.toString(),
                    }
                ],
                consideration: [
                    {
                        amount: sellerAmount.toString(),
                        recipient: walletAddress,
                    },
                    {
                        amount: openseaFeeAmount.toString(),
                        recipient: openseaFeeRecipient,
                    }
                ],
                endTime: expirationTime.toString(),
                // 如果是 Base 链,使用 ETH,否则使用 WETH
                ...(useNativeToken ? {} : {
                    considerationToken: this.chainConfig.wethAddress
                }),
            });

            logger.info('Executing order creation...');
            const order = await executeAllActions();
            
            logger.info('Order created successfully');
            logger.debug('Order structure:', JSON.stringify(order, null, 2));
            logger.debug('Signature length:', order.signature?.length);
            logger.info('Submitting listing to OpenSea API...');

            // 提交到 OpenSea API
            const url = `${this.baseUrl}/api/v2/orders/${this.chainConfig.chain}/seaport/listings`;
            
            const response = await this.axiosInstance({
                url,
                method: 'POST',
                data: {
                    parameters: order.parameters,
                    signature: order.signature,
                    protocol_address: '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC'
                }
            });

            logger.info('✅ Listing submitted successfully!');
            return response.data;
            
        } catch (error) {
            logger.error('Failed to create listing:', error.message);
            if (error.response) {
                logger.error('API Error Status:', error.response.status);
                logger.error('API Error Data:', JSON.stringify(error.response.data, null, 2));
                
                // 显示详细的错误信息
                if (error.response.data?.errors) {
                    logger.error('Detailed Errors:');
                    error.response.data.errors.forEach((err, index) => {
                        logger.error(`  Error ${index + 1}:`, JSON.stringify(err, null, 2));
                    });
                }
            }
            throw error;
        }
    }

    /**
     * Get all NFTs for a wallet address with pagination and collection filtering
     *
     * @param {string} walletAddress - The wallet address to fetch NFTs for
     * @param {Object} options - Options for the request
     * @param {string} options.chain - Chain to query (defaults to this.chainConfig.name)
     * @param {number} options.limit - Limit per page (default: 50, max: 200)
     * @param {Function} options.onProgress - Progress callback for pagination
     * @returns {Promise<Array>} Array of NFT objects with structure needed for cache
     * @throws {Error} If API call fails or wallet address is invalid
     */
    async getWalletNFTs(walletAddress, options = {}) {
        try {
            // Validate wallet address
            if (!walletAddress || typeof walletAddress !== 'string') {
                throw new Error('Valid wallet address is required');
            }

            const chain = options.chain || this.chainConfig.name;
            const limit = Math.min(options.limit || 50, 200); // OpenSea API max is typically 200
            let next = null;
            let allNFTs = [];
            let page = 1;

            logger.info(`Fetching NFTs for wallet ${walletAddress} on ${chain}`);

            do {
                // Construct URL based on OpenSea API v2 pattern
                const url = new URL(`${this.baseUrl}/api/v2/chain/${chain}/account/${walletAddress}/nfts`);
                url.searchParams.set('limit', limit.toString());

                if (next) {
                    url.searchParams.set('next', next);
                }

                logger.debug(`Fetching NFTs page ${page}:`, url.toString());

                const response = await this.fetchWithRetry(url.toString(), {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'X-API-KEY': this.apiKey
                    }
                });

                // Handle different response formats
                let nfts = [];
                if (response.nfts && Array.isArray(response.nfts)) {
                    nfts = response.nfts;
                } else if (Array.isArray(response)) {
                    nfts = response;
                } else {
                    logger.warn('Unexpected response format:', response);
                    break;
                }

                // Transform NFTs to cache format
                const transformedNFTs = nfts.map(nft => this._transformNFTForCache(nft));
                allNFTs.push(...transformedNFTs);

                // Debug: Log first NFT to see structure (only in debug mode)
                if (page === 1 && nfts.length > 0) {
                    logger.debug('Sample NFT structure from OpenSea API:', JSON.stringify(nfts[0], null, 2));
                }

                logger.debug(`Fetched ${nfts.length} NFTs on page ${page}, total: ${allNFTs.length}`);

                // Progress callback
                if (options.onProgress && typeof options.onProgress === 'function') {
                    options.onProgress({
                        page,
                        currentPageCount: nfts.length,
                        totalCount: allNFTs.length,
                        hasMore: !!response.next
                    });
                }

                // Check for next page
                next = response.next || null;
                page++;

                // Safety check to prevent infinite loops
                if (page > 100) {
                    logger.warn('Reached maximum page limit (100) - stopping pagination');
                    break;
                }

            } while (next);

            // Apply collection filtering using CacheService
            const { filtered: filteredNFTs, filteredCount } = await this.cacheService._filterNFTs(chain, allNFTs);

            if (filteredCount > 0) {
                logger.info(`Filtered out ${filteredCount} NFTs from ignored collections`);
            }

            logger.info(`Successfully fetched ${filteredNFTs.length} NFTs for wallet ${walletAddress} (${filteredCount} filtered)`);
            return filteredNFTs;

        } catch (error) {
            logger.error('Failed to fetch wallet NFTs:', error.message);
            throw error;
        }
    }

    /**
     * Transform OpenSea NFT response to cache format
     *
     * @param {Object} nft - OpenSea NFT object
     * @returns {Object} Transformed NFT for cache storage
     * @private
     */
    _transformNFTForCache(nft) {
        // Handle different OpenSea API response formats
        // OpenSea API v2 format: contract is a string, not an object
        const contract = typeof nft.contract === 'string' ? nft.contract : (nft.contract?.address || nft.asset_contract?.address || '');
        const tokenId = nft.identifier || nft.token_id || '';
        
        // Collection info - handle both object and string formats
        let collectionName = 'Unknown Collection';
        let collectionSlug = '';
        
        if (nft.collection) {
            if (typeof nft.collection === 'object') {
                // Older API format: collection is an object with name and slug
                collectionName = nft.collection.name || 'Unknown Collection';
                collectionSlug = nft.collection.slug || '';
            } else if (typeof nft.collection === 'string') {
                // OpenSea API v2 format: collection field is the slug (string)
                collectionSlug = nft.collection;
                // Use slug as name if no explicit name is provided
                collectionName = nft.collection;
            }
        }
        
        // Also check for alternative field names
        if (nft.collection_name) {
            collectionName = nft.collection_name;
        }
        if (nft.collection_slug) {
            collectionSlug = nft.collection_slug;
        }
        
        // NFT name - use name if available, otherwise generate from collection
        const name = nft.name || `${collectionName} #${tokenId}`;
        
        // Image URL - try multiple possible fields
        const imageUrl = nft.image_url || nft.display_image_url || nft.image_preview_url || nft.image_thumbnail_url || '';
        
        // Token standard
        const tokenStandard = nft.token_standard || nft.asset_contract?.schema_name || 'erc721';

        return {
            contract,
            tokenId,
            name,
            collection: collectionName,
            collectionSlug,
            imageUrl,
            tokenStandard: tokenStandard.toLowerCase()
        };
    }
} 