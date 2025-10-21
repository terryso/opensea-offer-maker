import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { OPENSEA_API_KEY, OPENSEA_API_BASE_URL } from '../config.js';
import { OpenSeaApi } from '../services/openseaApi.js';
import { addChainOption, getEffectiveChain } from '../utils/commandUtils.js';
import { ethers } from 'ethers';

export const checkOffersCommand = new Command('check')
  .description('Check collection offers')
  .requiredOption('-c, --collection <slug>', 'Collection slug')
  .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(checkOffersCommand);

checkOffersCommand.action(async (options) => {
  try {
    const chainConfig = await getEffectiveChain(options);

    const openSeaApi = new OpenSeaApi(
      OPENSEA_API_KEY,
      OPENSEA_API_BASE_URL,
      chainConfig
    );

    // 获取并显示收藏品统计数据
    const stats = await openSeaApi.getCollectionStats(options.collection);
    const floorPrice = stats.total.floor_price;

    logger.info('\nCollection Stats:');
    logger.info('------------------------');
    logger.info(`Floor Price: ${floorPrice} ${stats.total.floor_price_symbol || 'ETH'}`);
    logger.info(`Total Supply: ${stats.total.num_owners || 'N/A'}`);
    logger.info(`Market Cap: ${stats.total.market_cap?.toFixed(2) || 'N/A'} ETH`);

    // 查找各个时间段的数据
    const oneDay = stats.intervals.find(i => i.interval === 'one_day') || {};
    const sevenDay = stats.intervals.find(i => i.interval === 'seven_day') || {};
    const thirtyDay = stats.intervals.find(i => i.interval === 'thirty_day') || {};

    // 24h 统计
    logger.info('\n24h Stats:');
    logger.info(`Volume: ${oneDay.volume?.toFixed(2) || 'N/A'} ETH (${oneDay.volume_change?.toFixed(2) || 'N/A'}%)`);
    logger.info(`Sales: ${oneDay.sales || 'N/A'} (${oneDay.sales_diff > 0 ? '+' : ''}${oneDay.sales_diff || 'N/A'})`);
    logger.info(`Avg Price: ${oneDay.average_price?.toFixed(4) || 'N/A'} ETH`);

    // 7d 统计
    logger.info('\n7d Stats:');
    logger.info(`Volume: ${sevenDay.volume?.toFixed(2) || 'N/A'} ETH (${sevenDay.volume_change?.toFixed(2) || 'N/A'}%)`);
    logger.info(`Sales: ${sevenDay.sales || 'N/A'} (${sevenDay.sales_diff > 0 ? '+' : ''}${sevenDay.sales_diff || 'N/A'})`);
    logger.info(`Avg Price: ${sevenDay.average_price?.toFixed(4) || 'N/A'} ETH`);

    // 30d 统计
    logger.info('\n30d Stats:');
    logger.info(`Volume: ${thirtyDay.volume?.toFixed(2) || 'N/A'} ETH (${thirtyDay.volume_change?.toFixed(2) || 'N/A'}%)`);
    logger.info(`Sales: ${thirtyDay.sales || 'N/A'} (${thirtyDay.sales_diff > 0 ? '+' : ''}${thirtyDay.sales_diff || 'N/A'})`);
    logger.info(`Avg Price: ${thirtyDay.average_price?.toFixed(4) || 'N/A'} ETH`);

    // 总计统计
    logger.info('\nAll Time Stats:');
    logger.info(`Volume: ${stats.total.volume?.toFixed(2) || 'N/A'} ETH`);
    logger.info(`Sales: ${stats.total.sales || 'N/A'}`);
    logger.info(`Avg Price: ${stats.total.average_price?.toFixed(4) || 'N/A'} ETH`);
    logger.info('------------------------');

    // 获取 offers
    const response = await openSeaApi.getCollectionOffers(options.collection);

    if (!response?.offers?.length) {
      logger.info('No offers found');
      return;
    }

    // Calculate unit price and sort
    const offers = response.offers.map(offer => {
      const params = offer.protocol_data.parameters;
      const quantity = parseInt(params.consideration[0].startAmount) || 1;
      const totalPrice = BigInt(offer.price.value);
      const unitPrice = totalPrice / BigInt(quantity);
      return {
        unitPrice,
        quantity,
        totalPrice,
        address: params.offerer,
        endTime: parseInt(params.endTime)
      };
    }).filter(offer => {
      const now = Math.floor(Date.now() / 1000);
      return offer.endTime > now;
    }).sort((a, b) => {
      if (b.unitPrice > a.unitPrice) {return 1;}
      if (b.unitPrice < a.unitPrice) {return -1;}
      return b.quantity - a.quantity;
    });

    // 计算最高 offer 与地板价的差价比例
    if (offers.length > 0) {
      const highestOffer = ethers.formatEther(offers[0].unitPrice.toString());
      const priceDiff = floorPrice - parseFloat(highestOffer);
      const percentage = ((priceDiff / floorPrice) * 100).toFixed(2);
      logger.info(`Highest Offer: ${highestOffer} ETH`);
      logger.info(`Price Gap: ${priceDiff.toFixed(4)} ETH (${percentage}% below floor)`);
      logger.info('------------------------');
    }

    // Display the top 10 highest priced offers
    logger.info('\nTop 10 Highest Offers:');
    logger.info('------------------------');
    offers.slice(0, 10).forEach((offer, index) => {
      logger.info(`${index + 1}. ${ethers.formatEther(offer.unitPrice.toString())} WETH/item (Quantity: ${offer.quantity})`);
      logger.info(`   Wallet: ${offer.address}`);
      logger.info('------------------------');
    });

  } catch (error) {
    logger.error('Check offers failed:', error);
    process.exit(1);
  }
});
