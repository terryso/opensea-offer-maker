import { Command } from 'commander';
import { OpenSeaSDK } from 'opensea-js';
import { OfferStrategy } from './services/offerStrategy.js';
import { OpenSeaApi } from './services/openseaApi.js';
import { OfferService } from './services/offerService.js';
import { sdk, OPENSEA_API_KEY, OPENSEA_API_BASE_URL, WALLET_ADDRESS, SUPPORTED_CHAINS, DEFAULT_CHAIN, wallet, provider } from './config.js';
import { logger, LogLevel } from './utils/logger.js';
import { ethers } from 'ethers';


const program = new Command();

// Add chain option to all commands that need it
const addChainOption = (command) => {
    return command.option(
        '--chain <chain>',
        `Chain to use (${Object.keys(SUPPORTED_CHAINS).join(', ')})`,
        DEFAULT_CHAIN
    );
};

// Create offer command
const offerCommand = new Command('offer')
    .description('Create an offer for a single NFT or collection')
    .option('-a, --address <address>', 'NFT contract address (for individual NFT offer)')
    .option('-t, --token-id <tokenId>', 'Token ID (for individual NFT offer)')
    .option('-c, --collection <slug>', 'Collection slug (for collection offer)')
    .requiredOption('-o, --offer-amount <offerAmount>', 'Offer amount in WETH')
    .option('-e, --expiration-minutes <expirationMinutes>', 'Expiration time in minutes', '15')
    .option('--trait-type <traitType>', 'Trait type for collection offer')
    .option('--trait-value <traitValue>', 'Trait value for collection offer');

// Add chain option
addChainOption(offerCommand);

offerCommand.action(async (options) => {
    try {
        // Validate chain
        const chainConfig = SUPPORTED_CHAINS[options.chain];
        if (!chainConfig) {
            throw new Error(`Unsupported chain: ${options.chain}`);
        }

        // Initialize SDK with correct chain
        const chainSpecificSdk = new OpenSeaSDK(wallet, {
            chain: chainConfig.chain,
            apiKey: OPENSEA_API_KEY,
        });

        // Initialize service with chain-specific configuration
        const offerService = new OfferService(chainSpecificSdk, chainConfig);

        // Validate parameters
        if (!options.collection && (!options.address || !options.tokenId)) {
            throw new Error('Must provide collection slug or NFT contract address and token ID');
        }

        const isCollectionOffer = !!options.collection;

        logger.info('Creating offer with the following details:');
        if (isCollectionOffer) {
            logger.info(`Collection: ${options.collection}`);
        } else {
            logger.info(`Token Address: ${options.address}`);
            logger.info(`Token ID: ${options.tokenId}`);
        }
        logger.info(`Offer Amount: ${options.offerAmount}`);
        logger.info(`Expiration (minutes): ${options.expirationMinutes}`);

        const params = isCollectionOffer ? {
            collectionSlug: options.collection,
            offerAmount: options.offerAmount,
            expirationMinutes: parseInt(options.expirationMinutes),
            traitType: options.traitType,
            traitValue: options.traitValue
        } : {
            tokenAddress: options.address,
            tokenId: options.tokenId,
            offerAmount: options.offerAmount,
            expirationMinutes: parseInt(options.expirationMinutes)
        };

        const orderHash = isCollectionOffer
            ? await offerService.createCollectionOffer(params)
            : await offerService.createIndividualOffer(params);

        logger.info(`Offer created successfully! Order hash: ${orderHash}`);
        process.exit(0);
    } catch (error) {
        logger.error(`Failed to create offer: ${error}`);
        process.exit(1);
    }
});

// Auto offer command
const autoOfferCommand = new Command('auto')
    .description('Automatically create offers for NFTs or collections')
    .option('-c, --collection <slug>', 'Collection slug')
    .option('-a, --address <address>', 'NFT contract address')
    .option('-i, --token-id <id>', 'NFT token ID')
    .requiredOption('--min <price>', 'Minimum offer price (WETH)')
    .requiredOption('--max <price>', 'Maximum offer price (WETH)')
    .option('--increment <amount>', 'Amount to increase price by (WETH)', '0.0001')
    .option('--interval <seconds>', 'Check interval (seconds)', '60')
    .option('--floor-percentage <percentage>', 'Maximum percentage of floor price', '100')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(autoOfferCommand);

