import dotenv from 'dotenv';
import { OPENSEA_API_KEY, ALCHEMY_API_KEY } from './utils/env.js';
import { SUPPORTED_CHAINS, FALLBACK_DEFAULT_CHAIN } from './constants/chains.js';

dotenv.config();

// Re-export environment variables
export { OPENSEA_API_KEY, ALCHEMY_API_KEY };
export const RESERVOIR_API_KEY = process.env.RESERVOIR_API_KEY;

// Validate environment variables
if (!OPENSEA_API_KEY || !ALCHEMY_API_KEY) {
    const error = new Error("Missing environment variables. Please set OPENSEA_API_KEY and ALCHEMY_API_KEY.");
    error.code = 'ENV_MISSING';
    throw error;
}

// Re-export chain configurations
export { SUPPORTED_CHAINS };

// Default chain (fallback value if no config file)
export const DEFAULT_CHAIN = FALLBACK_DEFAULT_CHAIN;

// OpenSea API configuration
export const OPENSEA_API_BASE_URL = 'https://api.opensea.io';
export const OPENSEA_SEAPORT_ADDRESS = '0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC';

// WETH ABI
export const WETH_ABI = [
    // Read-only functions
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    
    // Write functions
    "function deposit() payable",
    "function withdraw(uint256 wad)",
    "function approve(address guy, uint256 wad) returns (bool)",
    "function transfer(address dst, uint256 wad) returns (bool)",
    
    // Events
    "event Deposit(address indexed dst, uint256 wad)",
    "event Withdrawal(address indexed src, uint256 wad)",
    "event Approval(address indexed src, address indexed guy, uint256 wad)",
    "event Transfer(address indexed src, address indexed dst, uint256 wad)"
]; 

// Reservoir API configuration
export const RESERVOIR_API_BASE_URLS = {
    ethereum: 'https://api.reservoir.tools',
    base: 'https://api-base.reservoir.tools',
    sepolia: 'https://api-sepolia.reservoir.tools'
};

// Supported marketplaces
export const SUPPORTED_MARKETPLACES = {
    ethereum: ['opensea'],
    base: ['opensea'],
    sepolia: ['opensea']
};