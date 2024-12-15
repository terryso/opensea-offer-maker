import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL, RESERVOIR_API_KEY } from '../config.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { ReservoirApi } from '../services/reservoirApi.js';
import { ScanService } from '../services/scanService.js';
import { addChainOption, validateChain } from '../utils/commandUtils.js';

export const trendingCommand = new Command('trending')
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
        const chainConfig = validateChain(options.chain);

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