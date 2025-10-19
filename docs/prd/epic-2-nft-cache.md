# Epic 2: NFT Wallet Cache - Brownfield Enhancement

## Epic Goal

Enable users to cache their wallet's NFT holdings locally, allowing them to quickly list NFTs without manually looking up contract addresses and token IDs each time.

## Epic Description

### Existing System Context

**Current relevant functionality:**
- `list` command requires manual input of contract address (`-a`) and token ID (`-t`)
- Users must look up NFT details externally (e.g., OpenSea website) before listing
- OpenSeaApi service already has methods to fetch NFT data from OpenSea API
- No local caching mechanism exists - all data is fetched on-demand

**Technology stack:**
- Node.js ES Modules with ethers.js v6 for blockchain interaction
- Commander.js for CLI command structure
- OpenSeaApi service for OpenSea API integration
- File system (fs/promises) for local data persistence
- Native fetch API with retry logic (3 retries, 1s delay)

**Integration points:**
- New `cache` command will use OpenSeaApi to fetch wallet NFTs
- New CacheService will handle local storage/retrieval of NFT data
- Enhanced `list` command will support interactive NFT selection from cache
- Cache data stored in `.cache/nfts/` directory (gitignored)

### Enhancement Details

**What's being added/changed:**

1. **New CacheService** (`src/services/cacheService.js`)
   - Save/load NFT data to/from local JSON files
   - Cache structure: `.cache/nfts/{walletAddress}_{chain}.json`
   - Collection filter management: `.cache/filters/ignored_collections.json`
   - Cache metadata: timestamp, chain, wallet address
   - Cache validation and expiry checking
   - Collection filtering during cache operations
   - Follows existing service patterns

2. **New Cache Command** (`src/commands/cacheCommand.js`)
   - `cache refresh` - Fetch and cache all NFTs for current wallet
   - `cache list` - Display cached NFTs with contract/tokenId info
   - `cache clear` - Clear cache for current wallet or all wallets
   - `cache status` - Show cache info (count, last updated, size)
   - `cache filter add <collection>` - Add collection to ignore list
   - `cache filter remove <collection>` - Remove collection from ignore list
   - `cache filter list` - Show ignored collections
   - `cache filter clear` - Clear all ignored collections
   - Support chain-specific caching

3. **Enhanced List Command** (`src/commands/listCommand.js`)
   - Add `--interactive` or `-i` flag for interactive NFT selection
   - When used without `-a` and `-t`, show cached NFTs for selection
   - Display NFT name, collection, image thumbnail (if terminal supports)
   - Fallback to manual input if cache is empty or expired
   - Maintain full backward compatibility with existing flags

4. **OpenSeaApi Enhancement** (`src/services/openseaApi.js`)
   - Add `getWalletNFTs(walletAddress)` method
   - Fetch NFTs with pagination support
   - Return structured data: contract, tokenId, name, collection, image

**How it integrates:**
- CacheService is a standalone service, no dependencies on other services
- Cache command uses OpenSeaApi and CacheService
- List command optionally uses CacheService for interactive mode
- Cache files are gitignored, no impact on repository
- No changes to other commands (offer, auto, check, swap, send, key)

**Success criteria:**
- ✅ Users can cache their wallet NFTs with `cache refresh`
- ✅ Cached data persists across CLI sessions
- ✅ List command supports interactive NFT selection from cache
- ✅ Cache automatically invalidates after configurable time (default 24h)
- ✅ Clear error messages when cache is empty or expired
- ✅ Backward compatibility: existing list command usage unchanged
- ✅ Multi-chain support: separate cache per chain
- ✅ Multi-wallet support: separate cache per wallet address
- ✅ Collection filtering: ignore specified worthless collections
- ✅ Filter persistence: ignored collections list persists across sessions
- ✅ Filter management: add/remove/list/clear ignored collections
- ✅ Performance improvement: filtered collections are never cached

## Stories

1. **Story 1: Create CacheService and Cache Command**
   - Implement `src/services/cacheService.js` with save/load/clear methods
   - Create cache directory structure (`.cache/nfts/`, `.cache/filters/`)
   - Implement collection filter management (ignored_collections.json)
   - Implement `src/commands/cacheCommand.js` with subcommands (refresh, list, clear, status, filter)
   - Add cache expiry logic (default 24h, configurable via env var)
   - Add collection filtering logic during cache operations
   - Add unit tests for CacheService including filter functionality
   - Update `.gitignore` to exclude `.cache/` directory

2. **Story 2: Enhance OpenSeaApi for Wallet NFT Fetching**
   - Add `getWalletNFTs(walletAddress, options)` method to OpenSeaApi
   - Implement pagination to fetch all NFTs (handle large collections)
   - Parse and structure NFT data (contract, tokenId, name, collection, image)
   - Integrate collection filtering during API data processing
   - Handle API errors gracefully (rate limits, network issues)
   - Add unit tests with mocked API responses including filter scenarios
   - Document OpenSea API endpoint usage

3. **Story 3: Enhance List Command with Interactive Selection**
   - Add `--interactive` flag to list command
   - Implement NFT selection UI using enquirer (already in dependencies)
   - Display cached NFTs in user-friendly format
   - Auto-populate `-a` and `-t` from selection
   - Handle empty cache scenario (prompt to run `cache refresh`)
   - Maintain full backward compatibility with existing flags
   - Add integration test for interactive flow
   - Update README.md with new usage examples

