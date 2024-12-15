import { Command } from 'commander';
import { logger, LogLevel } from '../utils/logger.js';
import { ethers } from 'ethers';
import { addChainOption, validateChain, addPrivateKeyOption, getWallet } from '../utils/commandUtils.js';

// WETH 合约地址
const WETH_ADDRESSES = {
    'ethereum': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    'base': '0x4200000000000000000000000000000000000006',
    'sepolia': '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
};

// WETH ABI
const WETH_ABI = [
    'function deposit() payable',
    'function withdraw(uint256 amount)',
    'function balanceOf(address) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)'
];

export const swapCommand = new Command('swap')
    .description('Swap between ETH and WETH')
    .requiredOption('-a, --amount <amount>', 'Amount to swap')
    .requiredOption('-d, --direction <direction>', 'Swap direction: eth2weth or weth2eth')
    .option('--debug', 'Enable debug logging');

// Add chain option
addChainOption(swapCommand);
// Add private key option
addPrivateKeyOption(swapCommand);

swapCommand.action(async (options) => {
    try {
        const chainConfig = validateChain(options.chain);
        const wallet = await getWallet(options);
        const walletAddress = await wallet.getAddress();

        if (options.debug) {
            logger.setLevel(LogLevel.DEBUG);
        }

        // 验证方向参数
        if (!['eth2weth', 'weth2eth'].includes(options.direction)) {
            throw new Error('Invalid direction. Must be either "eth2weth" or "weth2eth"');
        }

        const amount = ethers.parseEther(options.amount);
        const wethAddress = WETH_ADDRESSES[chainConfig.chain];
        if (!wethAddress) {
            throw new Error(`No WETH contract address for chain: ${chainConfig.chain}`);
        }

        // 检查余额
        const balance = await wallet.provider.getBalance(walletAddress);
        logger.debug(`Current balance: ${ethers.formatEther(balance)} ETH`);

        // 获取当前 gas 价格
        const feeData = await wallet.provider.getFeeData();
        const gasPrice = feeData.gasPrice || 0n;
        logger.debug(`Current gas price: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

        // 创建合约实例
        const wethContract = new ethers.Contract(wethAddress, WETH_ABI, wallet);

        // 准备交易参数
        const txParams = options.direction === 'eth2weth' 
            ? { value: amount }
            : { value: 0n };

        // 估算 gas 限制
        const gasEstimate = await wallet.provider.estimateGas({
            from: walletAddress,
            to: wethAddress,
            data: options.direction === 'eth2weth' 
                ? wethContract.interface.encodeFunctionData('deposit')
                : wethContract.interface.encodeFunctionData('withdraw', [amount]),
            ...txParams
        });

        // 添加 20% 的 gas 缓冲
        const gasLimit = (gasEstimate * 12n) / 10n;
        logger.debug(`Estimated gas limit: ${gasLimit}`);

        // 计算总花费（包括 gas）
        const gasCost = gasLimit * gasPrice;
        const totalCost = options.direction === 'eth2weth' ? amount + gasCost : gasCost;
        logger.debug(`Gas cost: ${ethers.formatEther(gasCost)} ETH`);
        logger.debug(`Total cost: ${ethers.formatEther(totalCost)} ETH`);

        // 检查是否有足够的余额
        if (balance < totalCost) {
            throw new Error(`Insufficient funds. Need ${ethers.formatEther(totalCost)} ETH (including gas), but only have ${ethers.formatEther(balance)} ETH`);
        }

        logger.info(`\nSwapping ${options.amount} ${options.direction === 'eth2weth' ? 'ETH → WETH' : 'WETH → ETH'}...`);
        logger.info(`Wallet: ${walletAddress}`);
        logger.info(`Chain: ${chainConfig.chain}`);
        logger.info(`Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);
        logger.info('------------------------');

        // 执行交易
        let tx;
        if (options.direction === 'eth2weth') {
            tx = await wethContract.deposit({
                value: amount,
                gasLimit,
                gasPrice
            });
        } else {
            tx = await wethContract.withdraw(amount, {
                gasLimit,
                gasPrice
            });
        }

        logger.info('Transaction sent, waiting for confirmation...');
        const receipt = await tx.wait();
        
        logger.info('Swap completed successfully!');
        logger.info(`Transaction hash: ${receipt.hash}`);

        // 显示余额时使用新的地址
        const ethBalance = await wallet.provider.getBalance(walletAddress);
        const wethBalance = await wethContract.balanceOf(walletAddress);
        
        logger.info('\nCurrent balances:');
        logger.info(`ETH: ${ethers.formatEther(ethBalance)} ETH`);
        logger.info(`WETH: ${ethers.formatEther(wethBalance)} WETH`);

    } catch (error) {
        logger.error('Swap failed:', error);
        if (options.debug) {
            logger.error('Error details:', error.stack);
        }
        process.exit(1);
    }
}); 