import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { addChainOption, getEffectiveChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import enquirer from 'enquirer';
const { prompt } = enquirer;

export const listCommand = new Command('list')
    .description('List an NFT for sale on multiple marketplaces')
    .requiredOption('-a, --address <address>', 'NFT contract address')
    .requiredOption('-t, --token-id <tokenId>', 'Token ID')
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
        const priceOptions = [options.price, options.floorDiff, options.profitMargin, options.profitPercent];
        const providedOptions = priceOptions.filter(opt => opt !== undefined).length;

        if (providedOptions === 0) {
            throw new Error('Must provide one of: --price, --floor-diff, --profit-margin, or --profit-percent');
        }
        if (providedOptions > 1) {
            throw new Error('Cannot use multiple pricing options at the same time. Choose only one: --price, --floor-diff, --profit-margin, or --profit-percent');
        }

        // 初始化 OpenSea API
        const openseaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

        // 获取定价所需的信息并计算上架价格
        let listingPrice;
        let pricingInfo = ''; // 用于显示定价依据

        if (options.price) {
            // 使用绝对价格
            listingPrice = parseFloat(options.price);
        } else if (options.floorDiff) {
            // 基于地板价差异
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
            pricingInfo = `${options.floorDiff} from floor`;
        } else if (options.profitMargin || options.profitPercent) {
            // 基于最后购买价格
            logger.info('Fetching last sale price...');
            const lastSale = await openseaApi.getNFTLastSalePrice(options.address, options.tokenId);

            if (!lastSale || !lastSale.price) {
                throw new Error('Could not fetch last sale price for this NFT. The NFT may not have any sales history.');
            }

            const purchasePrice = lastSale.price;
            logger.info(`Last purchase price: ${purchasePrice} ETH`);

            if (options.profitMargin) {
                // 固定价格增量
                const margin = parseFloat(options.profitMargin);
                if (isNaN(margin)) {
                    throw new Error('Invalid profit-margin value. Must be a number (e.g., 0.01)');
                }
                listingPrice = purchasePrice + margin;
                pricingInfo = `purchase price (${purchasePrice} ETH) + ${margin} ETH margin`;
            } else {
                // 百分比增量
                const percent = parseFloat(options.profitPercent);
                if (isNaN(percent)) {
                    throw new Error('Invalid profit-percent value. Must be a number (e.g., 10 for 10%)');
                }
                const profitAmount = purchasePrice * (percent / 100);
                listingPrice = purchasePrice + profitAmount;
                pricingInfo = `purchase price (${purchasePrice} ETH) + ${percent}% (${profitAmount.toFixed(6)} ETH)`;
            }
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

        // 格式化过期时间显示
        const expirationDisplay = timeUnit === 'd' ? `${timeValue} days` :
            timeUnit === 'h' ? `${timeValue} hours` :
            `${timeValue} minutes`;

        // 显示listing确认（除非跳过确认）
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

        // 注意: 目前只支持 OpenSea
        // Blur 需要单独的 API 集成
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

/**
 * 显示listing确认信息并等待用户确认
 * @param {Object} listingInfo - Listing信息
 * @throws {Error} 如果用户取消listing
 */
async function confirmListing(listingInfo) {
    console.log('\n' + '='.repeat(50));
    console.log('LISTING CONFIRMATION');
    console.log('='.repeat(50));
    console.log(`Chain: ${listingInfo.chain}`);
    console.log(`Contract: ${listingInfo.contractAddress}`);
    console.log(`Token ID: ${listingInfo.tokenId}`);
    console.log(`Listing Price: ${listingInfo.price.toFixed(6)} ETH`);
    if (listingInfo.pricingInfo) {
        console.log(`Pricing: ${listingInfo.pricingInfo}`);
    }
    console.log(`Expiration: ${listingInfo.expiration}`);
    console.log(`Marketplaces: ${listingInfo.marketplaces}`);
    console.log(`Wallet: ${listingInfo.wallet}`);
    console.log('='.repeat(50));
    console.log('⚠️  Note: This will create a listing on the blockchain.');
    console.log('='.repeat(50) + '\n');

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