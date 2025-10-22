/**
 * Interactive Mode Handler
 * Manages the interactive NFT selection and listing flow
 */

import { logger } from '../../utils/logger.js';
import enquirer from 'enquirer';
import { getPricingMethodChoices } from '../shared/pricing.js';
import { createListingData, calculateListingPrice, getListingInformation, executeOpenSeaListing, handleListingConfirmation } from '../orchestrator.js';
import { getWallet, getEffectiveChain } from '../../utils/commandUtils.js';
const { prompt } = enquirer;

// Interactive flow states
const FLOW_STEPS = {
  SELECT_COLLECTION: 'select-collection',
  SELECT_NFT: 'select-nft',
  SELECT_PRICING_METHOD: 'select-pricing-method',
  INPUT_PRICING_VALUE: 'input-pricing-value',
  CONFIRM: 'confirm',
  DONE: 'done',
  CANCELLED: 'cancelled'
};

// Special return values
const BACK_SIGNAL = Symbol('BACK');
const CANCEL_SIGNAL = Symbol('CANCEL');

/**
 * Execute interactive listing flow
 * @param {Object} options - Command options
 * @param {Object} context - Shared context (cacheService, apiContext, etc.)
 * @returns {Promise<Object>} Listing result or special signal
 */
export async function executeInteractiveMode(options, context) {
  logger.debug('Starting interactive listing mode');

  const { cacheService, apiContext } = context;

  // Get wallet address and chain info for cache operations
  const wallet = await getWallet(options);
  const walletAddress = wallet.address;
  const chainConfig = await getEffectiveChain(options);
  const chain = chainConfig.name;

  let currentStep = FLOW_STEPS.SELECT_COLLECTION;
  let selectedCollection = null;
  let selectedNFT = null;
  let pricingMethod = null;
  let pricingValue = null;

  try {
    while (currentStep !== FLOW_STEPS.DONE && currentStep !== FLOW_STEPS.CANCELLED) {
      switch (currentStep) {
      case FLOW_STEPS.SELECT_COLLECTION:
        const collectionResult = await selectCollection(cacheService, walletAddress, chain);
        if (collectionResult === CANCEL_SIGNAL) {
          currentStep = FLOW_STEPS.CANCELLED;
          break;
        }
        if (collectionResult === BACK_SIGNAL) {
          // No previous step, so cancel
          currentStep = FLOW_STEPS.CANCELLED;
          break;
        }
        selectedCollection = collectionResult;
        currentStep = FLOW_STEPS.SELECT_NFT;
        break;

      case FLOW_STEPS.SELECT_NFT:
        const nftResult = await selectNFT(selectedCollection, cacheService, walletAddress, chain);
        if (nftResult === CANCEL_SIGNAL) {
          currentStep = FLOW_STEPS.CANCELLED;
          break;
        }
        if (nftResult === BACK_SIGNAL) {
          currentStep = FLOW_STEPS.SELECT_COLLECTION;
          break;
        }
        selectedNFT = nftResult;
        currentStep = FLOW_STEPS.SELECT_PRICING_METHOD;
        break;

      case FLOW_STEPS.SELECT_PRICING_METHOD:
        const methodResult = await selectPricingMethod(selectedNFT, apiContext.openseaApi, apiContext.chainConfig);
        if (methodResult === CANCEL_SIGNAL) {
          currentStep = FLOW_STEPS.CANCELLED;
          break;
        }
        if (methodResult === BACK_SIGNAL) {
          currentStep = FLOW_STEPS.SELECT_NFT;
          break;
        }
        pricingMethod = methodResult.method;
        pricingValue = methodResult.value;
        currentStep = FLOW_STEPS.CONFIRM;
        break;

      case FLOW_STEPS.CONFIRM:
        const confirmResult = await confirmListing(
          selectedNFT,
          pricingMethod,
          pricingValue,
          options,
          apiContext
        );
        if (confirmResult === CANCEL_SIGNAL) {
          currentStep = FLOW_STEPS.CANCELLED;
          break;
        }
        if (confirmResult === BACK_SIGNAL) {
          currentStep = FLOW_STEPS.SELECT_PRICING_METHOD;
          break;
        }

        // Listing completed successfully
        currentStep = FLOW_STEPS.DONE;
        return confirmResult;
      }
    }

    if (currentStep === FLOW_STEPS.CANCELLED) {
      logger.info('❌ Listing cancelled by user');
      return CANCEL_SIGNAL;
    }

  } catch (error) {
    logger.error('Interactive mode error:', error.message);
    throw error;
  }
}

