/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Create mock OpenSeaApi
const mockOpenseaApi = {
    getAccountEvents: jest.fn(),
    getCollectionEvents: jest.fn()
};

// Create mock logger
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
};

// Mock modules
jest.unstable_mockModule('../utils/logger.js', () => ({
    logger: mockLogger
}));

jest.unstable_mockModule('../utils/env.js', () => ({
    OPENSEA_API_KEY: 'test-api-key',
    OPENSEA_BASE_URL: 'https://api.opensea.io',
    ALCHEMY_API_KEY: 'test-alchemy-key'
}));

// Mock OpenSeaApi class
jest.unstable_mockModule('../services/openseaApi.js', () => ({
    OpenSeaApi: jest.fn().mockImplementation(() => mockOpenseaApi)
}));

// Import after mocking
const { PollingMonitorService } = await import('../services/pollingMonitorService.js');

describe('PollingMonitorService', () => {
    let service;
    const testChainConfig = { name: 'ethereum', chain: 'ethereum' };

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        mockOpenseaApi.getAccountEvents.mockClear();
        mockOpenseaApi.getCollectionEvents.mockClear();

        // Set environment variables
        process.env.OPENSEA_API_KEY = 'test-api-key';

        // Clear timers
        jest.useFakeTimers();
    });

    afterEach(async () => {
        if (service) {
            await service.disconnect();
        }
        jest.useRealTimers();
    });

    describe('constructor', () => {
        it('should create instance with default configuration', () => {
            // Arrange & Act
            service = new PollingMonitorService({ chainConfig: testChainConfig });

            // Assert
            expect(service.config.apiKey).toBe('test-api-key');
            expect(service.config.network).toBe('mainnet');
            expect(service.config.pollingInterval).toBe(5000);
            expect(service.config.initialLookback).toBe(300);
            expect(service.connectionState).toBe(PollingMonitorService.ConnectionState.DISCONNECTED);
            expect(service.subscriptions.size).toBe(0);
        });

        it('should create instance with custom configuration', () => {
            // Arrange & Act
            service = new PollingMonitorService({
                apiKey: 'custom-api-key',
                network: 'testnet',
                chainConfig: testChainConfig,
                pollingInterval: 10000,
                initialLookback: 600
            });

            // Assert
            expect(service.config.apiKey).toBe('custom-api-key');
            expect(service.config.network).toBe('testnet');
            expect(service.config.pollingInterval).toBe(10000);
            expect(service.config.initialLookback).toBe(600);
        });

        it('should throw error when API key is missing', () => {
            // Act & Assert
            expect(() => new PollingMonitorService({ apiKey: '', chainConfig: testChainConfig }))
                .toThrow('OpenSea API key is required');
        });

        it('should throw error when chainConfig is missing', () => {
            // Act & Assert
            expect(() => new PollingMonitorService())
                .toThrow('chainConfig is required');
        });

        it('should read pollingInterval from environment variable', () => {
            // Arrange
            process.env.MONITOR_POLLING_INTERVAL = '3000';

            // Act
            service = new PollingMonitorService({ chainConfig: testChainConfig });

            // Assert
            expect(service.config.pollingInterval).toBe(3000);
        });

        it('should read initialLookback from environment variable', () => {
            // Arrange
            process.env.MONITOR_INITIAL_LOOKBACK = '600';

            // Act
            service = new PollingMonitorService({ chainConfig: testChainConfig });

            // Assert
            expect(service.config.initialLookback).toBe(600);
        });
    });

    describe('connect', () => {
        it('should initialize connection successfully', async () => {
            // Arrange
            service = new PollingMonitorService({ chainConfig: testChainConfig });

            // Act
            await service.connect();

            // Assert
            expect(service.connectionState).toBe(PollingMonitorService.ConnectionState.CONNECTED);
            expect(service.lastEventTimestamp).toBeDefined();
            expect(service.lastEventTimestamp).toBeGreaterThan(0);
        });

        it('should not connect if already connected', async () => {
            // Arrange
            service = new PollingMonitorService({ chainConfig: testChainConfig });
            await service.connect();
            const initialTimestamp = service.lastEventTimestamp;

            // Act
            await service.connect();

            // Assert
            expect(service.lastEventTimestamp).toBe(initialTimestamp);
        });

        it('should set initial lookback timestamp based on config', async () => {
            // Arrange
            const lookback = 300; // 5 minutes
            service = new PollingMonitorService({
                chainConfig: testChainConfig,
                initialLookback: lookback
            });

            const beforeConnect = Math.floor(Date.now() / 1000);

            // Act
            await service.connect();

            // Assert
            const expectedTimestamp = beforeConnect - lookback;
            expect(service.lastEventTimestamp).toBeGreaterThanOrEqual(expectedTimestamp - 1);
            expect(service.lastEventTimestamp).toBeLessThanOrEqual(expectedTimestamp + 1);
        });
    });

    describe('subscribeToCollection', () => {
        beforeEach(async () => {
            service = new PollingMonitorService({ chainConfig: testChainConfig });
            await service.connect();
        });

        it('should subscribe to collection events successfully', async () => {
            // Arrange
            const callback = jest.fn();
            const eventTypes = ['item_sold', 'item_listed'];

            // Act
            await service.subscribeToCollection('test-collection', eventTypes, callback);

            // Assert
            expect(service.subscriptions.size).toBe(1);
            const sub = Array.from(service.subscriptions.values())[0];
            expect(sub.collectionSlug).toBe('test-collection');
            expect(sub.eventTypes).toEqual(eventTypes);
            expect(sub.callback).toBe(callback);
        });

        it('should subscribe with wallet address filter', async () => {
            // Arrange
            const callback = jest.fn();
            const eventTypes = ['item_sold'];
            const walletAddress = '0x1234567890abcdef';

            // Act
            await service.subscribeToCollection('test-collection', eventTypes, callback, walletAddress);

            // Assert
            const sub = Array.from(service.subscriptions.values())[0];
            expect(sub.walletAddress).toBe(walletAddress);
        });

        it('should start polling when first subscription is added', async () => {
            // Arrange
            const callback = jest.fn();
            const eventTypes = ['item_sold'];

            // Act
            await service.subscribeToCollection('test-collection', eventTypes, callback, '0x123');

            // Assert
            expect(service.pollingTimer).toBeDefined();
        });

        it('should throw error if not connected', async () => {
            // Arrange
            const disconnectedService = new PollingMonitorService({ chainConfig: testChainConfig });
            const callback = jest.fn();

            // Act & Assert
            await expect(disconnectedService.subscribeToCollection('test', ['item_sold'], callback))
                .rejects.toThrow('Service not connected');
        });

        it('should throw error if eventTypes is empty', async () => {
            // Arrange
            const callback = jest.fn();

            // Act & Assert
            await expect(service.subscribeToCollection('test', [], callback))
                .rejects.toThrow('Event types must be a non-empty array');
        });
    });

    describe('subscribeToAllCollections', () => {
        beforeEach(async () => {
            service = new PollingMonitorService({ chainConfig: testChainConfig });
            await service.connect();
        });

        it('should subscribe to wildcard collection', async () => {
            // Arrange
            const callback = jest.fn();
            const eventTypes = ['item_sold'];

            // Act
            await service.subscribeToAllCollections(eventTypes, callback, '0x123');

            // Assert
            const sub = Array.from(service.subscriptions.values())[0];
            expect(sub.collectionSlug).toBe('*');
        });
    });

    describe('unsubscribe', () => {
        beforeEach(async () => {
            service = new PollingMonitorService({ chainConfig: testChainConfig });
            await service.connect();
        });

        it('should remove all subscriptions', async () => {
            // Arrange
            await service.subscribeToCollection('test1', ['item_sold'], jest.fn(), '0x123');
            await service.subscribeToCollection('test2', ['item_listed'], jest.fn(), '0x456');

            // Act
            await service.unsubscribe();

            // Assert
            expect(service.subscriptions.size).toBe(0);
            expect(service.pollingTimer).toBeNull();
        });

        it('should do nothing if no subscriptions exist', async () => {
            // Act & Assert
            await expect(service.unsubscribe()).resolves.not.toThrow();
        });
    });

    describe('disconnect', () => {
        it('should disconnect and clean up resources', async () => {
            // Arrange
            service = new PollingMonitorService({ chainConfig: testChainConfig });
            await service.connect();
            await service.subscribeToCollection('test', ['item_sold'], jest.fn(), '0x123');

            // Act
            await service.disconnect();

            // Assert
            expect(service.connectionState).toBe(PollingMonitorService.ConnectionState.DISCONNECTED);
            expect(service.subscriptions.size).toBe(0);
            expect(service.pollingTimer).toBeNull();
            expect(service.lastEventTimestamp).toBeNull();
            expect(service.seenEventIds.size).toBe(0);
        });

        it('should do nothing if already disconnected', async () => {
            // Arrange
            service = new PollingMonitorService({ chainConfig: testChainConfig });

            // Act & Assert
            await expect(service.disconnect()).resolves.not.toThrow();
        });
    });

    describe('getConnectionState', () => {
        it('should return current connection state', async () => {
            // Arrange
            service = new PollingMonitorService({ chainConfig: testChainConfig });

            // Assert initial state
            expect(service.getConnectionState()).toBe(PollingMonitorService.ConnectionState.DISCONNECTED);

            // Connect
            await service.connect();
            expect(service.getConnectionState()).toBe(PollingMonitorService.ConnectionState.CONNECTED);

            // Disconnect
            await service.disconnect();
            expect(service.getConnectionState()).toBe(PollingMonitorService.ConnectionState.DISCONNECTED);
        });
    });

    describe('getSubscriptionCount', () => {
        beforeEach(async () => {
            service = new PollingMonitorService({ chainConfig: testChainConfig });
            await service.connect();
        });

        it('should return correct subscription count', async () => {
            // Initial count
            expect(service.getSubscriptionCount()).toBe(0);

            // Add subscriptions
            await service.subscribeToCollection('test1', ['item_sold'], jest.fn(), '0x123');
            expect(service.getSubscriptionCount()).toBe(1);

            await service.subscribeToCollection('test2', ['item_listed'], jest.fn(), '0x456');
            expect(service.getSubscriptionCount()).toBe(2);

            // Unsubscribe
            await service.unsubscribe();
            expect(service.getSubscriptionCount()).toBe(0);
        });
    });

    describe('polling behavior', () => {
        beforeEach(async () => {
            service = new PollingMonitorService({
                chainConfig: testChainConfig,
                pollingInterval: 5000
            });
            await service.connect();
        });

        it('should start polling timer when subscription is added', async () => {
            // Arrange
            const callback = jest.fn();
            const walletAddress = '0x1234567890abcdef';
            mockOpenseaApi.getAccountEvents.mockResolvedValue({
                asset_events: [],
                next: null
            });

            // Act
            await service.subscribeToCollection('test', ['item_sold'], callback, walletAddress);

            // Assert
            expect(service.pollingTimer).toBeDefined();
            expect(service.pollingTimer).not.toBeNull();
        });

        it('should generate unique event IDs', () => {
            // Arrange
            const event1 = {
                event_timestamp: '2024-01-01T12:00:00Z',
                event_type: 'sale',
                nft: { contract: '0xabc', identifier: '123' },
                transaction: 'tx1'
            };

            const event2 = {
                event_timestamp: '2024-01-01T12:00:00Z',
                event_type: 'sale',
                nft: { contract: '0xabc', identifier: '123' },
                transaction: 'tx2' // Different transaction
            };

            // Act
            const id1 = service._generateEventId(event1);
            const id2 = service._generateEventId(event2);

            // Assert
            expect(id1).not.toBe(id2);
            expect(id1).toContain('sale');
            expect(id1).toContain('tx1');
            expect(id2).toContain('tx2');
        });
    });

    describe('event transformation', () => {
        it('should transform REST API event to Stream API format for sale', () => {
            // Arrange
            service = new PollingMonitorService({ chainConfig: testChainConfig });
            const restEvent = {
                event_type: 'sale',
                event_timestamp: '2024-01-01T12:00:00Z',
                nft: {
                    contract: '0xabc',
                    identifier: '123',
                    name: 'Test NFT',
                    collection: 'test-collection'
                },
                payment: { quantity: '1000000000000000000' },
                seller: '0x111',
                buyer: '0x222'
            };

            // Act
            const transformed = service._transformEventToStreamFormat(restEvent);

            // Assert
            expect(transformed.event_type).toBe('item_sold');
            expect(transformed.event_timestamp).toBe('2024-01-01T12:00:00Z');
            expect(transformed.payload.item.nft_id).toBe('ethereum/0xabc/123');
            expect(transformed.payload.sale_price).toBe('1000000000000000000');
            expect(transformed.payload.from_account.address).toBe('0x111');
            expect(transformed.payload.to_account.address).toBe('0x222');
        });

        it('should transform REST API event to Stream API format for transfer', () => {
            // Arrange
            service = new PollingMonitorService({ chainConfig: testChainConfig });
            const restEvent = {
                event_type: 'transfer',
                event_timestamp: '2024-01-01T12:00:00Z',
                nft: {
                    contract: '0xabc',
                    identifier: '123',
                    name: 'Test NFT',
                    collection: 'test-collection'
                },
                from_address: '0x111',
                to_address: '0x222'
            };

            // Act
            const transformed = service._transformEventToStreamFormat(restEvent);

            // Assert
            expect(transformed.event_type).toBe('item_transferred');
            expect(transformed.payload.from_account.address).toBe('0x111');
            expect(transformed.payload.to_account.address).toBe('0x222');
        });
    });
});
