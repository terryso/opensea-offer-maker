/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Create mock functions
const mockFs = {
    mkdir: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    unlink: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn()
};

// Mock fs module
jest.unstable_mockModule('fs/promises', () => ({
    default: mockFs
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn()
    }
}));

const { CacheService } = await import('../services/cacheService.js');

describe('CacheService', () => {
    let cacheService;
    const mockWalletAddress = '0x1234567890123456789012345678901234567890';
    const mockChain = 'ethereum';

    beforeEach(() => {
        jest.clearAllMocks();
        mockFs.mkdir.mockResolvedValue();
        mockFs.writeFile.mockResolvedValue();
        mockFs.readFile.mockResolvedValue();
        mockFs.unlink.mockResolvedValue();
        mockFs.readdir.mockResolvedValue([]);
        mockFs.stat.mockResolvedValue({ size: 1024 });

        cacheService = new CacheService();
    });

    describe('constructor', () => {
        it('should initialize with default cache expiry hours', () => {
            expect(cacheService.cacheExpiryHours).toBe(24);
        });

        it('should use environment variable for cache expiry', () => {
            process.env.CACHE_EXPIRY_HOURS = '48';
            const service = new CacheService();
            expect(service.cacheExpiryHours).toBe(48);
            delete process.env.CACHE_EXPIRY_HOURS;
        });
    });

    describe('_getCacheFilePath', () => {
        it('should return correct cache file path', () => {
            const result = cacheService._getCacheFilePath(mockWalletAddress, mockChain);
            expect(result).toBe('.cache/nfts/0x1234567890123456789012345678901234567890_ethereum.json');
        });
    });

    describe('_isCacheExpired', () => {
        it('should return false for fresh cache', () => {
            const now = Date.now();
            const result = cacheService._isCacheExpired(now);
            expect(result).toBe(false);
        });

        it('should return true for expired cache', () => {
            const yesterday = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
            const result = cacheService._isCacheExpired(yesterday);
            expect(result).toBe(true);
        });

        it('should respect custom cache expiry hours', () => {
            cacheService.cacheExpiryHours = 48;
            const thirtyHoursAgo = Date.now() - (30 * 60 * 60 * 1000);
            const result = cacheService._isCacheExpired(thirtyHoursAgo);
            expect(result).toBe(false); // Should not be expired within 48 hours
        });
    });

    describe('_filterNFTs', () => {
        it('should use whitelist mode when whitelist is not empty', async () => {
            const nfts = [
                { collectionSlug: 'good-collection', name: 'Good NFT' },
                { collectionSlug: 'bad-collection', name: 'Bad NFT' },
                { collectionSlug: 'another-good', name: 'Another Good' }
            ];

            const whitelistData = {
                whitelistedCollections: [
                    { collectionSlug: 'good-collection', reason: 'test', addedAt: Date.now() }
                ]
            };

            // First call for whitelist, second for blacklist (not used)
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(whitelistData));

            const result = await cacheService._filterNFTs(mockChain, nfts);

            expect(result.filtered).toHaveLength(1);
            expect(result.filtered[0].collectionSlug).toBe('good-collection');
            expect(result.filteredCount).toBe(2);
            expect(result.filterType).toBe('whitelist');
        });

        it('should use blacklist mode when whitelist is empty', async () => {
            const nfts = [
                { collectionSlug: 'good-collection', name: 'Good NFT' },
                { collectionSlug: 'bad-collection', name: 'Bad NFT' },
                { collectionSlug: 'another-good', name: 'Another Good' }
            ];

            const filterData = {
                ignoredCollections: [
                    { collectionSlug: 'bad-collection', reason: 'test', addedAt: Date.now() }
                ]
            };

            // First call for whitelist (empty), second for blacklist
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ whitelistedCollections: [] }));
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(filterData));

            const result = await cacheService._filterNFTs(mockChain, nfts);

            expect(result.filtered).toHaveLength(2);
            expect(result.filtered[0].collectionSlug).toBe('good-collection');
            expect(result.filtered[1].collectionSlug).toBe('another-good');
            expect(result.filteredCount).toBe(1);
            expect(result.filterType).toBe('blacklist');
        });

        it('should not filter when no whitelist and no blacklist', async () => {
            const nfts = [
                { collectionSlug: 'collection1', name: 'NFT1' },
                { collectionSlug: 'collection2', name: 'NFT2' }
            ];

            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ whitelistedCollections: [] }));
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ ignoredCollections: [] }));

            const result = await cacheService._filterNFTs(mockChain, nfts);

            expect(result.filtered).toHaveLength(2);
            expect(result.filteredCount).toBe(0);
            expect(result.filterType).toBe('blacklist');
        });

        it('should handle multiple whitelisted collections', async () => {
            const nfts = [
                { collectionSlug: 'good-collection-1', name: 'Good NFT 1' },
                { collectionSlug: 'good-collection-2', name: 'Good NFT 2' },
                { collectionSlug: 'bad-collection', name: 'Bad NFT' }
            ];

            const whitelistData = {
                whitelistedCollections: [
                    { collectionSlug: 'good-collection-1', reason: 'test1', addedAt: Date.now() },
                    { collectionSlug: 'good-collection-2', reason: 'test2', addedAt: Date.now() }
                ]
            };

            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(whitelistData));

            const result = await cacheService._filterNFTs(mockChain, nfts);

            expect(result.filtered).toHaveLength(2);
            expect(result.filtered[0].collectionSlug).toBe('good-collection-1');
            expect(result.filtered[1].collectionSlug).toBe('good-collection-2');
            expect(result.filteredCount).toBe(1);
            expect(result.filterType).toBe('whitelist');
        });

        it('should handle multiple ignored collections in blacklist mode', async () => {
            const nfts = [
                { collectionSlug: 'good-collection', name: 'Good NFT' },
                { collectionSlug: 'bad-collection-1', name: 'Bad NFT 1' },
                { collectionSlug: 'bad-collection-2', name: 'Bad NFT 2' }
            ];

            const filterData = {
                ignoredCollections: [
                    { collectionSlug: 'bad-collection-1', reason: 'test1', addedAt: Date.now() },
                    { collectionSlug: 'bad-collection-2', reason: 'test2', addedAt: Date.now() }
                ]
            };

            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ whitelistedCollections: [] }));
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(filterData));

            const result = await cacheService._filterNFTs(mockChain, nfts);

            expect(result.filtered).toHaveLength(1);
            expect(result.filtered[0].collectionSlug).toBe('good-collection');
            expect(result.filteredCount).toBe(2);
            expect(result.filterType).toBe('blacklist');
        });

        it('should handle no filter file found', async () => {
            const nfts = [
                { collectionSlug: 'collection1', name: 'NFT1' }
            ];

            const error = new Error('File not found');
            error.code = 'ENOENT';
            mockFs.readFile.mockRejectedValue(error);

            const result = await cacheService._filterNFTs(mockChain, nfts);

            expect(result.filtered).toHaveLength(1);
            expect(result.filteredCount).toBe(0);
        });

        it('should handle JSON parse error', async () => {
            const nfts = [
                { collectionSlug: 'collection1', name: 'NFT1' }
            ];

            mockFs.readFile.mockResolvedValue('invalid json');

            const result = await cacheService._filterNFTs(mockChain, nfts);

            expect(result.filtered).toHaveLength(1);
            expect(result.filteredCount).toBe(0);
        });
    });

    describe('loadIgnoredCollections', () => {
        it('should load ignored collections from file', async () => {
            const filterData = {
                ignoredCollections: [
                    { collectionSlug: 'test-collection', reason: 'test', addedAt: Date.now() }
                ]
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(filterData));

            const result = await cacheService.loadIgnoredCollections(mockChain);

            expect(result).toEqual(filterData.ignoredCollections);
            expect(mockFs.readFile).toHaveBeenCalledWith('.cache/filters/ignored_collections_ethereum.json', 'utf-8');
        });

        it('should return empty array when file not found', async () => {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            mockFs.readFile.mockRejectedValue(error);

            const result = await cacheService.loadIgnoredCollections(mockChain);

            expect(result).toEqual([]);
        });

        it('should return empty array on JSON parse error', async () => {
            mockFs.readFile.mockResolvedValue('invalid json');

            const result = await cacheService.loadIgnoredCollections(mockChain);

            expect(result).toEqual([]);
        });

        it('should handle missing ignoredCollections property', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({}));

            const result = await cacheService.loadIgnoredCollections(mockChain);

            expect(result).toEqual([]);
        });
    });

    describe('saveIgnoredCollections', () => {
        it('should save ignored collections to file', async () => {
            const ignoredCollections = [
                { collectionSlug: 'test', reason: 'test reason', addedAt: Date.now() }
            ];

            await cacheService.saveIgnoredCollections(mockChain, ignoredCollections);

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                '.cache/filters/ignored_collections_ethereum.json',
                expect.stringContaining('"ignoredCollections"')
            );
        });

        it('should handle save errors', async () => {
            mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

            await expect(cacheService.saveIgnoredCollections(mockChain, [])).rejects.toThrow('Write failed');
        });
    });

    describe('addIgnoredCollection', () => {
        it('should add new collection to ignore list', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({ ignoredCollections: [] }));

            const result = await cacheService.addIgnoredCollection(mockChain, 'new-collection', 'test reason');

            expect(result).toBe(true);
            expect(mockFs.writeFile).toHaveBeenCalled();
        });

        it('should return false if collection already exists', async () => {
            const existingCollections = [
                { collectionSlug: 'existing-collection', reason: 'test', addedAt: Date.now() }
            ];

            mockFs.readFile.mockResolvedValue(JSON.stringify({ ignoredCollections: existingCollections }));

            const result = await cacheService.addIgnoredCollection(mockChain, 'existing-collection');

            expect(result).toBe(false);
            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });

        it('should use default reason', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({ ignoredCollections: [] }));

            await cacheService.addIgnoredCollection(mockChain, 'test-collection');

            const writeCall = mockFs.writeFile.mock.calls[0][1];
            const data = JSON.parse(writeCall);
            expect(data.ignoredCollections[0].reason).toBe('用户指定：无价值');
        });
    });

    describe('removeIgnoredCollection', () => {
        it('should remove collection from ignore list', async () => {
            const existingCollections = [
                { collectionSlug: 'to-remove', reason: 'test', addedAt: Date.now() },
                { collectionSlug: 'to-keep', reason: 'test', addedAt: Date.now() }
            ];

            mockFs.readFile.mockResolvedValue(JSON.stringify({ ignoredCollections: existingCollections }));

            const result = await cacheService.removeIgnoredCollection(mockChain, 'to-remove');

            expect(result).toBe(true);
            const writeCall = mockFs.writeFile.mock.calls[0][1];
            const data = JSON.parse(writeCall);
            expect(data.ignoredCollections).toHaveLength(1);
            expect(data.ignoredCollections[0].collectionSlug).toBe('to-keep');
        });

        it('should return false if collection not found for removal', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({ ignoredCollections: [] }));

            const result = await cacheService.removeIgnoredCollection(mockChain, 'not-found');

            expect(result).toBe(false);
            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });
    });

    describe('clearIgnoredCollections', () => {
        it('should clear all ignored collections', async () => {
            await cacheService.clearIgnoredCollections(mockChain);

            const writeCall = mockFs.writeFile.mock.calls[0][1];
            const data = JSON.parse(writeCall);
            expect(data.ignoredCollections).toEqual([]);
        });
    });

    describe('loadWhitelistedCollections', () => {
        it('should load whitelisted collections from file', async () => {
            const whitelistData = {
                whitelistedCollections: [
                    { collectionSlug: 'test-collection', reason: 'test', addedAt: Date.now() }
                ]
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(whitelistData));

            const result = await cacheService.loadWhitelistedCollections(mockChain);

            expect(result).toEqual(whitelistData.whitelistedCollections);
            expect(mockFs.readFile).toHaveBeenCalledWith('.cache/filters/whitelisted_collections_ethereum.json', 'utf-8');
        });

        it('should return empty array when file not found', async () => {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            mockFs.readFile.mockRejectedValue(error);

            const result = await cacheService.loadWhitelistedCollections(mockChain);

            expect(result).toEqual([]);
        });

        it('should return empty array on JSON parse error', async () => {
            mockFs.readFile.mockResolvedValue('invalid json');

            const result = await cacheService.loadWhitelistedCollections(mockChain);

            expect(result).toEqual([]);
        });

        it('should handle missing whitelistedCollections property', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({}));

            const result = await cacheService.loadWhitelistedCollections(mockChain);

            expect(result).toEqual([]);
        });
    });

    describe('saveWhitelistedCollections', () => {
        it('should save whitelisted collections to file', async () => {
            const whitelistedCollections = [
                { collectionSlug: 'test', reason: 'test reason', addedAt: Date.now() }
            ];

            await cacheService.saveWhitelistedCollections(mockChain, whitelistedCollections);

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                '.cache/filters/whitelisted_collections_ethereum.json',
                expect.stringContaining('"whitelistedCollections"')
            );
        });

        it('should handle save errors', async () => {
            mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

            await expect(cacheService.saveWhitelistedCollections(mockChain, [])).rejects.toThrow('Write failed');
        });
    });

    describe('addWhitelistedCollection', () => {
        it('should add new collection to whitelist', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({ whitelistedCollections: [] }));

            const result = await cacheService.addWhitelistedCollection(mockChain, 'new-collection', 'test reason');

            expect(result).toBe(true);
            expect(mockFs.writeFile).toHaveBeenCalled();
        });

        it('should return false if collection already exists', async () => {
            const existingCollections = [
                { collectionSlug: 'existing-collection', reason: 'test', addedAt: Date.now() }
            ];

            mockFs.readFile.mockResolvedValue(JSON.stringify({ whitelistedCollections: existingCollections }));

            const result = await cacheService.addWhitelistedCollection(mockChain, 'existing-collection');

            expect(result).toBe(false);
            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });

        it('should use default reason', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({ whitelistedCollections: [] }));

            await cacheService.addWhitelistedCollection(mockChain, 'test-collection');

            const writeCall = mockFs.writeFile.mock.calls[0][1];
            const data = JSON.parse(writeCall);
            expect(data.whitelistedCollections[0].reason).toBe('用户指定：有价值');
        });
    });

    describe('removeWhitelistedCollection', () => {
        it('should remove collection from whitelist', async () => {
            const existingCollections = [
                { collectionSlug: 'to-remove', reason: 'test', addedAt: Date.now() },
                { collectionSlug: 'to-keep', reason: 'test', addedAt: Date.now() }
            ];

            mockFs.readFile.mockResolvedValue(JSON.stringify({ whitelistedCollections: existingCollections }));

            const result = await cacheService.removeWhitelistedCollection(mockChain, 'to-remove');

            expect(result).toBe(true);
            const writeCall = mockFs.writeFile.mock.calls[0][1];
            const data = JSON.parse(writeCall);
            expect(data.whitelistedCollections).toHaveLength(1);
            expect(data.whitelistedCollections[0].collectionSlug).toBe('to-keep');
        });

        it('should return false if collection not found for removal', async () => {
            mockFs.readFile.mockResolvedValue(JSON.stringify({ whitelistedCollections: [] }));

            const result = await cacheService.removeWhitelistedCollection(mockChain, 'not-found');

            expect(result).toBe(false);
            expect(mockFs.writeFile).not.toHaveBeenCalled();
        });
    });

    describe('clearWhitelistedCollections', () => {
        it('should clear all whitelisted collections', async () => {
            await cacheService.clearWhitelistedCollections(mockChain);

            const writeCall = mockFs.writeFile.mock.calls[0][1];
            const data = JSON.parse(writeCall);
            expect(data.whitelistedCollections).toEqual([]);
        });
    });

    describe('saveCache', () => {
        beforeEach(() => {
            // Mock readFile for _filterNFTs (whitelist first, then blacklist)
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ whitelistedCollections: [] }));
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ ignoredCollections: [] }));
        });

        it('should save cache data to file', async () => {
            const nfts = [
                {
                    contract: '0xabc',
                    tokenId: '123',
                    name: 'Test NFT',
                    collection: 'Test Collection',
                    collectionSlug: 'test-collection'
                }
            ];

            const result = await cacheService.saveCache(mockWalletAddress, mockChain, nfts);

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                '.cache/nfts/0x1234567890123456789012345678901234567890_ethereum.json',
                expect.stringContaining('"metadata"')
            );
            expect(result.metadata.walletAddress).toBe(mockWalletAddress);
            expect(result.metadata.chain).toBe(mockChain);
            expect(result.nfts).toHaveLength(1);
        });

        it('should filter NFTs when saving', async () => {
            const nfts = [
                { collectionSlug: 'good-collection', name: 'Good NFT' },
                { collectionSlug: 'bad-collection', name: 'Bad NFT' }
            ];

            const filterData = {
                ignoredCollections: [
                    { collectionSlug: 'bad-collection', reason: 'test', addedAt: Date.now() }
                ]
            };

            // Reset mocks and set up for this specific test
            mockFs.readFile.mockReset();
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ whitelistedCollections: [] }));
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(filterData));

            const result = await cacheService.saveCache(mockWalletAddress, mockChain, nfts);

            expect(result.nfts).toHaveLength(1);
            expect(result.nfts[0].collectionSlug).toBe('good-collection');
            expect(result.metadata.filteredCount).toBe(1);
        });

        it('should handle save errors', async () => {
            mockFs.writeFile.mockRejectedValue(new Error('Write failed'));

            await expect(cacheService.saveCache(mockWalletAddress, mockChain, [])).rejects.toThrow('Write failed');
        });
    });

    describe('loadCache', () => {
        it('should load cache data from file', async () => {
            const cacheData = {
                metadata: {
                    walletAddress: mockWalletAddress,
                    chain: mockChain,
                    timestamp: Date.now(),
                    count: 1,
                    filteredCount: 0
                },
                nfts: [{ contract: '0xabc', tokenId: '123' }]
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(cacheData));

            const result = await cacheService.loadCache(mockWalletAddress, mockChain);

            expect(result).toEqual(cacheData);
            expect(mockFs.readFile).toHaveBeenCalledWith(
                '.cache/nfts/0x1234567890123456789012345678901234567890_ethereum.json',
                'utf-8'
            );
        });

        it('should return null for expired cache', async () => {
            const expiredTimestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
            const cacheData = {
                metadata: { timestamp: expiredTimestamp },
                nfts: []
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(cacheData));

            const result = await cacheService.loadCache(mockWalletAddress, mockChain);

            expect(result).toBeNull();
        });

        it('should return null when file not found', async () => {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            mockFs.readFile.mockRejectedValue(error);

            const result = await cacheService.loadCache(mockWalletAddress, mockChain);

            expect(result).toBeNull();
        });

        it('should return null on JSON parse error', async () => {
            mockFs.readFile.mockResolvedValue('invalid json');

            const result = await cacheService.loadCache(mockWalletAddress, mockChain);

            expect(result).toBeNull();
        });
    });

    describe('clearCache', () => {
        it('should clear cache file successfully', async () => {
            const result = await cacheService.clearCache(mockWalletAddress, mockChain);

            expect(result).toBe(true);
            expect(mockFs.unlink).toHaveBeenCalledWith(
                '.cache/nfts/0x1234567890123456789012345678901234567890_ethereum.json'
            );
        });

        it('should return false when file not found', async () => {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            mockFs.unlink.mockRejectedValue(error);

            const result = await cacheService.clearCache(mockWalletAddress, mockChain);

            expect(result).toBe(false);
        });

        it('should throw on other errors', async () => {
            mockFs.unlink.mockRejectedValue(new Error('Permission denied'));

            await expect(cacheService.clearCache(mockWalletAddress, mockChain)).rejects.toThrow('Permission denied');
        });
    });

    describe('clearAllCache', () => {
        it('should clear all cache files', async () => {
            const files = ['wallet1_ethereum.json', 'wallet2_ethereum.json', 'other.txt'];
            mockFs.readdir.mockResolvedValue(files);

            const result = await cacheService.clearAllCache();

            expect(result).toBe(2); // Only json files
            expect(mockFs.unlink).toHaveBeenCalledTimes(2);
            expect(mockFs.unlink).toHaveBeenCalledWith('.cache/nfts/wallet1_ethereum.json');
            expect(mockFs.unlink).toHaveBeenCalledWith('.cache/nfts/wallet2_ethereum.json');
        });

        it('should handle clear errors', async () => {
            mockFs.readdir.mockRejectedValue(new Error('Read failed'));

            await expect(cacheService.clearAllCache()).rejects.toThrow('Read failed');
        });
    });

    describe('getCacheStatus', () => {
        it('should return cache status for existing cache', async () => {
            const cacheData = {
                metadata: {
                    walletAddress: mockWalletAddress,
                    chain: mockChain,
                    timestamp: Date.now(),
                    count: 5,
                    filteredCount: 2
                },
                nfts: [
                    { contract: '0xabc', tokenId: '123' }
                ]
            };

            mockFs.readFile.mockResolvedValue(JSON.stringify(cacheData));
            mockFs.stat.mockResolvedValue({ size: 2048 });

            const result = await cacheService.getCacheStatus(mockWalletAddress, mockChain);

            expect(result.exists).toBe(true);
            expect(result.count).toBe(5);
            expect(result.filteredCount).toBe(2);
            expect(result.size).toBe(2048);
            expect(result.expired).toBe(false);
        });

        it('should return non-existent status for missing cache', async () => {
            const error = new Error('File not found');
            error.code = 'ENOENT';
            mockFs.readFile.mockRejectedValue(error);

            const result = await cacheService.getCacheStatus(mockWalletAddress, mockChain);

            expect(result.exists).toBe(false);
            expect(result.walletAddress).toBe(mockWalletAddress);
            expect(result.chain).toBe(mockChain);
        });

        it('should handle non-ENOENT errors in loadCache', async () => {
            // Create an error that's not ENOENT to trigger the error logging branch in loadCache
            const error = new Error('Access denied');
            error.code = 'EPERM';
            mockFs.readFile.mockRejectedValue(error);

            const result = await cacheService.getCacheStatus(mockWalletAddress, mockChain);

            expect(result.exists).toBe(false);
            expect(result.walletAddress).toBe(mockWalletAddress);
            expect(result.chain).toBe(mockChain);
            expect(result.error).toBeUndefined(); // This path returns false but no error field
        });
    });

    describe('listAllCaches', () => {
        it('should list all cache files with status', async () => {
            const files = ['wallet1_ethereum.json', 'wallet2_base.json', 'other.txt'];
            mockFs.readdir.mockResolvedValue(files);

            const cacheData = {
                metadata: { timestamp: Date.now(), count: 1, filteredCount: 0 }
            };
            mockFs.readFile.mockResolvedValue(JSON.stringify(cacheData));
            mockFs.stat.mockResolvedValue({ size: 1024 });

            const result = await cacheService.listAllCaches();

            expect(result).toHaveLength(2); // Only json files
            expect(result[0].walletAddress).toBe('wallet1');
            expect(result[0].chain).toBe('ethereum');
            expect(result[1].walletAddress).toBe('wallet2');
            expect(result[1].chain).toBe('base');
        });

        it('should handle list errors', async () => {
            mockFs.readdir.mockRejectedValue(new Error('Read failed'));

            await expect(cacheService.listAllCaches()).rejects.toThrow('Read failed');
        });
    });

    describe('_ensureDirectories', () => {
        it('should create directories successfully', async () => {
            await cacheService._ensureDirectories();

            expect(mockFs.mkdir).toHaveBeenCalledWith('.cache', { recursive: true });
            expect(mockFs.mkdir).toHaveBeenCalledWith('.cache/nfts', { recursive: true });
            expect(mockFs.mkdir).toHaveBeenCalledWith('.cache/filters', { recursive: true });
        });

        it('should handle directory creation errors', async () => {
            mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

            await expect(cacheService._ensureDirectories()).rejects.toThrow('Permission denied');
        });
    });
});