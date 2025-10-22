import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { addChainOption, getEffectiveChain } from '../utils/commandUtils.js';
import { CacheService } from '../services/cacheService.js';
import { validateOptions } from '../listing/shared/validators.js';
import { createApiContext } from '../listing/orchestrator.js';
import { executeInteractiveMode } from '../listing/modes/InteractiveMode.js';
import { executeDirectMode } from '../listing/modes/DirectMode.js';

export const listCommand = new Command('list')
  .description('List an NFT for sale on multiple marketplaces. Use --interactive to select from cached NFTs or provide --address and --token-id manually.')
  .option('-a, --address <address>', 'NFT contract address')
  .option('-t, --token-id <tokenId>', 'Token ID')
  .option('-i, --interactive', 'Select NFT interactively from cache')
  .option('-p, --price <price>', 'Absolute listing price in ETH')
  .option('-f, --floor-diff <diff>', 'Price difference from floor price (e.g., +0.1, -0.1, +10%, -5%)')
  .option('--profit-margin <margin>', 'Profit margin over last purchase price (e.g., 0.01 for +0.01 ETH)')
  .option('--profit-percent <percent>', 'Profit percentage over last purchase price (e.g., 10 for +10%)')
  .option('-e, --expiration <time>', 'Expiration time (e.g., 30d, 12h, 45m)', '1h')
  .option('-m, --marketplaces <markets>', 'Comma-separated list of marketplaces (only opensea supported)', 'opensea')
  .option('--pay-optional-royalties', 'Pay optional creator royalties (default: skip optional fees)')
  .option('--skip-confirm', 'Skip listing confirmation')
  .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(listCommand);

listCommand.action(async (options) => {
  try {
    // Set debug logging if requested
    if (options.debug) {
      logger.level = LogLevel.DEBUG;
      logger.debug('Debug logging enabled');
    }

    // Validate command options
    const validation = validateOptions(options);
    if (!validation.isValid) {
      throw new Error(validation.errors.join('; '));
    }

    // Get effective chain configuration
    const chainConfig = await getEffectiveChain(options);

    // Create API context
    const apiContext = createApiContext(chainConfig);

    // Initialize cache service (needed for interactive mode)
    const cacheService = new CacheService();

    // Determine execution mode and route accordingly
    if (options.interactive) {
      logger.debug('Routing to interactive mode');
      const result = await executeInteractiveMode(options, {
        apiContext,
        cacheService
      });

      if (result && result === Symbol.for('CANCEL')) {
        process.exit(0); // User cancelled
      }

    } else {
      logger.debug('Routing to direct mode');
      const result = await executeDirectMode(options, {
        apiContext,
        cacheService
      });

      if (result && result.cancelled) {
        process.exit(0); // User cancelled
      }
    }

    logger.info('✅ Listing process completed successfully');

  } catch (error) {
    logger.error('❌ Listing failed:', error.message);
    if (options.debug) {
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
});

export default listCommand;
