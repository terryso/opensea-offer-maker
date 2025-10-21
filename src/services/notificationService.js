import { formatUnits } from 'ethers';
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * NotificationService - Formats and logs NFT events to console and local files
 *
 * Provides event formatting, display, and persistent logging capabilities for
 * real-time NFT monitoring. Events are logged to JSONL files for history review.
 *
 * Environment Variables:
 * - MONITOR_VERBOSITY (optional) - Event display verbosity: minimal, normal, detailed (default: normal)
 * - MONITOR_LOG_RETENTION_DAYS (optional) - Number of days to keep event logs (default: 30)
 *
 * Event Types Supported:
 * - item_sold - NFT sale events
 * - item_transferred - NFT transfer events
 * - item_listed - NFT listing events
 * - item_received_bid - NFT bid/offer events
 * - item_cancelled - Order cancellation events
 *
 * Verbosity Levels:
 * - minimal: Single line per event (e.g., "[SALE] NFT Name #123 sold for 1.5 ETH")
 * - normal: Multi-line with key details (default)
 * - detailed: All available information including timestamps and full addresses
 *
 * Usage Example:
 * const service = new NotificationService({ verbosity: 'normal' });
 * const formatted = service.formatEvent(event);
 * service.displayEvent(event);
 * await service.logEvent(event, walletAddress, chain);
 * const history = await service.queryEvents(walletAddress, chain, { eventType: 'item_sold' });
 */
export class NotificationService {
  /**
     * Supported event types
     */
  static EventTypes = {
    ITEM_SOLD: 'item_sold',
    ITEM_TRANSFERRED: 'item_transferred',
    ITEM_LISTED: 'item_listed',
    ITEM_RECEIVED_BID: 'item_received_bid',
    ITEM_CANCELLED: 'item_cancelled'
  };

  /**
     * Verbosity levels
     */
  static VerbosityLevels = {
    MINIMAL: 'minimal',
    NORMAL: 'normal',
    DETAILED: 'detailed'
  };

  /**
     * Create a new NotificationService instance
     * @param {Object} config - Configuration options
     * @param {string} config.verbosity - Display verbosity level: minimal, normal, detailed (default: normal)
     * @param {number} config.retentionDays - Number of days to keep event logs (default: 30)
     * @param {string} config.cacheDir - Directory for event logs (default: .cache/events)
     */
  constructor(config = {}) {
    this.verbosity = config.verbosity || process.env.MONITOR_VERBOSITY || NotificationService.VerbosityLevels.NORMAL;
    this.retentionDays = config.retentionDays || parseInt(process.env.MONITOR_LOG_RETENTION_DAYS || '30', 10);
    this.cacheDir = config.cacheDir || '.cache/events';

    logger.debug('NotificationService initialized:', {
      verbosity: this.verbosity,
      retentionDays: this.retentionDays,
      cacheDir: this.cacheDir
    });
  }

  /**
     * Format an event for display based on its type
     * @param {Object} event - The event object from OpenSea Stream API
     * @returns {string} Formatted event string
     */
  formatEvent(event) {
    if (!event || !event.event_type) {
      logger.error('Invalid event object:', event);
      return '[ERROR] Invalid event';
    }

    switch (event.event_type) {
    case NotificationService.EventTypes.ITEM_SOLD:
      return this.formatSaleEvent(event);
    case NotificationService.EventTypes.ITEM_TRANSFERRED:
      return this.formatTransferEvent(event);
    case NotificationService.EventTypes.ITEM_LISTED:
      return this.formatListingEvent(event);
    case NotificationService.EventTypes.ITEM_RECEIVED_BID:
      return this.formatBidEvent(event);
    case NotificationService.EventTypes.ITEM_CANCELLED:
      return this.formatCancelEvent(event);
    default:
      logger.debug('Unknown event type:', event.event_type);
      return `[${event.event_type.toUpperCase()}] Event received`;
    }
  }

