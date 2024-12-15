import { Command } from 'commander';
import { OpenSeaSDK } from 'opensea-js';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY } from '../config.js';
import { addChainOption, validateChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';

export const offerCommand = new Command('offer')
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
// Add private key option
addPrivateKeyOption(offerCommand);

offerCommand.action(async (options) => {
    try {
        // Validate chain
        const chainConfig = validateChain(options.chain);
        const wallet = await getWallet(options);
        const walletAddress = await wallet.getAddress();

        // Initialize SDK with correct chain and wallet
        const chainSpecificSdk = new OpenSeaSDK(wallet, {
            chain: chainConfig.chain,
            apiKey: OPENSEA_API_KEY,
        });

        // Validate parameters
        if (!options.collection && (!options.address || !options.tokenId)) {
            throw new Error('Must provide collection slug or NFT contract address and token ID');
        }

        if (options.collection && (options.address || options.tokenId)) {
            throw new Error('Cannot provide both collection and NFT parameters');
        }

        if ((options.traitType && !options.traitValue) || (!options.traitType && options.traitValue)) {
            throw new Error('Must provide both trait type and value or neither');
        }

        if (options.traitType && !options.collection) {
            throw new Error('Trait criteria can only be used with collection offers');
        }

        const expirationTime = Math.round(Date.now() / 1000 + parseInt(options.expirationMinutes) * 60);

        logger.info('Creating offer...');
        logger.info(`Wallet address: ${walletAddress}`);
        logger.info(`Offer amount: ${options.offerAmount} WETH`);
        logger.info(`Expiration: ${options.expirationMinutes} minutes`);

        if (options.collection) {
            logger.info(`Collection: ${options.collection}`);
            if (options.traitType) {
                logger.info(`Trait: ${options.traitType} = ${options.traitValue}`);
            }
        } else {
            logger.info(`NFT: ${options.address} #${options.tokenId}`);
        }
        logger.info('------------------------');

        let offer;
        if (options.collection) {
            // Create collection offer
            offer = await chainSpecificSdk.createCollectionOffer({
                collection: options.collection,
                accountAddress: walletAddress,
                amount: parseFloat(options.offerAmount),
                expirationTime,
                ...(options.traitType && {
                    trait: {
                        type: options.traitType,
                        value: options.traitValue
                    }
                })
            });
        } else {
            // Create NFT offer
            offer = await chainSpecificSdk.createOffer({
                asset: {
                    tokenId: options.tokenId,
                    tokenAddress: options.address,
                },
                accountAddress: walletAddress,
                startAmount: parseFloat(options.offerAmount),
                expirationTime
            });
        }

        logger.info('Offer created successfully!');
        logger.info(`Order hash: ${offer.orderHash}`);

    } catch (error) {
        logger.error('Offer creation failed:', error);
        process.exit(1);
    }
}); 