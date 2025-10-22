/**
 * Listing Orchestrator - Coordinates common flows between interactive and direct modes
 * Handles listing creation, expiration parsing, fee calculation, and OpenSea API calls
 */

import { logger } from '../utils/logger.js';
import { getWallet, getEffectiveChain } from '../utils/commandUtils.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { calculateListingPrice as calculatePrice } from './shared/pricing.js';
import { calculateFeeBreakdown as calculateFees, formatFeeBreakdown } from './shared/fees.js';
import { parseExpirationTime, parseMarketplaces, formatExpirationDisplay } from './shared/utils.js';

/**
 * Create listing data common to both modes
 * @param {Object} params - Listing parameters
 * @param {string} params.address - NFT contract address
 * @param {string} params.tokenId - Token ID
 * @param {number} params.price - Listing price in ETH
 * @param {string} params.expiration - Expiration time string
 * @param {string} params.marketplaces - Comma-separated marketplaces
 * @param {boolean} params.payOptionalRoyalties - Whether to pay optional royalties
 * @param {Object} options - Command options
 * @returns {Promise<Object>} Listing data object
 */
export async function createListingData(params, options) {
  const { address, tokenId, price, expiration, marketplaces, payOptionalRoyalties } = params;

  logger.debug(`Creating listing data for ${address}:${tokenId}`);

  // Parse expiration time
  const expirationTime = parseExpirationTime(expiration);
  const expirationDisplay = formatExpirationDisplay(expiration);

  // Parse marketplaces
  const marketplaceList = parseMarketplaces(marketplaces);

  // Get wallet
  const wallet = await getWallet(options);

  // Create base listing data
  const listingData = {
    nft: {
      address,
      tokenId,
      chain: await getEffectiveChain(options)
    },
    price: parseFloat(price),
    expirationTime,
    expirationDisplay,
    marketplaces: marketplaceList,
    payOptionalRoyalties,
    wallet
  };

  return listingData;
}

/**
 * Calculate listing price using various pricing methods
 * @param {Object} pricingParams - Pricing parameters
 * @param {string} pricingParams.method - Pricing method
 * @param {string} pricingParams.value - Pricing value
 * @param {string} pricingParams.contractAddress - NFT contract address
 * @param {string} pricingParams.tokenId - NFT token ID
 * @param {OpenSeaApi} pricingParams.openseaApi - OpenSea API instance
 * @returns {Promise<Object>} { listingPrice, pricingInfo }
 */
export async function calculateListingPrice(pricingParams) {
  return await calculatePrice(
    pricingParams.method,
    pricingParams.value,
    {
      openseaApi: pricingParams.openseaApi,
      contractAddress: pricingParams.contractAddress,
      tokenId: pricingParams.tokenId
    }
  );
}

/**
 * Calculate fee breakdown for listing
 * @param {Object} feeParams - Fee calculation parameters
 * @param {number} feeParams.listingPrice - Listing price in ETH
 * @param {string} feeParams.collectionSlug - Collection slug
 * @param {OpenSeaApi} feeParams.openseaApi - OpenSea API instance
 * @param {boolean} feeParams.payOptionalRoyalties - Whether to include optional creator fees
 * @returns {Promise<Object>} Fee breakdown
 */
export async function calculateFeeBreakdown(feeParams) {
  return await calculateFees(
    feeParams.listingPrice,
    feeParams.collectionSlug,
    {
      openseaApi: feeParams.openseaApi
    },
    feeParams.payOptionalRoyalties
  );
}

/**
 * Get comprehensive listing information for confirmation
 * @param {Object} listingData - Listing data
 * @param {Object} apiContext - API context (openseaApi, etc.)
 * @returns {Promise<Object>} Complete listing information
 */
