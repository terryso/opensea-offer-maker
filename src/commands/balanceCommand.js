import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { ethers } from 'ethers';
import { addChainOption, getEffectiveChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';
import { SUPPORTED_TOKENS, ERC20_ABI } from '../config/tokens.js';

export const balanceCommand = new Command('balance')
    .description('Check wallet balance for supported tokens')
    .option('-t, --token <token>', 'Specific token to check (e.g., eth, weth)')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(balanceCommand);
// Add private key option
addPrivateKeyOption(balanceCommand);

balanceCommand.action(async (options) => {
    try {
        const chainConfig = await getEffectiveChain(options);
        const wallet = await getWallet(options);
        const walletAddress = await wallet.getAddress();

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        logger.info(`\n钱包余额查询`);
        logger.info(`地址: ${walletAddress}`);
        logger.info(`链: ${chainConfig.chain}`);
        logger.info('------------------------');

        // 获取该链支持的代币
        const chainTokens = SUPPORTED_TOKENS[chainConfig.chain];
        if (!chainTokens) {
            throw new Error(`Chain "${chainConfig.chain}" does not have configured tokens`);
        }

        // 如果指定了特定代币，只查询该代币
        const tokensToQuery = options.token
            ? { [options.token.toLowerCase()]: chainTokens[options.token.toLowerCase()] }
            : chainTokens;

        // 验证指定的代币是否支持
        if (options.token && !tokensToQuery[options.token.toLowerCase()]) {
            throw new Error(`Token "${options.token}" is not supported on chain "${chainConfig.chain}"`);
        }

        // 查询每个代币的余额
        logger.info('\n余额:');
        for (const [tokenKey, tokenConfig] of Object.entries(tokensToQuery)) {
            let balance;

            if (tokenConfig.isNative) {
                // 查询原生代币余额（ETH）
                balance = await wallet.provider.getBalance(walletAddress);
            } else {
                // 查询 ERC20 代币余额
                const tokenContract = new ethers.Contract(
                    tokenConfig.address,
                    ERC20_ABI,
                    wallet
                );
                balance = await tokenContract.balanceOf(walletAddress);
            }

            const formattedBalance = ethers.formatUnits(balance, tokenConfig.decimals);
            logger.info(`  ${tokenConfig.symbol}: ${formattedBalance}`);

            if (options.debug) {
                logger.debug(`  ${tokenConfig.symbol} raw balance: ${balance.toString()}`);
            }
        }

        logger.info('');

    } catch (error) {
        logger.error('查询余额失败:', error.message);
        if (options.debug) {
            logger.error('错误详情:', error.stack);
        }
        process.exit(1);
    }
});
