import { Command } from 'commander';
import { OpenSeaSDK } from 'opensea-js';
import { OfferStrategy } from './services/offerStrategy.js';
import { OpenSeaApi } from './services/openseaApi.js';
import { OfferService } from './services/offerService.js';
import { sdk, OPENSEA_API_KEY, OPENSEA_API_BASE_URL, WALLET_ADDRESS, SUPPORTED_CHAINS, DEFAULT_CHAIN, wallet, provider, RESERVOIR_API_KEY } from './config.js';
import { logger, LogLevel } from './utils/logger.js';
import { ethers } from 'ethers';
import { ReservoirApi } from './services/reservoirApi.js';
import { ScanService } from './services/scanService.js';


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
        const openSeaApi = new OpenSeaApi(
            OPENSEA_API_KEY, 
            OPENSEA_API_BASE_URL, 
            chainConfig
        );

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

        const openSeaApi = new OpenSeaApi(
            OPENSEA_API_KEY, 
            OPENSEA_API_BASE_URL, 
            chainConfig
        );

        // 获取并显示收藏品统计数据
        const stats = await openSeaApi.getCollectionStats(options.collection);
        const floorPrice = stats.total.floor_price;
        
        logger.info('\nCollection Stats:');
        logger.info('------------------------');
        logger.info(`Floor Price: ${floorPrice} ${stats.total.floor_price_symbol || 'ETH'}`);
        logger.info(`Total Supply: ${stats.total.num_owners || 'N/A'}`);
        logger.info(`Market Cap: ${stats.total.market_cap?.toFixed(2) || 'N/A'} ETH`);
        
        // 查找各个时间段的数据
        const oneDay = stats.intervals.find(i => i.interval === 'one_day') || {};
        const sevenDay = stats.intervals.find(i => i.interval === 'seven_day') || {};
        const thirtyDay = stats.intervals.find(i => i.interval === 'thirty_day') || {};
        
        // 24h 统计
        logger.info('\n24h Stats:');
        logger.info(`Volume: ${oneDay.volume?.toFixed(2) || 'N/A'} ETH (${oneDay.volume_change?.toFixed(2) || 'N/A'}%)`);
        logger.info(`Sales: ${oneDay.sales || 'N/A'} (${oneDay.sales_diff > 0 ? '+' : ''}${oneDay.sales_diff || 'N/A'})`);
        logger.info(`Avg Price: ${oneDay.average_price?.toFixed(4) || 'N/A'} ETH`);
        
        // 7d 统计
        logger.info('\n7d Stats:');
        logger.info(`Volume: ${sevenDay.volume?.toFixed(2) || 'N/A'} ETH (${sevenDay.volume_change?.toFixed(2) || 'N/A'}%)`);
        logger.info(`Sales: ${sevenDay.sales || 'N/A'} (${sevenDay.sales_diff > 0 ? '+' : ''}${sevenDay.sales_diff || 'N/A'})`);
        logger.info(`Avg Price: ${sevenDay.average_price?.toFixed(4) || 'N/A'} ETH`);
        
        // 30d 统计
        logger.info('\n30d Stats:');
        logger.info(`Volume: ${thirtyDay.volume?.toFixed(2) || 'N/A'} ETH (${thirtyDay.volume_change?.toFixed(2) || 'N/A'}%)`);
        logger.info(`Sales: ${thirtyDay.sales || 'N/A'} (${thirtyDay.sales_diff > 0 ? '+' : ''}${thirtyDay.sales_diff || 'N/A'})`);
        logger.info(`Avg Price: ${thirtyDay.average_price?.toFixed(4) || 'N/A'} ETH`);
        
        // 总计统计
        logger.info('\nAll Time Stats:');
        logger.info(`Volume: ${stats.total.volume?.toFixed(2) || 'N/A'} ETH`);
        logger.info(`Sales: ${stats.total.sales || 'N/A'}`);
        logger.info(`Avg Price: ${stats.total.average_price?.toFixed(4) || 'N/A'} ETH`);
        logger.info('------------------------');

        // 获取 offers
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
            if (b.unitPrice > a.unitPrice) return 1;
            if (b.unitPrice < a.unitPrice) return -1;
            return b.quantity - a.quantity;
        });

        // 计算最高 offer 与地板价的差价比例
        if (offers.length > 0) {
            const highestOffer = ethers.formatEther(offers[0].unitPrice.toString());
            const priceDiff = floorPrice - parseFloat(highestOffer);
            const percentage = ((priceDiff / floorPrice) * 100).toFixed(2);
            logger.info(`Highest Offer: ${highestOffer} ETH`);
            logger.info(`Price Gap: ${priceDiff.toFixed(4)} ETH (${percentage}% below floor)`);
            logger.info('------------------------');
        }

        // Display the top 10 highest priced offers
        logger.info('\nTop 10 Highest Offers:');
        logger.info('------------------------');
        offers.slice(0, 10).forEach((offer, index) => {
            logger.info(`${index + 1}. ${ethers.formatEther(offer.unitPrice.toString())} WETH/item (Quantity: ${offer.quantity})`);
            logger.info(`   Wallet: ${offer.address}`);
            logger.info('------------------------');
        });

    } catch (error) {
        logger.error('Check offers failed:', error);
        process.exit(1);
    }
});

