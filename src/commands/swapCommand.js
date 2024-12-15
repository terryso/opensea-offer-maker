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

        logger.info(`\nSwapping ${options.amount} ${options.direction === 'eth2weth' ? 'ETH → WETH' : 'WETH → ETH'}...`);
        logger.info(`Wallet: ${walletAddress}`);
        logger.info(`Chain: ${chainConfig.chain}`);
        logger.info('------------------------');

        // 使用新的 wallet 实例连接合约
        const wethContract = new ethers.Contract(wethAddress, WETH_ABI, wallet);

        let tx;
        if (options.direction === 'eth2weth') {
            tx = await wethContract.deposit({ value: amount });
        } else {
            tx = await wethContract.withdraw(amount);
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