  /**
     * Format a sale event
     * @param {Object} event - The sale event
     * @returns {string} Formatted sale event string
     */
  formatSaleEvent(event) {
    const { payload } = event;
    const nftName = payload?.item?.metadata?.name || 'Unknown NFT';
    const nftId = this._extractTokenId(payload?.item?.nft_id);
    const collectionName = payload?.collection?.name || payload?.collection?.slug || 'Unknown Collection';
    const priceWei = payload?.sale_price || '0';
    const currency = payload?.currency || 'ETH';
    const price = formatUnits(priceWei, 18);
    const chain = event.chain || 'ethereum';
    const seller = payload?.from_account?.address || 'Unknown';
    const buyer = payload?.to_account?.address || 'Unknown';

    if (this.verbosity === NotificationService.VerbosityLevels.MINIMAL) {
      return `[SALE] ${nftName} #${nftId} sold for ${price} ${currency}`;
    }

    if (this.verbosity === NotificationService.VerbosityLevels.DETAILED) {
      const timestamp = event.event_timestamp || new Date().toISOString();
      const contract = this._extractContract(payload?.item?.nft_id);
      return `${'═'.repeat(50)}
[SALE] ${event.event_type} on ${this._formatChain(chain)}
Time: ${timestamp}
Collection: ${payload?.collection?.slug || 'N/A'} (${collectionName})
NFT: ${nftName} #${nftId}
Contract: ${contract || 'N/A'}
Token ID: ${nftId}
Price: ${price} ${currency} (${priceWei} wei)
Seller: ${seller}
Buyer: ${buyer}
${'═'.repeat(50)}`;
    }

    // Normal verbosity (default)
    return `[SALE] Collection: ${collectionName} (${this._formatChain(chain)})
NFT: ${nftName} #${nftId}
Price: ${price} ${currency}
From: ${this._truncateAddress(seller)} → To: ${this._truncateAddress(buyer)}`;
  }

  /**
     * Format a transfer event
     * @param {Object} event - The transfer event
     * @returns {string} Formatted transfer event string
     */
  formatTransferEvent(event) {
    const { payload } = event;
    const nftName = payload?.item?.metadata?.name || 'Unknown NFT';
    const nftId = this._extractTokenId(payload?.item?.nft_id);
    const collectionName = payload?.collection?.name || payload?.collection?.slug || 'Unknown Collection';
    const fromAddress = payload?.from_account?.address || 'Unknown';
    const toAddress = payload?.to_account?.address || 'Unknown';

    if (this.verbosity === NotificationService.VerbosityLevels.MINIMAL) {
      return `[TRANSFER] ${nftName} #${nftId} transferred`;
    }

    if (this.verbosity === NotificationService.VerbosityLevels.DETAILED) {
      const timestamp = event.event_timestamp || new Date().toISOString();
      const contract = this._extractContract(payload?.item?.nft_id);
      return `${'═'.repeat(50)}
[TRANSFER] ${event.event_type}
Time: ${timestamp}
Collection: ${payload?.collection?.slug || 'N/A'} (${collectionName})
NFT: ${nftName} #${nftId}
Contract: ${contract || 'N/A'}
Token ID: ${nftId}
From: ${fromAddress}
To: ${toAddress}
${'═'.repeat(50)}`;
    }

    // Normal verbosity (default)
    return `[TRANSFER] Collection: ${collectionName}
NFT: ${nftName} #${nftId}
From: ${this._truncateAddress(fromAddress)} → To: ${this._truncateAddress(toAddress)}`;
  }

