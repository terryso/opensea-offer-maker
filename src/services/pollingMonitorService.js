import { logger } from '../utils/logger.js';
import { OPENSEA_API_KEY } from '../utils/env.js';
import { OPENSEA_API_BASE_URL } from '../config.js';
import { OpenSeaApi } from './openseaApi.js';

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
            logger.debug('Polling for events...');

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
            // Fetch events with timestamp filter
            const filters = {
                eventType: 'all', // Get all event types, filter later
                after: this.lastEventTimestamp,
                limit: 100
            };

            logger.debug(`Fetching events for wallet ${walletAddress} after timestamp ${this.lastEventTimestamp}`);

            const response = await this.openseaApi.getAccountEvents(walletAddress, filters);

            if (!response || !response.asset_events) {
                logger.debug('No events returned from API');
                return;
            }

            const events = response.asset_events;
            logger.debug(`Received ${events.length} events from API`);

            // Process each event
            for (const event of events) {
                await this._processEvent(event, walletAddress);
            }

            // Update last event timestamp
            if (events.length > 0) {
                const latestTimestamp = this._getLatestEventTimestamp(events);
                if (latestTimestamp > this.lastEventTimestamp) {
                    this.lastEventTimestamp = latestTimestamp;
                    logger.debug(`Updated last event timestamp to ${this.lastEventTimestamp}`);
                }
            }

        } catch (error) {
            logger.error(`Failed to fetch events for wallet ${walletAddress}:`, error.message);
        }
    }

    /**
     * Process a single event
     * @private
     * @param {Object} event - Event from OpenSea REST API
     * @param {string} walletAddress - Wallet address that this event is for
     */
    async _processEvent(event, walletAddress) {
        try {
            // Generate unique event ID
            const eventId = this._generateEventId(event);

            // Skip if already seen
            if (this.seenEventIds.has(eventId)) {
                logger.debug(`Skipping duplicate event: ${eventId}`);
                return;
            }

            // Transform REST API event to Stream API format
            const transformedEvent = this._transformEventToStreamFormat(event);

            if (!transformedEvent) {
                logger.debug('Event could not be transformed, skipping');
                return;
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
            for (const sub of this.subscriptions.values()) {
                // Check if event type matches subscription
                if (!sub.eventTypes.includes(transformedEvent.event_type)) {
                    continue;
                }

                // Check collection filter
                if (sub.collectionSlug !== '*') {
                    const eventCollection = transformedEvent.payload?.collection?.slug;
                    if (eventCollection !== sub.collectionSlug) {
                        continue;
                    }
                }

                // Check wallet filter
                if (sub.walletAddress) {
                    const normalizedWallet = sub.walletAddress.toLowerCase();
                    const fromAddress = transformedEvent.payload?.from_account?.address?.toLowerCase();
                    const toAddress = transformedEvent.payload?.to_account?.address?.toLowerCase();

                    if (fromAddress !== normalizedWallet && toAddress !== normalizedWallet) {
                        continue;
                    }
                }

                // Call the callback
                logger.debug(`Calling callback for event: ${transformedEvent.event_type}`);
                sub.callback(transformedEvent);
            }

        } catch (error) {
            logger.error('Error processing event:', error.message);
        }
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

            // Extract NFT info
            const nftId = event.nft ? `${event.chain || 'ethereum'}/${event.nft.contract}/${event.nft.identifier}` : null;

            // Build transformed event
            const transformedEvent = {
                event_type: eventType,
                event_timestamp: event.event_timestamp,
                payload: {
                    item: {
                        nft_id: nftId,
                        metadata: {
                            name: event.nft?.name || 'Unknown NFT',
                            image_url: event.nft?.image_url
                        }
                    },
                    collection: {
                        slug: event.nft?.collection || 'unknown',
                        name: event.nft?.collection || 'Unknown Collection'
                    }
                }
            };

            // Add event-specific data
            if (event.event_type === 'sale' && event.payment) {
                transformedEvent.payload.sale_price = event.payment.quantity || '0';
                transformedEvent.payload.from_account = { address: event.seller || event.from_address };
                transformedEvent.payload.to_account = { address: event.buyer || event.to_address };
            } else if (event.event_type === 'transfer') {
                transformedEvent.payload.from_account = { address: event.from_address };
                transformedEvent.payload.to_account = { address: event.to_address };
            } else if (event.event_type === 'order') {
                // Distinguish between listing and bid based on order type
                const isOffer = event.order_type === 'criteria' || event.order_type === 'offer';
                transformedEvent.event_type = isOffer ? 'item_received_bid' : 'item_listed';
                transformedEvent.payload.base_price = event.payment?.quantity || '0';
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

        for (const event of events) {
            if (event.event_timestamp) {
                const timestamp = new Date(event.event_timestamp).getTime() / 1000;
                if (timestamp > latest) {
                    latest = timestamp;
                }
            }
        }

        return Math.floor(latest);
    }
}

export default PollingMonitorService;
