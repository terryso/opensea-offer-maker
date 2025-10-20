import { OpenSeaStreamClient } from '@opensea/stream-js';
import WebSocket from 'ws';
import { logger } from '../utils/logger.js';
import { OPENSEA_API_KEY } from '../utils/env.js';

/**
 * StreamService - Manages WebSocket connections to the OpenSea Stream API
 *
 * Provides real-time NFT event streaming via OpenSea's WebSocket API.
 * Supports all event types: item_listed, item_sold, item_transferred,
 * item_received_bid, item_cancelled, item_metadata_updated
 *
 * Environment Variables:
 * - OPENSEA_API_KEY (required) - OpenSea API key for authentication
 * - MONITOR_RECONNECT_MAX_DELAY (optional) - Max reconnection delay in ms (default: 60000)
 *
 * Important Notes:
 * - Events may arrive out of order - use event_timestamp for sorting
 * - Best-effort delivery - missed events during disconnection are not re-sent
 * - Events include all activity - filter by wallet address on client side
 * - Supports Mainnet (ethereum, polygon, etc.) and Testnet (Sepolia)
 *
 * Event Payload Structure:
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
 * const service = new StreamService({
 *   apiKey: process.env.OPENSEA_API_KEY,
 *   network: 'mainnet'
 * });
 * await service.connect();
 * await service.subscribeToCollection('azuki', ['item_listed', 'item_sold'], (event) => {
 *   console.log('Event received:', event);
 * });
 */
export class StreamService {
    /**
     * Connection states
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
     * Create a new StreamService instance
     * @param {Object} config - Configuration options
     * @param {string} config.apiKey - OpenSea API key (defaults to OPENSEA_API_KEY env var)
     * @param {string} config.network - Network to connect to ('mainnet' or 'testnet', default: 'mainnet')
     * @param {number} config.maxReconnectDelay - Maximum reconnection delay in ms (default: 60000)
     */
    constructor(config = {}) {
        // Use explicit undefined check to allow passing falsy values for testing
        const apiKey = config.apiKey !== undefined ? config.apiKey : OPENSEA_API_KEY;

        this.config = {
            apiKey: apiKey,
            network: config.network || 'mainnet',
            maxReconnectDelay: config.maxReconnectDelay ||
                parseInt(process.env.MONITOR_RECONNECT_MAX_DELAY || '60000')
        };

        if (!this.config.apiKey) {
            throw new Error('OpenSea API key is required. Set OPENSEA_API_KEY environment variable.');
        }

        this.connectionState = StreamService.ConnectionState.DISCONNECTED;
        this.client = null;
        this.subscriptions = new Map();
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;

        logger.debug('StreamService initialized:', {
            network: this.config.network,
            maxReconnectDelay: this.config.maxReconnectDelay
        });
    }

