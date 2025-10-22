/**
 * Fee calculation utilities
 * Pure functions for calculating fee breakdowns and net proceeds
 */

import { logger } from '../../utils/logger.js';

/**
 * Calculate fee breakdown and net proceeds for a listing
 * @param {number} listingPrice - Listing price in ETH
 * @param {string} collectionSlug - Collection slug
 * @param {Object} dependencies - API dependencies
 * @param {OpenSeaApi} dependencies.openseaApi - OpenSea API instance
 * @param {boolean} payOptionalRoyalties - Whether to include optional creator fees
 * @returns {Promise<Object>} Fee information including net proceeds and raw feeInfo
 */
export async function calculateFeeBreakdown(listingPrice, collectionSlug, { openseaApi }, payOptionalRoyalties = false) {
  try {
    logger.debug(`Calculating fee breakdown for price: ${listingPrice}, collection: ${collectionSlug}`);

    // Get collection fees
    const feeInfo = await openseaApi.getCollectionFees(collectionSlug);

    if (!feeInfo) {
      // Fallback to default OpenSea fee only if API fails
      logger.warn('Could not fetch collection fees, using default OpenSea fee only');
      return createDefaultFeeBreakdown(listingPrice, false);
    }

    // Calculate fee amounts in ETH
    const openseaFeeAmount = listingPrice * (feeInfo.openseaFeePercent / 100);
    const requiredCreatorFeeAmount = listingPrice * (feeInfo.requiredCreatorFeePercent / 100);
    const optionalCreatorFeeAmount = listingPrice * (feeInfo.optionalCreatorFeePercent / 100);

    // Determine which fees to include
    const actualCreatorFeePercent = feeInfo.requiredCreatorFeePercent +
            (payOptionalRoyalties ? feeInfo.optionalCreatorFeePercent : 0);
    const actualCreatorFeeAmount = requiredCreatorFeeAmount +
            (payOptionalRoyalties ? optionalCreatorFeeAmount : 0);

    const totalFeePercent = feeInfo.openseaFeePercent + actualCreatorFeePercent;
    const totalFeeAmount = openseaFeeAmount + actualCreatorFeeAmount;
    const netProceeds = listingPrice - totalFeeAmount;

    const result = {
      openseaFeePercent: feeInfo.openseaFeePercent,
      openseaFeeAmount,
      requiredCreatorFeePercent: feeInfo.requiredCreatorFeePercent,
      requiredCreatorFeeAmount,
      optionalCreatorFeePercent: feeInfo.optionalCreatorFeePercent,
      optionalCreatorFeeAmount,
      creatorFeePercent: actualCreatorFeePercent,
      creatorFeeAmount: actualCreatorFeeAmount,
      totalFeePercent,
      totalFeeAmount,
      netProceeds,
      hasRequiredCreatorFees: feeInfo.hasRequiredCreatorFees,
      hasOptionalCreatorFees: feeInfo.hasOptionalCreatorFees,
      hasCreatorFees: actualCreatorFeePercent > 0,
      feeInfo: feeInfo,  // Pass through for createListing
      payOptionalRoyalties
    };

    logger.debug(`Fee breakdown calculated: totalFee=${totalFeeAmount} ETH (${totalFeePercent}%), net=${netProceeds} ETH`);

    return result;

  } catch (error) {
    logger.error('Error calculating fee breakdown:', error);
    // Return minimal fee info on error
    return createDefaultFeeBreakdown(listingPrice, false);
  }
}

/**
 * Create default fee breakdown when API fails
 * @param {number} listingPrice - Listing price in ETH
 * @param {boolean} payOptionalRoyalties - Whether to include optional royalties
 * @returns {Object} Default fee breakdown
 */
function createDefaultFeeBreakdown(listingPrice, payOptionalRoyalties) {
  const openseaFeePercent = 1.0;
  const openseaFeeAmount = listingPrice * (openseaFeePercent / 100);
  const netProceeds = listingPrice - openseaFeeAmount;

  return {
    openseaFeePercent,
    openseaFeeAmount,
    requiredCreatorFeePercent: 0,
    requiredCreatorFeeAmount: 0,
    optionalCreatorFeePercent: 0,
    optionalCreatorFeeAmount: 0,
    creatorFeePercent: 0,
    creatorFeeAmount: 0,
    totalFeePercent: openseaFeePercent,
    totalFeeAmount: openseaFeeAmount,
    netProceeds,
    hasRequiredCreatorFees: false,
    hasOptionalCreatorFees: false,
    hasCreatorFees: false,
    feeInfo: null,
    payOptionalRoyalties
  };
}

/**
 * Format fee information for display
 * @param {Object} feeBreakdown - Fee breakdown object
 * @returns {string} Formatted fee information string
 */
export function formatFeeBreakdown(feeBreakdown) {
  const {
    openseaFeePercent,
    openseaFeeAmount,
    creatorFeePercent,
    creatorFeeAmount,
    totalFeePercent,
    totalFeeAmount,
    netProceeds,
    hasCreatorFees
  } = feeBreakdown;

  let feeText = '📊 Fee Breakdown:\n';
  feeText += `   OpenSea Fee: ${openseaFeePercent}% (${openseaFeeAmount.toFixed(6)} ETH)\n`;

  if (hasCreatorFees) {
    feeText += `   Creator Royalties: ${creatorFeePercent}% (${creatorFeeAmount.toFixed(6)} ETH)\n`;
  }

  feeText += `   Total Fees: ${totalFeePercent}% (${totalFeeAmount.toFixed(6)} ETH)\n`;
  feeText += `   🧾 Net Proceeds: ${netProceeds.toFixed(6)} ETH`;

  return feeText;
}

/**
 * Check if a collection has creator fees
 * @param {Object} feeInfo - Fee information from API
 * @returns {boolean} True if collection has creator fees
 */
export function hasCreatorFees(feeInfo) {
  return feeInfo && (feeInfo.hasRequiredCreatorFees || feeInfo.hasOptionalCreatorFees);
}

/**
 * Get effective creator fee percentage based on user preference
 * @param {Object} feeInfo - Fee information from API
 * @param {boolean} payOptionalRoyalties - User preference for optional royalties
 * @returns {number} Effective creator fee percentage
 */
export function getEffectiveCreatorFeePercent(feeInfo, payOptionalRoyalties) {
  if (!feeInfo) {return 0;}

  return feeInfo.requiredCreatorFeePercent +
         (payOptionalRoyalties ? feeInfo.optionalCreatorFeePercent : 0);
}
