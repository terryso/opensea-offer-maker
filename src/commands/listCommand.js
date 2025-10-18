import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { addChainOption, getEffectiveChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { OpenSeaApi } from '../services/openseaApi.js';

export const listCommand = new Command('list')
    .description('List an NFT for sale on multiple marketplaces')
    .requiredOption('-a, --address <address>', 'NFT contract address')
    .requiredOption('-t, --token-id <tokenId>', 'Token ID')
    .option('-p, --price <price>', 'Absolute listing price in ETH')
    .option('-f, --floor-diff <diff>', 'Price difference from floor price (e.g., +0.1, -0.1, +10%, -5%)')
    .option('-e, --expiration <time>', 'Expiration time (e.g., 30d, 12h, 45m)', '1h')
    .option('-m, --marketplaces <markets>', 'Comma-separated list of marketplaces (opensea,blur)', 'opensea,blur')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(listCommand);
// Add private key option
addPrivateKeyOption(listCommand);

listCommand.action(async (options) => {
    try {
        const chainConfig = await getEffectiveChain(options);
        const wallet = await getWallet(options);
        const walletAddress = await wallet.getAddress();

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        // 验证市场列表
        const validMarketplaces = ['opensea', 'blur'];
        const marketplaces = options.marketplaces.toLowerCase().split(',');
        const invalidMarkets = marketplaces.filter(m => !validMarketplaces.includes(m));
        if (invalidMarkets.length > 0) {
            throw new Error(`Invalid marketplaces: ${invalidMarkets.join(', ')}`);
        }

        // 如果在非以太坊链上尝试使用 Blur，报错
        if (chainConfig.chain !== 'ethereum' && marketplaces.includes('blur')) {
            throw new Error('Blur marketplace is only available on Ethereum mainnet');
        }

        // 检查价格参数
        if (!options.price && !options.floorDiff) {
            throw new Error('Must provide either --price or --floor-diff');
        }
        if (options.price && options.floorDiff) {
            throw new Error('Cannot use both --price and --floor-diff at the same time');
        }

        // 初始化 OpenSea API
        const openseaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);
        
        // 获取地板价（如果需要）
        let listingPrice;
        if (options.floorDiff) {
            // 首先通过合约地址获取 collection
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

        // 解析过期时间
        const expirationMatch = options.expiration.match(/^(\d+)([dhm])$/);
        if (!expirationMatch) {
            throw new Error('Invalid expiration format. Use format like "30d" for days, "12h" for hours, or "45m" for minutes');
        }

        const [, timeValue, timeUnit] = expirationMatch;
        const expirationSeconds = timeUnit === 'd' 
            ? parseInt(timeValue) * 24 * 60 * 60
            : timeUnit === 'h'
                ? parseInt(timeValue) * 60 * 60
                : parseInt(timeValue) * 60;  // 分钟

        const expirationTime = Math.floor(Date.now() / 1000 + expirationSeconds);

        logger.info(`Creating listing...`);
        logger.info(`NFT: ${options.address} #${options.tokenId}`);
        logger.info(`Price: ${listingPrice.toFixed(4)} ETH${options.floorDiff ? ` (${options.floorDiff} from floor)` : ''}`);
        logger.info(`Expiration: ${timeValue}${
            timeUnit === 'd' ? ' days' : 
            timeUnit === 'h' ? ' hours' : 
            ' minutes'
        }`);
        logger.info(`Marketplaces: ${marketplaces.join(', ')}`);
        logger.info(`Wallet: ${walletAddress}`);
        logger.info('------------------------\n');

        // 注意: 目前只支持 OpenSea
        // Blur 需要单独的 API 集成
        if (marketplaces.includes('blur')) {
            logger.warn('⚠️  Warning: Blur listing is not yet supported in this version.');
            logger.warn('    Only OpenSea listing will be created.');
        }

        // 使用 OpenSea API (内部使用 Seaport.js)
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
        
        // 显示链接
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