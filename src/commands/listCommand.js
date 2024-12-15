import { Command } from 'commander';
import { OpenSeaSDK } from 'opensea-js';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, WALLET_ADDRESS, RESERVOIR_API_KEY, wallet } from '../config.js';
import { ReservoirApi } from '../services/reservoirApi.js';
import { addChainOption, validateChain } from '../utils/commandUtils.js';

export const listCommand = new Command('list')
    .description('List an NFT for sale on OpenSea')
    .requiredOption('-a, --address <address>', 'NFT contract address')
    .requiredOption('-t, --token-id <tokenId>', 'Token ID')
    .option('-p, --price <price>', 'Absolute listing price in ETH')
    .option('-f, --floor-diff <diff>', 'Price difference from floor price (e.g., +0.1, -0.1, +10%, -5%)')
    .option('-e, --expiration <time>', 'Expiration time (e.g., 30d, 12h)', '1h')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(listCommand);

listCommand.action(async (options) => {
    try {
        const chainConfig = validateChain(options.chain);

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        // Initialize SDK with correct chain
        const chainSpecificSdk = new OpenSeaSDK(wallet, {
            chain: chainConfig.chain,
            apiKey: OPENSEA_API_KEY,
        });

        // 检查价格参数
        if (!options.price && !options.floorDiff) {
            throw new Error('Must provide either --price or --floor-diff');
        }
        if (options.price && options.floorDiff) {
            throw new Error('Cannot use both --price and --floor-diff at the same time');
        }

        // 获取地板价（如果需要）
        let listingPrice;
        if (options.floorDiff) {
            // 获取合集信息和地板价
            const reservoirApi = new ReservoirApi(RESERVOIR_API_KEY, chainConfig);
            const collections = await reservoirApi.getTopCollections(1, {
                contractAddress: options.address
            });
            
            if (!collections?.data?.length || !collections.data[0].stats.floorPrice) {
                throw new Error('Could not fetch floor price');
            }

            const floorPrice = collections.data[0].stats.floorPrice;
            logger.debug(`Floor price: ${floorPrice} ETH`);
            
            // 解析价格差异
            const diffMatch = options.floorDiff.match(/^([+-])(\d*\.?\d*)(%)?$/);
            if (!diffMatch) {
                throw new Error('Invalid floor-diff format. Use format like "+0.1", "-0.1", "+10%", or "-5%"');
            }

            const [, sign, value, isPercentage] = diffMatch;
            if (isPercentage) {
                // 百分比计算
                const percentage = parseFloat(value) / 100;
                const diff = floorPrice * percentage;
                listingPrice = sign === '+' ? floorPrice + diff : floorPrice - diff;
            } else {
                // 绝对值计算
                listingPrice = sign === '+' ? floorPrice + parseFloat(value) : floorPrice - parseFloat(value);
            }
        } else {
            listingPrice = parseFloat(options.price);
        }

        // 处理价格精度，保留最多6位小数
        listingPrice = parseFloat(listingPrice.toFixed(6));

        if (listingPrice <= 0) {
            throw new Error('Listing price must be greater than 0');
        }

        // 解析失效时间
        const expirationMatch = options.expiration.match(/^(\d+)([dh])$/);
        if (!expirationMatch) {
            throw new Error('Invalid expiration format. Use format like "30d" for days or "12h" for hours');
        }

        const [, timeValue, timeUnit] = expirationMatch;
        const expirationSeconds = timeUnit === 'd' 
            ? parseInt(timeValue) * 24 * 60 * 60
            : parseInt(timeValue) * 60 * 60;

        const expirationTime = Math.round(Date.now() / 1000 + expirationSeconds);

        logger.info(`Creating listing...`);
        logger.info(`NFT: ${options.address} #${options.tokenId}`);
        logger.info(`Price: ${listingPrice.toFixed(4)} ETH${options.floorDiff ? ` (${options.floorDiff} from floor)` : ''}`);
        logger.info(`Expiration: ${timeValue}${timeUnit === 'd' ? ' days' : ' hours'}`);
        logger.info('------------------------\n');

        const listing = await chainSpecificSdk.createListing({
            asset: {
                tokenId: options.tokenId,
                tokenAddress: options.address,
            },
            accountAddress: WALLET_ADDRESS,
            startAmount: listingPrice,
            expirationTime,
            quantity: 1,
        });

        logger.info('Listing created successfully!');
        logger.info(`Order hash: ${listing.orderHash}`);
        logger.info(`OpenSea URL: https://opensea.io/assets/${chainConfig.chain}/${options.address}/${options.tokenId}`);

    } catch (error) {
        logger.error('List failed:', error);
        if (options.debug) {
            logger.error('Error details:', error.stack);
        }
        process.exit(1);
    }
}); 