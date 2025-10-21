import { Command } from 'commander';
import { logger } from '../utils/logger.js';
import { ConfigManager } from '../utils/configManager.js';
import { DEFAULT_CHAIN } from '../config.js';

export const chainCommand = new Command('chain')
  .description('Manage default chain configuration');

chainCommand
  .command('get')
  .description('Display current default chain')
  .action(async () => {
    try {
      const chain = await ConfigManager.getDefaultChain();
      if (chain) {
        logger.info(`Current default chain: ${chain}`);
      } else {
        logger.info(`Default chain: ${DEFAULT_CHAIN} (fallback)`);
        logger.info('No custom chain configured. Use "chain set <chain>" to set one.');
      }
    } catch (error) {
      logger.error('Failed to get default chain:', error.message);
      process.exit(1);
    }
  });

chainCommand
  .command('set')
  .description('Set default chain')
  .argument('<chain>', 'Chain name (ethereum, base, sepolia)')
  .action(async (chain) => {
    try {
      const result = await ConfigManager.setDefaultChain(chain);
      logger.info(`Default chain set to: ${result.chain}`);
    } catch (error) {
      logger.error('Failed to set default chain:', error.message);
      process.exit(1);
    }
  });

chainCommand
  .command('list')
  .description('List all supported chains')
  .action(() => {
    try {
      const chains = ConfigManager.getSupportedChains();
      logger.info('Supported chains:');
      chains.forEach(chain => {
        logger.info(`  - ${chain.name}`);
        logger.info(`    WETH: ${chain.wethAddress}`);
      });
    } catch (error) {
      logger.error('Failed to list chains:', error.message);
      process.exit(1);
    }
  });
