import { logger } from '../utils/logger.js';
import { OPENSEA_API_KEY } from '../utils/env.js';
import { OPENSEA_API_BASE_URL } from '../config.js';
import { OpenSeaApi } from './openseaApi.js';
import { getNativeCurrencySymbol } from '../constants/chains.js';

/**
 * PollingMonitorService - Monitors NFT events using REST API polling
 *
 * Provides NFT event monitoring via periodic polling of OpenSea REST API.
 * Supports all event types: sale, transfer, order (listing), cancel, redemption.
 * This service is a fallback when the Stream API is unavailable.
 *
 * Environment Variables:
 * - OPENSEA_API_KEY (required) - OpenSea API key for authentication
 * - MONITOR_POLLING_INTERVAL (optional) - Polling interval in ms (default: 5000)
 * - MONITOR_INITIAL_LOOKBACK (optional) - Initial lookback time in seconds (default: 300)
 *
 * Important Notes:
 * - Events are polled periodically (not real-time like Stream API)
 * - API rate limits may apply to frequent polling
 * - Events are de-duplicated using event_timestamp and unique identifiers
 * - Compatible interface with StreamService for easy switching
 *
 * Event Payload Structure (transformed from OpenSea REST API):
 * {
 *   event_type: "item_sold",
 *   event_timestamp: "2024-01-01T12:00:00.000Z",
 *   payload: {
 *     item: { nft_id: "ethereum/0x.../123", metadata: {...} },
 *     collection: { slug: "collection-slug" },
 *     sale_price: "1000000000000000000",
 *     from_account: { address: "0x..." },
 *     to_account: { address: "0x..." }
 *   }
 * }
 *
 * Usage Example:
 * const service = new PollingMonitorService({
 *   apiKey: process.env.OPENSEA_API_KEY,
 *   network: 'mainnet',
 *   chainConfig: { name: 'ethereum', chain: 'ethereum' }
 * });
 * await service.connect();
 * await service.subscribeToCollection('azuki', ['item_listed', 'item_sold'], (event) => {
 *   console.log('Event received:', event);
 * }, walletAddress);
 */
export class PollingMonitorService {
    /**
     * Connection states (compatible with StreamService)
     */
    static ConnectionState = {
        DISCONNECTED: 'disconnected',
        CONNECTING: 'connecting',
        CONNECTED: 'connected',
        RECONNECTING: 'reconnecting'
    };

    /**
     * Supported event types
     */
    static EventTypes = {
        ITEM_LISTED: 'item_listed',
        ITEM_SOLD: 'item_sold',
        ITEM_TRANSFERRED: 'item_transferred',
        ITEM_RECEIVED_BID: 'item_received_bid',
        ITEM_CANCELLED: 'item_cancelled',
        ITEM_METADATA_UPDATED: 'item_metadata_updated'
    };

    /**
     * Mapping from Stream API event types to REST API event types
     */
    static EventTypeMapping = {
        'item_listed': 'order',
        'item_sold': 'sale',
        'item_transferred': 'transfer',
        'item_received_bid': 'order',
        'item_cancelled': 'cancel',
        'item_metadata_updated': 'all' // Metadata updates are not specifically tracked
    };