  /**
     * Format a listing event
     * @param {Object} event - The listing event
     * @returns {string} Formatted listing event string
     */
  formatListingEvent(event) {
    const { payload } = event;
    const nftName = payload?.item?.metadata?.name || 'Unknown NFT';
    const nftId = this._extractTokenId(payload?.item?.nft_id);
    const collectionName = payload?.collection?.name || payload?.collection?.slug || 'Unknown Collection';
    const priceWei = payload?.base_price || payload?.listing_price || '0';
    const currency = payload?.currency || 'ETH';
    const price = formatUnits(priceWei, 18);
    const chain = event.chain || 'ethereum';
    const maker = payload?.maker?.address || payload?.from_account?.address || 'Unknown';

    if (this.verbosity === NotificationService.VerbosityLevels.MINIMAL) {
      return `[LISTING] ${nftName} #${nftId} listed for ${price} ${currency}`;
    }

    if (this.verbosity === NotificationService.VerbosityLevels.DETAILED) {
      const timestamp = event.event_timestamp || new Date().toISOString();
      const contract = this._extractContract(payload?.item?.nft_id);
      return `${'═'.repeat(50)}
[LISTING] ${event.event_type} on ${this._formatChain(chain)}
Time: ${timestamp}
Collection: ${payload?.collection?.slug || 'N/A'} (${collectionName})
NFT: ${nftName} #${nftId}
Contract: ${contract || 'N/A'}
Token ID: ${nftId}
Listing Price: ${price} ${currency} (${priceWei} wei)
Seller: ${maker}
${'═'.repeat(50)}`;
    }

    // Normal verbosity (default)
    return `[LISTING] Collection: ${collectionName} (${this._formatChain(chain)})
NFT: ${nftName} #${nftId}
Price: ${price} ${currency}
Seller: ${this._truncateAddress(maker)}`;
  }

  /**
     * Format a bid event
     * @param {Object} event - The bid event
     * @returns {string} Formatted bid event string
     */
  formatBidEvent(event) {
    const { payload } = event;
    const isCollectionOffer = payload?.is_collection_offer;
    const collectionName = payload?.collection?.name || payload?.collection?.slug || 'Unknown Collection';
    const priceWei = payload?.base_price || payload?.bid_amount || '0';
    const currency = payload?.currency || 'ETH';
    const price = formatUnits(priceWei, 18);
    const chain = event.chain || 'ethereum';
    const bidder = payload?.maker?.address || payload?.from_account?.address || 'Unknown';

    if (this.verbosity === NotificationService.VerbosityLevels.MINIMAL) {
      const target = isCollectionOffer ? `${collectionName} collection` : `${payload?.item?.metadata?.name || 'NFT'} #${this._extractTokenId(payload?.item?.nft_id)}`;
      return `[BID] ${target} received bid of ${price} ${currency}`;
    }

    if (this.verbosity === NotificationService.VerbosityLevels.DETAILED) {
      const timestamp = event.event_timestamp || new Date().toISOString();
      const contract = this._extractContract(payload?.item?.nft_id);
      return `${'═'.repeat(50)}
[BID] ${event.event_type} on ${this._formatChain(chain)}
Time: ${timestamp}
Collection: ${payload?.collection?.slug || 'N/A'} (${collectionName})
${isCollectionOffer ? 'Collection-level offer' : `NFT: ${payload?.item?.metadata?.name || 'Unknown NFT'} #${this._extractTokenId(payload?.item?.nft_id)}`}
${isCollectionOffer ? '' : `Contract: ${contract || 'N/A'}
Token ID: ${this._extractTokenId(payload?.item?.nft_id)}`}
Bid Amount: ${price} ${currency} (${priceWei} wei)
Bidder: ${bidder}
${'═'.repeat(50)}`;
    }

    // Normal verbosity (default)
    if (isCollectionOffer) {
      return `[BID] Collection: ${collectionName} (${this._formatChain(chain)})
Type: Collection-level offer
Bid: ${price} ${currency}
Bidder: ${this._truncateAddress(bidder)}`;
    } else {
      const nftName = payload?.item?.metadata?.name || 'Unknown NFT';
      const nftId = this._extractTokenId(payload?.item?.nft_id);
      return `[BID] Collection: ${collectionName} (${this._formatChain(chain)})
NFT: ${nftName} #${nftId}
Bid: ${price} ${currency}
Bidder: ${this._truncateAddress(bidder)}`;
    }
  }

  /**
     * Format a cancellation event
     * @param {Object} event - The cancellation event
     * @returns {string} Formatted cancellation event string
     */
  formatCancelEvent(event) {
    const { payload } = event;
    const nftName = payload?.item?.metadata?.name || 'Unknown NFT';
    const nftId = this._extractTokenId(payload?.item?.nft_id);
    const collectionName = payload?.collection?.name || payload?.collection?.slug || 'Unknown Collection';
    const maker = payload?.maker?.address || payload?.from_account?.address || 'Unknown';

    if (this.verbosity === NotificationService.VerbosityLevels.MINIMAL) {
      return `[CANCEL] ${nftName} #${nftId} listing/bid cancelled`;
    }

    if (this.verbosity === NotificationService.VerbosityLevels.DETAILED) {
      const timestamp = event.event_timestamp || new Date().toISOString();
      const contract = this._extractContract(payload?.item?.nft_id);
      return `${'═'.repeat(50)}
[CANCEL] ${event.event_type}
Time: ${timestamp}
Collection: ${payload?.collection?.slug || 'N/A'} (${collectionName})
NFT: ${nftName} #${nftId}
Contract: ${contract || 'N/A'}
Token ID: ${nftId}
Cancelled By: ${maker}
${'═'.repeat(50)}`;
    }

    // Normal verbosity (default)
    return `[CANCEL] Collection: ${collectionName}
NFT: ${nftName} #${nftId}
Cancelled By: ${this._truncateAddress(maker)}`;
  }

