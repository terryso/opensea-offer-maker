import { Command } from 'commander';
import { OpenSeaSDK } from 'opensea-js';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { OfferStrategy } from '../services/offerStrategy.js';
import { OfferService } from '../services/offerService.js';
import { addChainOption, validateChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { SUPPORTED_CHAINS, DEFAULT_CHAIN } from '../config.js';

// 创建父命令
export const autoOfferCommand = new Command('auto')
    .description('Automatically create offers');

// 合集 offer 命令
autoOfferCommand
    .command('collection')
    .description('Automatically create collection offers')
    .requiredOption('-c, --collection <slug>', 'Collection slug')
    .requiredOption('--min <minPrice>', 'Minimum offer price in WETH')
    .requiredOption('--max <maxPrice>', 'Maximum offer price in WETH')
    .option('--increment <increment>', 'Price increment in WETH', '0.001')
    .option('--interval <seconds>', 'Check interval in seconds', '60')
    .option('--floor-percentage <percentage>', 'Floor price percentage for offer', '90')
    .option('--debug', 'Enable debug logging')
    .option('--chain <chain>', `Chain to use (${Object.keys(SUPPORTED_CHAINS).join(', ')})`, DEFAULT_CHAIN)
    .option('--private-key <key>', 'Private key to use for transaction')
    .action(async (options) => {
        try {
            const chainConfig = validateChain(options.chain);
            const wallet = await getWallet(options);
            const walletAddress = await wallet.getAddress();

            if (options.debug) {
                logger.setLevel(LogLevel.DEBUG);
            }

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

            const strategy = new OfferStrategy(offerService, openSeaApi, {
                minPrice: options.min,
                maxPrice: options.max,
                increment: options.increment,
                checkIntervalSeconds: parseInt(options.interval),
                walletAddress: walletAddress,
                floorPricePercentage: parseFloat(options.floorPercentage)
            });

            logger.info('Starting auto collection offer...');
            logger.info(`Collection: ${options.collection}`);
            logger.info(`Wallet address: ${walletAddress}`);
            logger.info('Price range:', options.min, '-', options.max, 'WETH');
            logger.info('Check interval:', options.interval, 'seconds');

            strategy.start({
                type: 'collection',
                collectionSlug: options.collection
            });

            setupExitHandler(strategy);

        } catch (error) {
            handleError(error, options.debug);
        }
    });

// 单个 token offer 命令
autoOfferCommand
    .command('token')
    .description('Automatically create individual token offers')
    .requiredOption('-a, --address <address>', 'NFT contract address')
    .requiredOption('-t, --token-id <tokenId>', 'Token ID')
    .requiredOption('-c, --collection <slug>', 'Collection slug')
    .requiredOption('--min <minPrice>', 'Minimum offer price in WETH')
    .requiredOption('--max <maxPrice>', 'Maximum offer price in WETH')
    .option('--increment <increment>', 'Price increment in WETH', '0.001')
    .option('--interval <seconds>', 'Check interval in seconds', '60')
    .option('--floor-percentage <percentage>', 'Floor price percentage for offer')
    .option('--debug', 'Enable debug logging')
    .option('--chain <chain>', `Chain to use (${Object.keys(SUPPORTED_CHAINS).join(', ')})`, DEFAULT_CHAIN)
    .option('--private-key <key>', 'Private key to use for transaction')
    .action(async (options) => {
        try {
            if (options.floorPercentage && !options.collection) {
                throw new Error('Must provide --collection when using --floor-percentage');
            }

            const chainConfig = validateChain(options.chain);
            const wallet = await getWallet(options);
            const walletAddress = await wallet.getAddress();

            if (options.debug) {
                logger.setLevel(LogLevel.DEBUG);
            }

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

            const strategy = new OfferStrategy(offerService, openSeaApi, {
                minPrice: options.min,
                maxPrice: options.max,
                increment: options.increment,
                checkIntervalSeconds: parseInt(options.interval),
                walletAddress: walletAddress,
                floorPricePercentage: options.floorPercentage ? parseFloat(options.floorPercentage) : null
            });

            logger.info('Starting auto token offer...');
            logger.info(`Token: ${options.address} #${options.tokenId}`);
            logger.info(`Wallet address: ${walletAddress}`);
            logger.info('Price range:', options.min, '-', options.max, 'WETH');
            logger.info('Check interval:', options.interval, 'seconds');

            strategy.start({
                type: 'token',
                tokenAddress: options.address,
                tokenId: options.tokenId,
                collectionSlug: options.collection
            });

            setupExitHandler(strategy);

        } catch (error) {
            handleError(error, options.debug);
        }
    });

// 辅助函数
function setupExitHandler(strategy) {
    process.on('SIGINT', () => {
        logger.info('Stopping auto offer...');
        strategy.stop();
        process.exit(0);
    });
    process.stdin.resume();
}

function handleError(error, debug) {
    logger.error('Auto offer failed:', error.message);
    if (debug && error.stack) {
        logger.error('Error details:', error.stack);
    }
    process.exit(1);
} 