    /**
     * Create a new PollingMonitorService instance
     * @param {Object} config - Configuration options
     * @param {string} config.apiKey - OpenSea API key (defaults to OPENSEA_API_KEY env var)
     * @param {string} config.network - Network to connect to ('mainnet' or 'testnet', default: 'mainnet')
     * @param {Object} config.chainConfig - Chain configuration object with name and chain properties
     * @param {number} config.pollingInterval - Polling interval in ms (default: 5000)
     * @param {number} config.initialLookback - Initial lookback time in seconds (default: 300)
     */
    constructor(config = {}) {
        // Use explicit undefined check to allow passing falsy values for testing
        const apiKey = config.apiKey !== undefined ? config.apiKey : OPENSEA_API_KEY;
        const baseUrl = config.baseUrl || OPENSEA_API_BASE_URL;

        if (!config.chainConfig) {
            throw new Error('chainConfig is required');
        }

        this.config = {
            apiKey: apiKey,
            network: config.network || 'mainnet',
            chainConfig: config.chainConfig,
            pollingInterval: config.pollingInterval ||
                parseInt(process.env.MONITOR_POLLING_INTERVAL || '5000'),
            initialLookback: config.initialLookback ||
                parseInt(process.env.MONITOR_INITIAL_LOOKBACK || '300')
        };

        if (!this.config.apiKey) {
            throw new Error('OpenSea API key is required. Set OPENSEA_API_KEY environment variable.');
        }

        // Initialize OpenSeaApi instance
        this.openseaApi = new OpenSeaApi(apiKey, baseUrl, config.chainConfig);

        this.connectionState = PollingMonitorService.ConnectionState.DISCONNECTED;
        this.subscriptions = new Map();
        this.pollingTimer = null;
        this.lastEventTimestamp = null;
        this.seenEventIds = new Set();

        logger.debug('PollingMonitorService initialized:', {
            network: this.config.network,
            chain: this.config.chainConfig.name,
            pollingInterval: this.config.pollingInterval,
            initialLookback: this.config.initialLookback
        });
    }

    /**
     * Connect to OpenSea REST API
     * Initializes the polling service
     */
    async connect() {
        if (this.connectionState === PollingMonitorService.ConnectionState.CONNECTED) {
            logger.debug('Already connected to OpenSea REST API (polling mode)');
            return;
        }

        try {
            this.connectionState = PollingMonitorService.ConnectionState.CONNECTING;
            logger.info('Connecting to OpenSea REST API (polling mode)...');

            // Set initial lookback timestamp
            const now = Math.floor(Date.now() / 1000);
            this.lastEventTimestamp = now - this.config.initialLookback;

            this.connectionState = PollingMonitorService.ConnectionState.CONNECTED;
            logger.info('Successfully connected to OpenSea REST API (polling mode)');
        } catch (error) {
            this.connectionState = PollingMonitorService.ConnectionState.DISCONNECTED;
            logger.error('Failed to connect to OpenSea REST API:', error.message);
            throw error;
        }
    }

    /**
     * Subscribe to events for a specific collection
     * @param {string} collectionSlug - Collection slug or '*' for all collections
     * @param {string[]} eventTypes - Array of event types to subscribe to
     * @param {Function} callback - Callback function to handle events
     * @param {string} [walletAddress] - Optional wallet address to filter events
     */
    async subscribeToCollection(collectionSlug, eventTypes, callback, walletAddress = null) {
        if (this.connectionState !== PollingMonitorService.ConnectionState.CONNECTED) {
            throw new Error('Service not connected. Call connect() first.');
        }

        if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
            throw new Error('Event types must be a non-empty array');
        }

