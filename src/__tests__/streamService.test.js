/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Create mock OpenSeaStreamClient
const mockClient = {
    onEvents: jest.fn(),
    onError: jest.fn()
};

const mockOpenSeaStreamClient = jest.fn(() => mockClient);

// Create mock logger
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
};

// Mock modules
jest.unstable_mockModule('@opensea/stream-js', () => ({
    OpenSeaStreamClient: mockOpenSeaStreamClient
}));

jest.unstable_mockModule('ws', () => ({
    default: jest.fn()
}));

jest.unstable_mockModule('../utils/logger.js', () => ({
    logger: mockLogger
}));

jest.unstable_mockModule('../utils/env.js', () => ({
    OPENSEA_API_KEY: 'test-api-key'
}));

// Import after mocking
const { StreamService } = await import('../services/streamService.js');

describe('StreamService', () => {
    let service;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        mockClient.onEvents.mockClear();
        mockClient.onError.mockClear();
        mockOpenSeaStreamClient.mockClear();

        // Reset mock client to default implementation
        mockOpenSeaStreamClient.mockImplementation(() => mockClient);

        // Set environment variable for testing
        process.env.OPENSEA_API_KEY = 'test-api-key';
    });

    afterEach(async () => {
        if (service) {
            await service.disconnect();
        }
    });

    describe('constructor', () => {
        it('should create instance with default configuration', () => {
            // Arrange & Act
            service = new StreamService();

            // Assert
            expect(service.config.apiKey).toBe('test-api-key');
            expect(service.config.network).toBe('mainnet');
            expect(service.config.maxReconnectDelay).toBe(60000);
            expect(service.connectionState).toBe(StreamService.ConnectionState.DISCONNECTED);
            expect(service.subscriptions.size).toBe(0);
        });

        it('should create instance with custom configuration', () => {
            // Arrange & Act
            service = new StreamService({
                apiKey: 'custom-api-key',
                network: 'testnet',
                maxReconnectDelay: 30000
            });

            // Assert
            expect(service.config.apiKey).toBe('custom-api-key');
            expect(service.config.network).toBe('testnet');
            expect(service.config.maxReconnectDelay).toBe(30000);
        });

        it('should throw error when API key is missing', () => {
            // Act & Assert
            // Pass empty string which will be falsy and trigger the error
            expect(() => new StreamService({ apiKey: '' }))
                .toThrow('OpenSea API key is required');
        });

        it('should read maxReconnectDelay from environment variable', () => {
            // Arrange
            process.env.MONITOR_RECONNECT_MAX_DELAY = '45000';

            // Act
            service = new StreamService();

            // Assert
            expect(service.config.maxReconnectDelay).toBe(45000);

            // Cleanup
            delete process.env.MONITOR_RECONNECT_MAX_DELAY;
        });

        it('should initialize with correct connection state', () => {
            // Arrange & Act
            service = new StreamService();

            // Assert
            expect(service.getConnectionState()).toBe(StreamService.ConnectionState.DISCONNECTED);
            expect(service.reconnectAttempts).toBe(0);
            expect(service.client).toBeNull();
        });
    });

    describe('connect', () => {
        beforeEach(() => {
            service = new StreamService();
        });

        it('should initialize OpenSeaStreamClient with correct configuration', async () => {
            // Act
            await service.connect();

            // Assert
            expect(mockOpenSeaStreamClient).toHaveBeenCalledWith({
                token: 'test-api-key',
                network: 'mainnet',
                connectOptions: {
                    transport: expect.any(Function)
                }
            });
        });

        it('should set up error event listener', async () => {
            // Act
            await service.connect();

            // Assert
            expect(mockClient.onError).toHaveBeenCalledWith(expect.any(Function));
        });

        it('should update connection state to CONNECTED', async () => {
            // Act
            await service.connect();

            // Assert
            expect(service.getConnectionState()).toBe(StreamService.ConnectionState.CONNECTED);
        });

        it('should reset reconnect attempts on successful connection', async () => {
            // Arrange
            service.reconnectAttempts = 5;

            // Act
            await service.connect();

            // Assert
            expect(service.reconnectAttempts).toBe(0);
        });

        it('should not reconnect if already connected', async () => {
            // Arrange
            await service.connect();
            const firstClient = service.client;
            mockOpenSeaStreamClient.mockClear();

            // Act
            await service.connect();

            // Assert
            expect(service.client).toBe(firstClient);
            expect(mockOpenSeaStreamClient).not.toHaveBeenCalled();
        });

        it('should throw error and update state on connection failure', async () => {
            // Arrange
            mockOpenSeaStreamClient.mockImplementationOnce(() => {
                throw new Error('Connection failed');
            });

            // Act & Assert
            await expect(service.connect()).rejects.toThrow('Connection failed');
            expect(service.getConnectionState()).toBe(StreamService.ConnectionState.DISCONNECTED);
        });

        it('should log connection events', async () => {
            // Act
            await service.connect();

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Connecting to OpenSea Stream API...');
            expect(mockLogger.info).toHaveBeenCalledWith('Successfully connected to OpenSea Stream API');
        });
    });

    describe('subscribeToCollection', () => {
        beforeEach(async () => {
            service = new StreamService();
            await service.connect();
        });

        it('should subscribe to collection with single event type', async () => {
            // Arrange
            const callback = jest.fn();
            const eventTypes = ['item_listed'];

            // Act
            await service.subscribeToCollection('azuki', eventTypes, callback);

            // Assert
            expect(mockClient.onEvents).toHaveBeenCalledWith(
                'azuki',
                eventTypes,
                expect.any(Function)
            );
            expect(service.getSubscriptionCount()).toBe(1);
        });

        it('should subscribe to collection with multiple event types', async () => {
            // Arrange
            const callback = jest.fn();
            const eventTypes = ['item_listed', 'item_sold', 'item_transferred'];

            // Act
            await service.subscribeToCollection('azuki', eventTypes, callback);

            // Assert
            expect(mockClient.onEvents).toHaveBeenCalledWith(
                'azuki',
                eventTypes,
                expect.any(Function)
            );
        });

        it('should throw error when client is not initialized', async () => {
            // Arrange
            service.client = null;
            const callback = jest.fn();

            // Act & Assert
            await expect(
                service.subscribeToCollection('azuki', ['item_listed'], callback)
            ).rejects.toThrow('Client not initialized');
        });

        it('should throw error when event types is empty array', async () => {
            // Arrange
            const callback = jest.fn();

            // Act & Assert
            await expect(
                service.subscribeToCollection('azuki', [], callback)
            ).rejects.toThrow('Event types must be a non-empty array');
        });

        it('should throw error when event types is not an array', async () => {
            // Arrange
            const callback = jest.fn();

            // Act & Assert
            await expect(
                service.subscribeToCollection('azuki', 'item_listed', callback)
            ).rejects.toThrow('Event types must be a non-empty array');
        });

        it('should store subscription information', async () => {
            // Arrange
            const callback = jest.fn();
            const eventTypes = ['item_listed'];

            // Act
            await service.subscribeToCollection('azuki', eventTypes, callback);

            // Assert
            expect(service.subscriptions.size).toBe(1);
            const subscription = service.subscriptions.get('azuki:item_listed');
            expect(subscription).toBeDefined();
            expect(subscription.collectionSlug).toBe('azuki');
            expect(subscription.eventTypes).toEqual(eventTypes);
        });

        it('should handle subscription errors gracefully', async () => {
            // Arrange
            mockClient.onEvents.mockImplementationOnce(() => {
                throw new Error('Subscription failed');
            });
            const callback = jest.fn();

            // Act & Assert
            await expect(
                service.subscribeToCollection('azuki', ['item_listed'], callback)
            ).rejects.toThrow('Subscription failed');
        });

        it('should log subscription events', async () => {
            // Arrange
            const callback = jest.fn();

            // Act
            await service.subscribeToCollection('azuki', ['item_listed'], callback);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Subscribing to collection events:',
                expect.objectContaining({
                    collection: 'azuki',
                    eventTypes: ['item_listed']
                })
            );
        });
    });

    describe('subscribeToAllCollections', () => {
        beforeEach(async () => {
            service = new StreamService();
            await service.connect();
        });

        it('should subscribe to all collections using wildcard', async () => {
            // Arrange
            const callback = jest.fn();
            const eventTypes = ['item_sold'];

            // Act
            await service.subscribeToAllCollections(eventTypes, callback);

            // Assert
            expect(mockClient.onEvents).toHaveBeenCalledWith(
                '*',
                eventTypes,
                expect.any(Function)
            );
        });

        it('should support wallet address filtering for wildcard subscriptions', async () => {
            // Arrange
            const callback = jest.fn();
            const walletAddress = '0x1234567890123456789012345678901234567890';

            // Act
            await service.subscribeToAllCollections(['item_listed'], callback, walletAddress);

            // Assert
            const subscription = service.subscriptions.get('*:item_listed');
            expect(subscription.walletAddress).toBe(walletAddress);
        });
    });

    describe('event filtering by wallet address', () => {
        beforeEach(async () => {
            service = new StreamService();
            await service.connect();
        });

        it('should filter events by from_account address', async () => {
            // Arrange
            const callback = jest.fn();
            const walletAddress = '0xABCD1234567890123456789012345678901234EF';
            let eventHandler;

            mockClient.onEvents.mockImplementation((collection, eventTypes, handler) => {
                eventHandler = handler;
            });

            await service.subscribeToCollection('azuki', ['item_listed'], callback, walletAddress);

            const event = {
                event_type: 'item_listed',
                payload: {
                    from_account: { address: '0xabcd1234567890123456789012345678901234ef' },
                    to_account: { address: '0x0000000000000000000000000000000000000000' }
                }
            };

            // Act
            eventHandler(event);

            // Assert
            expect(callback).toHaveBeenCalledWith(event);
        });

        it('should filter events by to_account address', async () => {
            // Arrange
            const callback = jest.fn();
            const walletAddress = '0xABCD1234567890123456789012345678901234EF';
            let eventHandler;

            mockClient.onEvents.mockImplementation((collection, eventTypes, handler) => {
                eventHandler = handler;
            });

            await service.subscribeToCollection('azuki', ['item_sold'], callback, walletAddress);

            const event = {
                event_type: 'item_sold',
                payload: {
                    from_account: { address: '0x0000000000000000000000000000000000000000' },
                    to_account: { address: '0xabcd1234567890123456789012345678901234ef' }
                }
            };

            // Act
            eventHandler(event);

            // Assert
            expect(callback).toHaveBeenCalledWith(event);
        });

        it('should not call callback for events from other wallets', async () => {
            // Arrange
            const callback = jest.fn();
            const walletAddress = '0xABCD1234567890123456789012345678901234EF';
            let eventHandler;

            mockClient.onEvents.mockImplementation((collection, eventTypes, handler) => {
                eventHandler = handler;
            });

            await service.subscribeToCollection('azuki', ['item_listed'], callback, walletAddress);

            const event = {
                event_type: 'item_listed',
                payload: {
                    from_account: { address: '0x9999999999999999999999999999999999999999' },
                    to_account: { address: '0x8888888888888888888888888888888888888888' }
                }
            };

            // Act
            eventHandler(event);

            // Assert
            expect(callback).not.toHaveBeenCalled();
        });

        it('should handle case-insensitive wallet address matching', async () => {
            // Arrange
            const callback = jest.fn();
            const walletAddress = '0xABCD1234567890123456789012345678901234EF'; // Mixed case
            let eventHandler;

            mockClient.onEvents.mockImplementation((collection, eventTypes, handler) => {
                eventHandler = handler;
            });

            await service.subscribeToCollection('azuki', ['item_listed'], callback, walletAddress);

            const event = {
                event_type: 'item_listed',
                payload: {
                    from_account: { address: '0xabcd1234567890123456789012345678901234ef' }, // Lowercase
                    to_account: { address: '0x0000000000000000000000000000000000000000' }
                }
            };

            // Act
            eventHandler(event);

            // Assert
            expect(callback).toHaveBeenCalledWith(event);
        });

        it('should pass all events when wallet filter is not provided', async () => {
            // Arrange
            const callback = jest.fn();
            let eventHandler;

            mockClient.onEvents.mockImplementation((collection, eventTypes, handler) => {
                eventHandler = handler;
            });

            await service.subscribeToCollection('azuki', ['item_listed'], callback);

            const event = {
                event_type: 'item_listed',
                payload: {
                    from_account: { address: '0x9999999999999999999999999999999999999999' },
                    to_account: { address: '0x8888888888888888888888888888888888888888' }
                }
            };

            // Act
            eventHandler(event);

            // Assert
            expect(callback).toHaveBeenCalledWith(event);
        });

        it('should not call callback when wallet filter enabled and account info missing', async () => {
            // Arrange
            const callback = jest.fn();
            const walletAddress = '0xABCD1234567890123456789012345678901234EF';
            let eventHandler;

            mockClient.onEvents.mockImplementation((collection, eventTypes, handler) => {
                eventHandler = handler;
            });

            await service.subscribeToCollection('azuki', ['item_listed'], callback, walletAddress);

            const event = {
                event_type: 'item_listed',
                payload: {}
            };

            // Act
            eventHandler(event);

            // Assert
            // Should NOT pass through when wallet filter is enabled but account info is missing
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('unsubscribe', () => {
        beforeEach(async () => {
            service = new StreamService();
            await service.connect();
        });

        it('should clear all subscriptions', async () => {
            // Arrange
            await service.subscribeToCollection('azuki', ['item_listed'], jest.fn());
            await service.subscribeToCollection('doodles', ['item_sold'], jest.fn());
            expect(service.getSubscriptionCount()).toBe(2);

            // Act
            await service.unsubscribe();

            // Assert
            expect(service.getSubscriptionCount()).toBe(0);
        });

        it('should handle unsubscribe when no active subscriptions', async () => {
            // Act & Assert
            await expect(service.unsubscribe()).resolves.not.toThrow();
            expect(service.getSubscriptionCount()).toBe(0);
        });

        it('should log unsubscribe event', async () => {
            // Arrange
            await service.subscribeToCollection('azuki', ['item_listed'], jest.fn());
            mockLogger.info.mockClear();

            // Act
            await service.unsubscribe();

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Unsubscribing from 1 subscription(s)');
            expect(mockLogger.info).toHaveBeenCalledWith('All subscriptions removed');
        });
    });

    describe('disconnect', () => {
        beforeEach(async () => {
            service = new StreamService();
            await service.connect();
        });

        it('should clear reconnection timer', async () => {
            // Arrange
            service.reconnectTimer = setTimeout(() => {}, 1000);

            // Act
            await service.disconnect();

            // Assert
            expect(service.reconnectTimer).toBeNull();
        });

        it('should clear all subscriptions', async () => {
            // Arrange
            await service.subscribeToCollection('azuki', ['item_listed'], jest.fn());

            // Act
            await service.disconnect();

            // Assert
            expect(service.getSubscriptionCount()).toBe(0);
        });

        it('should set connection state to DISCONNECTED', async () => {
            // Act
            await service.disconnect();

            // Assert
            expect(service.getConnectionState()).toBe(StreamService.ConnectionState.DISCONNECTED);
        });

        it('should set client to null', async () => {
            // Act
            await service.disconnect();

            // Assert
            expect(service.client).toBeNull();
        });

        it('should handle disconnect when already disconnected', async () => {
            // Arrange
            await service.disconnect();

            // Act & Assert
            await expect(service.disconnect()).resolves.not.toThrow();
        });

        it('should log disconnect events', async () => {
            // Arrange
            mockLogger.info.mockClear();

            // Act
            await service.disconnect();

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Disconnecting from OpenSea Stream API...');
            expect(mockLogger.info).toHaveBeenCalledWith('Successfully disconnected from OpenSea Stream API');
        });
    });

    describe('reconnection logic', () => {
        beforeEach(async () => {
            service = new StreamService({ maxReconnectDelay: 10000 });
            await service.connect();
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should trigger reconnection on connection error', () => {
            // Arrange
            const errorHandler = mockClient.onError.mock.calls[0][0];

            // Act
            errorHandler(new Error('Connection lost'));

            // Assert
            expect(service.connectionState).toBe(StreamService.ConnectionState.RECONNECTING);
        });

        it('should use exponential backoff for reconnection attempts', async () => {
            // Arrange
            const errorHandler = mockClient.onError.mock.calls[0][0];

            // Act - First attempt
            errorHandler(new Error('Connection lost'));
            expect(service.reconnectAttempts).toBe(1);

            // Should schedule reconnection at 1s
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Scheduling reconnection attempt 1 in 1000ms')
            );

            // Simulate failed reconnection
            mockOpenSeaStreamClient.mockImplementationOnce(() => {
                throw new Error('Still failing');
            });

            await jest.advanceTimersByTimeAsync(1000);

            // Second attempt should be at 2s
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Scheduling reconnection attempt 2 in 2000ms')
            );
        });

        it('should cap reconnection delay at maxReconnectDelay', async () => {
            // Arrange
            service.config.maxReconnectDelay = 5000;
            service.reconnectAttempts = 10; // Would normally be 1024s, but should cap at 5s

            // Act
            service._scheduleReconnection();

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('in 5000ms')
            );
        });

        it('should reset reconnect attempts on successful reconnection', async () => {
            // Arrange
            const errorHandler = mockClient.onError.mock.calls[0][0];
            service.reconnectAttempts = 5;

            // Prepare successful reconnection
            const newMockClient = {
                onEvents: jest.fn(),
                onError: jest.fn()
            };
            mockOpenSeaStreamClient.mockImplementation(() => newMockClient);

            // Act
            errorHandler(new Error('Connection lost'));
            await jest.advanceTimersByTimeAsync(32000); // Wait for reconnection

            // Assert
            expect(service.reconnectAttempts).toBe(0);
            expect(service.connectionState).toBe(StreamService.ConnectionState.CONNECTED);
        });

        it('should not attempt reconnection when already disconnected', () => {
            // Arrange
            const errorHandler = mockClient.onError.mock.calls[0][0];
            service.connectionState = StreamService.ConnectionState.DISCONNECTED;

            // Act
            errorHandler(new Error('Connection lost'));

            // Assert
            expect(service.reconnectAttempts).toBe(0);
            expect(service.reconnectTimer).toBeNull();
        });
    });

    describe('getConnectionState', () => {
        it('should return current connection state', async () => {
            // Arrange
            service = new StreamService();

            // Act & Assert - Initial state
            expect(service.getConnectionState()).toBe(StreamService.ConnectionState.DISCONNECTED);

            // Connect
            await service.connect();
            expect(service.getConnectionState()).toBe(StreamService.ConnectionState.CONNECTED);

            // Disconnect
            await service.disconnect();
            expect(service.getConnectionState()).toBe(StreamService.ConnectionState.DISCONNECTED);
        });
    });

    describe('getSubscriptionCount', () => {
        beforeEach(async () => {
            service = new StreamService();
            await service.connect();
        });

        it('should return 0 when no subscriptions', () => {
            // Act & Assert
            expect(service.getSubscriptionCount()).toBe(0);
        });

        it('should return correct count after adding subscriptions', async () => {
            // Act
            await service.subscribeToCollection('azuki', ['item_listed'], jest.fn());
            expect(service.getSubscriptionCount()).toBe(1);

            await service.subscribeToCollection('doodles', ['item_sold'], jest.fn());
            expect(service.getSubscriptionCount()).toBe(2);
        });

        it('should return 0 after unsubscribing', async () => {
            // Arrange
            await service.subscribeToCollection('azuki', ['item_listed'], jest.fn());

            // Act
            await service.unsubscribe();

            // Assert
            expect(service.getSubscriptionCount()).toBe(0);
        });
    });

    describe('static properties', () => {
        it('should define ConnectionState constants', () => {
            // Assert
            expect(StreamService.ConnectionState).toEqual({
                DISCONNECTED: 'disconnected',
                CONNECTING: 'connecting',
                CONNECTED: 'connected',
                RECONNECTING: 'reconnecting'
            });
        });

        it('should define EventTypes constants', () => {
            // Assert
            expect(StreamService.EventTypes).toEqual({
                ITEM_LISTED: 'item_listed',
                ITEM_SOLD: 'item_sold',
                ITEM_TRANSFERRED: 'item_transferred',
                ITEM_RECEIVED_BID: 'item_received_bid',
                ITEM_CANCELLED: 'item_cancelled',
                ITEM_METADATA_UPDATED: 'item_metadata_updated'
            });
        });
    });
});
