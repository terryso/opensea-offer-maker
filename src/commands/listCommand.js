import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { addChainOption, getEffectiveChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { CacheService } from '../services/cacheService.js';
import enquirer from 'enquirer';
const { prompt } = enquirer;

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

                if (cacheData.metadata && cacheData.metadata.filteredCount > 0) {
                    logger.info(`ℹ️  Note: ${cacheData.metadata.filteredCount} NFTs were filtered out by ignored collections`);
                }

                // Select NFT interactively
                const selectedNFT = await selectNFTInteractively(cacheData.nfts);
                options.address = selectedNFT.contract;
                options.tokenId = selectedNFT.tokenId;

                logger.info(`✅ Selected: ${selectedNFT.name || 'Unnamed NFT'} from ${selectedNFT.collection || 'Unknown Collection'}`);
                logger.info(`📍 Contract: ${selectedNFT.contract}, Token ID: ${selectedNFT.tokenId}`);
            } catch (error) {
                logger.error('Failed to load cache or select NFT:', error.message);
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

        // Check pricing parameters
        const priceOptions = [options.price, options.floorDiff, options.profitMargin, options.profitPercent];
        const providedOptions = priceOptions.filter(opt => opt !== undefined).length;

        // In interactive mode, if no pricing option is provided, prompt for it
        if (providedOptions === 0 && options.interactive) {
            // Will prompt for pricing after NFT selection
            logger.debug('No pricing option provided, will prompt interactively');
        } else if (providedOptions === 0) {
            throw new Error('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
        } else if (providedOptions > 1) {
            throw new Error('Cannot use multiple pricing options at the same time. Choose only one: --price, --floor-diff, --profit-margin, or --profit-percent');
        }

        // Initialize OpenSea API
        const openseaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

        // Interactive pricing if no pricing option was provided
        if (providedOptions === 0 && options.interactive) {
            const pricingChoice = await promptForPricing(openseaApi, options.address, options.tokenId);
            // Set the chosen pricing option
            if (pricingChoice.type === 'absolute') {
                options.price = pricingChoice.value;
            } else if (pricingChoice.type === 'floor-diff') {
                options.floorDiff = pricingChoice.value;
            } else if (pricingChoice.type === 'profit-margin') {
                options.profitMargin = pricingChoice.value;
            } else if (pricingChoice.type === 'profit-percent') {
                options.profitPercent = pricingChoice.value;
            }
        }

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
                chain: chainConfig.name
            });
        }

        logger.info('Creating OpenSea listing...');
        
        const listing = await openseaApi.createListing({
            contractAddress: options.address,
            tokenId: options.tokenId,
            price: listingPrice,
            expirationTime: expirationTime,
            wallet: wallet,
            walletAddress: walletAddress
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