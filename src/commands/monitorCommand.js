import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { OPENSEA_API_KEY } from '../config.js';
import { addChainOption, getEffectiveChain } from '../utils/commandUtils.js';
import { StreamService } from '../services/streamService.js';
import { PollingMonitorService } from '../services/pollingMonitorService.js';
import { NotificationService } from '../services/notificationService.js';
import { KeyManager } from '../utils/keyManager.js';
import { ethers } from 'ethers';

export const monitorCommand = new Command('monitor')
    .description('Monitor NFT events in real-time');

// Subcommand: monitor start
const startCommand = new Command('start')
    .description('Start monitoring wallet NFTs')
    .option('--collections <slugs>', 'Comma-separated collection slugs to monitor')
    .option('--all-collections', 'Monitor all collections (wildcard)')
    .option('--verbosity <level>', 'Display verbosity: minimal, normal, detailed', 'normal')
    .option('--mode <mode>', 'Monitoring mode: stream or polling', process.env.MONITOR_MODE || 'polling')
    .action(async (options) => {
        try {
            // Get effective chain configuration
            const chainConfig = await getEffectiveChain(options);

            // Decrypt wallet private key
            const privateKey = await KeyManager.decryptKey();
            const wallet = new ethers.Wallet(privateKey);
            const walletAddress = wallet.address.toLowerCase();

            // Initialize services
            const verbosity = options.verbosity || process.env.MONITOR_VERBOSITY || 'normal';
            const notificationService = new NotificationService({ verbosity });

            // Determine monitoring mode
            const mode = options.mode || 'polling';
            logger.info(`Using monitoring mode: ${mode}`);

            // Initialize appropriate service based on mode
            let monitorService;
            if (mode === 'stream') {
                monitorService = new StreamService({
                    apiKey: OPENSEA_API_KEY,
                    network: (chainConfig.name === 'sepolia') ? 'testnet' : 'mainnet',
                    walletAddress
                });
            } else if (mode === 'polling') {
                monitorService = new PollingMonitorService({
                    apiKey: OPENSEA_API_KEY,
                    network: (chainConfig.name === 'sepolia') ? 'testnet' : 'mainnet',
                    chainConfig: chainConfig
                });
            } else {
                throw new Error(`Invalid monitoring mode: ${mode}. Use 'stream' or 'polling'`);
            }

            // Determine which collections to monitor
            const collections = options.allCollections
                ? ['*']
                : options.collections
                    ? options.collections.split(',').map(s => s.trim())
                    : ['*'];  // default to wildcard if neither flag specified

            // Connect to monitor service
            await monitorService.connect();

            // Set up event callback
            const eventCallback = async (event) => {
                notificationService.displayEvent(event);
                await notificationService.logEvent(event, walletAddress, chainConfig.name);
            };

            // Subscribe to all event types for each collection
            const eventTypes = [
                'item_sold',
                'item_listed',
                'item_transferred',
                'item_received_bid',
                'item_cancelled'
            ];

            for (const collection of collections) {
                await monitorService.subscribeToCollection(
                    collection,
                    eventTypes,
                    eventCallback,
                    walletAddress
                );
            }

            // Display monitoring info
            const apiInfo = mode === 'stream' ? 'OpenSea Stream API (WebSocket)' : 'OpenSea REST API (Polling)';
            logger.info(`\n${'='.repeat(60)}`);
            logger.info(`Connected to ${apiInfo}`);
            logger.info(`Monitoring wallet: ${walletAddress}`);
            logger.info(`Chain: ${chainConfig.name}`);
            logger.info(`Mode: ${mode}`);
            logger.info(`Collections: ${collections.join(', ')}`);
            logger.info(`Verbosity: ${verbosity}`);
            if (mode === 'polling') {
                const interval = monitorService.config.pollingInterval / 1000;
                logger.info(`Polling interval: ${interval}s`);
            }
            logger.info(`${'='.repeat(60)}`);
            logger.info('\n✅ Monitoring started successfully!');
            logger.info('📊 Watching for NFT events (sales, listings, transfers, bids, cancellations)...');
            logger.info('⏱️  Status updates will appear every minute');
            logger.info('🛑 Press Ctrl+C to stop monitoring\n');

            // Set up graceful shutdown handlers
            let isShuttingDown = false;

            const gracefulShutdown = async () => {
                if (isShuttingDown) return;
                isShuttingDown = true;

                logger.info('\nShutting down gracefully...');

                try {
                    await monitorService.disconnect();
                    logger.info(`Disconnected from ${apiInfo}`);
                    process.exit(0);
                } catch (error) {
                    logger.error('Error during shutdown:', error.message);
                    process.exit(1);
                }
            };

            process.on('SIGINT', gracefulShutdown);
            process.on('SIGTERM', gracefulShutdown);

            // Keep process running until interrupted
            // The WebSocket connection will stay open

        } catch (error) {
            logger.error('Monitor start failed:', error.message);
            process.exit(1);
        }
    });

addChainOption(startCommand);
monitorCommand.addCommand(startCommand);

