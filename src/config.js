import dotenv from 'dotenv';
import { Chain, OpenSeaSDK } from "opensea-js";
import { AlchemyProvider, ethers } from "ethers";
import { logger } from './utils/logger.js';

dotenv.config();

// Environment variables
export const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
export const WALLET_PRIV_KEY = process.env.WALLET_PRIV_KEY;
export const ALCHEMY_API_KEY_MAINNET = process.env.ALCHEMY_API_KEY;
export const RESERVOIR_API_KEY = process.env.RESERVOIR_API_KEY;

// Validate environment variables
if (!OPENSEA_API_KEY || !WALLET_PRIV_KEY || !ALCHEMY_API_KEY_MAINNET) {
    const error = new Error("Missing environment variables. Please set OPENSEA_API_KEY, WALLET_PRIV_KEY, and ALCHEMY_API_KEY_MAINNET.");
    error.code = 'ENV_MISSING';
    throw error;
}

// Provider configuration
export const provider = new AlchemyProvider("base", ALCHEMY_API_KEY_MAINNET);

// Wallet configuration
export const wallet = new ethers.Wallet(WALLET_PRIV_KEY, provider);
export const WALLET_ADDRESS = wallet.address;

// Base chain WETH address
export const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

// OpenSea SDK configuration
export const sdk = new OpenSeaSDK(wallet, {
    chain: Chain.Base,
    apiKey: OPENSEA_API_KEY,
});

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

// Default to Base chain if not specified
export const DEFAULT_CHAIN = 'base';

// OpenSea API configuration
export const OPENSEA_API_BASE_URL = 'https://api.opensea.io';
export const OPENSEA_SEAPORT_ADDRESS = '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC';

// WETH ABI
export const WETH_ABI = [
    {"constant":true,"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},
]; 