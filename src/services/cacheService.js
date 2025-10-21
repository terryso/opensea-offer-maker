import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const DEFAULT_CACHE_EXPIRY_HOURS = 24;
const CACHE_BASE_DIR = '.cache';
const NFTS_DIR = 'nfts';
const FILTERS_DIR = 'filters';

export class CacheService {
  constructor() {
    // Note: Direct process.env access for runtime configurability (deviation from coding standards)
    this.cacheExpiryHours = parseInt(process.env.CACHE_EXPIRY_HOURS || DEFAULT_CACHE_EXPIRY_HOURS);
    this.baseDir = CACHE_BASE_DIR;
    this.nftsDir = path.join(this.baseDir, NFTS_DIR);
    this.filtersDir = path.join(this.baseDir, FILTERS_DIR);
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
     * Get filter file path for chain
     */
  _getFilterFilePath(chain) {
    return path.join(this.filtersDir, `ignored_collections_${chain}.json`);
  }

  /**
     * Get whitelist file path for chain
     */
  _getWhitelistFilePath(chain) {
    return path.join(this.filtersDir, `whitelisted_collections_${chain}.json`);
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
     * Load ignored collections filter for a specific chain
     */
  async loadIgnoredCollections(chain) {
    try {
      await this._ensureDirectories();
      const filterFile = this._getFilterFilePath(chain);
      const content = await fs.readFile(filterFile, 'utf-8');
      const filterData = JSON.parse(content);
      return filterData.ignoredCollections || [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.debug(`Ignored collections file not found for chain ${chain}, returning empty list`);
        return [];
      }
      logger.error(`Failed to load ignored collections for chain ${chain}:`, error);
      // Return empty array on JSON parse error to prevent crashes
      return [];
    }
  }

  /**
     * Save ignored collections filter for a specific chain
     */
  async saveIgnoredCollections(chain, ignoredCollections) {
    try {
      await this._ensureDirectories();
      const filterData = {
        metadata: {
          timestamp: Date.now(),
          version: '1.0',
          chain
        },
        ignoredCollections
      };
      const filterFile = this._getFilterFilePath(chain);
      await fs.writeFile(filterFile, JSON.stringify(filterData, null, 2));
      logger.debug(`Ignored collections saved for chain ${chain}`);
    } catch (error) {
      logger.error(`Failed to save ignored collections for chain ${chain}:`, error);
      throw error;
    }
  }

  /**
     * Add collection to ignore list
     */
  async addIgnoredCollection(chain, collectionSlug, reason = '用户指定：无价值') {
    const ignoredCollections = await this.loadIgnoredCollections(chain);

    // Check if already exists
    const exists = ignoredCollections.find(item => item.collectionSlug === collectionSlug);
    if (exists) {
      logger.info(`Collection ${collectionSlug} is already in ignore list for chain ${chain}`);
      return false;
    }

    ignoredCollections.push({
      collectionSlug,
      reason,
      addedAt: Date.now()
    });

    await this.saveIgnoredCollections(chain, ignoredCollections);
    logger.info(`Added collection ${collectionSlug} to ignore list for chain ${chain}`);
    return true;
  }

  /**
     * Remove collection from ignore list
     */
  async removeIgnoredCollection(chain, collectionSlug) {
    const ignoredCollections = await this.loadIgnoredCollections(chain);
    const initialLength = ignoredCollections.length;

    const filtered = ignoredCollections.filter(item => item.collectionSlug !== collectionSlug);

    if (filtered.length === initialLength) {
      logger.info(`Collection ${collectionSlug} not found in ignore list for chain ${chain}`);
      return false;
    }

    await this.saveIgnoredCollections(chain, filtered);
    logger.info(`Removed collection ${collectionSlug} from ignore list for chain ${chain}`);
    return true;
  }

  /**
     * Clear all ignored collections
     */
  async clearIgnoredCollections(chain) {
    await this.saveIgnoredCollections(chain, []);
    logger.info(`Cleared all ignored collections for chain ${chain}`);
  }

  /**
     * Load whitelisted collections
     */
  async loadWhitelistedCollections(chain) {
    try {
      await this._ensureDirectories();
      const whitelistFile = this._getWhitelistFilePath(chain);
      const content = await fs.readFile(whitelistFile, 'utf-8');
      const whitelistData = JSON.parse(content);
      return whitelistData.whitelistedCollections || [];
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.debug(`Whitelisted collections file not found for chain ${chain}, returning empty list`);
        return [];
      }
      logger.error(`Failed to load whitelisted collections for chain ${chain}:`, error);
      // Return empty array on JSON parse error to prevent crashes
      return [];
    }
  }

  /**
     * Save whitelisted collections
     */
  async saveWhitelistedCollections(chain, whitelistedCollections) {
    try {
      await this._ensureDirectories();
      const whitelistData = {
        metadata: {
          timestamp: Date.now(),
          version: '1.0',
          chain
        },
        whitelistedCollections
      };
      const whitelistFile = this._getWhitelistFilePath(chain);
      await fs.writeFile(whitelistFile, JSON.stringify(whitelistData, null, 2));
      logger.debug(`Whitelisted collections saved for chain ${chain}`);
    } catch (error) {
      logger.error(`Failed to save whitelisted collections for chain ${chain}:`, error);
      throw error;
    }
  }

  /**
     * Add collection to whitelist
     */
  async addWhitelistedCollection(chain, collectionSlug, reason = '用户指定：有价值') {
    const whitelistedCollections = await this.loadWhitelistedCollections(chain);

    // Check if already exists
    const exists = whitelistedCollections.find(item => item.collectionSlug === collectionSlug);
    if (exists) {
      logger.info(`Collection ${collectionSlug} is already in whitelist for chain ${chain}`);
      return false;
    }

    whitelistedCollections.push({
      collectionSlug,
      reason,
      addedAt: Date.now()
    });

    await this.saveWhitelistedCollections(chain, whitelistedCollections);
    logger.info(`Added collection ${collectionSlug} to whitelist for chain ${chain}`);
    return true;
  }

  /**
     * Remove collection from whitelist
     */
  async removeWhitelistedCollection(chain, collectionSlug) {
    const whitelistedCollections = await this.loadWhitelistedCollections(chain);
    const initialLength = whitelistedCollections.length;

    const filtered = whitelistedCollections.filter(item => item.collectionSlug !== collectionSlug);

    if (filtered.length === initialLength) {
      logger.info(`Collection ${collectionSlug} not found in whitelist for chain ${chain}`);
      return false;
    }

    await this.saveWhitelistedCollections(chain, filtered);
    logger.info(`Removed collection ${collectionSlug} from whitelist for chain ${chain}`);
    return true;
  }

  /**
     * Clear all whitelisted collections
     */
  async clearWhitelistedCollections(chain) {
    await this.saveWhitelistedCollections(chain, []);
    logger.info(`Cleared all whitelisted collections for chain ${chain}`);
  }

  /**
     * Filter NFTs by whitelist (if exists) or blacklist
     * Priority: Whitelist > Blacklist
     * - If whitelist is not empty, only keep NFTs in whitelist
     * - If whitelist is empty, filter out NFTs in blacklist
     */
  async _filterNFTs(chain, nfts) {
    const whitelistedCollections = await this.loadWhitelistedCollections(chain);
    const originalCount = nfts.length;
    let filtered;
    let filteredCount;
    let filterType;

    // If whitelist exists and is not empty, use whitelist mode
    if (whitelistedCollections.length > 0) {
      const whitelistedSlugs = new Set(whitelistedCollections.map(item => item.collectionSlug));
      filtered = nfts.filter(nft => whitelistedSlugs.has(nft.collectionSlug));
      filteredCount = originalCount - filtered.length;
      filterType = 'whitelist';

      if (filteredCount > 0) {
        logger.debug(`Filtered out ${filteredCount} NFTs not in whitelist (kept ${filtered.length})`);
      }
    } else {
      // Use blacklist mode when whitelist is empty
      const ignoredCollections = await this.loadIgnoredCollections(chain);
      const ignoredSlugs = new Set(ignoredCollections.map(item => item.collectionSlug));
      filtered = nfts.filter(nft => !ignoredSlugs.has(nft.collectionSlug));
      filteredCount = originalCount - filtered.length;
      filterType = 'blacklist';

      if (filteredCount > 0) {
        logger.debug(`Filtered out ${filteredCount} NFTs from ignored collections`);
      }
    }

    return { filtered, filteredCount, filterType };
  }

  /**
     * Save NFT cache data
     */
  async saveCache(walletAddress, chain, nfts) {
    try {
      await this._ensureDirectories();

      // Filter out ignored collections
      const { filtered: filteredNFTs, filteredCount } = await this._filterNFTs(chain, nfts);

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