/**
 * Handle collection selection step
 * @param {Object} cacheService - Cache service instance
 * @param {string} walletAddress - Wallet address
 * @param {string} chain - Chain identifier
 * @returns {Promise<Object|string>} Selected collection or special signal
 */
async function selectCollection(cacheService, walletAddress, chain) {
  const cachedCollections = await cacheService.getCachedCollections(walletAddress, chain);

  if (!cachedCollections || cachedCollections.length === 0) {
    throw new Error(`No cached collections found for wallet ${walletAddress} on chain ${chain}. Please run cache command first.`);
  }

  logger.info('\n📚 Select a collection:');

  const choices = cachedCollections.map(collection => ({
    name: collection.slug,
    message: `${collection.name} (${collection.nft_count} NFTs)`
  }));

  choices.push(
    { name: '__cancel__', message: '❌ Cancel' }
  );

  try {
    const response = await prompt({
      type: 'select',
      name: 'collection',
      message: 'Select collection (Press ESC to cancel):',
      choices
    });

    if (response.collection === '__cancel__') {
      return CANCEL_SIGNAL;
    }

    const selectedCollection = cachedCollections.find(c => c.slug === response.collection);
    logger.info(`✅ Selected collection: ${selectedCollection.name}`);
    return selectedCollection;

  } catch (error) {
    if (error.name === 'promptcancelled') {
      return CANCEL_SIGNAL;
    }
    throw error;
  }
}

/**
 * Handle NFT selection step
 * @param {Object} collection - Selected collection
 * @param {Object} cacheService - Cache service instance
 * @param {string} walletAddress - Wallet address
 * @param {string} chain - Chain identifier
 * @returns {Promise<Object|string>} Selected NFT or special signal
 */
async function selectNFT(collection, cacheService, walletAddress, chain) {
  const cachedNFTs = await cacheService.getCachedNFTs(collection.slug, walletAddress, chain);

  if (!cachedNFTs || cachedNFTs.length === 0) {
    throw new Error(`No cached NFTs found for collection ${collection.name}. Please run cache command first.`);
  }

  logger.info(`\n🖼️  Select an NFT from ${collection.name}:`);

  const choices = cachedNFTs.map(nft => ({
    name: `${nft.contract}:${nft.tokenId}`,
    message: `#${nft.tokenId} - ${nft.name || 'Unnamed'}`
  }));

  choices.push(
    { name: '__back__', message: '⬅️ Go back to collection selection' },
    { name: '__cancel__', message: '❌ Cancel' }
  );

  try {
    const response = await prompt({
      type: 'select',
      name: 'nft',
      message: 'Select NFT (Press ESC to cancel):',
      choices
    });

    if (response.nft === '__back__') {
      return BACK_SIGNAL;
    }
    if (response.nft === '__cancel__') {
      return CANCEL_SIGNAL;
    }

    const [contractAddress, tokenId] = response.nft.split(':');
    const selectedNFT = cachedNFTs.find(n =>
      n.contract === contractAddress && n.tokenId === tokenId
    );

    logger.info(`✅ Selected NFT: #${selectedNFT.tokenId} - ${selectedNFT.name || 'Unnamed'}`);
    return selectedNFT;

  } catch (error) {
    if (error.name === 'promptcancelled') {
      return CANCEL_SIGNAL;
    }
    throw error;
  }
}

/**
 * Handle pricing method selection
 * @param {Object} nft - Selected NFT
 * @param {OpenSeaApi} openseaApi - OpenSea API instance
 * @param {Object} chainConfig - Chain configuration
 * @returns {Promise<Object|string>} Pricing method selection or special signal
 */
