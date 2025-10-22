/**
 * Pricing calculation utilities
 * Pure functions for calculating listing prices using various methods
 */

import { logger } from '../../utils/logger.js';

/**
 * Calculate listing price based on pricing method and value
 * @param {string} method - Pricing method (absolute, floor-diff, profit-margin, profit-percent)
 * @param {string} value - Pricing value
 * @param {Object} dependencies - API dependencies
 * @param {OpenSeaApi} dependencies.openseaApi - OpenSea API instance
 * @param {string} contractAddress - NFT contract address
 * @param {string} tokenId - NFT token ID
 * @returns {Promise<Object>} { listingPrice, pricingInfo }
 */
export async function calculateListingPrice(method, value, { openseaApi, contractAddress, tokenId }) {
  let listingPrice;
  let pricingInfo = '';

  logger.debug(`Calculating price using method: ${method}, value: ${value}`);

  if (method === 'absolute') {
    listingPrice = parseFloat(value);
    pricingInfo = `${listingPrice} ETH (absolute price)`;

  } else if (method === 'floor-diff') {
    const { floorPrice } = await getFloorPrice(openseaApi, contractAddress);
    const diffMatch = value.match(/^([+-])(\d*\.?\d*)(%)?$/);

    if (!diffMatch) {
      throw new Error('Invalid floor-diff format. Use format like "+0.1", "-0.1", "+10%", or "-5%"');
    }

    const [, sign, diffValue, isPercentage] = diffMatch;

    if (isPercentage) {
      const percentage = parseFloat(diffValue) / 100;
      const diff = floorPrice * percentage;
      listingPrice = sign === '+' ? floorPrice + diff : floorPrice - diff;
    } else {
      listingPrice = sign === '+' ? floorPrice + parseFloat(diffValue) : floorPrice - parseFloat(diffValue);
    }
    pricingInfo = `${value} from floor (floor: ${parseFloat(floorPrice.toFixed(6))} ETH)`;

  } else if (method === 'profit-margin') {
    const { purchasePrice } = await getLastSalePrice(openseaApi, contractAddress, tokenId);
    const margin = parseFloat(value);
    listingPrice = purchasePrice + margin;
    pricingInfo = `purchase price (${purchasePrice} ETH) + ${margin} ETH margin`;

  } else if (method === 'profit-percent') {
    const { purchasePrice } = await getLastSalePrice(openseaApi, contractAddress, tokenId);
    const percent = parseFloat(value);
    const profitAmount = purchasePrice * (percent / 100);
    listingPrice = purchasePrice + profitAmount;
    pricingInfo = `purchase price (${purchasePrice} ETH) + ${percent}% (${profitAmount.toFixed(6)} ETH)`;

  } else {
    throw new Error(`Unknown pricing method: ${method}`);
  }

  // Handle price precision - maintain exact precision behavior
  listingPrice = parseFloat(listingPrice.toFixed(6));

  if (listingPrice <= 0) {
    throw new Error('Listing price must be greater than 0');
  }

  logger.debug(`Calculated price: ${listingPrice} ETH, info: ${pricingInfo}`);

  return { listingPrice, pricingInfo };
}

/**
 * Get floor price for a collection
 * @param {OpenSeaApi} openseaApi - OpenSea API instance
 * @param {string} contractAddress - NFT contract address
 * @returns {Promise<Object>} { floorPrice }
 */
async function getFloorPrice(openseaApi, contractAddress) {
  const collectionData = await openseaApi.getCollectionByContract(contractAddress);
  if (!collectionData || !collectionData.collection) {
    throw new Error('Could not fetch collection info');
  }

  const stats = await openseaApi.getCollectionStats(collectionData.collection);
  if (!stats?.floor_price) {
    throw new Error('Could not fetch floor price');
  }

  const floorPrice = stats.floor_price;
  logger.debug(`Floor price: ${floorPrice} ETH`);

  return { floorPrice };
}

/**
 * Get last sale price for an NFT
 * @param {OpenSeaApi} openseaApi - OpenSea API instance
 * @param {string} contractAddress - NFT contract address
 * @param {string} tokenId - NFT token ID
 * @returns {Promise<Object>} { purchasePrice }
 */
async function getLastSalePrice(openseaApi, contractAddress, tokenId) {
  const lastSale = await openseaApi.getNFTLastSalePrice(contractAddress, tokenId);
  if (!lastSale || !lastSale.price) {
    throw new Error('Could not fetch last sale price');
  }

  const purchasePrice = lastSale.price;
  logger.debug(`Last purchase price: ${purchasePrice} ETH`);

  return { purchasePrice };
}

/**
 * Validate pricing parameters for direct mode
 * @param {Object} options - Command options
 * @returns {Object} Validation result
 */
export function validatePricingParameters(options) {
  const priceOptions = [options.price, options.floorDiff, options.profitMargin, options.profitPercent];
  const providedOptions = priceOptions.filter(opt => opt !== undefined).length;

  if (providedOptions === 0) {
    throw new Error('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
  } else if (providedOptions > 1) {
    throw new Error('Cannot use multiple pricing options at the same time. Choose only one: --price, --floor-diff, --profit-margin, or --profit-percent');
  }

  return {
    method: options.price ? 'absolute' :
           options.floorDiff ? 'floor-diff' :
           options.profitMargin ? 'profit-margin' : 'profit-percent',
    value: options.price || options.floorDiff || options.profitMargin || options.profitPercent
  };
}

/**
 * Get available pricing methods for selection
 * @returns {Array} Array of pricing method choices
 */
export function getPricingMethodChoices() {
  return [
    { name: 'absolute', message: 'Absolute price (e.g., 0.1 ETH)', value: 'absolute' },
    { name: 'floor-diff', message: 'Floor price difference (e.g., +0.1, -5%)', value: 'floor-diff' },
    { name: 'profit-margin', message: 'Profit margin over purchase price (e.g., +0.01 ETH)', value: 'profit-margin' },
    { name: 'profit-percent', message: 'Profit percentage over purchase price (e.g., +10%)', value: 'profit-percent' }
  ];
}