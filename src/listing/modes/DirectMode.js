/**
 * Direct Mode Handler
 * Manages direct parameter-based listing flow
 */

import { logger } from '../../utils/logger.js';
import { validatePricingOptions } from '../shared/validators.js';
import { createListingData, calculateListingPrice, getListingInformation, executeOpenSeaListing, handleListingConfirmation } from '../orchestrator.js';

/**
 * Execute direct listing flow with provided parameters
 * @param {Object} options - Command options including address, tokenId, pricing, etc.
 * @param {Object} context - Shared context (apiContext, cacheService, etc.)
 * @returns {Promise<Object>} Listing result
 */
export async function executeDirectMode(options, context) {
  logger.debug('Starting direct listing mode');

  const { apiContext, cacheService } = context;

  try {
    // Validate and extract pricing parameters
    const pricingValidation = validatePricingOptions(options);
    if (!pricingValidation.isValid) {
      throw new Error(pricingValidation.errors.join('; '));
    }

    // Determine pricing method and value
    const { method, value } = getPricingMethodAndValue(options);

    // Calculate listing price
    const { listingPrice, pricingInfo } = await calculateListingPrice({
      method,
      value,
      contractAddress: options.address,
      tokenId: options.tokenId,
      openseaApi: apiContext.openseaApi
    });

    logger.debug(`Direct mode calculated price: ${listingPrice} ETH (${pricingInfo})`);

    // Create listing data
    const listingData = await createListingData({
      address: options.address,
      tokenId: options.tokenId,
      price: listingPrice,
      expiration: options.expiration || '1h',
      marketplaces: options.marketplaces || 'opensea',
      payOptionalRoyalties: options.payOptionalRoyalties || false
    }, options);

    // Get comprehensive listing information
    const listingInfo = await getListingInformation(listingData, apiContext);
    listingInfo.pricingInfo = pricingInfo; // Override with detailed pricing info

    // Handle confirmation
    const confirmed = await handleListingConfirmation(listingInfo, options.skipConfirm);
    if (!confirmed) {
      logger.info('❌ Listing cancelled by user');
      return { cancelled: true };
    }

    // Execute listing
    const result = await executeOpenSeaListing(listingData, {
      ...apiContext,
      feeInfo: listingInfo.feeBreakdown.feeInfo
    }, options);

    logger.info(`✅ Successfully listed ${options.address}:${options.tokenId} for ${listingPrice} ETH`);

    return {
      success: true,
      listingData,
      listingInfo,
      result
    };

  } catch (error) {
    logger.error('Direct mode error:', error.message);
    throw error;
  }
}

/**
 * Validate direct mode specific parameters
 * @param {Object} options - Command options
 * @returns {Object} Validation result
 */
export function validateDirectModeParameters(options) {
  const errors = [];

  // Required parameters for direct mode
  if (!options.address) {
    errors.push('--address is required in direct mode');
  }

  if (!options.tokenId) {
    errors.push('--token-id is required in direct mode');
  }

  // Pricing validation delegated to shared validators
  const pricingValidation = validatePricingOptions(options);
  if (!pricingValidation.isValid) {
    errors.push(...pricingValidation.errors);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Extract listing parameters from command options
 * @param {Object} options - Command options
 * @returns {Object} Extracted listing parameters
 */
export function extractListingParameters(options) {
  return {
    address: options.address,
    tokenId: options.tokenId,
    price: options.price,
    floorDiff: options.floorDiff,
    profitMargin: options.profitMargin,
    profitPercent: options.profitPercent,
    expiration: options.expiration || '1h',
    marketplaces: options.marketplaces || 'opensea',
    payOptionalRoyalties: options.payOptionalRoyalties || false,
    skipConfirm: options.skipConfirm || false
  };
}

/**
 * Get pricing method and value from options
 * @param {Object} options - Command options
 * @returns {Object} Pricing method and value
 */
export function getPricingMethodAndValue(options) {
  if (options.price) {
    return { method: 'absolute', value: options.price };
  }
  if (options.floorDiff) {
    return { method: 'floor-diff', value: options.floorDiff };
  }
  if (options.profitMargin) {
    return { method: 'profit-margin', value: options.profitMargin };
  }
  if (options.profitPercent) {
    return { method: 'profit-percent', value: options.profitPercent };
  }

  throw new Error('No pricing method specified');
}