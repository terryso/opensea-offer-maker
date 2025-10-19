import { SUPPORTED_CHAINS, DEFAULT_CHAIN } from '../config.js';
import { ConfigManager } from '../utils/configManager.js';
import { ethers } from 'ethers';
import { KeyManager } from '../utils/keyManager.js';
import enquirer from 'enquirer';
const { prompt } = enquirer;

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

/**
 * Get the effective chain to use, considering user configuration
 * @param {Object} options - Command options
 * @returns {Promise<Object>} Chain configuration
 */
export const getEffectiveChain = async (options) => {
    let chainName = options.chain;

    // Only use configured default if user didn't explicitly provide --chain
    // Check process.argv to see if --chain was explicitly provided
    const chainExplicitlyProvided = process.argv.includes('--chain');
    
    if (!chainExplicitlyProvided) {
        const configuredChain = await ConfigManager.getDefaultChain();
        if (configuredChain) {
            chainName = configuredChain;
        }
    }

    return validateChain(chainName);
};

// 添加私钥选项
export const addPrivateKeyOption = (command) => {
    return command.option(
        '--private-key <key>',
        'Private key to use for transaction (overrides WALLET_PRIV_KEY in .env)'
    );
};

// 获取钱包实例
export const getWallet = async (options) => {
    let privateKey = options.privateKey;

    if (!privateKey) {
        if (!await KeyManager.isKeyStored()) {
            throw new Error('No private key stored. Please run "key setup" first or provide --private-key');
        }
        privateKey = await KeyManager.decryptKey();
    }

    // 根据指定的链创建 provider（考虑用户配置的默认链）
    const chainConfig = await getEffectiveChain(options);
    const provider = new ethers.AlchemyProvider(
        chainConfig.chain === 'ethereum' ? 'mainnet' : chainConfig.chain,
        process.env.ALCHEMY_API_KEY
    );

    return new ethers.Wallet(privateKey, provider);
}; 