// 在其他命令定义之后，trendingCommand 之前添加
const scanCommand = new Command('scan')
    .description('Scan collections for trading opportunities')
    .option('-v, --volume <volume>', 'Minimum 24h volume in ETH', '1')
    .option('-g, --gap <gap>', 'Minimum price gap percentage', '20')
    .option('-t, --top <number>', 'Number of top collections to scan', '100')
    .option('--min-floor <price>', 'Minimum floor price in ETH')
    .option('--max-floor <price>', 'Maximum floor price in ETH')
    .option('--min-opportunities <number>', 'Minimum number of opportunities before stopping', '5')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(scanCommand);

// 添加新的命令
const trendingCommand = new Command('trending')
    .description('Scan trending collections for trading opportunities')
    .option('-v, --volume <volume>', 'Minimum 24h volume in ETH', '1')
    .option('-g, --gap <gap>', 'Minimum price gap percentage', '20')
    .option('-p, --period <period>', 'Time period (1h, 6h, 24h, 7d, 30d)', '24h')
    .option('-l, --limit <limit>', 'Number of collections to fetch', '20')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(trendingCommand);

trendingCommand.action(async (options) => {
    try {
        const chainConfig = SUPPORTED_CHAINS[options.chain];
        if (!chainConfig) {
            throw new Error(`Unsupported chain: ${options.chain}`);
        }

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        const reservoirApi = new ReservoirApi(RESERVOIR_API_KEY, chainConfig);
        const openSeaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);
        const scanService = new ScanService(reservoirApi, openSeaApi);

        logger.info(`\nFetching trending collections...`);
        logger.info(`Period: ${options.period}`);
        logger.info(`Minimum volume: ${options.volume} ETH`);
        logger.info(`Limit: ${options.limit}`);
        logger.info('------------------------\n');

        const { collections } = await scanService.scanTrendingCollections(options);

        if (collections.length === 0) {
            logger.info('No collections found matching the criteria.');
            return;
        }

        // 显示结果
        logger.info(`\nFound ${collections.length} trending collections:`);
        collections.forEach((collection, index) => {
            logger.info('\n------------------------');
            logger.info(`${index + 1}. ${collection.name}`);
            logger.info(`Floor Price: ${collection.stats.floorPrice.toFixed(4)} ETH (${collection.stats.floorPriceChange >= 0 ? '+' : ''}${collection.stats.floorPriceChange.toFixed(2)}%)`);
            logger.info(`24h Volume: ${collection.stats.volume24h.toFixed(2)} ETH (${collection.stats.volumeChange >= 0 ? '+' : ''}${collection.stats.volumeChange.toFixed(2)}%)`);
            logger.info(`Supply: ${collection.stats.totalSupply} (${collection.stats.onSaleCount} on sale)`);
            logger.info(`Owners: ${collection.stats.ownerCount}`);
            logger.info(`Reservoir: ${collection.reservoirUrl}`);
        });

    } catch (error) {
        logger.error('Trending scan failed:', error);
        if (options.debug) {
            logger.error('Error details:', error.stack);
        }
        process.exit(1);
    }
});

// 在 scanCommand 定义和 addChainOption 之后添加
scanCommand.action(async (options) => {
    try {
        const chainConfig = SUPPORTED_CHAINS[options.chain];
        if (!chainConfig) {
            throw new Error(`Unsupported chain: ${options.chain}`);
        }

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        logger.info(`Scanning top ${options.limit || 20} collections for opportunities...`);
        logger.info(`Minimum 24h volume: ${options.volume} ETH`);
        logger.info(`Minimum price gap: ${options.gap}%`);
        logger.info('------------------------\n');

        const reservoirApi = new ReservoirApi(RESERVOIR_API_KEY, chainConfig);
        const openSeaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);
        const scanService = new ScanService(reservoirApi, openSeaApi);

        const { scannedPages, opportunities } = await scanService.scanTopCollections(options);

        // 显示结果
        logger.info(`\nScanned ${scannedPages} pages of collections`);
        logger.info(`Found ${opportunities.length} opportunities:`);
        opportunities.forEach((opp, index) => {
            logger.info('\n------------------------');
            logger.info(`${index + 1}. ${opp.name} (${opp.slug})`);
            logger.info(`Floor Price: ${opp.floorPrice.toFixed(4)} ETH`);
            logger.info(`Highest Offer: ${opp.highestOffer.toFixed(4)} ETH`);
            logger.info(`Price Gap: ${opp.gapPercentage.toFixed(2)}%`);
            logger.info(`24h Volume: ${opp.volume24h.toFixed(2)} ETH`);
            logger.info(`OpenSea: ${opp.openseaUrl}`);
        });

    } catch (error) {
        logger.error('Scan failed:', error);
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
    .addCommand(checkOffersCommand)
    .addCommand(scanCommand)
    .addCommand(trendingCommand);

program.parse(process.argv); 