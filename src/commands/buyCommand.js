import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { addChainOption, getEffectiveChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { buySpecificNFT, buyFloorNFT } from '../services/buyService.js';
import { OpenSeaSDK } from 'opensea-js';

export const buyCommand = new Command('buy')
  .description('Buy a specific NFT or floor NFT from a collection')
  .option('-a, --address <address>', 'NFT contract address (for specific NFT)')
  .option('-t, --token-id <tokenId>', 'Token ID (for specific NFT)')
  .option('-c, --collection <slug>', 'Collection slug (for floor NFT)')
  .option('-m, --max-price <price>', 'Maximum acceptable price in ETH')
  .option('--skip-confirm', 'Skip purchase confirmation')
  .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(buyCommand);
// Add private key option
addPrivateKeyOption(buyCommand);

buyCommand.action(async (options) => {
  try {
    if (options.debug) {
      logger.setLevel(LogLevel.DEBUG);
    }

    // 验证参数: 必须提供 (address + tokenId) 或 collection，但不能同时提供
    const hasSpecificNFT = options.address && options.tokenId;
    const hasCollection = options.collection;

    if (!hasSpecificNFT && !hasCollection) {
      throw new Error('Must provide either (-a, -t) for specific NFT or (-c) for floor NFT');
    }

    if (hasSpecificNFT && hasCollection) {
      throw new Error('Cannot use both specific NFT options (-a, -t) and collection option (-c) at the same time');
    }

    // 如果提供了address但没有tokenId，或反之
    if ((options.address && !options.tokenId) || (!options.address && options.tokenId)) {
      throw new Error('Both --address and --token-id are required for buying a specific NFT');
    }

    // 获取链配置和钱包
    const chainConfig = await getEffectiveChain(options);
    const wallet = await getWallet(options);
    const walletAddress = await wallet.getAddress();

    logger.info('Buy Command');
    logger.info('------------------------');
    logger.info(`Chain: ${chainConfig.name}`);
    logger.info(`Wallet: ${walletAddress}`);

    // 初始化 OpenSea SDK
    const sdk = new OpenSeaSDK(wallet, {
      chain: chainConfig.chain,
      apiKey: OPENSEA_API_KEY,
    });

    // 初始化 OpenSea API
    const openseaApi = new OpenSeaApi(OPENSEA_API_KEY, OPENSEA_API_BASE_URL, chainConfig);

    // 准备选项
    const buyOptions = {
      maxPrice: options.maxPrice ? parseFloat(options.maxPrice) : null,
      skipConfirm: options.skipConfirm || false,
    };

    let transactionHash;

    if (hasSpecificNFT) {
      // 购买指定NFT
      logger.info('Mode: Buy Specific NFT');
      logger.info(`NFT: ${options.address} #${options.tokenId}`);
      if (buyOptions.maxPrice) {
        logger.info(`Max Price: ${buyOptions.maxPrice} ETH`);
      }
      logger.info('------------------------\n');

      transactionHash = await buySpecificNFT(
        sdk,
        options.address,
        options.tokenId,
        wallet,
        openseaApi,
        buyOptions
      );
    } else {
      // 购买地板NFT
      logger.info('Mode: Buy Floor NFT');
      logger.info(`Collection: ${options.collection}`);
      if (buyOptions.maxPrice) {
        logger.info(`Max Price: ${buyOptions.maxPrice} ETH`);
      }
      logger.info('------------------------\n');

      transactionHash = await buyFloorNFT(
        sdk,
        options.collection,
        wallet,
        openseaApi,
        buyOptions
      );
    }

    // 显示成功信息和链接
    logger.info('\n🎉 Purchase completed successfully!');
    logger.info(`Transaction hash: ${transactionHash}`);

    // 显示区块链浏览器链接
    const explorerUrl = chainConfig.chain === 'ethereum'
      ? `https://etherscan.io/tx/${transactionHash}`
      : chainConfig.chain === 'base'
        ? `https://basescan.org/tx/${transactionHash}`
        : chainConfig.chain === 'sepolia'
          ? `https://sepolia.etherscan.io/tx/${transactionHash}`
          : null;

    if (explorerUrl) {
      logger.info('\n🔗 View transaction:');
      logger.info(`   ${explorerUrl}`);
    }

    // 如果是购买指定NFT，显示OpenSea链接
    if (hasSpecificNFT) {
      logger.info('\n🔗 View on OpenSea:');
      logger.info(`   https://opensea.io/assets/${chainConfig.name}/${options.address}/${options.tokenId}`);
    }

  } catch (error) {
    logger.error('Buy failed:', error.message);
    if (options.debug) {
      logger.error('Error details:', error.stack);
    }
    process.exit(1);
  }
});
