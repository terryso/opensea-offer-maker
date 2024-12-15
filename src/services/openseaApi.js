import { logger } from '../utils/logger.js';

export class OpenSeaApi {
    constructor(apiKey, baseUrl, chainConfig) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.chainConfig = chainConfig;
    }

    async fetchWithRetry(url, options, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'X-API-KEY': this.apiKey,
                        'Accept': 'application/json',
                        ...options.headers
                    }
                });

                if (response.status === 404) {
                    return { offers: [] };
                }

                if (response.status === 401) {
                    const errorText = await response.text();
                    throw new Error(`Invalid API key: ${errorText}`);
                }

                if (!response.ok) {
                    const errorText = await response.text();
                    logger.error(`API Error: ${response.status}`, errorText);
                    throw new Error(`HTTP error! status: ${response.status}, details: ${errorText}`);
                }

                return await response.json();
            } catch (error) {
                logger.error(`Attempt ${i + 1} failed:`, error.message);
                
                if (error.message.includes('Invalid API key')) {
                    throw error;
                }

                if (i === retries - 1) {
                    if (error.message.includes('404')) {
                        return { offers: [] };
                    }
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

            logger.debug('Best NFT offer response:', JSON.stringify(response, null, 2));
            return response;
        } catch (error) {
            logger.error('Failed to fetch best NFT offer:', error);
            return { offers: [] };
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
} 