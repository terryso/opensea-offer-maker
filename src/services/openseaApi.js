import { logger } from '../utils/logger.js';
import axios from 'axios';
import { ethers } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Seaport } from '@opensea/seaport-js';
import { ItemType } from '@opensea/seaport-js/lib/constants.js';

export class OpenSeaApi {
    constructor(apiKey, baseUrl, chainConfig) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.chainConfig = chainConfig;

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

    async getOrderStatus(orderHash) {
        try {
            const url = new URL(`${this.baseUrl}/api/v2/orders/${this.chainConfig.name}/seaport/${orderHash}`);
            
            logger.debug('Fetching order status:', url.toString());
            
            const response = await this.fetchWithRetry(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': this.apiKey
                }
            });

            return {
                fulfilled: response.order_status === 'fulfilled',
                status: response.order_status,
                ...response
            };
        } catch (error) {
            logger.error('Failed to fetch order status:', error);
            throw error;
        }
    }

    async createListing(params) {
        const { contractAddress, tokenId, price, expirationTime, wallet, walletAddress } = params;
        
        try {
            logger.info('Building listing order with Seaport.js...');
            
            const provider = wallet.provider;
            
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
} 