import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { addChainOption, getEffectiveChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { CacheService } from '../services/cacheService.js';
import enquirer from 'enquirer';
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

export const listCommand = new Command('list')
    .description('List an NFT for sale on multiple marketplaces. Use --interactive to select from cached NFTs or provide --address and --token-id manually.')
    .option('-a, --address <address>', 'NFT contract address')
    .option('-t, --token-id <tokenId>', 'Token ID')
    .option('-i, --interactive', 'Select NFT interactively from cache')
    .option('-p, --price <price>', 'Absolute listing price in ETH')
    .option('-f, --floor-diff <diff>', 'Price difference from floor price (e.g., +0.1, -0.1, +10%, -5%)')
    .option('--profit-margin <margin>', 'Profit margin over last purchase price (e.g., 0.01 for +0.01 ETH)')
    .option('--profit-percent <percent>', 'Profit percentage over last purchase price (e.g., 10 for +10%)')
    .option('-e, --expiration <time>', 'Expiration time (e.g., 30d, 12h, 45m)', '1h')
    .option('-m, --marketplaces <markets>', 'Comma-separated list of marketplaces (only opensea supported)', 'opensea')
    .option('--pay-optional-royalties', 'Pay optional creator royalties (default: skip optional fees)')
    .option('--skip-confirm', 'Skip listing confirmation')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(listCommand);
// Add private key option
addPrivateKeyOption(listCommand);

listCommand.action(async (options) => {
    try {
        // Validate flag combinations
        if (options.interactive && (options.address || options.tokenId)) {
            throw new Error('Cannot use --interactive with --address or --token-id. Choose either interactive mode or manual input.');
        }

        if (!options.interactive && (!options.address || !options.tokenId)) {
            throw new Error('Must provide both --address and --token-id, or use --interactive mode');
        }

        const chainConfig = await getEffectiveChain(options);
        const wallet = await getWallet(options);
        const walletAddress = await wallet.getAddress();

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        // Handle interactive mode
        if (options.interactive) {
            const cacheService = new CacheService();

            try {
                const cacheData = await cacheService.loadCache(walletAddress, chainConfig.chain);

                if (!cacheData) {
                    // Check if cache exists but is expired
                    const cacheStatus = await cacheService.getCacheStatus(walletAddress, chainConfig.chain);

                    if (cacheStatus.exists && cacheStatus.expired) {
                        logger.info('⏰ Cache exists but has expired.');
                        logger.info('📋 Run "cache refresh" to update your NFT cache.');
                        logger.info('📖 Usage: npm start -- cache refresh --help');
                    } else {
                        logger.info('❌ No cached NFTs found for this wallet and chain.');
                        logger.info('📋 Run "cache refresh" command first to populate the cache.');
                        logger.info('📖 Usage: npm start -- cache refresh --help');
                    }
                    process.exit(1);
                }

                if (!cacheData.nfts || cacheData.nfts.length === 0) {
                    logger.info('❌ Cache exists but contains no NFTs for this wallet and chain.');
                    logger.info('📋 This might mean the wallet has no NFTs, or all NFTs are filtered out.');
                    logger.info('📖 Run "cache refresh" to update or check ignored collections with "cache filter"');
                    process.exit(1);
                }

                // Initialize OpenSea API (needed for interactive pricing)
                const openseaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

                // Parse marketplace list and expiration time for confirmation display
                const marketplaces = options.marketplaces.toLowerCase().split(',');

                // Parse expiration time for confirmation display
                const expirationMatch = options.expiration.match(/^(\d+)([dhm])$/);
                if (!expirationMatch) {
                    throw new Error('Invalid expiration format. Use format like "30d" for days, "12h" for hours, or "45m" for minutes');
                }
                const [, timeValue, timeUnit] = expirationMatch;
                const expirationDisplay = timeUnit === 'd' ? `${timeValue} days` :
                    timeUnit === 'h' ? `${timeValue} hours` :
                    `${timeValue} minutes`;

                // Run interactive flow with back navigation support
                const { selectedNFT, pricingChoice, feeInfo, payOptionalRoyalties } = await runInteractiveFlow(cacheData, openseaApi, {
                    walletAddress,
                    chainConfig,
                    marketplaces: marketplaces.join(', '),
                    expirationDisplay,
                    payOptionalRoyalties: options.payOptionalRoyalties || false
                });

                options.address = selectedNFT.contract;
                options.tokenId = selectedNFT.tokenId;

                // Set pricing option based on interactive choice
                if (pricingChoice.type === 'absolute') {
                    options.price = pricingChoice.value;
                } else if (pricingChoice.type === 'floor-diff') {
                    options.floorDiff = pricingChoice.value;
                } else if (pricingChoice.type === 'profit-margin') {
                    options.profitMargin = pricingChoice.value;
                } else if (pricingChoice.type === 'profit-percent') {
                    options.profitPercent = pricingChoice.value;
                }

                // Store fee info and payment preference for createListing
                options.feeInfo = feeInfo;
                options.payOptionalRoyalties = payOptionalRoyalties;

            } catch (error) {
                logger.error('Interactive flow error:', error.message);
                if (error.message.includes('cancelled')) {
                    logger.info('💭 You can also use manual input: npm start -- list -a <contract> -t <token-id> ...');
                    process.exit(0);
                } else {
                    logger.info('💡 Try manual input instead: npm start -- list -a <contract> -t <token-id> ...');
                    process.exit(1);
                }
            }
        }

        // Validate marketplace list
        const validMarketplaces = ['opensea'];
        const marketplaces = options.marketplaces.toLowerCase().split(',');
        const invalidMarkets = marketplaces.filter(m => !validMarketplaces.includes(m));
        if (invalidMarkets.length > 0) {
            throw new Error(`Invalid marketplaces: ${invalidMarkets.join(', ')}. Only OpenSea is supported.`);
        }

        // Check pricing parameters (only for non-interactive mode)
        if (!options.interactive) {
            const priceOptions = [options.price, options.floorDiff, options.profitMargin, options.profitPercent];
            const providedOptions = priceOptions.filter(opt => opt !== undefined).length;

            if (providedOptions === 0) {
                throw new Error('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
            } else if (providedOptions > 1) {
                throw new Error('Cannot use multiple pricing options at the same time. Choose only one: --price, --floor-diff, --profit-margin, or --profit-percent');
            }
        }

        // Initialize OpenSea API (if not already initialized in interactive mode)
        const openseaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

        // Get pricing information and calculate listing price
        let listingPrice;
        let pricingInfo = ''; // Used to display pricing basis

        if (options.price) {
            // Use absolute price
            listingPrice = parseFloat(options.price);
        } else if (options.floorDiff) {
            // Based on floor price difference
            const collectionData = await openseaApi.getCollectionByContract(options.address);
            if (!collectionData || !collectionData.collection) {
                throw new Error('Could not fetch collection info');
            }

            const collectionSlug = collectionData.collection;
            logger.debug(`Collection slug: ${collectionSlug}`);

            const stats = await openseaApi.getCollectionStats(collectionSlug);

            if (!stats?.floor_price) {
                throw new Error('Could not fetch floor price');
            }

            const floorPrice = stats.floor_price;
            logger.debug(`Floor price: ${floorPrice} ETH`);

            // Parse price difference
            const diffMatch = options.floorDiff.match(/^([+-])(\d*\.?\d*)(%)?$/);
            if (!diffMatch) {
                throw new Error('Invalid floor-diff format. Use format like "+0.1", "-0.1", "+10%", or "-5%"');
            }

            const [, sign, value, isPercentage] = diffMatch;
            if (isPercentage) {
                // Percentage calculation
                const percentage = parseFloat(value) / 100;
                const diff = floorPrice * percentage;
                listingPrice = sign === '+' ? floorPrice + diff : floorPrice - diff;
            } else {
                // Absolute value calculation
                listingPrice = sign === '+' ? floorPrice + parseFloat(value) : floorPrice - parseFloat(value);
            }
            pricingInfo = `${options.floorDiff} from floor`;
        } else if (options.profitMargin || options.profitPercent) {
            // Based on last purchase price
            logger.info('Fetching last sale price...');
            const lastSale = await openseaApi.getNFTLastSalePrice(options.address, options.tokenId);

            if (!lastSale || !lastSale.price) {
                throw new Error('Could not fetch last sale price for this NFT. The NFT may not have any sales history.');
            }

            const purchasePrice = lastSale.price;
            logger.info(`Last purchase price: ${purchasePrice} ETH`);

            if (options.profitMargin) {
                // Fixed price margin
                const margin = parseFloat(options.profitMargin);
                if (isNaN(margin)) {
                    throw new Error('Invalid profit-margin value. Must be a number (e.g., 0.01)');
                }
                listingPrice = purchasePrice + margin;
                pricingInfo = `purchase price (${purchasePrice} ETH) + ${margin} ETH margin`;
            } else {
                // Percentage margin
                const percent = parseFloat(options.profitPercent);
                if (isNaN(percent)) {
                    throw new Error('Invalid profit-percent value. Must be a number (e.g., 10 for 10%)');
                }
                const profitAmount = purchasePrice * (percent / 100);
                listingPrice = purchasePrice + profitAmount;
                pricingInfo = `purchase price (${purchasePrice} ETH) + ${percent}% (${profitAmount.toFixed(6)} ETH)`;
            }
        }

        // Handle price precision, keep at most 6 decimal places
        listingPrice = parseFloat(listingPrice.toFixed(6));

        if (listingPrice <= 0) {
            throw new Error('Listing price must be greater than 0');
        }

        // Parse expiration time
        const expirationMatch = options.expiration.match(/^(\d+)([dhm])$/);
        if (!expirationMatch) {
            throw new Error('Invalid expiration format. Use format like "30d" for days, "12h" for hours, or "45m" for minutes');
        }

        const [, timeValue, timeUnit] = expirationMatch;
        const expirationSeconds = timeUnit === 'd'
            ? parseInt(timeValue) * 24 * 60 * 60
            : timeUnit === 'h'
                ? parseInt(timeValue) * 60 * 60
                : parseInt(timeValue) * 60;  // minutes

        const expirationTime = Math.floor(Date.now() / 1000 + expirationSeconds);

        // Format expiration time display
        const expirationDisplay = timeUnit === 'd' ? `${timeValue} days` :
            timeUnit === 'h' ? `${timeValue} hours` :
            `${timeValue} minutes`;

        // Determine if we should pay optional royalties
        const payOptionalRoyalties = options.payOptionalRoyalties || false;

        // Get collection slug and fee information for listing creation
        let collectionSlug = null;
        let feeBreakdown = null;
        try {
            const collectionData = await openseaApi.getCollectionByContract(options.address);
            if (collectionData && collectionData.collection) {
                collectionSlug = collectionData.collection;
                feeBreakdown = await calculateFeeBreakdown(
                    listingPrice,
                    collectionSlug,
                    openseaApi,
                    payOptionalRoyalties
                );
            }
        } catch (error) {
            logger.warn('Could not fetch fee information:', error.message);
        }

        // Show listing confirmation (unless skipped)
        if (!options.skipConfirm) {
            await confirmListing({
                contractAddress: options.address,
                tokenId: options.tokenId,
                price: listingPrice,
                pricingInfo: pricingInfo,
                expiration: expirationDisplay,
                marketplaces: marketplaces.join(', '),
                wallet: walletAddress,
                chain: chainConfig.name,
                feeBreakdown: feeBreakdown
            });
        }

        logger.info('Creating OpenSea listing...');

        const listing = await openseaApi.createListing({
            contractAddress: options.address,
            tokenId: options.tokenId,
            price: listingPrice,
            expirationTime: expirationTime,
            wallet: wallet,
            walletAddress: walletAddress,
            feeInfo: feeBreakdown?.feeInfo || null,
            payOptionalRoyalties: payOptionalRoyalties
        });

        logger.info('\n✅ Listing created successfully!');
        logger.info(`Order hash: ${listing.order_hash || listing.orderHash || 'N/A'}`);
        
        // Display links
        logger.info(`\n🔗 View on OpenSea:`);
        logger.info(`   https://opensea.io/assets/${chainConfig.chain}/${options.address}/${options.tokenId}`);

    } catch (error) {
        logger.error('List failed:', error);
        if (options.debug) {
            logger.error('Error details:', error.stack);
        }
        process.exit(1);
    }
});

/**
 * Step 1: Select a collection from available collections
 * @param {Map} collectionMap - Map of collection names to NFT arrays
 * @returns {string|symbol} Selected collection name, or BACK_SIGNAL/CANCEL_SIGNAL
 */
async function selectCollectionStep(collectionMap) {
    // If only one collection, auto-select it
    if (collectionMap.size === 1) {
        const collectionName = Array.from(collectionMap.keys())[0];
        logger.info(`📚 All NFTs belong to: ${collectionName}`);
        return collectionName;
    }

    // Multiple collections - let user choose
    logger.info(`📚 Found ${collectionMap.size} collections. Select a collection:`);

    const collectionChoices = Array.from(collectionMap.entries()).map(([collectionName, nftsInCollection]) => {
        return {
            name: collectionName,
            message: `${collectionName} (${nftsInCollection.length} NFT${nftsInCollection.length > 1 ? 's' : ''})`,
            value: collectionName
        };
    });

    // Sort by collection name
    collectionChoices.sort((a, b) => a.name.localeCompare(b.name));

    // Add "Cancel" option at the end
    collectionChoices.push({
        name: '__cancel__',
        message: '⬅️ Cancel and exit',
        value: '__cancel__'
    });

    try {
        const collectionResponse = await prompt({
            type: 'select',
            name: 'selectedCollection',
            message: 'Choose a collection (Press ESC to cancel):',
            choices: collectionChoices,
            pageSize: collectionChoices.length > 20 ? 15 : collectionChoices.length
        });

        if (collectionResponse.selectedCollection === '__cancel__') {
            return CANCEL_SIGNAL;
        }

        return collectionResponse.selectedCollection;
    } catch (error) {
        // Handle ESC key or other cancellation
        const errorMessage = error.message || '';
        if (errorMessage === '' || errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
            return CANCEL_SIGNAL;
        }
        throw error;
    }
}

/**
 * Step 2: Select an NFT from the chosen collection
 * @param {Array} nftsInCollection - Array of NFTs in the selected collection
 * @param {string} collectionName - Name of the collection
 * @returns {Object|symbol} Selected NFT object, or BACK_SIGNAL/CANCEL_SIGNAL
 */
async function selectNFTStep(nftsInCollection, collectionName) {
    logger.info(`\n🎨 Select an NFT from ${collectionName} (${nftsInCollection.length} NFT${nftsInCollection.length > 1 ? 's' : ''}):`);

    const nftChoices = nftsInCollection.map((nft, index) => {
        const displayName = nft.name || 'Unnamed NFT';
        const contractShort = `${nft.contract.slice(0, 6)}...${nft.contract.slice(-4)}`;

        return {
            name: `${index + 1}`,
            message: `${displayName} | ${contractShort}:${nft.tokenId}`,
            value: nft
        };
    });

    // Add "Back" option at the end
    nftChoices.push({
        name: '__back__',
        message: '⬅️ Go back to collection selection',
        value: '__back__'
    });

    const pageSize = nftChoices.length > 20 ? 15 : nftChoices.length;

    try {
        const response = await prompt({
            type: 'select',
            name: 'selectedNFT',
            message: 'Choose an NFT to list (Press ESC to go back):',
            choices: nftChoices,
            pageSize: pageSize,
            result(value) {
                return this.choices.find(choice => choice.name === value).value;
            }
        });

        if (response.selectedNFT === '__back__') {
            return BACK_SIGNAL;
        }

        return response.selectedNFT;
    } catch (error) {
        // Handle ESC key - go back to collection selection
        const errorMessage = error.message || '';
        if (errorMessage === '' || errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
            return BACK_SIGNAL;
        }
        throw error;
    }
}

/**
 * Main interactive flow with support for going back to previous steps
 * @param {Object} cacheData - Cache data with NFTs
 * @param {OpenSeaApi} openseaApi - OpenSea API instance
 * @param {Object} config - Additional configuration (walletAddress, chainConfig, marketplaces, expirationDisplay)
 * @returns {Object} { selectedNFT, pricingChoice: { type, value } }
 * @throws {Error} If user cancels the flow
 */
async function runInteractiveFlow(cacheData, openseaApi, config) {
    const nfts = cacheData.nfts;

    // Group NFTs by collection
    const collectionMap = new Map();
    nfts.forEach(nft => {
        const collectionName = nft.collection || 'Unknown Collection';
        if (!collectionMap.has(collectionName)) {
            collectionMap.set(collectionName, []);
        }
        collectionMap.get(collectionName).push(nft);
    });

    logger.info(`\n📦 Found ${nfts.length} NFTs in cache.`);
    if (cacheData.metadata && cacheData.metadata.filteredCount > 0) {
        logger.info(`ℹ️  Note: ${cacheData.metadata.filteredCount} NFTs were filtered out by ignored collections`);
    }

    // State machine
    let currentStep = FLOW_STEPS.SELECT_COLLECTION;
    let selectedCollection = null;
    let selectedNFT = null;
    let pricingMethod = null;
    let pricingValue = null;
    let feeInfo = null;
    let payOptionalRoyalties = config.payOptionalRoyalties || false;

    while (currentStep !== FLOW_STEPS.DONE && currentStep !== FLOW_STEPS.CANCELLED) {
        if (currentStep === FLOW_STEPS.SELECT_COLLECTION) {
            const result = await selectCollectionStep(collectionMap);

            if (result === CANCEL_SIGNAL) {
                currentStep = FLOW_STEPS.CANCELLED;
            } else if (result === BACK_SIGNAL) {
                // Cannot go back from collection selection
                currentStep = FLOW_STEPS.CANCELLED;
            } else {
                selectedCollection = result;
                currentStep = FLOW_STEPS.SELECT_NFT;
            }

        } else if (currentStep === FLOW_STEPS.SELECT_NFT) {
            const nftsInCollection = collectionMap.get(selectedCollection);
            const result = await selectNFTStep(nftsInCollection, selectedCollection);

            if (result === CANCEL_SIGNAL) {
                currentStep = FLOW_STEPS.CANCELLED;
            } else if (result === BACK_SIGNAL) {
                // Go back to collection selection (only if multiple collections)
                if (collectionMap.size > 1) {
                    currentStep = FLOW_STEPS.SELECT_COLLECTION;
                    selectedCollection = null;
                } else {
                    // Only one collection, treat back as cancel
                    currentStep = FLOW_STEPS.CANCELLED;
                }
            } else {
                selectedNFT = result;
                logger.info(`✅ Selected: ${selectedNFT.name || 'Unnamed NFT'} from ${selectedNFT.collection || 'Unknown Collection'}`);
                logger.info(`📍 Contract: ${selectedNFT.contract}, Token ID: ${selectedNFT.tokenId}`);
                currentStep = FLOW_STEPS.SELECT_PRICING_METHOD;
            }

        } else if (currentStep === FLOW_STEPS.SELECT_PRICING_METHOD) {
            const result = await selectPricingMethodStep();

            if (result === CANCEL_SIGNAL) {
                currentStep = FLOW_STEPS.CANCELLED;
            } else if (result === BACK_SIGNAL) {
                // Go back to NFT selection
                currentStep = FLOW_STEPS.SELECT_NFT;
                selectedNFT = null;
            } else {
                pricingMethod = result;
                currentStep = FLOW_STEPS.INPUT_PRICING_VALUE;
            }

        } else if (currentStep === FLOW_STEPS.INPUT_PRICING_VALUE) {
            const result = await inputPricingValueStep(pricingMethod, openseaApi, selectedNFT.contract, selectedNFT.tokenId);

            if (result === CANCEL_SIGNAL) {
                currentStep = FLOW_STEPS.CANCELLED;
            } else if (result === BACK_SIGNAL) {
                // Go back to pricing method selection
                currentStep = FLOW_STEPS.SELECT_PRICING_METHOD;
                pricingMethod = null;
            } else {
                pricingValue = result;
                currentStep = FLOW_STEPS.CONFIRM;
            }

        } else if (currentStep === FLOW_STEPS.CONFIRM) {
            // Calculate the listing price for confirmation
            const { listingPrice, pricingInfo } = await calculateListingPrice(
                pricingMethod,
                pricingValue,
                openseaApi,
                selectedNFT.contract,
                selectedNFT.tokenId
            );

            // Use the payOptionalRoyalties value from config (command line parameter)
            const shouldPayOptionalRoyalties = config.payOptionalRoyalties || false;

            // Calculate fee breakdown with the determined optional royalties setting
            const feeBreakdown = await calculateFeeBreakdown(
                listingPrice,
                selectedNFT.collectionSlug,
                openseaApi,
                shouldPayOptionalRoyalties
            );

            // Inform user about optional fees if they exist
            if (feeBreakdown.hasOptionalCreatorFees) {
                if (shouldPayOptionalRoyalties) {
                    logger.info(`\n✅ Optional creator royalties (${feeBreakdown.optionalCreatorFeePercent}%) will be included`);
                } else {
                    logger.info(`\n⏭️  Optional creator royalties (${feeBreakdown.optionalCreatorFeePercent}%) will be skipped (save ${feeBreakdown.optionalCreatorFeeAmount.toFixed(6)} ETH)`);
                    logger.info('💡 Use --pay-optional-royalties to include them');
                }
            }

            const listingInfo = {
                contractAddress: selectedNFT.contract,
                tokenId: selectedNFT.tokenId,
                price: listingPrice,
                pricingInfo: pricingInfo,
                expiration: config.expirationDisplay,
                marketplaces: config.marketplaces,
                wallet: config.walletAddress,
                chain: config.chainConfig.name,
                feeBreakdown: feeBreakdown,
                payOptionalRoyalties: shouldPayOptionalRoyalties
            };

            const result = await confirmListingStep(listingInfo);

            if (result === true) {
                // Save fee information for listing creation
                feeInfo = feeBreakdown.feeInfo;
                payOptionalRoyalties = shouldPayOptionalRoyalties;
                currentStep = FLOW_STEPS.DONE;
            } else if (result === BACK_SIGNAL) {
                // Go back to pricing method selection
                currentStep = FLOW_STEPS.SELECT_PRICING_METHOD;
                pricingMethod = null;
                pricingValue = null;
            } else if (result === CANCEL_SIGNAL) {
                currentStep = FLOW_STEPS.CANCELLED;
            }
        }
    }

    if (currentStep === FLOW_STEPS.CANCELLED) {
        throw new Error('Interactive flow cancelled by user');
    }

    return {
        selectedNFT,
        pricingChoice: {
            type: pricingMethod,
            value: pricingValue
        },
        feeInfo,
        payOptionalRoyalties
    };
}

/**
 * Interactive NFT selection from cached NFTs
 * @param {Array} nfts - Array of cached NFT objects
 * @returns {Object} Selected NFT object
 * @throws {Error} If user cancels selection
 */
async function selectNFTInteractively(nfts) {
    logger.info(`\n📦 Found ${nfts.length} NFTs in cache.`);

    // Group NFTs by collection
    const collectionMap = new Map();
    nfts.forEach(nft => {
        const collectionName = nft.collection || 'Unknown Collection';
        if (!collectionMap.has(collectionName)) {
            collectionMap.set(collectionName, []);
        }
        collectionMap.get(collectionName).push(nft);
    });

    // If only one collection, skip collection selection
    let selectedCollection;
    if (collectionMap.size === 1) {
        selectedCollection = Array.from(collectionMap.keys())[0];
        logger.info(`📚 All NFTs belong to: ${selectedCollection}`);
    } else {
        // Step 1: Select collection
        logger.info(`📚 Found ${collectionMap.size} collections. Select a collection first:`);

        const collectionChoices = Array.from(collectionMap.entries()).map(([collectionName, nftsInCollection]) => {
            return {
                name: collectionName,
                message: `${collectionName} (${nftsInCollection.length} NFT${nftsInCollection.length > 1 ? 's' : ''})`,
                value: collectionName
            };
        });

        // Sort by collection name
        collectionChoices.sort((a, b) => a.name.localeCompare(b.name));

        try {
            const collectionResponse = await prompt({
                type: 'select',
                name: 'selectedCollection',
                message: 'Choose a collection:',
                choices: collectionChoices,
                pageSize: collectionChoices.length > 20 ? 15 : collectionChoices.length
            });

            selectedCollection = collectionResponse.selectedCollection;
        } catch (error) {
            if (error.message === '' || error.message.includes('cancelled')) {
                throw new Error('Collection selection cancelled by user');
            }
            throw error;
        }
    }

    // Step 2: Select NFT from the chosen collection
    const nftsInCollection = collectionMap.get(selectedCollection);
    logger.info(`\n🎨 Select an NFT from ${selectedCollection} (${nftsInCollection.length} NFT${nftsInCollection.length > 1 ? 's' : ''}):`);

    const nftChoices = nftsInCollection.map((nft, index) => {
        const displayName = nft.name || 'Unnamed NFT';
        const contractShort = `${nft.contract.slice(0, 6)}...${nft.contract.slice(-4)}`;

        return {
            name: `${index + 1}`,
            message: `${displayName} | ${contractShort}:${nft.tokenId}`,
            value: nft
        };
    });

    const pageSize = nftChoices.length > 20 ? 15 : nftChoices.length;

    try {
        const response = await prompt({
            type: 'select',
            name: 'selectedNFT',
            message: 'Choose an NFT to list:',
            choices: nftChoices,
            pageSize: pageSize,
            result(value) {
                return this.choices.find(choice => choice.name === value).value;
            }
        });

        return response.selectedNFT;
    } catch (error) {
        if (error.message === '' || error.message.includes('cancelled')) {
            throw new Error('NFT selection cancelled by user');
        }
        throw error;
    }
}

/**
 * Step 3: Select pricing method
 * @returns {string|symbol} Pricing method (absolute, floor-diff, profit-margin, profit-percent), or BACK_SIGNAL/CANCEL_SIGNAL
 */
async function selectPricingMethodStep() {
    logger.info('\n💰 Choose pricing strategy:');

    try {
        const methodResponse = await prompt({
            type: 'select',
            name: 'method',
            message: 'Select pricing method (Press ESC to go back):',
            choices: [
                { name: 'absolute', message: 'Absolute price (e.g., 0.1 ETH)', value: 'absolute' },
                { name: 'floor-diff', message: 'Floor price difference (e.g., +0.1, -5%)', value: 'floor-diff' },
                { name: 'profit-margin', message: 'Profit margin over purchase price (e.g., +0.01 ETH)', value: 'profit-margin' },
                { name: 'profit-percent', message: 'Profit percentage over purchase price (e.g., +10%)', value: 'profit-percent' },
                { name: '__back__', message: '⬅️ Go back to NFT selection', value: '__back__' }
            ]
        });

        if (methodResponse.method === '__back__') {
            return BACK_SIGNAL;
        }

        return methodResponse.method;
    } catch (error) {
        // Handle ESC key - go back to NFT selection
        const errorMessage = error.message || '';
        if (errorMessage === '' || errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
            return BACK_SIGNAL;
        }
        throw error;
    }
}

/**
 * Step 4: Input pricing value based on method
 * @param {string} method - Pricing method
 * @param {OpenSeaApi} openseaApi - OpenSea API instance
 * @param {string} contractAddress - NFT contract address
 * @param {string} tokenId - NFT token ID
 * @returns {string|symbol} Pricing value, or BACK_SIGNAL/CANCEL_SIGNAL
 */
async function inputPricingValueStep(method, openseaApi, contractAddress, tokenId) {
    // Loop to allow retry on cancel
    while (true) {
        try {
            let value;

            if (method === 'absolute') {
                const priceResponse = await prompt({
                    type: 'input',
                    name: 'price',
                    message: 'Enter listing price in ETH (Press ESC to cancel):',
                    validate: (input) => {
                        const num = parseFloat(input);
                        if (isNaN(num) || num <= 0) {
                            return 'Please enter a valid positive number';
                        }
                        return true;
                    }
                });
                value = priceResponse.price;

            } else if (method === 'floor-diff') {
                // Fetch and display floor price
                logger.info('📊 Fetching floor price...');
                const collectionData = await openseaApi.getCollectionByContract(contractAddress);
                if (!collectionData || !collectionData.collection) {
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
                        const match = input.match(/^([+-])(\d*\.?\d*)(%)?$/);
                        if (!match) {
                            return 'Invalid format. Use format like "+0.1", "-0.1", "+10%", or "-5%"';
                        }
                        return true;
                    }
                });
                value = diffResponse.diff;

            } else if (method === 'profit-margin') {
                // Fetch and display last sale price
                logger.info('📊 Fetching last sale price...');
                const lastSale = await openseaApi.getNFTLastSalePrice(contractAddress, tokenId);
                if (!lastSale || !lastSale.price) {
                    throw new Error('Could not fetch last sale price. The NFT may not have any sales history.');
                }
                logger.info(`Last purchase price: ${lastSale.price} ETH`);

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

            } else if (method === 'profit-percent') {
                // Fetch and display last sale price
                logger.info('📊 Fetching last sale price...');
                const lastSale = await openseaApi.getNFTLastSalePrice(contractAddress, tokenId);
                if (!lastSale || !lastSale.price) {
                    throw new Error('Could not fetch last sale price. The NFT may not have any sales history.');
                }
                logger.info(`Last purchase price: ${lastSale.price} ETH`);

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

            return value;

        } catch (error) {
            // Handle user cancellation (ESC key or Ctrl+C)
            const errorMessage = error.message || '';
            const errorName = error.name || '';

            if (
                errorMessage === '' ||
                errorMessage.includes('cancelled') ||
                errorMessage.includes('cancel') ||
                errorName === 'Error' && errorMessage === '' ||
                error.code === 'ERR_ASSERTION'
            ) {
                // Ask user if they want to go back or retry
                try {
                    const retryResponse = await prompt({
                        type: 'select',
                        name: 'action',
                        message: 'Input cancelled. What would you like to do? (Press ESC to go back)',
                        choices: [
                            { name: 'retry', message: '🔄 Try again', value: 'retry' },
                            { name: 'back', message: '⬅️ Go back to pricing method', value: 'back' }
                        ]
                    });

                    if (retryResponse.action === 'back') {
                        return BACK_SIGNAL;
                    }
                    // If retry, continue the loop
                } catch (retryError) {
                    // If user cancels the retry prompt with ESC, go back
                    return BACK_SIGNAL;
                }
            } else {
                throw error;
            }
        }
    }
}

/**
 * Prompt user for pricing strategy and value
 * @param {OpenSeaApi} openseaApi - OpenSea API instance
 * @param {string} contractAddress - NFT contract address
 * @param {string} tokenId - NFT token ID
 * @returns {Object} Pricing choice with type and value
 * @throws {Error} If user cancels pricing input
 */
async function promptForPricing(openseaApi, contractAddress, tokenId) {
    logger.info('\n💰 Choose pricing strategy:');

    try {
        // Step 1: Choose pricing method
        const methodResponse = await prompt({
            type: 'select',
            name: 'method',
            message: 'Select pricing method:',
            choices: [
                { name: 'absolute', message: 'Absolute price (e.g., 0.1 ETH)', value: 'absolute' },
                { name: 'floor-diff', message: 'Floor price difference (e.g., +0.1, -5%)', value: 'floor-diff' },
                { name: 'profit-margin', message: 'Profit margin over purchase price (e.g., +0.01 ETH)', value: 'profit-margin' },
                { name: 'profit-percent', message: 'Profit percentage over purchase price (e.g., +10%)', value: 'profit-percent' }
            ]
        });

        const method = methodResponse.method;
        let value;

        // Step 2: Get pricing value based on method
        if (method === 'absolute') {
            const priceResponse = await prompt({
                type: 'input',
                name: 'price',
                message: 'Enter listing price in ETH:',
                validate: (input) => {
                    const num = parseFloat(input);
                    if (isNaN(num) || num <= 0) {
                        return 'Please enter a valid positive number';
                    }
                    return true;
                }
            });
            value = priceResponse.price;

        } else if (method === 'floor-diff') {
            // Fetch and display floor price
            logger.info('📊 Fetching floor price...');
            const collectionData = await openseaApi.getCollectionByContract(contractAddress);
            if (!collectionData || !collectionData.collection) {
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
                message: 'Enter price difference (e.g., +0.1, -0.1, +10%, -5%):',
                validate: (input) => {
                    const match = input.match(/^([+-])(\d*\.?\d*)(%)?$/);
                    if (!match) {
                        return 'Invalid format. Use format like "+0.1", "-0.1", "+10%", or "-5%"';
                    }
                    return true;
                }
            });
            value = diffResponse.diff;

        } else if (method === 'profit-margin') {
            // Fetch and display last sale price
            logger.info('📊 Fetching last sale price...');
            const lastSale = await openseaApi.getNFTLastSalePrice(contractAddress, tokenId);
            if (!lastSale || !lastSale.price) {
                throw new Error('Could not fetch last sale price. The NFT may not have any sales history.');
            }
            logger.info(`Last purchase price: ${lastSale.price} ETH`);

            const marginResponse = await prompt({
                type: 'input',
                name: 'margin',
                message: 'Enter profit margin in ETH (e.g., 0.01):',
                validate: (input) => {
                    const num = parseFloat(input);
                    if (isNaN(num)) {
                        return 'Please enter a valid number';
                    }
                    return true;
                }
            });
            value = marginResponse.margin;

        } else if (method === 'profit-percent') {
            // Fetch and display last sale price
            logger.info('📊 Fetching last sale price...');
            const lastSale = await openseaApi.getNFTLastSalePrice(contractAddress, tokenId);
            if (!lastSale || !lastSale.price) {
                throw new Error('Could not fetch last sale price. The NFT may not have any sales history.');
            }
            logger.info(`Last purchase price: ${lastSale.price} ETH`);

            const percentResponse = await prompt({
                type: 'input',
                name: 'percent',
                message: 'Enter profit percentage (e.g., 10 for 10%):',
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

        return { type: method, value: value };

    } catch (error) {
        if (error.message === '' || error.message.includes('cancelled')) {
            throw new Error('Pricing input cancelled by user');
        }
        throw error;
    }
}

/**
 * Calculate listing price based on pricing method and value
 * @param {string} method - Pricing method (absolute, floor-diff, profit-margin, profit-percent)
 * @param {string} value - Pricing value
 * @param {OpenSeaApi} openseaApi - OpenSea API instance
 * @param {string} contractAddress - NFT contract address
 * @param {string} tokenId - NFT token ID
 * @returns {Object} { listingPrice, pricingInfo }
 */
async function calculateListingPrice(method, value, openseaApi, contractAddress, tokenId) {
    let listingPrice;
    let pricingInfo = '';

    if (method === 'absolute') {
        listingPrice = parseFloat(value);
        pricingInfo = `${listingPrice} ETH (absolute price)`;

    } else if (method === 'floor-diff') {
        const collectionData = await openseaApi.getCollectionByContract(contractAddress);
        if (!collectionData || !collectionData.collection) {
            throw new Error('Could not fetch collection info');
        }

        const stats = await openseaApi.getCollectionStats(collectionData.collection);
        if (!stats?.floor_price) {
            throw new Error('Could not fetch floor price');
        }

        const floorPrice = stats.floor_price;
        const diffMatch = value.match(/^([+-])(\d*\.?\d*)(%)?$/);
        const [, sign, diffValue, isPercentage] = diffMatch;

        if (isPercentage) {
            const percentage = parseFloat(diffValue) / 100;
            const diff = floorPrice * percentage;
            listingPrice = sign === '+' ? floorPrice + diff : floorPrice - diff;
        } else {
            listingPrice = sign === '+' ? floorPrice + parseFloat(diffValue) : floorPrice - parseFloat(diffValue);
        }
        pricingInfo = `${value} from floor (floor: ${floorPrice} ETH)`;

    } else if (method === 'profit-margin') {
        const lastSale = await openseaApi.getNFTLastSalePrice(contractAddress, tokenId);
        if (!lastSale || !lastSale.price) {
            throw new Error('Could not fetch last sale price');
        }

        const purchasePrice = lastSale.price;
        const margin = parseFloat(value);
        listingPrice = purchasePrice + margin;
        pricingInfo = `purchase price (${purchasePrice} ETH) + ${margin} ETH margin`;

    } else if (method === 'profit-percent') {
        const lastSale = await openseaApi.getNFTLastSalePrice(contractAddress, tokenId);
        if (!lastSale || !lastSale.price) {
            throw new Error('Could not fetch last sale price');
        }

        const purchasePrice = lastSale.price;
        const percent = parseFloat(value);
        const profitAmount = purchasePrice * (percent / 100);
        listingPrice = purchasePrice + profitAmount;
        pricingInfo = `purchase price (${purchasePrice} ETH) + ${percent}% (${profitAmount.toFixed(6)} ETH)`;
    }

    // Handle price precision
    listingPrice = parseFloat(listingPrice.toFixed(6));

    if (listingPrice <= 0) {
        throw new Error('Listing price must be greater than 0');
    }

    return { listingPrice, pricingInfo };
}

/**
 * Calculate fee breakdown and net proceeds for a listing
 * @param {number} listingPrice - Listing price in ETH
 * @param {string} collectionSlug - Collection slug
 * @param {OpenSeaApi} openseaApi - OpenSea API instance
 * @param {boolean} payOptionalRoyalties - Whether to include optional creator fees
 * @returns {Object} Fee information including net proceeds and raw feeInfo
 */
async function calculateFeeBreakdown(listingPrice, collectionSlug, openseaApi, payOptionalRoyalties = false) {
    try {
        // Get collection fees
        const feeInfo = await openseaApi.getCollectionFees(collectionSlug);

        if (!feeInfo) {
            // Fallback to default OpenSea fee only if API fails
            logger.warn('Could not fetch collection fees, using default OpenSea fee only');
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
                payOptionalRoyalties: false
            };
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

        return {
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
    } catch (error) {
        logger.error('Error calculating fee breakdown:', error);
        // Return minimal fee info on error
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
            payOptionalRoyalties: false
        };
    }
}

/**
 * Step 5: Confirm listing (interactive mode)
 * @param {Object} listingInfo - Listing information
 * @returns {boolean|symbol} true to confirm, BACK_SIGNAL to go back, CANCEL_SIGNAL to cancel
 */
async function confirmListingStep(listingInfo) {
    logger.info('\n' + '='.repeat(50));
    logger.info('LISTING CONFIRMATION');
    logger.info('='.repeat(50));
    logger.info(`Chain: ${listingInfo.chain}`);
    logger.info(`Contract: ${listingInfo.contractAddress}`);
    logger.info(`Token ID: ${listingInfo.tokenId}`);
    logger.info(`Listing Price: ${listingInfo.price.toFixed(6)} ETH`);
    if (listingInfo.pricingInfo) {
        logger.info(`Pricing: ${listingInfo.pricingInfo}`);
    }

    // Display fee breakdown if available
    if (listingInfo.feeBreakdown) {
        logger.info('');
        logger.info('Fee Breakdown:');
        logger.info(`  - OpenSea Fee (${listingInfo.feeBreakdown.openseaFeePercent}%): ${listingInfo.feeBreakdown.openseaFeeAmount.toFixed(6)} ETH`);

        // Show required creator fees
        if (listingInfo.feeBreakdown.hasRequiredCreatorFees) {
            logger.info(`  - Creator Royalty - Required (${listingInfo.feeBreakdown.requiredCreatorFeePercent}%): ${listingInfo.feeBreakdown.requiredCreatorFeeAmount.toFixed(6)} ETH`);
        }

        // Show optional creator fees (included or skipped)
        if (listingInfo.feeBreakdown.hasOptionalCreatorFees) {
            if (listingInfo.feeBreakdown.payOptionalRoyalties) {
                logger.info(`  - Creator Royalty - Optional (${listingInfo.feeBreakdown.optionalCreatorFeePercent}%): ${listingInfo.feeBreakdown.optionalCreatorFeeAmount.toFixed(6)} ETH [INCLUDED]`);
            } else {
                logger.info(`  - Creator Royalty - Optional (${listingInfo.feeBreakdown.optionalCreatorFeePercent}%): ${listingInfo.feeBreakdown.optionalCreatorFeeAmount.toFixed(6)} ETH [SKIPPED]`);
            }
        }

        logger.info(`  - Total Fees (${listingInfo.feeBreakdown.totalFeePercent}%): ${listingInfo.feeBreakdown.totalFeeAmount.toFixed(6)} ETH`);
        logger.info('');
        logger.info(`💰 Net Proceeds: ${listingInfo.feeBreakdown.netProceeds.toFixed(6)} ETH`);
    }

    logger.info('');
    logger.info(`Expiration: ${listingInfo.expiration}`);
    logger.info(`Marketplaces: ${listingInfo.marketplaces}`);
    logger.info(`Wallet: ${listingInfo.wallet}`);
    logger.info('='.repeat(50));
    logger.info('⚠️  Note: This will create a listing on the blockchain.');
    logger.info('='.repeat(50) + '\n');

    try {
        const response = await prompt({
            type: 'select',
            name: 'action',
            message: 'What would you like to do? (Press ESC to cancel)',
            choices: [
                { name: 'confirm', message: '✅ Proceed with listing', value: 'confirm' },
                { name: 'back', message: '⬅️ Go back to change price', value: 'back' },
                { name: 'cancel', message: '❌ Cancel listing', value: 'cancel' }
            ]
        });

        if (response.action === 'confirm') {
            logger.debug('Listing confirmed by user');
            return true;
        } else if (response.action === 'back') {
            return BACK_SIGNAL;
        } else {
            return CANCEL_SIGNAL;
        }
    } catch (error) {
        // Handle ESC key - treat as cancel
        const errorMessage = error.message || '';
        if (errorMessage === '' || errorMessage.includes('cancelled') || errorMessage.includes('cancel')) {
            return CANCEL_SIGNAL;
        }
        throw error;
    }
}

/**
 * Display listing confirmation information and wait for user confirmation
 * @param {Object} listingInfo - Listing information
 * @throws {Error} If user cancels listing
 */
async function confirmListing(listingInfo) {
    logger.info('\n' + '='.repeat(50));
    logger.info('LISTING CONFIRMATION');
    logger.info('='.repeat(50));
    logger.info(`Chain: ${listingInfo.chain}`);
    logger.info(`Contract: ${listingInfo.contractAddress}`);
    logger.info(`Token ID: ${listingInfo.tokenId}`);
    logger.info(`Listing Price: ${listingInfo.price.toFixed(6)} ETH`);
    if (listingInfo.pricingInfo) {
        logger.info(`Pricing: ${listingInfo.pricingInfo}`);
    }

    // Display fee breakdown if available
    if (listingInfo.feeBreakdown) {
        logger.info('');
        logger.info('Fee Breakdown:');
        logger.info(`  - OpenSea Fee (${listingInfo.feeBreakdown.openseaFeePercent}%): ${listingInfo.feeBreakdown.openseaFeeAmount.toFixed(6)} ETH`);

        // Show required creator fees
        if (listingInfo.feeBreakdown.hasRequiredCreatorFees) {
            logger.info(`  - Creator Royalty - Required (${listingInfo.feeBreakdown.requiredCreatorFeePercent}%): ${listingInfo.feeBreakdown.requiredCreatorFeeAmount.toFixed(6)} ETH`);
        }

        // Show optional creator fees (included or skipped)
        if (listingInfo.feeBreakdown.hasOptionalCreatorFees) {
            if (listingInfo.feeBreakdown.payOptionalRoyalties) {
                logger.info(`  - Creator Royalty - Optional (${listingInfo.feeBreakdown.optionalCreatorFeePercent}%): ${listingInfo.feeBreakdown.optionalCreatorFeeAmount.toFixed(6)} ETH [INCLUDED]`);
            } else {
                logger.info(`  - Creator Royalty - Optional (${listingInfo.feeBreakdown.optionalCreatorFeePercent}%): ${listingInfo.feeBreakdown.optionalCreatorFeeAmount.toFixed(6)} ETH [SKIPPED]`);
            }
        }

        logger.info(`  - Total Fees (${listingInfo.feeBreakdown.totalFeePercent}%): ${listingInfo.feeBreakdown.totalFeeAmount.toFixed(6)} ETH`);
        logger.info('');
        logger.info(`💰 Net Proceeds: ${listingInfo.feeBreakdown.netProceeds.toFixed(6)} ETH`);
    }

    logger.info('');
    logger.info(`Expiration: ${listingInfo.expiration}`);
    logger.info(`Marketplaces: ${listingInfo.marketplaces}`);
    logger.info(`Wallet: ${listingInfo.wallet}`);
    logger.info('='.repeat(50));
    logger.info('⚠️  Note: This will create a listing on the blockchain.');
    logger.info('='.repeat(50) + '\n');

    const response = await prompt({
        type: 'confirm',
        name: 'confirmed',
        message: 'Do you want to proceed with this listing?',
        initial: false,
    });

    if (!response.confirmed) {
        throw new Error('Listing cancelled by user');
    }

    logger.debug('Listing confirmed by user');
} 