// Subcommand: monitor history
const historyCommand = new Command('history')
    .description('Show event history from logs')
    .option('--type <eventType>', 'Filter by event type: sale, transfer, listing, bid, cancel')
    .option('--days <number>', 'Show events from last N days', '7')
    .option('--nft <contract:tokenId>', 'Filter by specific NFT')
    .option('--limit <number>', 'Maximum events to show', '50')
    .action(async (options) => {
        try {
            // Get effective chain configuration
            const chainConfig = await getEffectiveChain(options);

            // Get wallet address
            const privateKey = await KeyManager.decryptKey();
            const wallet = new ethers.Wallet(privateKey);
            const walletAddress = wallet.address.toLowerCase();

            // Initialize notification service
            const notificationService = new NotificationService({ verbosity: 'normal' });

            // Parse filters from command options
            const filters = {};

            if (options.type) {
                // Convert "sale" to "item_sold", "transfer" to "item_transferred", etc.
                const eventTypeMap = {
                    'sale': 'item_sold',
                    'transfer': 'item_transferred',
                    'listing': 'item_listed',
                    'bid': 'item_received_bid',
                    'cancel': 'item_cancelled'
                };
                filters.eventType = eventTypeMap[options.type] || options.type;
            }

            if (options.days) {
                const daysAgo = parseInt(options.days, 10);
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - daysAgo);
                filters.startDate = startDate.toISOString();
            }

            if (options.nft) {
                const [contract, tokenId] = options.nft.split(':');
                if (contract && tokenId) {
                    filters.nftContract = contract.toLowerCase();
                    filters.tokenId = tokenId;
                }
            }

            const limit = parseInt(options.limit || '50', 10);
            filters.limit = limit;

            // Query events
            const events = await notificationService.queryEvents(walletAddress, chainConfig.name, filters);

            // Display results
            if (events.length === 0) {
                logger.info('No events found for the specified filters');
                return;
            }

            logger.info(`\nFound ${events.length} events:\n`);
            logger.info('═══════════════════════════════════════════════════════════════════');

            events.forEach((event, index) => {
                const eventDate = new Date(event.timestamp);
                const eventTypeName = event.eventType.replace('item_', '').replace('_', ' ');

                logger.info(`${index + 1}. [${eventTypeName.toUpperCase()}] ${eventDate.toLocaleString()}`);
                logger.info(`   NFT: ${event.nft.name || 'Unknown'} #${event.nft.tokenId}`);
                logger.info(`   Collection: ${event.nft.collection || 'N/A'}`);

                if (event.sale) {
                    logger.info(`   Price: ${event.sale.price} ${event.sale.currency}`);
                    logger.info(`   Buyer: ${event.sale.buyer}`);
                    logger.info(`   Seller: ${event.sale.seller}`);
                }

                if (event.fromAddress) {
                    logger.info(`   From: ${event.fromAddress}`);
                }

                if (event.toAddress) {
                    logger.info(`   To: ${event.toAddress}`);
                }

                logger.info('───────────────────────────────────────────────────────────────────');
            });

            logger.info(`\nTotal: ${events.length} events`);

        } catch (error) {
            logger.error('Monitor history failed:', error.message);
            process.exit(1);
        }
    });

addChainOption(historyCommand);
monitorCommand.addCommand(historyCommand);

// Subcommand: monitor stats
const statsCommand = new Command('stats')
    .description('Show monitoring statistics')
    .option('--days <number>', 'Statistics period in days', '30')
    .action(async (options) => {
        try {
            // Get effective chain configuration
            const chainConfig = await getEffectiveChain(options);

            // Get wallet address
            const privateKey = await KeyManager.decryptKey();
            const wallet = new ethers.Wallet(privateKey);
            const walletAddress = wallet.address.toLowerCase();

            // Initialize notification service
            const notificationService = new NotificationService({ verbosity: 'normal' });

            // Calculate date range
            const daysAgo = parseInt(options.days || '30', 10);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysAgo);

            // Query all events for the period
            const events = await notificationService.queryEvents(
                walletAddress,
                chainConfig.name,
                { startDate: startDate.toISOString() }
            );

            // Handle no events case
            if (events.length === 0) {
                logger.info('No events found for the specified period');
                return;
            }

            // Calculate statistics
            const stats = {
                totalEvents: events.length,
                byType: {},
                dateRange: {
                    start: startDate.toISOString().split('T')[0],
                    end: new Date().toISOString().split('T')[0]
                }
            };

            // Count by type
            events.forEach(event => {
                const type = event.eventType;
                stats.byType[type] = (stats.byType[type] || 0) + 1;
            });

            // Calculate uptime (time span of events)
            const timestamps = events.map(e => new Date(e.timestamp).getTime());
            const firstEvent = Math.min(...timestamps);
            const lastEvent = Math.max(...timestamps);
            const uptimeMs = lastEvent - firstEvent;
            const uptimeDays = (uptimeMs / (1000 * 60 * 60 * 24)).toFixed(1);

            // Display formatted stats
            logger.info('\n═══════════════════════════════════════');
            logger.info('       Monitoring Statistics');
            logger.info('═══════════════════════════════════════');
            logger.info(`Wallet: ${walletAddress}`);
            logger.info(`Chain: ${chainConfig.name}`);
            logger.info(`Period: ${stats.dateRange.start} to ${stats.dateRange.end}`);
            logger.info('═══════════════════════════════════════');
            logger.info(`Total Events: ${stats.totalEvents}`);
            logger.info('\nEvents by Type:');

            Object.entries(stats.byType)
                .sort((a, b) => b[1] - a[1])  // Sort by count descending
                .forEach(([type, count]) => {
                    const percentage = ((count / stats.totalEvents) * 100).toFixed(1);
                    const typeName = type.replace('item_', '').replace('_', ' ');
                    logger.info(`  ${typeName}: ${count} (${percentage}%)`);
                });

            if (uptimeDays > 0) {
                logger.info('\nActivity Metrics:');
                logger.info(`  Monitoring Span: ${uptimeDays} days`);
                const avgPerDay = (stats.totalEvents / parseFloat(uptimeDays)).toFixed(1);
                logger.info(`  Average Events/Day: ${avgPerDay}`);
            }

            logger.info('═══════════════════════════════════════\n');

        } catch (error) {
            logger.error('Monitor stats failed:', error.message);
            process.exit(1);
        }
    });

addChainOption(statsCommand);
monitorCommand.addCommand(statsCommand);

export default monitorCommand;