autoOfferCommand.action(async (options) => {
    try {
        // Validate chain
        const chainConfig = SUPPORTED_CHAINS[options.chain];
        if (!chainConfig) {
            throw new Error(`Unsupported chain: ${options.chain}`);
        }

        // Initialize SDK with correct chain
        const chainSpecificSdk = new OpenSeaSDK(wallet, {
            chain: chainConfig.chain,
            apiKey: OPENSEA_API_KEY,
        });

        const offerService = new OfferService(chainSpecificSdk, chainConfig);
        const openSeaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        logger.debug('Initializing strategy with wallet:', WALLET_ADDRESS);

        const strategy = new OfferStrategy(offerService, openSeaApi, {
            minPrice: options.min,
            maxPrice: options.max,
            increment: options.increment,
            checkIntervalSeconds: parseInt(options.interval),
            walletAddress: WALLET_ADDRESS,
            floorPricePercentage: parseFloat(options.floorPercentage)
        });

        // Validate parameters
        if (!options.collection && (!options.address || !options.tokenId)) {
            throw new Error('Must provide collection slug or NFT contract address and token ID');
        }

        logger.info('Starting auto offer...');
        logger.info(`Wallet address: ${WALLET_ADDRESS}`);
        logger.info('Price range:', options.min, '-', options.max, 'WETH');
        logger.info('Check interval:', options.interval, 'seconds');

        // Start strategy
        strategy.start(options.collection ? {
            collectionSlug: options.collection
        } : {
            tokenAddress: options.address,
            tokenId: options.tokenId
        });

        // Handle exit signal
        process.on('SIGINT', () => {
            logger.info('Stopping auto offer...');
            strategy.stop();
            process.exit(0);
        });

        // Keep process running
        process.stdin.resume();

    } catch (error) {
        logger.error('Auto offer failed:', error);
        if (options.debug) {
            logger.error('Error details:', error.stack);
        }
        process.exit(1);
    }
});

// Check offers command
const checkOffersCommand = new Command('check')
    .description('Check current offers status')
    .requiredOption('-c, --collection <slug>', 'Collection slug')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(checkOffersCommand);

checkOffersCommand.action(async (options) => {
    try {
        // Validate chain
        const chainConfig = SUPPORTED_CHAINS[options.chain];
        if (!chainConfig) {
            throw new Error(`Unsupported chain: ${options.chain}`);
        }

        const openSeaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

        // Get offers
        const response = await openSeaApi.getCollectionOffers(options.collection);

        if (!response?.offers?.length) {
            logger.info('No offers found');
            return;
        }

        // Calculate unit price and sort
        const offers = response.offers.map(offer => {
            const params = offer.protocol_data.parameters;
            const quantity = parseInt(params.consideration[0].startAmount) || 1;
            const totalPrice = BigInt(offer.price.value);
            const unitPrice = totalPrice / BigInt(quantity);
            return {
                unitPrice,
                quantity,
                totalPrice,
                address: params.offerer,
                endTime: parseInt(params.endTime)
            };
        }).filter(offer => {
            const now = Math.floor(Date.now() / 1000);
            return offer.endTime > now;
        }).sort((a, b) => {
            // First sort by unit price
            if (b.unitPrice > a.unitPrice) return 1;
            if (b.unitPrice < a.unitPrice) return -1;
            // If unit price is the same, sort by quantity
            return b.quantity - a.quantity;
        });

        // Only display the top 10 highest priced offers
        logger.info('\nCurrent highest offers:');
        offers.slice(0, 10).forEach((offer, index) => {
            logger.info(`${index + 1}. ${ethers.formatEther(offer.unitPrice.toString())} WETH/item (Quantity: ${offer.quantity})`);
        });

    } catch (error) {
        logger.error('Check offers failed:', error);
        process.exit(1);
    }
});

// Set main program
program
    .name('opensea-offer-maker')
    .description('OpenSea offer creation tool')
    .version('1.0.0')
    .addCommand(offerCommand)
    .addCommand(autoOfferCommand)
    .addCommand(checkOffersCommand);

program.parse(process.argv); 