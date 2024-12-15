import { SUPPORTED_CHAINS, DEFAULT_CHAIN } from '../config.js';

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