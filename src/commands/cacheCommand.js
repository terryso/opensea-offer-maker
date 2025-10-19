import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import CacheService from '../services/cacheService.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { addChainOption, getEffectiveChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { OpenSeaApi } from '../services/openseaApi.js';

export const cacheCommand = new Command('cache')
    .description('Manage NFT cache and collection filters');

// Cache refresh subcommand
const refreshCommand = cacheCommand
    .command('refresh')
    .description('Fetch and cache NFTs for specified wallet')
    .option('-w, --wallet <address>', 'Wallet address to cache (defaults to current wallet)')
    .option('--debug', 'Enable debug logging');

// Add chain option and private key option to refresh command
addChainOption(refreshCommand);
addPrivateKeyOption(refreshCommand);

refreshCommand.action(async (options) => {
    try {
        const chainConfig = await getEffectiveChain(options);
        
        // 如果没有指定钱包地址,使用当前默认钱包
        let walletAddress = options.wallet;
        if (!walletAddress) {
            const wallet = await getWallet(options);
            walletAddress = await wallet.getAddress();
        }

        const cacheService = new CacheService();
        const openseaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

        logger.info(`Starting NFT cache refresh for wallet ${walletAddress} on ${chainConfig.name}...`);

        // Progress callback for pagination
        const onProgress = (progress) => {
            const progressPercent = progress.hasMore ? '...' : '✓';
            logger.info(`📄 Page ${progress.page}: Found ${progress.currentPageCount} NFTs (Total: ${progress.totalCount}) ${progressPercent}`);
        };

        // Fetch NFTs from OpenSea API (with collection filtering already applied)
        const startTime = Date.now();
        const nfts = await openseaApi.getWalletNFTs(walletAddress, {
            chain: chainConfig.name,
            onProgress
        });

        const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
        logger.info(`✅ Fetched ${nfts.length} NFTs in ${fetchTime}s`);

        // Save to cache
        logger.info('💾 Saving to cache...');
        const cacheData = await cacheService.saveCache(walletAddress, chainConfig.name, nfts);

        logger.info(`\n🎉 Cache refresh completed!`);
        logger.info(`   Wallet: ${walletAddress}`);
        logger.info(`   Chain: ${chainConfig.name}`);
        logger.info(`   NFTs Cached: ${cacheData.metadata.count}`);
        if (cacheData.metadata.filteredCount > 0) {
            logger.info(`   NFTs Filtered: ${cacheData.metadata.filteredCount} (ignored collections)`);
        }
        logger.info(`   Last Updated: ${new Date(cacheData.metadata.timestamp).toLocaleString()}`);

    } catch (error) {
        logger.error('Cache refresh failed:', error.message);
        if (options.debug) {
            logger.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
});

// Cache list subcommand
const listCommand = cacheCommand
    .command('list')
    .description('Display cached NFTs with contract/tokenId info')
    .option('-w, --wallet <address>', 'Wallet address to list (optional, defaults to current wallet)')
    .option('--debug', 'Enable debug logging');

// Add chain option and private key option to list command
addChainOption(listCommand);
addPrivateKeyOption(listCommand);

listCommand.action(async (options) => {
        try {
            const chainConfig = await getEffectiveChain(options);
            
            // 如果没有指定钱包地址,使用当前默认钱包
            let walletAddress = options.wallet;
            if (!walletAddress) {
                const wallet = await getWallet(options);
                walletAddress = await wallet.getAddress();
            }

            const cacheService = new CacheService();
            const cacheData = await cacheService.loadCache(walletAddress, chainConfig.name);

            if (!cacheData) {
                logger.info(`No cache found for wallet ${walletAddress} on ${chainConfig.name}`);
                logger.info('Run "cache refresh" to populate cache');
                return;
            }

            logger.info(`\nCached NFTs for ${walletAddress} on ${chainConfig.name}:`);
            logger.info(`Total: ${cacheData.metadata.count} NFTs`);
            if (cacheData.metadata.filteredCount > 0) {
                logger.info(`Filtered: ${cacheData.metadata.filteredCount} NFTs from ignored collections`);
            }
            logger.info(`Last updated: ${new Date(cacheData.metadata.timestamp).toLocaleString()}`);
            logger.info('\n--- NFTs ---');

            cacheData.nfts.forEach((nft, index) => {
                logger.info(`${index + 1}. ${nft.name || 'Unnamed'}`);
                logger.info(`   Collection: ${nft.collection}`);
                logger.info(`   Contract: ${nft.contract}`);
                logger.info(`   Token ID: ${nft.tokenId}`);
                logger.info(`   Standard: ${nft.tokenStandard || 'Unknown'}`);
                if (nft.imageUrl) {
                    logger.info(`   Image: ${nft.imageUrl}`);
                }
                logger.info('');
            });

        } catch (error) {
            logger.error('Failed to list cache:', error.message);
            process.exit(1);
        }
    });

// Cache clear subcommand
const clearCommand = cacheCommand
    .command('clear')
    .description('Clear cache for current wallet or all wallets')
    .option('-w, --wallet <address>', 'Wallet address to clear (optional, defaults to current wallet)')
    .option('--all', 'Clear all cache files')
    .option('--debug', 'Enable debug logging');

// Add chain option and private key option to clear command
addChainOption(clearCommand);
addPrivateKeyOption(clearCommand);

clearCommand.action(async (options) => {
        try {
            const cacheService = new CacheService();

            if (options.all) {
                const count = await cacheService.clearAllCache();
                logger.info(`Cleared ${count} cache files`);
            } else {
                const chainConfig = await getEffectiveChain(options);
                
                // 如果没有指定钱包地址,使用当前默认钱包
                let walletAddress = options.wallet;
                if (!walletAddress) {
                    const wallet = await getWallet(options);
                    walletAddress = await wallet.getAddress();
                }
                
                const cleared = await cacheService.clearCache(walletAddress, chainConfig.name);
                if (cleared) {
                    logger.info(`Cleared cache for ${walletAddress} on ${chainConfig.name}`);
                } else {
                    logger.info(`No cache found for ${walletAddress} on ${chainConfig.name}`);
                }
            }

        } catch (error) {
            logger.error('Failed to clear cache:', error.message);
            process.exit(1);
        }
    });

// Cache status subcommand
const statusCommand = cacheCommand
    .command('status')
    .description('Show cache info (count, last updated, size)')
    .option('-w, --wallet <address>', 'Wallet address to check (optional, defaults to current wallet)')
    .option('--all', 'Show status for all cache files')
    .option('--debug', 'Enable debug logging');

// Add chain option and private key option to status command
addChainOption(statusCommand);
addPrivateKeyOption(statusCommand);

statusCommand.action(async (options) => {
        try {
            const cacheService = new CacheService();

            if (options.all) {
                const caches = await cacheService.listAllCaches();

                if (caches.length === 0) {
                    logger.info('No cache files found');
                    return;
                }

                logger.info(`\nFound ${caches.length} cache files:\n`);

                caches.forEach((cache, index) => {
                    logger.info(`${index + 1}. ${cache.walletAddress} (${cache.chain})`);
                    if (cache.exists) {
                        logger.info(`   NFTs: ${cache.count}`);
                        if (cache.filteredCount > 0) {
                            logger.info(`   Filtered: ${cache.filteredCount}`);
                        }
                        logger.info(`   Last Updated: ${new Date(cache.lastUpdated).toLocaleString()}`);
                        logger.info(`   Size: ${(cache.size / 1024).toFixed(2)} KB`);
                        logger.info(`   Status: ${cache.expired ? 'EXPIRED' : 'VALID'}`);
                    } else {
                        logger.info(`   Status: ERROR - ${cache.error || 'Unknown error'}`);
                    }
                    logger.info('');
                });

            } else {
                const chainConfig = await getEffectiveChain(options);
                
                // 如果没有指定钱包地址,使用当前默认钱包
                let walletAddress = options.wallet;
                if (!walletAddress) {
                    const wallet = await getWallet(options);
                    walletAddress = await wallet.getAddress();
                }
                
                const status = await cacheService.getCacheStatus(walletAddress, chainConfig.name);

                logger.info(`\nCache status for ${walletAddress} on ${chainConfig.name}:`);

                if (!status.exists) {
                    logger.info('Status: No cache found');
                    if (status.error) {
                        logger.info(`Error: ${status.error}`);
                    }
                    logger.info('Run "cache refresh" to create cache');
                } else {
                    logger.info(`Status: ${status.expired ? 'EXPIRED' : 'VALID'}`);
                    logger.info(`NFTs: ${status.count}`);
                    if (status.filteredCount > 0) {
                        logger.info(`Filtered: ${status.filteredCount}`);
                    }
                    logger.info(`Last Updated: ${new Date(status.lastUpdated).toLocaleString()}`);
                    logger.info(`Size: ${(status.size / 1024).toFixed(2)} KB`);

                    if (status.expired) {
                        logger.info('⚠️  Cache is expired. Run "cache refresh" to update');
                    }
                }
            }

        } catch (error) {
            logger.error('Failed to get cache status:', error.message);
            process.exit(1);
        }
    });

// Filter management subcommands
const filterCommand = cacheCommand
    .command('filter')
    .description('Manage collection filters');

filterCommand
    .command('add <collection>')
    .description('Add collection to ignore list')
    .option('-r, --reason <reason>', 'Reason for ignoring', '用户指定：无价值')
    .option('--debug', 'Enable debug logging')
    .action(async (collection, options) => {
        try {
            const cacheService = new CacheService();
            const added = await cacheService.addIgnoredCollection(collection, options.reason);

            if (added) {
                logger.info(`✅ Added "${collection}" to ignore list`);
                logger.info(`   Reason: ${options.reason}`);
            } else {
                logger.info(`ℹ️  Collection "${collection}" is already in ignore list`);
            }

        } catch (error) {
            logger.error('Failed to add collection to ignore list:', error.message);
            process.exit(1);
        }
    });

filterCommand
    .command('remove <collection>')
    .description('Remove collection from ignore list')
    .option('--debug', 'Enable debug logging')
    .action(async (collection, options) => {
        try {
            const cacheService = new CacheService();
            const removed = await cacheService.removeIgnoredCollection(collection);

            if (removed) {
                logger.info(`✅ Removed "${collection}" from ignore list`);
            } else {
                logger.info(`ℹ️  Collection "${collection}" was not found in ignore list`);
            }

        } catch (error) {
            logger.error('Failed to remove collection from ignore list:', error.message);
            process.exit(1);
        }
    });

filterCommand
    .command('list')
    .description('Show ignored collections')
    .option('--debug', 'Enable debug logging')
    .action(async (options) => {
        try {
            const cacheService = new CacheService();
            const ignoredCollections = await cacheService.loadIgnoredCollections();

            if (ignoredCollections.length === 0) {
                logger.info('No collections in ignore list');
                return;
            }

            logger.info(`\\nIgnored Collections (${ignoredCollections.length}):\\n`);

            ignoredCollections.forEach((item, index) => {
                logger.info(`${index + 1}. ${item.collectionSlug}`);
                logger.info(`   Reason: ${item.reason}`);
                logger.info(`   Added: ${new Date(item.addedAt).toLocaleString()}`);
                logger.info('');
            });

        } catch (error) {
            logger.error('Failed to list ignored collections:', error.message);
            process.exit(1);
        }
    });

filterCommand
    .command('clear')
    .description('Clear all ignored collections')
    .option('--debug', 'Enable debug logging')
    .action(async (options) => {
        try {
            const cacheService = new CacheService();
            await cacheService.clearIgnoredCollections();
            logger.info('✅ Cleared all ignored collections');

        } catch (error) {
            logger.error('Failed to clear ignored collections:', error.message);
            process.exit(1);
        }
    });

export default cacheCommand;