    /**
     * Connect to OpenSea Stream API
     * Initializes WebSocket client with proper configuration
     */
    async connect() {
        if (this.connectionState === StreamService.ConnectionState.CONNECTED) {
            logger.debug('Already connected to OpenSea Stream API');
            return;
        }

        try {
            this.connectionState = StreamService.ConnectionState.CONNECTING;
            logger.info('Connecting to OpenSea Stream API...');

            this.client = new OpenSeaStreamClient({
                token: this.config.apiKey,
                network: this.config.network,
                connectOptions: {
                    transport: WebSocket
                }
            });

            // Set up error event listener
            const handleError = (error) => {
                const msg = (error && error.message) ? error.message : error;
                logger.error('OpenSea Stream API error:', msg);
                this._handleConnectionError(error);
            };
            if (typeof this.client.onError === 'function') {
                this.client.onError(handleError);
            } else if (typeof this.client.on === 'function') {
                try { this.client.on('error', handleError); } catch (e) { logger.warn('Failed to bind error event via on("error"): ' + e.message); }
                try { this.client.on('connect_error', handleError); } catch {}
                try { this.client.on('disconnect', () => handleError(new Error('Disconnected'))); } catch {}
            } else {
                logger.warn('OpenSeaStreamClient has no onError or on() API; error handling may be limited');
            }

            this.connectionState = StreamService.ConnectionState.CONNECTED;
            this.reconnectAttempts = 0;
            logger.info('Successfully connected to OpenSea Stream API');
        } catch (error) {
            this.connectionState = StreamService.ConnectionState.DISCONNECTED;
            logger.error('Failed to connect to OpenSea Stream API:', error.message);
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
        if (!this.client) {
            throw new Error('Client not initialized. Call connect() first.');
        }

        if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
            throw new Error('Event types must be a non-empty array');
        }

        try {
            const subscriptionKey = `${collectionSlug}:${eventTypes.join(',')}`;

            // Wrap callback with wallet filtering if needed
            const wrappedCallback = walletAddress
                ? (event) => this._filterEventByWallet(event, walletAddress, callback)
                : callback;

            logger.info('Subscribing to collection events:', {
                collection: collectionSlug,
                eventTypes,
                walletFilter: walletAddress || 'none'
            });

            // Subscribe using the SDK's onEvents method
            this.client.onEvents(collectionSlug, eventTypes, wrappedCallback);

            // Store subscription for management
            this.subscriptions.set(subscriptionKey, {
                collectionSlug,
                eventTypes,
                callback: wrappedCallback,
                walletAddress
            });

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
    }

    /**
     * Gracefully disconnect from OpenSea Stream API
     * Closes WebSocket connection and cleans up resources
     */
    async disconnect() {
        if (this.connectionState === StreamService.ConnectionState.DISCONNECTED) {
            logger.debug('Already disconnected');
            return;
        }

        try {
            logger.info('Disconnecting from OpenSea Stream API...');

            // Clear any pending reconnection timer
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            // Clear all subscriptions
            await this.unsubscribe();

            // Close WebSocket connection if client exists
            if (this.client) {
                // Note: OpenSeaStreamClient doesn't expose disconnect method
                // The WebSocket will be closed when the client is dereferenced
                this.client = null;
            }

            this.connectionState = StreamService.ConnectionState.DISCONNECTED;
            logger.info('Successfully disconnected from OpenSea Stream API');
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
     * Filter events by wallet address
     * Only passes events relevant to the specified wallet to the callback
     * @private
     */
    _filterEventByWallet(event, walletAddress, callback) {
        // If no wallet filter, pass all events through
        if (!walletAddress) {
            callback(event);
            return;
        }

        // If wallet filter is enabled but event has no payload, filter it out
        if (!event?.payload) {
            logger.debug('Event filtered out (missing payload):', {
                eventType: event.event_type
            });
            return;
        }

        const normalizedWallet = walletAddress.toLowerCase();
        const fromAddress = event.payload.from_account?.address?.toLowerCase();
        const toAddress = event.payload.to_account?.address?.toLowerCase();

        const isRelevant = fromAddress === normalizedWallet || toAddress === normalizedWallet;

        if (isRelevant) {
            logger.debug('Event matched wallet filter:', {
                eventType: event.event_type,
                walletAddress: normalizedWallet,
                fromAddress,
                toAddress
            });
            callback(event);
        } else {
            logger.debug('Event filtered out (wallet mismatch):', {
                eventType: event.event_type,
                walletAddress: normalizedWallet,
                fromAddress,
                toAddress
            });
        }
    }

    /**
     * Handle connection errors and trigger reconnection logic
     * @private
     */
    _handleConnectionError(error) {
        if (this.connectionState === StreamService.ConnectionState.DISCONNECTED) {
            // Already disconnected, don't attempt reconnection
            return;
        }

        this.connectionState = StreamService.ConnectionState.RECONNECTING;
        this._scheduleReconnection();
    }

    /**
     * Schedule reconnection with exponential backoff
     * @private
     */
    _scheduleReconnection() {
        if (this.reconnectTimer) {
            return; // Reconnection already scheduled
        }

        this.reconnectAttempts++;

        // Calculate delay with exponential backoff: 1s, 2s, 4s, 8s, ... up to maxReconnectDelay
        const baseDelay = 1000; // 1 second
        const calculatedDelay = Math.min(
            baseDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.config.maxReconnectDelay
        );

        logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${calculatedDelay}ms`);

        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            try {
                await this.connect();

                // Resubscribe to all previous subscriptions
                if (this.subscriptions.size > 0) {
                    logger.info(`Resubscribing to ${this.subscriptions.size} subscription(s)`);
                    const subscriptionsToRestore = Array.from(this.subscriptions.values());
                    this.subscriptions.clear(); // Clear before resubscribing to avoid duplicates

                    for (const sub of subscriptionsToRestore) {
                        await this.subscribeToCollection(
                            sub.collectionSlug,
                            sub.eventTypes,
                            sub.callback,
                            sub.walletAddress
                        );
                    }
                }
            } catch (error) {
                logger.error('Reconnection attempt failed:', error.message);
                this._scheduleReconnection(); // Schedule next attempt
            }
        }, calculatedDelay);
    }
}

export default StreamService;
