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
    .option('-m, --marketplaces <markets>', 'Comma-separated list of marketplaces (opensea,blur)', 'opensea,blur')
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
        const validMarketplaces = ['opensea', 'blur'];
        const marketplaces = options.marketplaces.toLowerCase().split(',');
        const invalidMarkets = marketplaces.filter(m => !validMarketplaces.includes(m));
        if (invalidMarkets.length > 0) {
            throw new Error(`Invalid marketplaces: ${invalidMarkets.join(', ')}`);
        }

        // Blur marketplace only available on Ethereum mainnet
        if (chainConfig.chain !== 'ethereum' && marketplaces.includes('blur')) {
            throw new Error('Blur marketplace is only available on Ethereum mainnet');
        }

        // Check pricing parameters
        const priceOptions = [options.price, options.floorDiff, options.profitMargin, options.profitPercent];
        const providedOptions = priceOptions.filter(opt => opt !== undefined).length;

        if (providedOptions === 0) {
            throw new Error('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
        }
        if (providedOptions > 1) {
            throw new Error('Cannot use multiple pricing options at the same time. Choose only one: --price, --floor-diff, --profit-margin, or --profit-percent');
        }

        // Initialize OpenSea API
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

        // Note: Currently only supports OpenSea
        // Blur requires separate API integration
        if (marketplaces.includes('blur')) {
            logger.warn('⚠️  Warning: Blur listing is not yet supported in this version.');
            logger.warn('    Only OpenSea listing will be created.');
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
    logger.info(`\n📦 Found ${nfts.length} NFTs in cache. Select one to list:`);

    // Prepare choices for enquirer
    const choices = nfts.map((nft, index) => {
        const displayName = nft.name || 'Unnamed NFT';
        const collectionName = nft.collection || 'Unknown Collection';
        const contractShort = `${nft.contract.slice(0, 6)}...${nft.contract.slice(-4)}`;

        return {
            name: `${index + 1}`,
            message: `${displayName} | ${collectionName} | ${contractShort}:${nft.tokenId}`,
            value: nft
        };
    });

    // Add pagination for better UX with large collections
    const pageSize = choices.length > 20 ? 15 : choices.length;

    try {
        const response = await prompt({
            type: 'select',
            name: 'selectedNFT',
            message: 'Choose an NFT to list:',
            choices: choices,
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