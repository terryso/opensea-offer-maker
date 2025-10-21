/**
 * @jest-environment node
 */

import { jest } from '@jest/globals';

// Create mock logger
const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
};

// Create mock fs/promises functions
const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();
const mockReadFile = jest.fn();
const mockReaddir = jest.fn();
const mockStat = jest.fn();
const mockUnlink = jest.fn();

// Create mock formatUnits
const mockFormatUnits = jest.fn();

// Mock modules
jest.unstable_mockModule('../utils/logger.js', () => ({
    logger: mockLogger
}));

jest.unstable_mockModule('fs/promises', () => ({
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    readdir: mockReaddir,
    stat: mockStat,
    unlink: mockUnlink
}));

jest.unstable_mockModule('ethers', () => ({
    formatUnits: mockFormatUnits
}));

// Import after mocking
const { NotificationService } = await import('../services/notificationService.js');

describe('NotificationService', () => {
    let service;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        mockMkdir.mockResolvedValue(undefined);
        mockWriteFile.mockResolvedValue(undefined);
        mockReadFile.mockResolvedValue('');
        mockReaddir.mockResolvedValue([]);
        mockStat.mockResolvedValue({ mtime: new Date() });
        mockUnlink.mockResolvedValue(undefined);

        // Configure formatUnits mock to convert wei to ETH
        mockFormatUnits.mockImplementation((value, decimals) => {
            const wei = BigInt(value);
            const divisor = BigInt(10) ** BigInt(decimals);
            const eth = Number(wei) / Number(divisor);
            return eth.toString();
        });

        // Reset environment variables
        delete process.env.MONITOR_VERBOSITY;
        delete process.env.MONITOR_LOG_RETENTION_DAYS;
    });

    describe('constructor', () => {
        it('should create instance with default configuration', () => {
            // Arrange & Act
            service = new NotificationService();

            // Assert
            expect(service.verbosity).toBe('normal');
            expect(service.retentionDays).toBe(30);
            expect(service.cacheDir).toBe('.cache/events');
        });

        it('should create instance with custom configuration', () => {
            // Arrange & Act
            service = new NotificationService({
                verbosity: 'detailed',
                retentionDays: 60,
                cacheDir: 'custom/cache'
            });

            // Assert
            expect(service.verbosity).toBe('detailed');
            expect(service.retentionDays).toBe(60);
            expect(service.cacheDir).toBe('custom/cache');
        });

        it('should read verbosity from environment variable', () => {
            // Arrange
            process.env.MONITOR_VERBOSITY = 'minimal';

            // Act
            service = new NotificationService();

            // Assert
            expect(service.verbosity).toBe('minimal');
        });

        it('should read retention days from environment variable', () => {
            // Arrange
            process.env.MONITOR_LOG_RETENTION_DAYS = '90';

            // Act
            service = new NotificationService();

            // Assert
            expect(service.retentionDays).toBe(90);
        });

        it('should log initialization', () => {
            // Act
            service = new NotificationService();

            // Assert
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'NotificationService initialized:',
                expect.objectContaining({
                    verbosity: 'normal',
                    retentionDays: 30,
                    cacheDir: '.cache/events'
                })
            );
        });
    });

    describe('formatEvent', () => {
        beforeEach(() => {
            service = new NotificationService({ verbosity: 'normal' });
        });

        it('should dispatch to formatSaleEvent for item_sold', () => {
            // Arrange
            const event = {
                event_type: 'item_sold',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/123',
                        metadata: { name: 'Test NFT' }
                    },
                    collection: { name: 'Test Collection', slug: 'test-collection' },
                    sale_price: '1000000000000000000',
                    from_account: { address: '0xseller' },
                    to_account: { address: '0xbuyer' }
                }
            };

            // Act
            const result = service.formatEvent(event);

            // Assert
            expect(result).toContain('[SALE]');
            expect(result).toContain('Test NFT');
        });

        it('should dispatch to formatTransferEvent for item_transferred', () => {
            // Arrange
            const event = {
                event_type: 'item_transferred',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/123',
                        metadata: { name: 'Test NFT' }
                    },
                    collection: { name: 'Test Collection' },
                    from_account: { address: '0xfrom' },
                    to_account: { address: '0xto' }
                }
            };

            // Act
            const result = service.formatEvent(event);

            // Assert
            expect(result).toContain('[TRANSFER]');
            expect(result).toContain('Test NFT');
        });

        it('should dispatch to formatListingEvent for item_listed', () => {
            // Arrange
            const event = {
                event_type: 'item_listed',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/123',
                        metadata: { name: 'Test NFT' }
                    },
                    collection: { name: 'Test Collection' },
                    base_price: '500000000000000000',
                    maker: { address: '0xmaker' }
                }
            };

            // Act
            const result = service.formatEvent(event);

            // Assert
            expect(result).toContain('[LISTING]');
            expect(result).toContain('Test NFT');
        });

        it('should dispatch to formatBidEvent for item_received_bid', () => {
            // Arrange
            const event = {
                event_type: 'item_received_bid',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/123',
                        metadata: { name: 'Test NFT' }
                    },
                    collection: { name: 'Test Collection' },
                    base_price: '750000000000000000',
                    maker: { address: '0xbidder' }
                }
            };

            // Act
            const result = service.formatEvent(event);

            // Assert
            expect(result).toContain('[BID]');
            expect(result).toContain('Test NFT');
        });

        it('should dispatch to formatCancelEvent for item_cancelled', () => {
            // Arrange
            const event = {
                event_type: 'item_cancelled',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/123',
                        metadata: { name: 'Test NFT' }
                    },
                    collection: { name: 'Test Collection' },
                    maker: { address: '0xmaker' }
                }
            };

            // Act
            const result = service.formatEvent(event);

            // Assert
            expect(result).toContain('[CANCEL]');
            expect(result).toContain('Test NFT');
        });

        it('should handle unknown event types', () => {
            // Arrange
            const event = {
                event_type: 'unknown_event',
                payload: {}
            };

            // Act
            const result = service.formatEvent(event);

            // Assert
            expect(result).toContain('[UNKNOWN_EVENT]');
            expect(mockLogger.debug).toHaveBeenCalledWith('Unknown event type:', 'unknown_event');
        });

        it('should handle invalid event object', () => {
            // Act
            const result = service.formatEvent(null);

            // Assert
            expect(result).toBe('[ERROR] Invalid event');
            expect(mockLogger.error).toHaveBeenCalledWith('Invalid event object:', null);
        });

        it('should handle event without event_type', () => {
            // Arrange
            const event = { payload: {} };

            // Act
            const result = service.formatEvent(event);

            // Assert
            expect(result).toBe('[ERROR] Invalid event');
        });
    });

    describe('formatSaleEvent', () => {
        it('should format sale event with minimal verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'minimal' });
            const event = {
                event_type: 'item_sold',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/123',
                        metadata: { name: 'Cool NFT' }
                    },
                    sale_price: '1500000000000000000',
                    from_account: { address: '0xseller' },
                    to_account: { address: '0xbuyer' }
                }
            };

            // Act
            const result = service.formatSaleEvent(event);

            // Assert
            expect(result).toBe('[SALE] Cool NFT #123 sold for 1.5 ETH');
        });

        it('should format sale event with normal verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'normal' });
            const event = {
                event_type: 'item_sold',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234567890/456',
                        metadata: { name: 'Awesome NFT' }
                    },
                    collection: { name: 'Awesome Collection', slug: 'awesome' },
                    sale_price: '2000000000000000000',
                    from_account: { address: '0x1234567890abcdef' },
                    to_account: { address: '0xfedcba0987654321' }
                }
            };

            // Act
            const result = service.formatSaleEvent(event);

            // Assert
            expect(result).toContain('[SALE] Collection: Awesome Collection');
            expect(result).toContain('NFT: Awesome NFT #456');
            expect(result).toContain('Price: 2 ETH');
            expect(result).toContain('0x1234...cdef → To: 0xfedc...4321');
        });

        it('should format sale event with detailed verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'detailed' });
            const event = {
                event_type: 'item_sold',
                event_timestamp: '2024-01-01T12:00:00.000Z',
                payload: {
                    item: {
                        nft_id: 'ethereum/0xabcdef/789',
                        metadata: { name: 'Detailed NFT' }
                    },
                    collection: { name: 'Detail Collection', slug: 'detail-coll' },
                    sale_price: '3000000000000000000',
                    from_account: { address: '0xdetailseller' },
                    to_account: { address: '0xdetailbuyer' }
                }
            };

            // Act
            const result = service.formatSaleEvent(event);

            // Assert
            expect(result).toContain('═'.repeat(50));
            expect(result).toContain('[SALE] item_sold');
            expect(result).toContain('Time: 2024-01-01T12:00:00.000Z');
            expect(result).toContain('Collection: detail-coll (Detail Collection)');
            expect(result).toContain('NFT: Detailed NFT #789');
            expect(result).toContain('Contract: 0xabcdef');
            expect(result).toContain('Token ID: 789');
            expect(result).toContain('Price: 3 ETH (3000000000000000000 wei)');
            expect(result).toContain('Seller: 0xdetailseller');
            expect(result).toContain('Buyer: 0xdetailbuyer');
        });

        it('should handle missing data gracefully', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'normal' });
            const event = {
                event_type: 'item_sold',
                payload: {}
            };

            // Act
            const result = service.formatSaleEvent(event);

            // Assert
            expect(result).toContain('Unknown NFT');
            expect(result).toContain('Unknown Collection');
            expect(result).toContain('0 ETH');
        });
    });

    describe('formatTransferEvent', () => {
        it('should format transfer event with minimal verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'minimal' });
            const event = {
                event_type: 'item_transferred',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/100',
                        metadata: { name: 'Transfer NFT' }
                    }
                }
            };

            // Act
            const result = service.formatTransferEvent(event);

            // Assert
            expect(result).toBe('[TRANSFER] Transfer NFT #100 transferred');
        });

        it('should format transfer event with normal verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'normal' });
            const event = {
                event_type: 'item_transferred',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/200',
                        metadata: { name: 'Transfer NFT' }
                    },
                    collection: { name: 'Transfer Collection' },
                    from_account: { address: '0x1111111111111111' },
                    to_account: { address: '0x2222222222222222' }
                }
            };

            // Act
            const result = service.formatTransferEvent(event);

            // Assert
            expect(result).toContain('[TRANSFER] Collection: Transfer Collection');
            expect(result).toContain('NFT: Transfer NFT #200');
            expect(result).toContain('0x1111...1111 → To: 0x2222...2222');
        });
    });

    describe('formatListingEvent', () => {
        it('should format listing event with minimal verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'minimal' });
            const event = {
                event_type: 'item_listed',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/300',
                        metadata: { name: 'Listed NFT' }
                    },
                    base_price: '500000000000000000'
                }
            };

            // Act
            const result = service.formatListingEvent(event);

            // Assert
            expect(result).toBe('[LISTING] Listed NFT #300 listed for 0.5 ETH');
        });

        it('should use listing_price if base_price is not available', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'normal' });
            const event = {
                event_type: 'item_listed',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/301',
                        metadata: { name: 'Listed NFT' }
                    },
                    collection: { name: 'List Collection' },
                    listing_price: '800000000000000000',
                    maker: { address: '0xmaker123' }
                }
            };

            // Act
            const result = service.formatListingEvent(event);

            // Assert
            expect(result).toContain('Price: 0.8 ETH');
        });
    });

    describe('formatBidEvent', () => {
        it('should format bid event with minimal verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'minimal' });
            const event = {
                event_type: 'item_received_bid',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/400',
                        metadata: { name: 'Bid NFT' }
                    },
                    base_price: '600000000000000000'
                }
            };

            // Act
            const result = service.formatBidEvent(event);

            // Assert
            expect(result).toBe('[BID] Bid NFT #400 received bid of 0.6 ETH');
        });

        it('should use bid_amount if base_price is not available', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'normal' });
            const event = {
                event_type: 'item_received_bid',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/401',
                        metadata: { name: 'Bid NFT' }
                    },
                    collection: { name: 'Bid Collection' },
                    bid_amount: '900000000000000000',
                    maker: { address: '0xbidder123' }
                }
            };

            // Act
            const result = service.formatBidEvent(event);

            // Assert
            expect(result).toContain('Bid: 0.9 ETH');
        });
    });

    describe('formatCancelEvent', () => {
        it('should format cancel event with minimal verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'minimal' });
            const event = {
                event_type: 'item_cancelled',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/500',
                        metadata: { name: 'Cancel NFT' }
                    }
                }
            };

            // Act
            const result = service.formatCancelEvent(event);

            // Assert
            expect(result).toBe('[CANCEL] Cancel NFT #500 listing/bid cancelled');
        });

        it('should format cancel event with normal verbosity', () => {
            // Arrange
            service = new NotificationService({ verbosity: 'normal' });
            const event = {
                event_type: 'item_cancelled',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/501',
                        metadata: { name: 'Cancel NFT' }
                    },
                    collection: { name: 'Cancel Collection' },
                    maker: { address: '0xcanceller123' }
                }
            };

            // Act
            const result = service.formatCancelEvent(event);

            // Assert
            expect(result).toContain('[CANCEL] Collection: Cancel Collection');
            expect(result).toContain('NFT: Cancel NFT #501');
            expect(result).toContain('Cancelled By: 0xcanc...r123');
        });
    });

    describe('displayEvent', () => {
        beforeEach(() => {
            service = new NotificationService({ verbosity: 'normal' });
        });

        it('should call logger.info with formatted event', () => {
            // Arrange
            const event = {
                event_type: 'item_sold',
                payload: {
                    item: {
                        nft_id: 'ethereum/0x1234/123',
                        metadata: { name: 'Display NFT' }
                    },
                    collection: { name: 'Display Collection' },
                    sale_price: '1000000000000000000',
                    from_account: { address: '0xseller' },
                    to_account: { address: '0xbuyer' }
                }
            };

            // Act
            service.displayEvent(event);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('[SALE]'));
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Display NFT'));
        });
    });

    describe('logEvent', () => {
        beforeEach(() => {
            service = new NotificationService();
        });

        it('should create cache directory if it does not exist', async () => {
            // Arrange
            const event = {
                event_type: 'item_sold',
                event_timestamp: '2024-01-01T12:00:00.000Z',
                payload: {
                    item: {
                        nft_id: 'ethereum/0xcontract/123',
                        metadata: { name: 'Log NFT' }
                    },
                    collection: { slug: 'log-collection' },
                    sale_price: '1000000000000000000',
                    from_account: { address: '0xseller' },
                    to_account: { address: '0xbuyer' }
                }
            };
            const walletAddress = '0xWALLET';
            const chain = 'ETHEREUM';

            // Act
            await service.logEvent(event, walletAddress, chain);

            // Assert
            expect(mockMkdir).toHaveBeenCalledWith('.cache/events', { recursive: true });
        });

        it('should write event to JSONL file with correct path', async () => {
            // Arrange
            const event = {
                event_type: 'item_sold',
                event_timestamp: '2024-01-01T12:00:00.000Z',
                payload: {
                    item: {
                        nft_id: 'ethereum/0xcontract/123',
                        metadata: { name: 'Log NFT' }
                    },
                    collection: { slug: 'log-collection' },
                    sale_price: '1000000000000000000',
                    from_account: { address: '0xseller' },
                    to_account: { address: '0xbuyer' }
                }
            };
            const walletAddress = '0xWALLET123';
            const chain = 'ethereum';

            // Act
            await service.logEvent(event, walletAddress, chain);

            // Assert
            expect(mockWriteFile).toHaveBeenCalledWith(
                '.cache/events/0xwallet123_ethereum.jsonl',
                expect.stringContaining('"eventType":"item_sold"'),
                { flag: 'a' }
            );
        });

        it('should append event in JSONL format with newline', async () => {
            // Arrange
            const event = {
                event_type: 'item_transferred',
                event_timestamp: '2024-01-02T12:00:00.000Z',
                payload: {
                    item: {
                        nft_id: 'ethereum/0xabc/456',
                        metadata: { name: 'Transfer Log NFT' }
                    },
                    collection: { slug: 'transfer-coll' },
                    from_account: { address: '0xfrom' },
                    to_account: { address: '0xto' }
                }
            };
            const walletAddress = '0x123';
            const chain = 'base';

            // Act
            await service.logEvent(event, walletAddress, chain);

            // Assert
            const writeCall = mockWriteFile.mock.calls[0];
            const writtenData = writeCall[1];
            expect(writtenData).toMatch(/^\{.*\}\n$/); // JSON object followed by newline
            expect(writtenData).toContain('"eventType":"item_transferred"');
        });

        it('should transform event to standardized log format', async () => {
            // Arrange
            const event = {
                event_type: 'item_sold',
                event_timestamp: '2024-01-03T12:00:00.000Z',
                payload: {
                    item: {
                        nft_id: 'ethereum/0xcontract123/789',
                        metadata: { name: 'Standard NFT' }
                    },
                    collection: { slug: 'standard-coll' },
                    sale_price: '2000000000000000000',
                    from_account: { address: '0xseller123' },
                    to_account: { address: '0xbuyer456' }
                }
            };
            const walletAddress = '0xWallet789';
            const chain = 'polygon';

            // Act
            await service.logEvent(event, walletAddress, chain);

            // Assert
            const writeCall = mockWriteFile.mock.calls[0];
            const writtenData = writeCall[1];
            const logEntry = JSON.parse(writtenData.trim());

            expect(logEntry.eventType).toBe('item_sold');
            expect(logEntry.timestamp).toBe('2024-01-03T12:00:00.000Z');
            expect(logEntry.chain).toBe('polygon');
            expect(logEntry.nft.contract).toBe('0xcontract123');
            expect(logEntry.nft.tokenId).toBe('789');
            expect(logEntry.nft.name).toBe('Standard NFT');
            expect(logEntry.nft.collectionSlug).toBe('standard-coll');
            expect(logEntry.sale.price).toBe('2');
            expect(logEntry.sale.currency).toBe('ETH');
            expect(logEntry.sale.fromAddress).toBe('0xseller123');
            expect(logEntry.sale.toAddress).toBe('0xbuyer456');
            expect(logEntry.relevantToWallet).toBe('0xwallet789');
            expect(logEntry.raw).toEqual(event);
        });

        it('should handle file write errors gracefully', async () => {
            // Arrange
            mockWriteFile.mockRejectedValue(new Error('Disk full'));
            const event = {
                event_type: 'item_sold',
                payload: {
                    item: { nft_id: 'ethereum/0x123/1', metadata: { name: 'Error NFT' } },
                    collection: { slug: 'error-coll' },
                    sale_price: '1000000000000000000',
                    from_account: { address: '0xseller' },
                    to_account: { address: '0xbuyer' }
                }
            };

            // Act
            await service.logEvent(event, '0xwallet', 'ethereum');

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to log event:', 'Disk full');
        });

        it('should not throw error when logging fails', async () => {
            // Arrange
            mockWriteFile.mockRejectedValue(new Error('Permission denied'));
            const event = {
                event_type: 'item_sold',
                payload: {
                    item: { nft_id: 'ethereum/0x123/1', metadata: { name: 'Error NFT' } },
                    collection: { slug: 'error-coll' },
                    sale_price: '1000000000000000000',
                    from_account: { address: '0xseller' },
                    to_account: { address: '0xbuyer' }
                }
            };

            // Act & Assert
            await expect(service.logEvent(event, '0xwallet', 'ethereum')).resolves.not.toThrow();
        });
    });

    describe('queryEvents', () => {
        beforeEach(() => {
            service = new NotificationService();
        });

        it('should return empty array when file does not exist', async () => {
            // Arrange
            mockReadFile.mockRejectedValue({ code: 'ENOENT' });

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {});

            // Assert
            expect(result).toEqual([]);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Event log file not found:',
                '0xwallet',
                'ethereum'
            );
        });

        it('should read events from correct JSONL file', async () => {
            // Arrange
            const jsonl = [
                '{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","chain":"ethereum","nft":{"contract":"0x123","tokenId":"1","name":"NFT 1","collectionSlug":"coll"},"sale":{"price":"1.0","currency":"ETH","fromAddress":"0xa","toAddress":"0xb"},"relevantToWallet":"0xwallet"}',
                '{"eventType":"item_transferred","timestamp":"2024-01-02T12:00:00.000Z","chain":"ethereum","nft":{"contract":"0x456","tokenId":"2","name":"NFT 2","collectionSlug":"coll2"},"transfer":{"fromAddress":"0xc","toAddress":"0xd"},"relevantToWallet":"0xwallet"}'
            ].join('\n');
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            const result = await service.queryEvents('0xWALLET', 'ETHEREUM', {});

            // Assert
            expect(mockReadFile).toHaveBeenCalledWith('.cache/events/0xwallet_ethereum.jsonl', 'utf-8');
            expect(result).toHaveLength(2);
        });

        it('should filter events by eventType', async () => {
            // Arrange
            const jsonl = [
                '{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_transferred","timestamp":"2024-01-02T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-03T12:00:00.000Z","nft":{}}'
            ].join('\n');
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {
                eventType: 'item_sold'
            });

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0].eventType).toBe('item_sold');
            expect(result[1].eventType).toBe('item_sold');
        });

        it('should filter events by date range', async () => {
            // Arrange
            const jsonl = [
                '{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-15T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-31T12:00:00.000Z","nft":{}}'
            ].join('\n');
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {
                startDate: '2024-01-10T00:00:00.000Z',
                endDate: '2024-01-20T00:00:00.000Z'
            });

            // Assert
            expect(result).toHaveLength(1);
            expect(result[0].timestamp).toBe('2024-01-15T12:00:00.000Z');
        });

        it('should filter events by NFT contract', async () => {
            // Arrange
            const jsonl = [
                '{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{"contract":"0x111"}}',
                '{"eventType":"item_sold","timestamp":"2024-01-02T12:00:00.000Z","nft":{"contract":"0x222"}}',
                '{"eventType":"item_sold","timestamp":"2024-01-03T12:00:00.000Z","nft":{"contract":"0x111"}}'
            ].join('\n');
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {
                nftContract: '0x111'
            });

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0].nft.contract).toBe('0x111');
            expect(result[1].nft.contract).toBe('0x111');
        });

        it('should filter events by token ID', async () => {
            // Arrange
            const jsonl = [
                '{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{"tokenId":"100"}}',
                '{"eventType":"item_sold","timestamp":"2024-01-02T12:00:00.000Z","nft":{"tokenId":"200"}}',
                '{"eventType":"item_sold","timestamp":"2024-01-03T12:00:00.000Z","nft":{"tokenId":"100"}}'
            ].join('\n');
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {
                tokenId: '100'
            });

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0].nft.tokenId).toBe('100');
            expect(result[1].nft.tokenId).toBe('100');
        });

        it('should sort events by timestamp (newest first)', async () => {
            // Arrange
            const jsonl = [
                '{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-03T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-02T12:00:00.000Z","nft":{}}'
            ].join('\n');
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {});

            // Assert
            expect(result).toHaveLength(3);
            expect(result[0].timestamp).toBe('2024-01-03T12:00:00.000Z');
            expect(result[1].timestamp).toBe('2024-01-02T12:00:00.000Z');
            expect(result[2].timestamp).toBe('2024-01-01T12:00:00.000Z');
        });

        it('should support pagination with limit and offset', async () => {
            // Arrange
            const jsonl = [
                '{"eventType":"item_sold","timestamp":"2024-01-05T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-04T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-03T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-02T12:00:00.000Z","nft":{}}',
                '{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{}}'
            ].join('\n');
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {
                limit: 2,
                offset: 1
            });

            // Assert
            expect(result).toHaveLength(2);
            expect(result[0].timestamp).toBe('2024-01-04T12:00:00.000Z');
            expect(result[1].timestamp).toBe('2024-01-03T12:00:00.000Z');
        });

        it('should handle malformed JSON lines gracefully', async () => {
            // Arrange
            const jsonl = [
                '{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{}}',
                'this is not valid json',
                '{"eventType":"item_transferred","timestamp":"2024-01-02T12:00:00.000Z","nft":{}}'
            ].join('\n');
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {});

            // Assert
            expect(result).toHaveLength(2);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Malformed JSON line in event log:',
                expect.any(String)
            );
        });

        it('should handle file read errors', async () => {
            // Arrange
            mockReadFile.mockRejectedValue(new Error('Permission denied'));

            // Act
            const result = await service.queryEvents('0xwallet', 'ethereum', {});

            // Assert
            expect(result).toEqual([]);
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to query events:', 'Permission denied');
        });
    });

    describe('rotateOldLogs', () => {
        beforeEach(() => {
            service = new NotificationService({ retentionDays: 30 });
        });

        it('should create cache directory if it does not exist', async () => {
            // Act
            await service.rotateOldLogs();

            // Assert
            expect(mockMkdir).toHaveBeenCalledWith('.cache/events', { recursive: true });
        });

        it('should delete files where all events are older than retention period', async () => {
            // Arrange
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
            const jsonl = `{"eventType":"item_sold","timestamp":"${oldDate}","nft":{}}`;

            mockReaddir.mockResolvedValue(['0xwallet_ethereum.jsonl']);
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            await service.rotateOldLogs();

            // Assert
            expect(mockUnlink).toHaveBeenCalledWith('.cache/events/0xwallet_ethereum.jsonl');
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Deleted old event log file:',
                '0xwallet_ethereum.jsonl'
            );
        });

        it('should trim old events from files with mixed dates', async () => {
            // Arrange
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
            const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
            const jsonl = [
                `{"eventType":"item_sold","timestamp":"${oldDate}","nft":{}}`,
                `{"eventType":"item_sold","timestamp":"${recentDate}","nft":{}}`
            ].join('\n');

            mockReaddir.mockResolvedValue(['0xwallet_ethereum.jsonl']);
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            await service.rotateOldLogs();

            // Assert
            expect(mockWriteFile).toHaveBeenCalledWith(
                '.cache/events/0xwallet_ethereum.jsonl',
                expect.stringContaining(recentDate),
                { flag: 'w' }
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Trimmed old events from log file:',
                '0xwallet_ethereum.jsonl'
            );
        });

        it('should skip non-JSONL files', async () => {
            // Arrange
            mockReaddir.mockResolvedValue(['README.md', 'data.txt', 'events.jsonl']);
            mockReadFile.mockResolvedValue('{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{}}');

            // Act
            await service.rotateOldLogs();

            // Assert
            expect(mockReadFile).toHaveBeenCalledTimes(1); // Only events.jsonl
        });

        it('should keep files with all recent events', async () => {
            // Arrange
            const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
            const jsonl = `{"eventType":"item_sold","timestamp":"${recentDate}","nft":{}}`;

            mockReaddir.mockResolvedValue(['0xwallet_ethereum.jsonl']);
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            await service.rotateOldLogs();

            // Assert
            expect(mockUnlink).not.toHaveBeenCalled();
            expect(mockWriteFile).not.toHaveBeenCalled();
        });

        it('should handle malformed JSON during rotation', async () => {
            // Arrange
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
            const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
            const jsonl = [
                'invalid json line',
                `{"eventType":"item_sold","timestamp":"${oldDate}","nft":{}}`,
                `{"eventType":"item_sold","timestamp":"${recentDate}","nft":{}}`
            ].join('\n');

            mockReaddir.mockResolvedValue(['0xwallet_ethereum.jsonl']);
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            await service.rotateOldLogs();

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Malformed JSON in log rotation:',
                expect.any(String)
            );
            // Recent events and malformed lines should be kept
            expect(mockWriteFile).toHaveBeenCalled();
        });

        it('should delete file if only malformed lines remain after trimming', async () => {
            // Arrange
            const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
            const jsonl = `{"eventType":"item_sold","timestamp":"${oldDate}","nft":{}}`;

            mockReaddir.mockResolvedValue(['0xwallet_ethereum.jsonl']);
            mockReadFile.mockResolvedValue(jsonl);

            // Act
            await service.rotateOldLogs();

            // Assert
            expect(mockUnlink).toHaveBeenCalled();
        });

        it('should handle errors during file processing gracefully', async () => {
            // Arrange
            mockReaddir.mockResolvedValue(['error.jsonl', 'valid.jsonl']);
            mockReadFile
                .mockRejectedValueOnce(new Error('Read error'))
                .mockResolvedValueOnce('{"eventType":"item_sold","timestamp":"2024-01-01T12:00:00.000Z","nft":{}}');

            // Act
            await service.rotateOldLogs();

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to process log file during rotation:',
                'error.jsonl',
                'Read error'
            );
        });

        it('should not throw error when rotation fails', async () => {
            // Arrange
            mockReaddir.mockRejectedValue(new Error('Permission denied'));

            // Act & Assert
            await expect(service.rotateOldLogs()).resolves.not.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to rotate old logs:', 'Permission denied');
        });
    });

    describe('helper methods', () => {
        beforeEach(() => {
            service = new NotificationService();
        });

        describe('_extractContract', () => {
            it('should extract contract from nft_id', () => {
                // Act
                const result = service._extractContract('ethereum/0xcontract123/456');

                // Assert
                expect(result).toBe('0xcontract123');
            });

            it('should return null for invalid nft_id', () => {
                // Act
                const result = service._extractContract('invalid');

                // Assert
                expect(result).toBeNull();
            });

            it('should return null for null nft_id', () => {
                // Act
                const result = service._extractContract(null);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe('_extractTokenId', () => {
            it('should extract token ID from nft_id', () => {
                // Act
                const result = service._extractTokenId('ethereum/0xcontract/789');

                // Assert
                expect(result).toBe('789');
            });

            it('should return null for invalid nft_id', () => {
                // Act
                const result = service._extractTokenId('ethereum/0xcontract');

                // Assert
                expect(result).toBeNull();
            });

            it('should return null for null nft_id', () => {
                // Act
                const result = service._extractTokenId(null);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe('_truncateAddress', () => {
            it('should truncate long addresses', () => {
                // Act
                const result = service._truncateAddress('0x1234567890abcdef');

                // Assert
                expect(result).toBe('0x1234...cdef');
            });

            it('should return short addresses unchanged', () => {
                // Act
                const result = service._truncateAddress('0x123');

                // Assert
                expect(result).toBe('0x123');
            });

            it('should handle null addresses', () => {
                // Act
                const result = service._truncateAddress(null);

                // Assert
                expect(result).toBeNull();
            });
        });

        describe('Detailed verbosity for all event types', () => {
            beforeEach(() => {
                service = new NotificationService({ verbosity: 'detailed' });
            });

            describe('formatTransferEvent', () => {
                it('should format transfer event with detailed verbosity', () => {
                    // Arrange
                    const event = {
                        event_type: 'item_transferred',
                        event_timestamp: '2024-01-01T12:00:00.000Z',
                        payload: {
                            item: {
                                nft_id: 'ethereum/0xabcdef/123',
                                metadata: { name: 'Transfer NFT' }
                            },
                            collection: { name: 'Transfer Collection', slug: 'transfer-coll' },
                            from_account: { address: '0xfromaddress' },
                            to_account: { address: '0xtoaddress' }
                        }
                    };

                    // Act
                    const result = service.formatTransferEvent(event);

                    // Assert
                    expect(result).toContain('═'.repeat(50));
                    expect(result).toContain('[TRANSFER] item_transferred');
                    expect(result).toContain('Time: 2024-01-01T12:00:00.000Z');
                    expect(result).toContain('Collection: transfer-coll (Transfer Collection)');
                    expect(result).toContain('NFT: Transfer NFT #123');
                    expect(result).toContain('Contract: 0xabcdef');
                    expect(result).toContain('Token ID: 123');
                    expect(result).toContain('From: 0xfromaddress');
                    expect(result).toContain('To: 0xtoaddress');
                });

                it('should handle missing timestamp in detailed transfer', () => {
                    // Arrange
                    const event = {
                        event_type: 'item_transferred',
                        payload: {
                            item: {
                                nft_id: 'ethereum/0xcontract/456',
                                metadata: { name: 'No Time NFT' }
                            },
                            collection: { slug: 'no-time-coll' },
                            from_account: { address: '0xfrom' },
                            to_account: { address: '0xto' }
                        }
                    };

                    // Act
                    const result = service.formatTransferEvent(event);

                    // Assert
                    expect(result).toContain('Time:'); // Should have current timestamp
                    expect(result).toContain('No Time NFT #456');
                });
            });

            describe('formatListingEvent', () => {
                it('should format listing event with detailed verbosity', () => {
                    // Arrange
                    const event = {
                        event_type: 'item_listed',
                        event_timestamp: '2024-01-01T15:30:00.000Z',
                        chain: 'base',
                        payload: {
                            item: {
                                nft_id: 'base/0x123456789/789',
                                metadata: { name: 'Listing NFT' }
                            },
                            collection: { name: 'Listing Collection', slug: 'listing-coll' },
                            base_price: '500000000000000000',
                            maker: { address: '0xmaker' }
                        }
                    };

                    // Act
                    const result = service.formatListingEvent(event);

                    // Assert
                    expect(result).toContain('═'.repeat(50));
                    expect(result).toContain('[LISTING] item_listed on Base');
                    expect(result).toContain('Time: 2024-01-01T15:30:00.000Z');
                    expect(result).toContain('Collection: listing-coll (Listing Collection)');
                    expect(result).toContain('NFT: Listing NFT #789');
                    expect(result).toContain('Contract: 0x123456789');
                    expect(result).toContain('Token ID: 789');
                    expect(result).toContain('Listing Price: 0.5 ETH (500000000000000000 wei)');
                    expect(result).toContain('Seller: 0xmaker');
                });

                it('should handle listing with missing contract info', () => {
                    // Arrange
                    const event = {
                        event_type: 'item_listed',
                        payload: {
                            item: { metadata: { name: 'No Contract NFT' } },
                            collection: { slug: 'no-contract-coll' },
                            base_price: '100000000000000000'
                        }
                    };

                    // Act
                    const result = service.formatListingEvent(event);

                    // Assert
                    expect(result).toContain('NFT: No Contract NFT #null');
                    expect(result).toContain('Contract: N/A');
                    expect(result).toContain('Token ID: null');
                });
            });

            describe('formatBidEvent', () => {
                it('should format collection bid with detailed verbosity', () => {
                    // Arrange
                    const event = {
                        event_type: 'item_received_bid',
                        event_timestamp: '2024-01-01T18:45:00.000Z',
                        payload: {
                            is_collection_offer: true,
                            collection: { name: 'Bid Collection', slug: 'bid-coll' },
                            base_price: '2000000000000000000',
                            maker: { address: '0xbidder' }
                        }
                    };

                    // Act
                    const result = service.formatBidEvent(event);

                    // Assert
                    expect(result).toContain('═'.repeat(50));
                    expect(result).toContain('[BID] item_received_bid on Ethereum');
                    expect(result).toContain('Time: 2024-01-01T18:45:00.000Z');
                    expect(result).toContain('Collection: bid-coll (Bid Collection)');
                    expect(result).toContain('Collection-level offer');
                    expect(result).toContain('Bid Amount: 2 ETH (2000000000000000000 wei)');
                    expect(result).toContain('Bidder: 0xbidder');
                });

                it('should format individual NFT bid with detailed verbosity', () => {
                    // Arrange
                    const event = {
                        event_type: 'item_received_bid',
                        event_timestamp: '2024-01-01T20:00:00.000Z',
                        chain: 'arbitrum',
                        payload: {
                            is_collection_offer: false,
                            item: {
                                nft_id: 'arbitrum/0xarbitrum/999',
                                metadata: { name: 'Bid NFT' }
                            },
                            collection: { name: 'Bid NFT Collection', slug: 'bid-nft-coll' },
                            base_price: '1500000000000000000',
                            maker: { address: '0xbidder2' }
                        }
                    };

                    // Act
                    const result = service.formatBidEvent(event);

                    // Assert
                    expect(result).toContain('═'.repeat(50));
                    expect(result).toContain('[BID] item_received_bid on Arbitrum');
                    expect(result).toContain('NFT: Bid NFT #999');
                    expect(result).toContain('Contract: 0xarbitrum');
                    expect(result).toContain('Token ID: 999');
                    expect(result).toContain('Bid Amount: 1.5 ETH (1500000000000000000 wei)');
                    expect(result).toContain('Bidder: 0xbidder2');
                });
            });

            describe('formatCancelEvent', () => {
                it('should format cancel event with detailed verbosity', () => {
                    // Arrange
                    const event = {
                        event_type: 'item_cancelled',
                        event_timestamp: '2024-01-01T22:15:00.000Z',
                        payload: {
                            item: {
                                nft_id: 'polygon/0xpolygon/555',
                                metadata: { name: 'Cancelled NFT' }
                            },
                            collection: { name: 'Cancel Collection', slug: 'cancel-coll' },
                            maker: { address: '0xcanceler' }
                        }
                    };

                    // Act
                    const result = service.formatCancelEvent(event);

                    // Assert
                    expect(result).toContain('═'.repeat(50));
                    expect(result).toContain('[CANCEL] item_cancelled');
                    expect(result).toContain('Time: 2024-01-01T22:15:00.000Z');
                    expect(result).toContain('Collection: cancel-coll (Cancel Collection)');
                    expect(result).toContain('NFT: Cancelled NFT #555');
                    expect(result).toContain('Contract: 0xpolygon');
                    expect(result).toContain('Token ID: 555');
                    expect(result).toContain('Cancelled By: 0xcanceler');
                });
            });
        });
    });
});