  /**
     * Display an event to the console using logger
     * @param {Object} event - The event object from OpenSea Stream API
     */
  displayEvent(event) {
    const formatted = this.formatEvent(event);
    // Add visual separator for better readability
    logger.info('\n' + '─'.repeat(60));
    logger.info(formatted);
    logger.info('─'.repeat(60) + '\n');
  }

  /**
     * Log an event to a JSONL file
     * @param {Object} event - The event object from OpenSea Stream API
     * @param {string} walletAddress - The wallet address being monitored
     * @param {string} chain - The blockchain chain (e.g., 'ethereum', 'base')
     */
  async logEvent(event, walletAddress, chain) {
    try {
      // Ensure directory exists
      await mkdir(this.cacheDir, { recursive: true });

      // Transform event to standardized log format
      const logEntry = this._transformEventToLogFormat(event, walletAddress, chain);

      // Format file path
      const filePath = path.join(
        this.cacheDir,
        `${walletAddress.toLowerCase()}_${chain.toLowerCase()}.jsonl`
      );

      // Append event as single JSON line
      await writeFile(filePath, JSON.stringify(logEntry) + '\n', { flag: 'a' });

      logger.debug('Event logged:', filePath);
    } catch (error) {
      logger.error('Failed to log event:', error.message);
      // Don't throw - logging failure shouldn't crash monitoring
    }
  }

