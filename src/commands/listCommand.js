import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { RESERVOIR_API_KEY } from '../config.js';
import { addChainOption, validateChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { createClient, ReservoirClient } from '@reservoir0x/reservoir-sdk';
import { ReservoirApi } from '../services/reservoirApi.js';
import { ethers } from 'ethers';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ALCHEMY_API_KEY } from '../config.js';

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
        const chainConfig = validateChain(options.chain);
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

        const reservoirApi = new ReservoirApi(RESERVOIR_API_KEY, chainConfig);
        // 获取地板价（如果需要）
        let listingPrice;
        if (options.floorDiff) {
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

        // 初始化 Reservoir SDK
        const client = createClient({
            chains: [{
                id: chainConfig.chain === 'ethereum' ? 1 : 8453,
                baseApiUrl: chainConfig.chain === 'ethereum' 
                    ? 'https://api.reservoir.tools'
                    : 'https://api-base.reservoir.tools',
                default: true,
                apiKey: RESERVOIR_API_KEY,
            }],
            source: 'localhost'
        });

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

        // 创建 viem wallet
        const account = privateKeyToAccount(wallet.privateKey);
        const viemWallet = createWalletClient({
            account,
            transport: http(chainConfig.chain === 'ethereum' 
                ? 'https://eth-mainnet.g.alchemy.com/v2/' + ALCHEMY_API_KEY
                : 'https://base-mainnet.g.alchemy.com/v2/' + ALCHEMY_API_KEY
            )
        });

        // 创建 listing
        const result = await client.actions.listToken({
            listings: [
                // OpenSea listing
                {
                    token: `${options.address}:${options.tokenId}`,
                    weiPrice: ethers.parseEther(listingPrice.toString()).toString(),
                    orderbook: "opensea",
                    orderKind: "seaport",
                    expirationTime: expirationTime.toString(),
                    options: {
                        'seaport': {
                            useOffChainCancellation: true,
                            conduitKey: "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
                            zone: "0x004C00500000aD104D7DBd00e3ae0A5C00560C00",
                            startTime: Math.floor(Date.now() / 1000).toString(),
                            counter: "0",
                            salt: "0",
                            zoneHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
                            orderType: 0,
                            consideration: [{
                                itemType: 1,
                                token: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                                identifierOrCriteria: "0",
                                startAmount: ethers.parseEther(listingPrice.toString()).toString(),
                                endAmount: ethers.parseEther(listingPrice.toString()).toString(),
                                recipient: walletAddress
                            }]
                        }
                    }
                },
                // Blur listing (如果选择了 Blur 且在以太坊主网)
                ...(marketplaces.includes('blur') && chainConfig.chain === 'ethereum' ? [{
                    token: `${options.address}:${options.tokenId}`,
                    weiPrice: ethers.parseEther(listingPrice.toString()).toString(),
                    orderbook: "blur",
                    orderKind: "blur",
                    expirationTime: expirationTime.toString(),
                    options: {
                        'blur': {
                            collection: options.address
                        }
                    }
                }] : [])
            ],
            wallet: viemWallet,
            onProgress: (steps) => {
                logger.debug('Progress:', steps);
                // 添加更详细的调试信息
                if (steps.length > 0) {
                    steps.forEach(step => {
                        if (step.items && step.items.length > 0) {
                            step.items.forEach(item => {
                                if (item.data?.sign) {
                                    logger.debug('Signing data:', {
                                        signatureKind: item.data.sign.signatureKind,
                                        primaryType: item.data.sign.primaryType,
                                        domain: item.data.sign.domain,
                                        marketplace: item.data.sign.domain.name  // 显示是哪个市场的签名
                                    });
                                }
                                if (item.data?.post) {
                                    logger.debug('API call:', {
                                        endpoint: item.data.post.endpoint,
                                        method: item.data.post.method
                                    });
                                }
                                logger.debug('Step status:', item.status);
                            });
                        }
                    });
                }
            }
        });

        // 检查是否有错误
        if (result.error || result.errors?.length) {
            logger.debug('Full error response:', JSON.stringify(result, null, 2));
            if (result.errors) {
                result.errors.forEach((error, index) => {
                    logger.error(`Error ${index + 1}:`, error);
                });
            }
            throw new Error(result.error?.message || result.errors[0]?.message || 'Unknown error');
        }

        // 执行所有步骤
        if (result.steps) {
            for (const step of result.steps) {
                try {
                    logger.info(`\nExecuting step: ${step.action}`);
                    logger.info(`Description: ${step.description}`);
                    logger.info(`Type: ${step.kind}`);

                    const stepResult = await step.execute();
                    
                    if (step.kind === 'transaction') {
                        logger.info(`Transaction hash: ${stepResult.txHash}`);
                        logger.info(`Gas used: ${stepResult.gasUsed || 'unknown'}`);
                    } else if (step.kind === 'signature') {
                        logger.info('Signature completed');
                    }

                    logger.info(`Status: ${step.status}`);
                    logger.info('------------------------');
                } catch (error) {
                    logger.error(`Failed to execute step ${step.action}:`, error);
                    throw error;
                }
            }
        }

        logger.info('\nListing created successfully!');

        // 显示链接
        if (result.path) {
            logger.info(`Path to listing: ${result.path}`);
        }
        if (marketplaces.includes('opensea')) {
            logger.info(`OpenSea URL: https://opensea.io/assets/${chainConfig.chain}/${options.address}/${options.tokenId}`);
        }
        if (marketplaces.includes('blur') && chainConfig.chain === 'ethereum') {
            logger.info(`Blur URL: https://blur.io/asset/${options.address}/${options.tokenId}`);
        }

    } catch (error) {
        logger.error('List failed:', error);
        if (options.debug) {
            logger.error('Error details:', error.stack);
        }
        process.exit(1);
    }
}); 