        try {
            const subscriptionKey = `${collectionSlug}:${eventTypes.join(',')}:${walletAddress || 'all'}`;

            logger.info('Subscribing to collection events (polling mode):', {
                collection: collectionSlug,
                eventTypes,
                walletFilter: walletAddress || 'none'
            });

            // Store subscription for management
            this.subscriptions.set(subscriptionKey, {
                collectionSlug,
                eventTypes,
                callback,
                walletAddress
            });

            // Start polling if not already running
            if (!this.pollingTimer) {
                this._startPolling();
            }

            logger.info(`Successfully subscribed to ${collectionSlug} for events: ${eventTypes.join(', ')}`);
        } catch (error) {
            logger.error('Failed to subscribe to collection:', error);
            throw error;
        }
    }

    /**
     * Subscribe to events for all collections (wildcard subscription)
     * @param {string[]} eventTypes - Array of event types to subscribe to
     * @param {Function} callback - Callback function to handle events
     * @param {string} [walletAddress] - Optional wallet address to filter events
     */
    async subscribeToAllCollections(eventTypes, callback, walletAddress = null) {
        return this.subscribeToCollection('*', eventTypes, callback, walletAddress);
    }

    /**
     * Unsubscribe from all active subscriptions
     */
    async unsubscribe() {
        if (this.subscriptions.size === 0) {
            logger.debug('No active subscriptions to unsubscribe');
            return;
        }

        logger.info(`Unsubscribing from ${this.subscriptions.size} subscription(s)`);
        this.subscriptions.clear();
        logger.info('All subscriptions removed');

        // Stop polling if no subscriptions remain
        this._stopPolling();
    }

    /**
     * Gracefully disconnect from OpenSea REST API
     * Stops polling and cleans up resources
     */
    async disconnect() {
        if (this.connectionState === PollingMonitorService.ConnectionState.DISCONNECTED) {
            logger.debug('Already disconnected');
            return;
        }

        try {
            logger.info('Disconnecting from OpenSea REST API (polling mode)...');

            // Stop polling
            this._stopPolling();

            // Clear all subscriptions
            await this.unsubscribe();

            // Clear state
            this.lastEventTimestamp = null;
            this.seenEventIds.clear();

            this.connectionState = PollingMonitorService.ConnectionState.DISCONNECTED;
            logger.info('Successfully disconnected from OpenSea REST API (polling mode)');
        } catch (error) {
            logger.error('Error during disconnect:', error);
            throw error;
        }
    }

    /**
     * Get current connection state
     * @returns {string} Current connection state
     */
    getConnectionState() {
        return this.connectionState;
    }

    /**
     * Get active subscriptions count
     * @returns {number} Number of active subscriptions
     */
    getSubscriptionCount() {
        return this.subscriptions.size;
    }

    /**
     * Start the polling loop
     * @private
     */
    _startPolling() {
        if (this.pollingTimer) {
            logger.debug('Polling already started');
            return;
        }

        logger.info(`Starting polling with interval: ${this.config.pollingInterval}ms`);

        // Keep track of poll count for status updates
        this.pollCount = 0;

        // Run first poll immediately
        this._poll();

        // Set up periodic polling
        this.pollingTimer = setInterval(() => {
            this._poll();
        }, this.config.pollingInterval);
    }

    /**
     * Stop the polling loop
     * @private
     */
    _stopPolling() {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
            logger.info('Polling stopped');
        }
    }

    /**
     * Execute a single poll cycle
     * Fetches events and processes them
     * @private
     */
    async _poll() {
        if (this.subscriptions.size === 0) {
            logger.debug('No subscriptions, skipping poll');
            return;
        }

        try {
            this.pollCount = (this.pollCount || 0) + 1;

            // Show periodic status updates (every 12 polls = 1 minute at 5s interval)
            if (this.pollCount % 12 === 1) {
                const timestamp = new Date().toLocaleTimeString();
                logger.info(`[${timestamp}] Polling for events... (poll #${this.pollCount})`);
            } else {
                logger.debug(`Polling for events... (poll #${this.pollCount})`);
            }

            // Get unique wallet addresses from subscriptions
            const walletAddresses = new Set();
            for (const sub of this.subscriptions.values()) {
                if (sub.walletAddress) {
                    walletAddresses.add(sub.walletAddress.toLowerCase());
                }
            }

            // Fetch events for each wallet address
            for (const walletAddress of walletAddresses) {
                await this._fetchAndProcessEvents(walletAddress);
            }

        } catch (error) {
            logger.error('Error during polling:', error.message);
        }
    }

    /**
     * Fetch and process events for a specific wallet
     * @private
     * @param {string} walletAddress - Wallet address to fetch events for
     */
    async _fetchAndProcessEvents(walletAddress) {
        try {
            // Validate timestamp before using it
            const now = Math.floor(Date.now() / 1000);

            // If lastEventTimestamp is in the future, reset it
            if (this.lastEventTimestamp > now) {
                logger.warn(`Last event timestamp ${this.lastEventTimestamp} is in the future, resetting to ${now - this.config.initialLookback}`);
                this.lastEventTimestamp = now - this.config.initialLookback;
            }

            // Fetch events with timestamp filter
            const filters = {
                eventType: 'all', // Get all event types, filter later
                after: this.lastEventTimestamp,
                limit: 100
            };

            logger.debug(`Fetching events for wallet ${walletAddress} after timestamp ${this.lastEventTimestamp} (${new Date(this.lastEventTimestamp * 1000).toISOString()})`);

            const response = await this.openseaApi.getAccountEvents(walletAddress, filters);

            if (!response || !response.asset_events) {
                logger.debug('No events returned from API');
                return;
            }

            const events = response.asset_events;

            if (events.length === 0) {
                logger.debug(`No new events (checked up to ${new Date(this.lastEventTimestamp * 1000).toISOString()})`);
                return;
            }

            // Process each event silently - only show relevant events
            let processedCount = 0;
            let relevantCount = 0;
            for (const event of events) {
                const wasProcessed = await this._processEvent(event, walletAddress);
                if (wasProcessed) {
                    processedCount++;
                    relevantCount++;
                } else {
                    // Count if event was relevant to wallet but filtered out by other criteria
                    const isRelevantToWallet = this._isEventRelevantToWallet(event, walletAddress);
                    if (isRelevantToWallet) relevantCount++;
                }
            }

            // Only show summary if there were relevant events
            if (relevantCount > 0) {
                logger.debug(`Found ${relevantCount} relevant event(s), ${processedCount} processed`);
            }

            // Update last event timestamp
            if (events.length > 0) {
                const latestTimestamp = this._getLatestEventTimestamp(events);
                if (latestTimestamp > this.lastEventTimestamp) {
                    this.lastEventTimestamp = latestTimestamp;
                    logger.debug(`Updated last event timestamp to ${this.lastEventTimestamp} (${new Date(this.lastEventTimestamp * 1000).toISOString()})`);
                }
            }

        } catch (error) {
            logger.error(`Failed to fetch events for wallet ${walletAddress}:`, error.message);
            // Don't throw - let polling continue
        }
    }

    /**
     * Process a single event
     * @private
     * @param {Object} event - Event from OpenSea REST API
     * @param {string} walletAddress - Wallet address that this event is for
     * @returns {boolean} True if event was processed, false if skipped
     */
    async _processEvent(event, walletAddress) {
        try {
            // Generate unique event ID
            const eventId = this._generateEventId(event);

            // Skip if already seen
            if (this.seenEventIds.has(eventId)) {
                logger.debug(`Skipping duplicate event: ${eventId}`);
                return false;
            }

            // Transform REST API event to Stream API format
            const transformedEvent = this._transformEventToStreamFormat(event);

            if (!transformedEvent) {
                logger.debug(`Event type '${event.event_type}' could not be transformed`);
                return false;
            }

            // Mark as seen
            this.seenEventIds.add(eventId);

            // Limit size of seen set to prevent memory issues (keep last 10000)
            if (this.seenEventIds.size > 10000) {
                const oldestIds = Array.from(this.seenEventIds).slice(0, 5000);
                oldestIds.forEach(id => this.seenEventIds.delete(id));
                logger.debug('Cleaned up old event IDs from seen set');
            }

            // Find matching subscriptions and call callbacks
            let matched = false;
            for (const sub of this.subscriptions.values()) {
                // Check if event type matches subscription
                if (!sub.eventTypes.includes(transformedEvent.event_type)) {
                    logger.debug(`Event type '${transformedEvent.event_type}' not in subscription`);
                    continue;
                }

                // Check collection filter
                if (sub.collectionSlug !== '*') {
                    const eventCollection = transformedEvent.payload?.collection?.slug;
                    if (eventCollection !== sub.collectionSlug) {
                        logger.debug(`Collection '${eventCollection}' doesn't match filter: ${sub.collectionSlug}`);
                        continue;
                    }
                }

                // Check wallet filter
                if (sub.walletAddress) {
                    const normalizedWallet = sub.walletAddress.toLowerCase();
                    const fromAddress = transformedEvent.payload?.from_account?.address?.toLowerCase();
                    const toAddress = transformedEvent.payload?.to_account?.address?.toLowerCase();
                    const makerAddress = transformedEvent.payload?.maker?.address?.toLowerCase();

                    // Check if wallet is involved (as from, to, or maker)
                    const isInvolved =
                        fromAddress === normalizedWallet ||
                        toAddress === normalizedWallet ||
                        makerAddress === normalizedWallet;

                    if (!isInvolved) {
                        logger.debug(`Event doesn't involve wallet ${normalizedWallet}`);
                        continue;
                    }
                }

                // Call the callback
                try {
                    // Add event detection header
                    logger.info(`\n🔔 New ${transformedEvent.event_type} event detected!`);
                    await sub.callback(transformedEvent);
                    matched = true;
                } catch (callbackError) {
                    logger.error('Error in event callback:', callbackError.message);
                }
            }

            if (!matched) {
                logger.debug('Event did not match any subscription filters');
            }

            return matched;

        } catch (error) {
            logger.error('Error processing event:', error.message);
            return false;
        }
    }

    /**
     * Check if an event is relevant to a specific wallet address
     * @private
     * @param {Object} event - Raw event from OpenSea REST API
     * @param {string} walletAddress - Wallet address to check
     * @returns {boolean} True if event involves the wallet
     */
    _isEventRelevantToWallet(event, walletAddress) {
        const normalizedWallet = walletAddress.toLowerCase();

        // Check various address fields in the raw event
        const addresses = [
            event.maker,
            event.from_address,
            event.to_address,
            event.seller,
            event.buyer,
            event.taker
        ].filter(addr => addr); // Filter out null/undefined

        return addresses.some(addr => addr.toLowerCase() === normalizedWallet);
    }

    /**
     * Transform REST API event to Stream API format
     * @private
     * @param {Object} event - Event from OpenSea REST API
     * @returns {Object|null} Transformed event in Stream API format
     */
    _transformEventToStreamFormat(event) {
        try {
            // Map REST API event type to Stream API event type
            const eventType = this._mapRestEventTypeToStreamType(event.event_type);

            if (!eventType) {
                logger.debug(`Unsupported event type: ${event.event_type}`);
                return null;
            }

            // Extract NFT info - REST API uses 'asset' field, not 'nft'
            const asset = event.asset;
            const criteria = event.criteria;

            let nftId = null;
            let collectionName = 'Unknown Collection';
            let collectionSlug = 'unknown';

            if (asset) {
                // Direct NFT event
                nftId = `${event.chain || 'ethereum'}/${asset.contract}/${asset.identifier}`;
                collectionName = asset?.name || asset?.collection || 'Unknown Collection';
                collectionSlug = asset?.collection || 'unknown';
            } else if (criteria) {
                // Collection-level offer/bid
                collectionName = criteria?.collection?.slug || 'Unknown Collection';
                collectionSlug = criteria?.collection?.slug || 'unknown';
                logger.debug(`Collection-level event for ${collectionSlug}`);
            }

            // Determine currency symbol based on payment token and chain configuration
            const getCurrencySymbol = (payment) => {
                if (!payment) return 'ETH';

                const tokenAddress = payment.token_address?.toLowerCase();
                const symbol = payment.symbol || 'ETH';
                const chain = event.chain || 'ethereum';

                // Common token mappings with dynamic native currency
                const tokenMap = {
                    '0x0000000000000000000000000000000000000000': getNativeCurrencySymbol(chain),
                    '0x4200000000000000000000000000000000000006': 'WETH', // Base WETH
                    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': 'WETH', // Ethereum WETH
                    '0x82af49447d8a07e3bd95bd0d56f35241523fbab1': 'WETH', // Arbitrum WETH
                    '0x7ceb23fD6bC0adD59E62ac25578270cFf1b9f619': 'WMATIC', // Polygon WMATIC
                    '0x48b62137EdfA95a428D35C09E44256a739F6B557': 'WAPE', // ApeChain WAPE
                };

                // If it's the native token for the chain
                if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
                    const nativeSymbol = getNativeCurrencySymbol(chain);
                    logger.debug(`Native token detected for ${chain}, using ${nativeSymbol}`);
                    return nativeSymbol;
                }

                // Check token mappings
                const mappedSymbol = tokenMap[tokenAddress];
                if (mappedSymbol) {
                    logger.debug(`Mapped token address to ${mappedSymbol}`);
                    return mappedSymbol;
                }

                // Fall back to symbol from payment data
                logger.debug(`Using payment symbol: ${symbol} (chain: ${chain}, tokenAddress: ${tokenAddress})`);
                return symbol;
            };

            // Build transformed event
            const transformedEvent = {
                event_type: eventType,
                event_timestamp: event.event_timestamp,
                chain: event.chain || 'ethereum',
                payload: {
                    item: {
                        nft_id: nftId,
                        metadata: {
                            name: asset?.name || 'Unknown NFT',
                            image_url: asset?.image_url || asset?.display_image_url
                        }
                    },
                    collection: {
                        slug: collectionSlug,
                        name: collectionName
                    }
                }
            };

            // Add event-specific data with currency information
            if (event.event_type === 'sale' && event.payment) {
                transformedEvent.payload.sale_price = event.payment.quantity || '0';
                transformedEvent.payload.currency = getCurrencySymbol(event.payment);
                transformedEvent.payload.from_account = { address: event.seller || event.from_address };
                transformedEvent.payload.to_account = { address: event.buyer || event.to_address };
            } else if (event.event_type === 'transfer') {
                transformedEvent.payload.from_account = { address: event.from_address };
                transformedEvent.payload.to_account = { address: event.to_address };
            } else if (event.event_type === 'order') {
                // Distinguish between listing and bid based on order type
                const isCollectionOffer = event.order_type === 'collection_offer';
                const isCriteriaOffer = event.order_type === 'criteria';
                const isRegularOffer = event.order_type === 'offer';

                const currency = getCurrencySymbol(event.payment);

                if (isCollectionOffer || isCriteriaOffer || isRegularOffer) {
                    transformedEvent.event_type = 'item_received_bid';
                    transformedEvent.payload.bid_amount = event.payment?.quantity || '0';
                    transformedEvent.payload.currency = currency;
                    transformedEvent.payload.is_collection_offer = isCollectionOffer;
                } else {
                    // Default to listing for other order types
                    transformedEvent.event_type = 'item_listed';
                    transformedEvent.payload.base_price = event.payment?.quantity || '0';
                    transformedEvent.payload.currency = currency;
                }

                transformedEvent.payload.maker = { address: event.maker };
            } else if (event.event_type === 'cancel') {
                transformedEvent.payload.maker = { address: event.maker || event.from_address };
            }

            return transformedEvent;

        } catch (error) {
            logger.error('Error transforming event:', error.message);
            return null;
        }
    }

    /**
     * Map REST API event type to Stream API event type
     * @private
     * @param {string} restEventType - REST API event type
     * @returns {string|null} Stream API event type
     */
    _mapRestEventTypeToStreamType(restEventType) {
        const mapping = {
            'sale': 'item_sold',
            'transfer': 'item_transferred',
            'order': 'item_listed', // Will be refined in transform based on order type
            'cancel': 'item_cancelled',
            'redemption': null // Not supported in Stream API
        };

        return mapping[restEventType] || null;
    }

    /**
     * Generate unique event ID
     * @private
     * @param {Object} event - Event object
     * @returns {string} Unique event ID
     */
    _generateEventId(event) {
        // Combine multiple fields to create a unique ID
        const parts = [
            event.event_timestamp,
            event.event_type,
            event.nft?.contract,
            event.nft?.identifier,
            event.transaction || '',
            event.order_hash || ''
        ];

        return parts.filter(p => p).join(':');
    }

    /**
     * Get the latest timestamp from a list of events
     * @private
     * @param {Array} events - Array of events
     * @returns {number} Latest timestamp (Unix seconds)
     */
    _getLatestEventTimestamp(events) {
        let latest = this.lastEventTimestamp || 0;
        const now = Math.floor(Date.now() / 1000);

        for (const event of events) {
            if (event.event_timestamp) {
                const timestamp = new Date(event.event_timestamp).getTime() / 1000;

                // Validate timestamp: must not be in the future
                if (timestamp > now) {
                    logger.warn(`Event timestamp ${timestamp} is in the future (now: ${now}), skipping`);
                    continue;
                }

                if (timestamp > latest) {
                    latest = timestamp;
                }
            }
        }

        return Math.floor(latest);
    }
}

export default PollingMonitorService;
