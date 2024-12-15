import dotenv from 'dotenv';
import { Chain } from "opensea-js";

dotenv.config();

// Environment variables
export const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY;
export const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
export const RESERVOIR_API_KEY = process.env.RESERVOIR_API_KEY;

// Validate environment variables
if (!OPENSEA_API_KEY || !ALCHEMY_API_KEY) {
    const error = new Error("Missing environment variables. Please set OPENSEA_API_KEY and ALCHEMY_API_KEY.");
    error.code = 'ENV_MISSING';
    throw error;
}

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