async function selectPricingMethod(nft, openseaApi, chainConfig) {
  logger.info('\n💰 Choose pricing strategy:');

  const choices = [
    ...getPricingMethodChoices(),
    { name: '__back__', message: '⬅️ Go back to NFT selection' },
    { name: '__cancel__', message: '❌ Cancel' }
  ];

  try {
    const response = await prompt({
      type: 'select',
      name: 'method',
      message: 'Select pricing method (Press ESC to cancel):',
      choices
    });

    if (response.method === '__back__') {
      return BACK_SIGNAL;
    }
    if (response.method === '__cancel__') {
      return CANCEL_SIGNAL;
    }

    const method = response.method;
    let value;

    if (method === 'absolute') {
      const valueResponse = await prompt({
        type: 'input',
        name: 'price',
        message: 'Enter price in ETH (Press ESC to cancel):',
        validate: (input) => {
          const num = parseFloat(input);
          if (isNaN(num) || num <= 0) {
            return 'Please enter a valid positive number';
          }
          return true;
        }
      });
      value = valueResponse.price;

    } else if (method === 'floor-diff') {
      // Fetch and display floor price
      logger.info('📊 Fetching floor price...');
      const collectionData = await openseaApi.getCollectionByContract(nft.contract);
      if (!collectionData?.collection) {
        throw new Error('Could not fetch collection info');
      }
      const stats = await openseaApi.getCollectionStats(collectionData.collection);
      if (!stats?.floor_price) {
        throw new Error('Could not fetch floor price');
      }
      logger.info(`Current floor price: ${stats.floor_price} ETH`);

      const diffResponse = await prompt({
        type: 'input',
        name: 'diff',
        message: 'Enter price difference (e.g., +0.1, -0.1, +10%, -5%) (Press ESC to cancel):',
        validate: (input) => {
          if (!/^([+-])(\d*\.?\d*)(%)?$/.test(input)) {
            return 'Invalid format. Use format like "+0.1", "-0.1", "+10%", or "-5%"';
          }
          return true;
        }
      });
      value = diffResponse.diff;

    } else if (method === 'profit-margin' || method === 'profit-percent') {
      // Fetch and display last sale price
      logger.info('📊 Fetching last sale price...');
      const lastSale = await openseaApi.getNFTLastSalePrice(nft.contract, nft.tokenId);
      if (!lastSale?.price) {
        throw new Error('Could not fetch last sale price. The NFT may not have any sales history.');
      }
      logger.info(`Last purchase price: ${lastSale.price} ETH`);

      if (method === 'profit-margin') {
        const marginResponse = await prompt({
          type: 'input',
          name: 'margin',
          message: 'Enter profit margin in ETH (e.g., 0.01) (Press ESC to cancel):',
          validate: (input) => {
            const num = parseFloat(input);
            if (isNaN(num)) {
              return 'Please enter a valid number';
            }
            return true;
          }
        });
        value = marginResponse.margin;
      } else {
        const percentResponse = await prompt({
          type: 'input',
          name: 'percent',
          message: 'Enter profit percentage (e.g., 10 for 10%) (Press ESC to cancel):',
          validate: (input) => {
            const num = parseFloat(input);
            if (isNaN(num)) {
              return 'Please enter a valid number';
            }
            return true;
          }
        });
        value = percentResponse.percent;
      }
    }

    logger.info(`✅ Selected pricing: ${method} with value: ${value}`);
    return { method, value };

  } catch (error) {
    if (error.name === 'promptcancelled') {
      return CANCEL_SIGNAL;
    }
    throw error;
  }
}

/**
 * Handle listing confirmation
 * @param {Object} selectedNFT - Selected NFT
 * @param {string} pricingMethod - Selected pricing method
 * @param {string} pricingValue - Pricing value
 * @param {Object} options - Command options
 * @param {Object} apiContext - API context
 * @returns {Promise<Object|string>} Listing result or special signal
 */
async function confirmListing(selectedNFT, pricingMethod, pricingValue, options, apiContext) {
  try {
    // Calculate listing price
    const { listingPrice, pricingInfo } = await calculateListingPrice({
      method: pricingMethod,
      value: pricingValue,
      contractAddress: selectedNFT.contract,
      tokenId: selectedNFT.tokenId,
      openseaApi: apiContext.openseaApi
    });

    // Create listing data
    const listingData = await createListingData({
      address: selectedNFT.contract,
      tokenId: selectedNFT.tokenId,
      price: listingPrice,
      expiration: options.expiration || '1h',
      marketplaces: options.marketplaces || 'opensea',
      payOptionalRoyalties: options.payOptionalRoyalties || false
    }, options);

    // Get comprehensive listing information
    const listingInfo = await getListingInformation(listingData, apiContext);
    listingInfo.pricingInfo = pricingInfo;
    listingInfo.nft.name = selectedNFT.name; // Preserve NFT name from cache

    // Handle confirmation
    const confirmed = await handleListingConfirmation(listingInfo, options.skipConfirm);
    if (!confirmed) {
      return BACK_SIGNAL;
    }

    // Execute listing
    const result = await executeOpenSeaListing(listingData, {
      ...apiContext,
      feeInfo: listingInfo.feeBreakdown.feeInfo
    }, options);

    logger.info(`✅ Successfully listed ${selectedNFT.contract}:${selectedNFT.tokenId} for ${listingPrice} ETH`);

    return {
      success: true,
      listingData,
      listingInfo,
      result,
      selectedNFT
    };

  } catch (error) {
    logger.error('Error during listing confirmation:', error.message);
    throw error;
  }
}

// Export symbols for use in other modules
export { BACK_SIGNAL, CANCEL_SIGNAL, FLOW_STEPS };
