/**
 * @jest-environment node
 */

import dotenv from 'dotenv';
import { OpenSeaApi } from '../services/openseaApi.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { logger, LogLevel } from '../utils/logger.js';

dotenv.config();

describe('OpenSeaApi Integration', () => {
    let api;

    beforeAll(() => {
        api = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL);
        // Enable debug logging if DEBUG environment variable is set
        if (process.env.DEBUG === 'true') {
            logger.setLevel(LogLevel.DEBUG);
        }
    });

    // Use a known NFT collection for testing
    const TEST_COLLECTION = {
        slug: 'chonks', // A collection on Base
        contractAddress: '0x07152bfde079b5319e5308c43fb1dbc9c76cb4f9'
    };

    // Use a known NFT for testing
    const TEST_NFT = {
        contractAddress: TEST_COLLECTION.contractAddress,
        tokenId: '44834'
    };

    describe('Collection Offers', () => {
        it('should fetch collection offers', async () => {
            const result = await api.getCollectionOffers(TEST_COLLECTION.slug);
            logger.debugObject('Collection Offers', result);

            expect(result).toBeDefined();
            expect(result.offers).toBeDefined();

            if (result.offers && result.offers.length > 0) {
                const offer = result.offers[0];
                expect(offer).toMatchObject({
                    order_hash: expect.any(String),
                    protocol_data: expect.any(Object)
                });
            }
        }, 30000);

        it('should fetch all collection offers', async () => {
            const result = await api.getAllCollectionOffers(TEST_COLLECTION.slug);
            // console.log('All Collection Offers:', JSON.stringify(result, null, 2));

            expect(result).toBeDefined();
            expect(result.offers).toBeDefined();
            expect(result.next).toBeDefined();
        }, 30000);

        it('should handle collection with no offers', async () => {
            const result = await api.getCollectionOffers('non-existent-collection-' + Date.now());
            // console.log('No Offers Result:', JSON.stringify(result, null, 2));

            expect(result).toBeDefined();
            expect(result).toEqual({
                offers: []
            });
        }, 30000);

        it('should handle invalid collection slugs', async () => {
            const invalidSlugs = [
                '',                    // Empty string
                'invalid@collection',  // Invalid characters
                ' ',                   // Empty space
                '!@#$%^&*()'          // Special characters
            ];

            for (const slug of invalidSlugs) {
                const result = await api.getCollectionOffers(slug);
                expect(result).toEqual({
                    offers: []
                });
            }
        }, 30000);
    });

    describe('NFT Offers', () => {
        it('should fetch NFT offers', async () => {
            const result = await api.getNFTOffers(
                TEST_NFT.contractAddress,
                TEST_NFT.tokenId
            );
            // console.log('NFT Offers:', JSON.stringify(result, null, 2));

            expect(result).toBeDefined();
            expect(result.orders).toBeDefined();

            if (result.orders.length > 0) {
                const offer = result.orders[0];
                expect(offer).toMatchObject({
                    maker: expect.objectContaining({
                        address: expect.any(String)
                    }),
                    current_price: expect.any(String)
                });
            }
        }, 30000);

        it('should handle NFT with no offers', async () => {
            const result = await api.getNFTOffers(
                TEST_NFT.contractAddress,
                '999999999' // Use a non-existent token ID
            );
            logger.debugObject('No NFT Offers Result', result);

            expect(result).toBeDefined();
            expect(Array.isArray(result.orders)).toBe(true);
            expect(result.orders.length).toBe(0);
        }, 30000);
    });

    describe('Error Handling', () => {
        it('should handle invalid API key', async () => {
            const invalidApi = new OpenSeaApi('invalid-key', OPENSEA_API_BASE_URL);

            await expect(invalidApi.getCollectionOffers(TEST_COLLECTION.contractAddress))
                .rejects
                .toThrow('Invalid API key');
        }, 30000);

        it('should handle other API errors gracefully', async () => {
            // Simulate other types of errors
            const result = await api.getCollectionOffers('invalid-slug-@#$%');
            expect(result).toEqual({ offers: [] });
        }, 30000);
    });

    describe('Response Format', () => {
        it('should return properly formatted collection offers', async () => {
            const result = await api.getCollectionOffers(TEST_COLLECTION.contractAddress);

            if (result.offers && result.offers.length > 0) {
                const offer = result.offers[0];
                // Only log this in debug mode
                // console.log('Collection Offer Format:', {
                //     maker: offer.maker,
                //     price: offer.current_price,
                //     protocol_data: offer.protocol_data
                // });

                expect(offer).toMatchObject({
                    maker: expect.objectContaining({
                        address: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/)
                    }),
                    current_price: expect.stringMatching(/^\d+$/),
                    protocol_data: expect.any(Object)
                });
            }
        }, 30000);

        it('should return properly formatted NFT offers', async () => {
            const result = await api.getNFTOffers(
                TEST_NFT.contractAddress,
                TEST_NFT.tokenId
            );

            if (result.orders && result.orders.length > 0) {
                const offer = result.orders[0];
                console.log('NFT Offer Format:', {
                    maker: offer.maker,
                    price: offer.current_price,
                    protocol_data: offer.protocol_data
                });

                expect(offer).toMatchObject({
                    maker: expect.objectContaining({
                        address: expect.stringMatching(/^0x[a-fA-F0-9]{40}$/)
                    }),
                    current_price: expect.stringMatching(/^\d+$/),
                    protocol_data: expect.any(Object)
                });
            }
        }, 30000);
    });
});