  /**
     * Query events from history logs
     * @param {string} walletAddress - The wallet address
     * @param {string} chain - The blockchain chain
     * @param {Object} filters - Filter options
     * @param {string} filters.eventType - Filter by event type
     * @param {Date|string} filters.startDate - Filter by start date
     * @param {Date|string} filters.endDate - Filter by end date
     * @param {string} filters.nftContract - Filter by NFT contract address
     * @param {string} filters.tokenId - Filter by token ID
     * @param {number} filters.limit - Limit number of results
     * @param {number} filters.offset - Offset for pagination
     * @returns {Promise<Array>} Array of matching events sorted by timestamp (newest first)
     */
  async queryEvents(walletAddress, chain, filters = {}) {
    try {
      const filePath = path.join(
        this.cacheDir,
        `${walletAddress.toLowerCase()}_${chain.toLowerCase()}.jsonl`
      );

      // Read file
      const fileContent = await readFile(filePath, 'utf-8');
      const lines = fileContent.trim().split('\n').filter(line => line.length > 0);

      // Parse and filter events
      const events = [];
      for (const line of lines) {
        try {
          const event = JSON.parse(line);

          // Apply filters
          if (filters.eventType && event.eventType !== filters.eventType) {
            continue;
          }

          if (filters.startDate) {
            const eventDate = new Date(event.timestamp);
            const startDate = new Date(filters.startDate);
            if (eventDate < startDate) {
              continue;
            }
          }

          if (filters.endDate) {
            const eventDate = new Date(event.timestamp);
            const endDate = new Date(filters.endDate);
            if (eventDate > endDate) {
              continue;
            }
          }

          if (filters.nftContract && event.nft?.contract?.toLowerCase() !== filters.nftContract.toLowerCase()) {
            continue;
          }

          if (filters.tokenId && event.nft?.tokenId !== filters.tokenId) {
            continue;
          }

          events.push(event);
        } catch (parseError) {
          logger.error('Malformed JSON line in event log:', parseError.message);
          // Skip malformed lines and continue
        }
      }

      // Sort by timestamp (newest first)
      events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      // Apply pagination
      const offset = filters.offset || 0;
      const limit = filters.limit || events.length;
      return events.slice(offset, offset + limit);

    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist - return empty array
        logger.debug('Event log file not found:', walletAddress, chain);
        return [];
      }
      logger.error('Failed to query events:', error.message);
      return [];
    }
  }

  /**
     * Rotate old event logs based on retention period
     */
  async rotateOldLogs() {
    try {
      // Ensure directory exists
      await mkdir(this.cacheDir, { recursive: true });

      // Read all files in cache directory
      const files = await readdir(this.cacheDir);
      const retentionMs = this.retentionDays * 24 * 60 * 60 * 1000;
      const cutoffDate = new Date(Date.now() - retentionMs);

      for (const file of files) {
        if (!file.endsWith('.jsonl')) {
          continue;
        }

        const filePath = path.join(this.cacheDir, file);

        try {
          // Read file and parse events
          const fileContent = await readFile(filePath, 'utf-8');
          const lines = fileContent.trim().split('\n').filter(line => line.length > 0);

          let hasOldEvents = false;
          let allEventsOld = true;

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              const eventDate = new Date(event.timestamp);

              if (eventDate < cutoffDate) {
                hasOldEvents = true;
              } else {
                allEventsOld = false;
              }
            } catch (parseError) {
              logger.error('Malformed JSON in log rotation:', parseError.message);
            }
          }

          // If all events are old, delete the entire file
          if (allEventsOld && lines.length > 0) {
            await unlink(filePath);
            logger.debug('Deleted old event log file:', file);
          } else if (hasOldEvents) {
            // Trim old events from file (keep only recent ones)
            const recentLines = [];
            for (const line of lines) {
              try {
                const event = JSON.parse(line);
                const eventDate = new Date(event.timestamp);
                if (eventDate >= cutoffDate) {
                  recentLines.push(line);
                }
              } catch (parseError) {
                // Keep malformed lines for manual review
                recentLines.push(line);
              }
            }

            if (recentLines.length > 0) {
              await writeFile(filePath, recentLines.join('\n') + '\n', { flag: 'w' });
              logger.debug('Trimmed old events from log file:', file);
            } else {
              await unlink(filePath);
              logger.debug('Deleted empty log file after trimming:', file);
            }
          }
        } catch (fileError) {
          logger.error('Failed to process log file during rotation:', file, fileError.message);
        }
      }

      logger.debug('Log rotation completed');
    } catch (error) {
      logger.error('Failed to rotate old logs:', error.message);
      // Don't throw - rotation failure shouldn't crash service
    }
  }

  /**
     * Transform OpenSea Stream event to standardized log format
     * @private
     * @param {Object} event - The OpenSea Stream event
     * @param {string} walletAddress - The wallet address being monitored
     * @param {string} chain - The blockchain chain
     * @returns {Object} Standardized log entry
     */
  _transformEventToLogFormat(event, walletAddress, chain) {
    const { payload } = event;
    const nftId = payload?.item?.nft_id || '';
    const contract = this._extractContract(nftId);
    const tokenId = this._extractTokenId(nftId);

    const logEntry = {
      eventType: event.event_type,
      timestamp: event.event_timestamp || new Date().toISOString(),
      chain: chain.toLowerCase(),
      nft: {
        contract: contract || 'N/A',
        tokenId: tokenId || 'N/A',
        name: payload?.item?.metadata?.name || 'Unknown NFT',
        collectionSlug: payload?.collection?.slug || 'N/A'
      },
      relevantToWallet: walletAddress.toLowerCase(),
      raw: event
    };

    // Add event-specific fields
    if (event.event_type === NotificationService.EventTypes.ITEM_SOLD) {
      const priceWei = payload?.sale_price || '0';
      logEntry.sale = {
        price: formatUnits(priceWei, 18),
        currency: 'ETH',
        fromAddress: payload?.from_account?.address || 'Unknown',
        toAddress: payload?.to_account?.address || 'Unknown'
      };
    } else if (event.event_type === NotificationService.EventTypes.ITEM_TRANSFERRED) {
      logEntry.transfer = {
        fromAddress: payload?.from_account?.address || 'Unknown',
        toAddress: payload?.to_account?.address || 'Unknown'
      };
    } else if (event.event_type === NotificationService.EventTypes.ITEM_LISTED) {
      const priceWei = payload?.base_price || payload?.listing_price || '0';
      logEntry.listing = {
        price: formatUnits(priceWei, 18),
        currency: 'ETH',
        maker: payload?.maker?.address || payload?.from_account?.address || 'Unknown'
      };
    } else if (event.event_type === NotificationService.EventTypes.ITEM_RECEIVED_BID) {
      const priceWei = payload?.base_price || payload?.bid_amount || '0';
      logEntry.bid = {
        price: formatUnits(priceWei, 18),
        currency: 'ETH',
        bidder: payload?.maker?.address || payload?.from_account?.address || 'Unknown'
      };
    } else if (event.event_type === NotificationService.EventTypes.ITEM_CANCELLED) {
      logEntry.cancellation = {
        maker: payload?.maker?.address || payload?.from_account?.address || 'Unknown'
      };
    }

    return logEntry;
  }

  /**
     * Extract contract address from nft_id
     * @private
     * @param {string} nftId - The nft_id (format: "chain/contract/tokenId")
     * @returns {string|null} Contract address or null
     */
  _extractContract(nftId) {
    if (!nftId) {return null;}
    const parts = nftId.split('/');
    return parts.length >= 2 ? parts[1] : null;
  }

  /**
     * Extract token ID from nft_id
     * @private
     * @param {string} nftId - The nft_id (format: "chain/contract/tokenId")
     * @returns {string|null} Token ID or null
     */
  _extractTokenId(nftId) {
    if (!nftId) {return null;}
    const parts = nftId.split('/');
    return parts.length >= 3 ? parts[2] : null;
  }

  /**
     * Truncate Ethereum address for display
     * @private
     * @param {string} address - Full Ethereum address
     * @returns {string} Truncated address (0x1234...5678)
     */
  _truncateAddress(address) {
    if (!address || address.length < 10) {return address;}
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  /**
     * Format chain name for display
     * @private
     * @param {string} chain - Chain identifier
     * @returns {string} Formatted chain name
     */
  _formatChain(chain) {
    const chainMap = {
      'ethereum': 'Ethereum',
      'base': 'Base',
      'polygon': 'Polygon',
      'arbitrum': 'Arbitrum',
      'optimism': 'Optimism',
      'apechain': 'ApeChain',
      'ape_chain': 'ApeChain',  // Support both formats
      'avalanche': 'Avalanche',
      'bsc': 'BSC',
      'solana': 'Solana'
    };

    return chainMap[chain?.toLowerCase()] || chain || 'Unknown';
  }
}

export default NotificationService;
