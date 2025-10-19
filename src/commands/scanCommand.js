import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL, RESERVOIR_API_KEY } from '../config.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { ReservoirApi } from '../services/reservoirApi.js';
import { ScanService } from '../services/scanService.js';
import { addChainOption, getEffectiveChain } from '../utils/commandUtils.js';

export const scanCommand = new Command('scan')
    .description('Scan collections for trading opportunities')
    .option('-v, --volume <volume>', 'Minimum 24h volume in ETH')
    .option('-g, --gap <gap>', 'Minimum price gap percentage')
    .option('-s, --sales <sales>', 'Minimum estimated 24h sales')
    .option('-t, --top <number>', 'Number of top collections to scan', '100')
    .option('--min-floor <price>', 'Minimum floor price in ETH')
    .option('--max-floor <price>', 'Maximum floor price in ETH')
    .option('--min-opportunities <number>', 'Minimum number of opportunities before stopping', '10')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(scanCommand);

scanCommand.action(async (options) => {
    try {
        const chainConfig = await getEffectiveChain(options);

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        logger.info(`Scanning top ${options.minOpportunities || 10} collections for opportunities...`);
        if (options.volume) {
            logger.info(`Minimum 24h volume: ${options.volume} ETH`);
        }
        if (options.sales) {
            logger.info(`Minimum estimated 24h sales: ${options.sales}`);
        }
        if (options.gap) {
            logger.info(`Minimum price gap: ${options.gap}%`);
        }
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
            logger.info(`Est. 24h Sales: ${opp.estimatedSales.toFixed(2)}`);
            logger.info(`OpenSea: ${opp.openseaUrl}`);
            logger.info(`Reservoir: ${opp.reservoirUrl}`);
        });

    } catch (error) {
        logger.error('Scan failed:', error);
        process.exit(1);
    }
}); 