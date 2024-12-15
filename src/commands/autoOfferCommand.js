import { Command } from 'commander';
import { OpenSeaSDK } from 'opensea-js';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { OfferStrategy } from '../services/offerStrategy.js';
import { OfferService } from '../services/offerService.js';
import { addChainOption, validateChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';

export const autoOfferCommand = new Command('auto')
    .description('Automatically create offers based on floor price')
    .option('-a, --address <address>', 'NFT contract address (for individual NFT offer)')
    .option('-t, --token-id <tokenId>', 'Token ID (for individual NFT offer)')
    .option('-c, --collection <slug>', 'Collection slug (for collection offer)')
    .requiredOption('--min <minPrice>', 'Minimum offer price in WETH')
    .requiredOption('--max <maxPrice>', 'Maximum offer price in WETH')
    .option('--increment <increment>', 'Price increment in WETH', '0.001')
    .option('--interval <seconds>', 'Check interval in seconds', '60')
    .option('--floor-percentage <percentage>', 'Floor price percentage for offer', '90')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(autoOfferCommand);
// Add private key option
addPrivateKeyOption(autoOfferCommand);

autoOfferCommand.action(async (options) => {
    try {
        const chainConfig = validateChain(options.chain);
        const wallet = await getWallet(options);
        const walletAddress = await wallet.getAddress();

        // Initialize SDK with correct chain and wallet
        const chainSpecificSdk = new OpenSeaSDK(wallet, {
            chain: chainConfig.chain,
            apiKey: OPENSEA_API_KEY,
        });

        const offerService = new OfferService(chainSpecificSdk, chainConfig);
        const openSeaApi = new OpenSeaApi(
            OPENSEA_API_KEY, 
            OPENSEA_API_BASE_URL, 
            chainConfig
        );

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        logger.debug('Initializing strategy with wallet:', walletAddress);

        const strategy = new OfferStrategy(offerService, openSeaApi, {
            minPrice: options.min,
            maxPrice: options.max,
            increment: options.increment,
            checkIntervalSeconds: parseInt(options.interval),
            walletAddress: walletAddress,
            floorPricePercentage: parseFloat(options.floorPercentage)
        });

        // Validate parameters
        if (!options.collection && (!options.address || !options.tokenId)) {
            throw new Error('Must provide collection slug or NFT contract address and token ID');
        }

        logger.info('Starting auto offer...');
        logger.info(`Wallet address: ${walletAddress}`);
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