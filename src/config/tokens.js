import { Chain } from 'opensea-js';

// 标准 ERC20 ABI
export const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
];

// 支持的代币配置
export const SUPPORTED_TOKENS = {
    'ethereum': {
        'eth': {
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18,
            isNative: true
        },
        'weth': {
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
        }
    },
    'base': {
        'eth': {
            name: 'Base ETH',
            symbol: 'ETH',
            decimals: 18,
            isNative: true
        },
        'weth': {
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            address: '0x4200000000000000000000000000000000000006'
        }
    },
    'sepolia': {
        'eth': {
            name: 'Sepolia ETH',
            symbol: 'ETH',
            decimals: 18,
            isNative: true
        },
        'weth': {
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
        }
    }
}; 