## Compatibility Requirements

- ✅ Existing list command flags (`-a`, `-t`, `-p`, etc.) remain unchanged
- ✅ No changes to other commands (offer, auto, check, swap, send, key)
- ✅ Cache is optional - users can continue using manual input
- ✅ No database or external dependencies added
- ✅ Cache files are local and gitignored
- ✅ Performance: Cache operations are fast (local file I/O)
- ✅ OpenSeaApi changes are additive (new method only)

## Risk Mitigation

**Primary Risk:** OpenSea API rate limits or changes break cache refresh

**Mitigation:**
- Implement exponential backoff for rate limit errors
- Cache data structure is flexible (JSON) - easy to adapt to API changes
- Graceful degradation: if cache fails, fall back to manual input
- Document OpenSea API dependency and rate limits
- Add retry logic following existing patterns (3 retries, 1s delay)

**Rollback Plan:**
- Git revert to restore original list command
- Cache is optional feature - removal has no impact on core functionality
- Delete `.cache/` directory to remove all cached data
- No migrations needed (cache is ephemeral data)

**Additional Risks:**
- **Large NFT collections:** Mitigate with pagination and progress indicators
- **Cache corruption:** Validate JSON structure on load, clear if invalid
- **Disk space:** Cache size is minimal (JSON text), add size limits if needed
- **Multi-wallet confusion:** Clear cache naming per wallet/chain prevents conflicts

## Definition of Done

- ✅ All stories completed with acceptance criteria met
- ✅ Cache command supports refresh, list, clear, status, filter operations
- ✅ Collection filtering system implemented and functional
- ✅ Filter persistence across CLI sessions verified
- ✅ List command supports interactive NFT selection
- ✅ Backward compatibility verified: existing list usage unchanged
- ✅ Unit tests added for CacheService and OpenSeaApi methods (>80% coverage)
- ✅ Integration test covers cache refresh → interactive list flow
- ✅ Filter functionality thoroughly tested (add, remove, list, clear)
- ✅ Performance improvement verified: filtered collections excluded from cache
- ✅ No regression in other commands (run full test suite)
- ✅ README and documentation updated with cache and filter examples
- ✅ Code review confirms pattern consistency
- ✅ Manual testing on testnet (Sepolia) successful
- ✅ Cache expiry and validation working correctly

---

## Validation Checklist ✅

**Scope Validation:**
- ✅ Epic can be completed in 3 stories maximum
- ✅ No architectural changes required (follows existing service pattern)
- ✅ Enhancement follows existing patterns (service + command)
- ✅ Integration complexity is manageable (isolated to cache and list features)

**Risk Assessment:**
- ✅ Risk to existing system is low (cache is optional, list command backward compatible)
- ✅ Rollback plan is feasible (git revert, delete cache directory)
- ✅ Testing approach covers existing functionality (full test suite)
- ✅ Team has sufficient knowledge (same patterns as OpenSeaApi/ReservoirApi)

**Completeness Check:**
- ✅ Epic goal is clear and achievable
- ✅ Stories are properly scoped (service → API enhancement → command enhancement)
- ✅ Success criteria are measurable
- ✅ Dependencies identified (OpenSea API for wallet NFT fetching)

## OpenSea API Research

Based on OpenSea API v2 documentation, the following endpoint will be used:

- **Get NFTs by Account**: `GET /api/v2/chain/{chain}/account/{address}/nfts`
  - Returns all NFTs owned by a specific wallet address
  - Supports pagination via `next` cursor
  - Response includes: contract address, token ID, name, collection, metadata, image URL
  - Rate limit: Standard API rate limits apply (requires API key)
  - Chain-specific: Must specify chain in URL path

**Example Response Structure:**
```json
{
  "nfts": [
    {
      "identifier": "123",
      "collection": "collection-slug",
      "contract": "0x...",
      "token_standard": "erc721",
      "name": "NFT Name",
      "description": "...",
      "image_url": "https://...",
      "metadata_url": "https://..."
    }
  ],
  "next": "cursor-for-next-page"
}
```

**Cache Data Structure:**
```json
{
  "metadata": {
    "walletAddress": "0x...",
    "chain": "ethereum",
    "timestamp": 1234567890,
    "count": 50,
    "filteredCount": 15
  },
  "nfts": [
    {
      "contract": "0x...",
      "tokenId": "123",
      "name": "NFT Name",
      "collection": "Collection Name",
      "collectionSlug": "collection-slug",
      "imageUrl": "https://...",
      "tokenStandard": "erc721"
    }
  ]
}
```

**Collection Filter Data Structure:**
```json
{
  "metadata": {
    "timestamp": 1234567890,
    "version": "1.0"
  },
  "ignoredCollections": [
    {
      "collectionSlug": "worthless-collection-1",
      "reason": "用户指定：无价值",
      "addedAt": 1234567890
    },
    {
      "collectionSlug": "spam-collection",
      "reason": "垃圾合集",
      "addedAt": 1234567890
    }
  ]
}
```