export async function getListingInformation(listingData, apiContext) {
  const { nft, price, expirationDisplay, marketplaces, payOptionalRoyalties } = listingData;
  const { openseaApi } = apiContext;

  logger.debug(`Getting listing information for ${nft.address}:${nft.tokenId}`);

  // Get collection information
  const collectionData = await openseaApi.getCollectionByContract(nft.address);
  if (!collectionData || !collectionData.collection) {
    throw new Error('Could not fetch collection information');
  }

  const collectionSlug = collectionData.collection;

  // Calculate fee breakdown
  const feeBreakdown = await calculateFeeBreakdown({
    listingPrice: price,
    collectionSlug,
    openseaApi,
    payOptionalRoyalties
  });

  // Format fee breakdown for display
  const feeDisplay = formatFeeBreakdown(feeBreakdown);

  return {
    nft,
    price,
    pricingInfo: `${price} ETH`,
    expirationDisplay,
    marketplaces: marketplaces.join(', '),
    feeBreakdown,
    feeDisplay,
    payOptionalRoyalties,
    collectionSlug
  };
}

/**
 * Execute listing on OpenSea
 * @param {Object} listingData - Complete listing data
 * @param {Object} apiContext - API context (openseaApi, feeInfo, etc.)
 * @param {Object} options - Command options
 * @returns {Promise<Object>} Listing result
 */
export async function executeOpenSeaListing(listingData, apiContext, options) {
  const { nft, price, expirationTime, payOptionalRoyalties, wallet } = listingData;
  const { openseaApi, feeInfo } = apiContext;

  logger.debug(`Executing OpenSea listing for ${nft.address}:${nft.tokenId}`);

  // Build listing parameters for OpenSea API
  const listingParams = {
    contractAddress: nft.address,
    tokenId: nft.tokenId,
    price: price.toString(),
    expirationTime,
    wallet,
    walletAddress: wallet.address,
    feeInfo,
    payOptionalRoyalties
  };

  // Execute listing
  const result = await openseaApi.createListing(listingParams);

  logger.info('✅ Listing created successfully on OpenSea');
  logger.debug(`Listing result: ${JSON.stringify(result, null, 2)}`);

  return result;
}

/**
 * Create API context for operations
 * @param {Object} chainConfig - Chain configuration
 * @returns {Object} API context
 */
export function createApiContext(chainConfig) {
  const openseaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

  return {
    openseaApi,
    chainConfig
  };
}

/**
 * Handle listing confirmation (both interactive and direct modes)
 * @param {Object} listingInfo - Complete listing information
 * @param {boolean} skipConfirm - Whether to skip confirmation
 * @returns {Promise<boolean|symbol>} True to confirm, special signal to cancel
 */
export async function handleListingConfirmation(listingInfo, skipConfirm = false) {
  if (skipConfirm) {
    logger.info('⏭️ Skipping confirmation as requested');
    return true;
  }

  // Display listing information
  logger.info('\n' + '='.repeat(50));
  logger.info('📋 Listing Summary:');
  logger.info(`   NFT: ${listingInfo.nft.address}:${listingInfo.nft.tokenId}`);
  logger.info(`   Price: ${listingInfo.pricingInfo}`);
  logger.info(`   Expiration: ${listingInfo.expirationDisplay}`);
  logger.info(`   Marketplaces: ${listingInfo.marketplaces}`);
  logger.info(`   Pay Optional Royalties: ${listingInfo.payOptionalRoyalties ? 'Yes' : 'No'}`);
  logger.info(listingInfo.feeDisplay);
  logger.info('='.repeat(50));

  // Interactive confirmation using enquirer
  const enquirerModule = await import('enquirer');
  const { prompt } = enquirerModule.default || enquirerModule;

  try {
    const response = await prompt({
      type: 'select',
      name: 'confirm',
      message: 'Do you want to proceed with this listing?',
      choices: [
        { name: 'yes', message: '✅ Proceed with listing' },
        { name: 'no', message: '⬅️ Go back to pricing' }
      ]
    });

    if (response.confirm === 'yes') {
      logger.info('✅ User confirmed listing');
      return true;
    } else {
      logger.info('⬅️ User went back to pricing step');
      return false;
    }
  } catch (error) {
    if (error.name === 'promptcancelled') {
      logger.info('❌ User cancelled listing');
      return false;
    }
    throw error;
  }
}
