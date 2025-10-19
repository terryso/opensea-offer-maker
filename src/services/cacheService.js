import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const DEFAULT_CACHE_EXPIRY_HOURS = 24;
const CACHE_BASE_DIR = '.cache';
const NFTS_DIR = 'nfts';
const FILTERS_DIR = 'filters';
const FILTER_FILE = 'ignored_collections.json';

export class CacheService {
    constructor() {
        // Note: Direct process.env access for runtime configurability (deviation from coding standards)
        this.cacheExpiryHours = parseInt(process.env.CACHE_EXPIRY_HOURS || DEFAULT_CACHE_EXPIRY_HOURS);
        this.baseDir = CACHE_BASE_DIR;
        this.nftsDir = path.join(this.baseDir, NFTS_DIR);
        this.filtersDir = path.join(this.baseDir, FILTERS_DIR);
        this.filterFile = path.join(this.filtersDir, FILTER_FILE);
    }

    /**
     * Ensure cache directories exist
     */
    async _ensureDirectories() {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
            await fs.mkdir(this.nftsDir, { recursive: true });
            await fs.mkdir(this.filtersDir, { recursive: true });
            logger.debug('Cache directories created/verified');
        } catch (error) {
            logger.error('Failed to create cache directories:', error);
            throw error;
        }
    }

    /**
     * Get cache file path for wallet and chain
     */
    _getCacheFilePath(walletAddress, chain) {
        return path.join(this.nftsDir, `${walletAddress}_${chain}.json`);
    }

    /**
     * Check if cache is expired
     */
    _isCacheExpired(timestamp) {
        const now = Date.now();
        const expiryTime = timestamp + (this.cacheExpiryHours * 60 * 60 * 1000);
        return now > expiryTime;
    }

    /**
     * Load ignored collections filter
     */
    async loadIgnoredCollections() {
        try {
            await this._ensureDirectories();
            const content = await fs.readFile(this.filterFile, 'utf-8');
            const filterData = JSON.parse(content);
            return filterData.ignoredCollections || [];
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.debug('Ignored collections file not found, returning empty list');
                return [];
            }
            logger.error('Failed to load ignored collections:', error);
            // Return empty array on JSON parse error to prevent crashes
            return [];
        }
    }

    /**
     * Save ignored collections filter
     */
    async saveIgnoredCollections(ignoredCollections) {
        try {
            await this._ensureDirectories();
            const filterData = {
                metadata: {
                    timestamp: Date.now(),
                    version: "1.0"
                },
                ignoredCollections
            };
            await fs.writeFile(this.filterFile, JSON.stringify(filterData, null, 2));
            logger.debug('Ignored collections saved');
        } catch (error) {
            logger.error('Failed to save ignored collections:', error);
            throw error;
        }
    }

    /**
     * Add collection to ignore list
     */
    async addIgnoredCollection(collectionSlug, reason = '用户指定：无价值') {
        const ignoredCollections = await this.loadIgnoredCollections();

        // Check if already exists
        const exists = ignoredCollections.find(item => item.collectionSlug === collectionSlug);
        if (exists) {
            logger.info(`Collection ${collectionSlug} is already in ignore list`);
            return false;
        }

        ignoredCollections.push({
            collectionSlug,
            reason,
            addedAt: Date.now()
        });

        await this.saveIgnoredCollections(ignoredCollections);
        logger.info(`Added collection ${collectionSlug} to ignore list`);
        return true;
    }

    /**
     * Remove collection from ignore list
     */
    async removeIgnoredCollection(collectionSlug) {
        const ignoredCollections = await this.loadIgnoredCollections();
        const initialLength = ignoredCollections.length;

        const filtered = ignoredCollections.filter(item => item.collectionSlug !== collectionSlug);

        if (filtered.length === initialLength) {
            logger.info(`Collection ${collectionSlug} not found in ignore list`);
            return false;
        }

        await this.saveIgnoredCollections(filtered);
        logger.info(`Removed collection ${collectionSlug} from ignore list`);
        return true;
    }

    /**
     * Clear all ignored collections
     */
    async clearIgnoredCollections() {
        await this.saveIgnoredCollections([]);
        logger.info('Cleared all ignored collections');
    }

    /**
     * Filter NFTs by removing ignored collections
     */
    async _filterNFTs(nfts) {
        const ignoredCollections = await this.loadIgnoredCollections();
        const ignoredSlugs = new Set(ignoredCollections.map(item => item.collectionSlug));

        const originalCount = nfts.length;
        const filtered = nfts.filter(nft => !ignoredSlugs.has(nft.collectionSlug));
        const filteredCount = originalCount - filtered.length;

        if (filteredCount > 0) {
            logger.debug(`Filtered out ${filteredCount} NFTs from ignored collections`);
        }

        return { filtered, filteredCount };
    }

    /**
     * Save NFT cache data
     */
    async saveCache(walletAddress, chain, nfts) {
        try {
            await this._ensureDirectories();

            // Filter out ignored collections
            const { filtered: filteredNFTs, filteredCount } = await this._filterNFTs(nfts);

            const cacheData = {
                metadata: {
                    walletAddress,
                    chain,
                    timestamp: Date.now(),
                    count: filteredNFTs.length,
                    filteredCount
                },
                nfts: filteredNFTs
            };

            const filePath = this._getCacheFilePath(walletAddress, chain);
            await fs.writeFile(filePath, JSON.stringify(cacheData, null, 2));

            logger.info(`Cached ${filteredNFTs.length} NFTs for ${walletAddress} on ${chain} (filtered ${filteredCount})`);
            return cacheData;
        } catch (error) {
            logger.error('Failed to save cache:', error);
            throw error;
        }
    }

    /**
     * Load NFT cache data
     */
    async loadCache(walletAddress, chain) {
        try {
            const filePath = this._getCacheFilePath(walletAddress, chain);
            const content = await fs.readFile(filePath, 'utf-8');
            const cacheData = JSON.parse(content);

            // Check if cache is expired
            if (this._isCacheExpired(cacheData.metadata.timestamp)) {
                logger.debug('Cache expired for', walletAddress, 'on', chain);
                return null;
            }

            logger.debug(`Loaded ${cacheData.nfts.length} NFTs from cache for ${walletAddress} on ${chain}`);
            return cacheData;
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.debug('Cache file not found for', walletAddress, 'on', chain);
                return null;
            }
            logger.error('Failed to load cache:', error);
            // Return null on JSON parse error to trigger refresh
            return null;
        }
    }

    /**
     * Clear cache for specific wallet and chain
     */
    async clearCache(walletAddress, chain) {
        try {
            const filePath = this._getCacheFilePath(walletAddress, chain);
            await fs.unlink(filePath);
            logger.info(`Cleared cache for ${walletAddress} on ${chain}`);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                logger.debug('Cache file not found for', walletAddress, 'on', chain);
                return false;
            }
            logger.error('Failed to clear cache:', error);
            throw error;
        }
    }

    /**
     * Clear all cache files
     */
    async clearAllCache() {
        try {
            await this._ensureDirectories();
            const files = await fs.readdir(this.nftsDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            for (const file of jsonFiles) {
                await fs.unlink(path.join(this.nftsDir, file));
            }

            logger.info(`Cleared ${jsonFiles.length} cache files`);
            return jsonFiles.length;
        } catch (error) {
            logger.error('Failed to clear all cache:', error);
            throw error;
        }
    }

    /**
     * Get cache status information
     */
    async getCacheStatus(walletAddress, chain) {
        try {
            const cacheData = await this.loadCache(walletAddress, chain);
            if (!cacheData) {
                return {
                    exists: false,
                    walletAddress,
                    chain
                };
            }

            const filePath = this._getCacheFilePath(walletAddress, chain);
            const stats = await fs.stat(filePath);

            return {
                exists: true,
                walletAddress,
                chain,
                count: cacheData.metadata.count,
                filteredCount: cacheData.metadata.filteredCount || 0,
                lastUpdated: new Date(cacheData.metadata.timestamp).toISOString(),
                size: stats.size,
                expired: this._isCacheExpired(cacheData.metadata.timestamp)
            };
        } catch (error) {
            logger.error('Failed to get cache status:', error);
            return {
                exists: false,
                walletAddress,
                chain,
                error: error.message
            };
        }
    }

    /**
     * List all cache files with status
     */
    async listAllCaches() {
        try {
            await this._ensureDirectories();
            const files = await fs.readdir(this.nftsDir);
            const jsonFiles = files.filter(file => file.endsWith('.json'));

            const caches = [];
            for (const file of jsonFiles) {
                const match = file.match(/^(.+)_(.+)\.json$/);
                if (match) {
                    const [, walletAddress, chain] = match;
                    const status = await this.getCacheStatus(walletAddress, chain);
                    caches.push(status);
                }
            }

            return caches;
        } catch (error) {
            logger.error('Failed to list caches:', error);
            throw error;
        }
    }
}

export default CacheService;