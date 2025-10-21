import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { ethers } from 'ethers';
import { addChainOption, getEffectiveChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { SUPPORTED_TOKENS, ERC20_ABI } from '../config/tokens.js';

export const sendCommand = new Command('send')
  .description('Send tokens to an address')
  .requiredOption('-t, --token <token>', 'Token symbol (e.g., eth, weth)')
  .requiredOption('-a, --amount <amount>', 'Amount to send')
  .requiredOption('-r, --recipient <address>', 'Recipient address')
  .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(sendCommand);
// Add private key option
addPrivateKeyOption(sendCommand);

sendCommand.action(async (options) => {
  try {
    const chainConfig = await getEffectiveChain(options);
    const wallet = await getWallet(options);
    const walletAddress = await wallet.getAddress();

    if (options.debug) {
      logger.setLevel(LogLevel.DEBUG);
    }

    // 验证代币
    const token = options.token.toLowerCase();
    const chainTokens = SUPPORTED_TOKENS[chainConfig.chain];
    if (!chainTokens || !chainTokens[token]) {
      throw new Error(`Unsupported token "${token}" on chain "${chainConfig.chain}"`);
    }

    const tokenConfig = chainTokens[token];

    // 验证接收地址
    if (!ethers.isAddress(options.recipient)) {
      throw new Error('Invalid recipient address');
    }

    // 解析金额
    const amount = ethers.parseUnits(options.amount, tokenConfig.decimals);

    logger.info(`\nSending ${options.amount} ${tokenConfig.symbol}...`);
    logger.info(`From: ${walletAddress}`);
    logger.info(`To: ${options.recipient}`);
    logger.info(`Chain: ${chainConfig.chain}`);
    logger.info('------------------------');

    let tx;
    let receipt;

    if (tokenConfig.isNative) {
      // 发送原生代币（ETH）
      tx = await wallet.sendTransaction({
        to: options.recipient,
        value: amount
      });
    } else {
      // 发送 ERC20 代币
      const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, wallet);
      tx = await tokenContract.transfer(options.recipient, amount);
    }

    logger.info('Transaction sent, waiting for confirmation...');
    receipt = await tx.wait();

    logger.info('Transfer completed successfully!');
    logger.info(`Transaction hash: ${receipt.hash}`);

    // 显示余额
    let senderBalance;
    if (tokenConfig.isNative) {
      senderBalance = await wallet.provider.getBalance(walletAddress);
    } else {
      const tokenContract = new ethers.Contract(tokenConfig.address, ERC20_ABI, wallet);
      senderBalance = await tokenContract.balanceOf(walletAddress);
    }

    logger.info('\nRemaining balance:');
    logger.info(`${ethers.formatUnits(senderBalance, tokenConfig.decimals)} ${tokenConfig.symbol}`);

  } catch (error) {
    logger.error('Transfer failed:', error);
    if (options.debug) {
      logger.error('Error details:', error.stack);
    }
    process.exit(1);
  }
});
