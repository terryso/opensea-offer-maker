import { Chain } from "opensea-js";

// Supported chains configuration
export const SUPPORTED_CHAINS = {
    ethereum: {
        name: 'ethereum',
        chain: Chain.Mainnet,
        wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    },
    base: {
        name: 'base',
        chain: Chain.Base,
        wethAddress: '0x4200000000000000000000000000000000000006'
    },
    sepolia: {
        name: 'sepolia',
        chain: Chain.Sepolia,
        wethAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
    }
};

// Fallback default chain
export const FALLBACK_DEFAULT_CHAIN = 'ethereum';
