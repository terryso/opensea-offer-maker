import { SUPPORTED_CHAINS, DEFAULT_CHAIN, provider, WALLET_PRIV_KEY } from '../config.js';
import { ethers } from 'ethers';

export const addChainOption = (command) => {
    return command.option(
        '--chain <chain>',
        `Chain to use (${Object.keys(SUPPORTED_CHAINS).join(', ')})`,
        DEFAULT_CHAIN
    );
};

export const validateChain = (chainName) => {
    const chainConfig = SUPPORTED_CHAINS[chainName];
    if (!chainConfig) {
        throw new Error(`Unsupported chain: ${chainName}`);
    }
    return chainConfig;
};

// 添加私钥选项
export const addPrivateKeyOption = (command) => {
    return command.option(
        '--private-key <key>',
        'Private key to use for transaction (overrides WALLET_PRIV_KEY in .env)'
    );
};

// 获取钱包实例
export const getWallet = (options) => {
    const privateKey = options.privateKey || WALLET_PRIV_KEY;
    if (!privateKey) {
        throw new Error('No private key provided. Use --private-key or set WALLET_PRIV_KEY in .env');
    }
    return new ethers.Wallet(privateKey, provider);
}; 