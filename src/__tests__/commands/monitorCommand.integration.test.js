/**
 * @jest-environment node
 * Integration tests for monitorCommand - tests actual functionality with mocked services
 */

import { monitorCommand } from '../../commands/monitorCommand.js';
import { StreamService } from '../../services/streamService.js';
import { NotificationService } from '../../services/notificationService.js';
import { KeyManager } from '../../utils/keyManager.js';
import { ethers } from 'ethers';

// Mock dependencies
jest.mock('../../services/streamService.js');
jest.mock('../../services/notificationService.js');
jest.mock('../../utils/keyManager.js');
jest.mock('../../utils/commandUtils.js', () => ({
    addChainOption: jest.fn((command) => command),
    getEffectiveChain: jest.fn(async () => ({
        name: 'ethereum',
        chainId: 1,
        openseaChainName: 'mainnet'
    }))
}));

describe('monitorCommand Integration Tests', () => {
    let mockStreamService;
    let mockNotificationService;
    let mockKeyManager;
    let processExitSpy;
    let consoleErrorSpy;

    beforeEach(() => {
        // Mock StreamService
        mockStreamService = {
            connect: jest.fn().mockResolvedValue(undefined),
            disconnect: jest.fn().mockResolvedValue(undefined),
            subscribeToCollection: jest.fn().mockResolvedValue(undefined),
            subscribeToAllCollections: jest.fn().mockResolvedValue(undefined),
            isConnected: jest.fn().mockReturnValue(true)
        };
        StreamService.mockImplementation(() => mockStreamService);

        // Mock NotificationService
        mockNotificationService = {
            displayEvent: jest.fn(),
            logEvent: jest.fn().mockResolvedValue(undefined),
            queryEvents: jest.fn().mockResolvedValue([]),
            rotateOldLogs: jest.fn()
        };
        NotificationService.mockImplementation(() => mockNotificationService);

        // Mock KeyManager
        mockKeyManager = {
            decryptKey: jest.fn().mockResolvedValue('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
        };
        KeyManager.mockImplementation(() => mockKeyManager);

        // Spy on process.exit to prevent test termination
        processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.clearAllMocks();
        processExitSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('monitor start', () => {
        it('should initialize services and subscribe to events with specific collections', async () => {
            const startCommand = monitorCommand.commands.find(cmd => cmd.name() === 'start');
            const options = { collections: 'azuki,beanz' };

            // Execute the action handler
            await startCommand._actionHandler(options);

            // Verify KeyManager was used to decrypt wallet
            expect(mockKeyManager.decryptKey).toHaveBeenCalled();

            // Verify StreamService was initialized and connected
            expect(StreamService).toHaveBeenCalled();
            expect(mockStreamService.connect).toHaveBeenCalled();

            // Verify NotificationService was initialized
            expect(NotificationService).toHaveBeenCalledWith({ verbosity: 'normal' });

            // Verify subscribeToCollection was called for each collection with correct parameters
            expect(mockStreamService.subscribeToCollection).toHaveBeenCalledTimes(2);
            expect(mockStreamService.subscribeToCollection).toHaveBeenCalledWith(
                'azuki',
                ['item_sold', 'item_listed', 'item_transferred', 'item_received_bid', 'item_cancelled'],
                expect.any(Function),
                expect.any(String)
            );
            expect(mockStreamService.subscribeToCollection).toHaveBeenCalledWith(
                'beanz',
                ['item_sold', 'item_listed', 'item_transferred', 'item_received_bid', 'item_cancelled'],
                expect.any(Function),
                expect.any(String)
            );
        });

        it('should subscribe to wildcard when --all-collections flag is used', async () => {
            const startCommand = monitorCommand.commands.find(cmd => cmd.name() === 'start');
            const options = { allCollections: true };

            await startCommand._actionHandler(options);

            // Verify wildcard subscription
            expect(mockStreamService.subscribeToCollection).toHaveBeenCalledTimes(1);
            expect(mockStreamService.subscribeToCollection).toHaveBeenCalledWith(
                '*',
                ['item_sold', 'item_listed', 'item_transferred', 'item_received_bid', 'item_cancelled'],
                expect.any(Function),
                expect.any(String)
            );
        });

        it('should use custom verbosity when specified', async () => {
            const startCommand = monitorCommand.commands.find(cmd => cmd.name() === 'start');
            const options = { verbosity: 'detailed' };

            await startCommand._actionHandler(options);

            // Verify NotificationService was initialized with custom verbosity
            expect(NotificationService).toHaveBeenCalledWith({ verbosity: 'detailed' });
        });

        it('should handle event callbacks correctly', async () => {
            const startCommand = monitorCommand.commands.find(cmd => cmd.name() === 'start');
            const options = { collections: 'test-collection' };

            await startCommand._actionHandler(options);

            // Get the callback function passed to subscribeToCollection
            const callback = mockStreamService.subscribeToCollection.mock.calls[0][2];

            // Simulate an event
            const mockEvent = {
                eventType: 'item_sold',
                timestamp: '2024-01-01T12:00:00Z',
                nft: { name: 'Test NFT', tokenId: '123' }
            };

            await callback(mockEvent);

            // Verify event was displayed and logged
            expect(mockNotificationService.displayEvent).toHaveBeenCalledWith(mockEvent);
            expect(mockNotificationService.logEvent).toHaveBeenCalledWith(
                mockEvent,
                expect.any(String),
                'ethereum'
            );
        });
    });

    describe('monitor history', () => {
        it('should query events with correct filters', async () => {
            const historyCommand = monitorCommand.commands.find(cmd => cmd.name() === 'history');
            const options = { type: 'sale', days: '7', limit: '50' };

            // Mock queryEvents to return sample events
            mockNotificationService.queryEvents.mockResolvedValue([
                {
                    eventType: 'item_sold',
                    timestamp: '2024-01-01T12:00:00Z',
                    nft: { name: 'Test NFT', tokenId: '123', collection: 'test-collection' }
                }
            ]);

            await historyCommand._actionHandler(options);

            // Verify queryEvents was called with correct parameters
            expect(mockNotificationService.queryEvents).toHaveBeenCalledWith(
                expect.any(String),
                'ethereum',
                expect.objectContaining({
                    eventType: 'item_sold',
                    startDate: expect.any(String),
                    limit: 50
                })
            );
        });

        it('should handle NFT filter correctly', async () => {
            const historyCommand = monitorCommand.commands.find(cmd => cmd.name() === 'history');
            const options = { nft: '0xabc123:456' };

            mockNotificationService.queryEvents.mockResolvedValue([]);

            await historyCommand._actionHandler(options);

            // Verify queryEvents was called with NFT filter
            expect(mockNotificationService.queryEvents).toHaveBeenCalledWith(
                expect.any(String),
                'ethereum',
                expect.objectContaining({
                    nftContract: '0xabc123',
                    tokenId: '456'
                })
            );
        });

        it('should handle no events found gracefully', async () => {
            const historyCommand = monitorCommand.commands.find(cmd => cmd.name() === 'history');
            const options = {};

            mockNotificationService.queryEvents.mockResolvedValue([]);

            await historyCommand._actionHandler(options);

            // Should not throw error, just log info
            expect(mockNotificationService.queryEvents).toHaveBeenCalled();
        });
    });

    describe('monitor stats', () => {
        it('should calculate statistics correctly', async () => {
            const statsCommand = monitorCommand.commands.find(cmd => cmd.name() === 'stats');
            const options = { days: '30' };

            // Mock queryEvents to return sample events
            const mockEvents = [
                { eventType: 'item_sold', timestamp: '2024-01-01T12:00:00Z' },
                { eventType: 'item_sold', timestamp: '2024-01-02T12:00:00Z' },
                { eventType: 'item_listed', timestamp: '2024-01-03T12:00:00Z' }
            ];
            mockNotificationService.queryEvents.mockResolvedValue(mockEvents);

            await statsCommand._actionHandler(options);

            // Verify queryEvents was called with correct date range
            expect(mockNotificationService.queryEvents).toHaveBeenCalledWith(
                expect.any(String),
                'ethereum',
                expect.objectContaining({
                    startDate: expect.any(String)
                })
            );
        });

        it('should handle no events gracefully', async () => {
            const statsCommand = monitorCommand.commands.find(cmd => cmd.name() === 'stats');
            const options = {};

            mockNotificationService.queryEvents.mockResolvedValue([]);

            await statsCommand._actionHandler(options);

            // Should not throw error
            expect(mockNotificationService.queryEvents).toHaveBeenCalled();
        });

        it('should use custom days period', async () => {
            const statsCommand = monitorCommand.commands.find(cmd => cmd.name() === 'stats');
            const options = { days: '7' };

            mockNotificationService.queryEvents.mockResolvedValue([]);

            await statsCommand._actionHandler(options);

            // Verify custom period was used
            expect(mockNotificationService.queryEvents).toHaveBeenCalled();
        });
    });

    describe('error handling', () => {
        it('should handle KeyManager errors gracefully', async () => {
            const startCommand = monitorCommand.commands.find(cmd => cmd.name() === 'start');
            mockKeyManager.decryptKey.mockRejectedValue(new Error('No key found'));

            await startCommand._actionHandler({});

            // Verify process.exit was called with error code
            expect(processExitSpy).toHaveBeenCalledWith(1);
        });

        it('should handle StreamService connection errors', async () => {
            const startCommand = monitorCommand.commands.find(cmd => cmd.name() === 'start');
            mockStreamService.connect.mockRejectedValue(new Error('Connection failed'));

            await startCommand._actionHandler({});

            // Verify process.exit was called with error code
            expect(processExitSpy).toHaveBeenCalledWith(1);
        });

        it('should handle NotificationService query errors', async () => {
            const historyCommand = monitorCommand.commands.find(cmd => cmd.name() === 'history');
            mockNotificationService.queryEvents.mockRejectedValue(new Error('Query failed'));

            await historyCommand._actionHandler({});

            // Verify process.exit was called with error code
            expect(processExitSpy).toHaveBeenCalledWith(1);
        });
    });
});
