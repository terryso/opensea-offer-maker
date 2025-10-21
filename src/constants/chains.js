import { Chain } from 'opensea-js';

// Supported chains configuration
export const SUPPORTED_CHAINS = {
  ethereum: {
    name: 'ethereum',
    chain: Chain.Mainnet,
    wethAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    chainId: 1,
    alchemyNetwork: 'mainnet',
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/',
    apiChainName: 'ethereum',  // OpenSea API chain identifier
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000'
    }
  },
  base: {
    name: 'base',
    chain: Chain.Base,
    wethAddress: '0x4200000000000000000000000000000000000006',
    chainId: 8453,
    alchemyNetwork: 'base',
    rpcUrl: 'https://base-mainnet.g.alchemy.com/v2/',
    apiChainName: 'base',
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000'
    }
  },
  arbitrum: {
    name: 'arbitrum',
    chain: Chain.Arbitrum,
    wethAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    chainId: 42161,
    alchemyNetwork: 'arb-mainnet',
    rpcUrl: 'https://arb-mainnet.g.alchemy.com/v2/',
    apiChainName: 'arbitrum',
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000'
    }
  },
  ronin: {
    name: 'ronin',
    chain: Chain.Ronin,
    wethAddress: '0xc99a6A985eD2Cac1ef41640596C5A5f9F4E19Ef5',
    chainId: 2020,
    rpcUrl: 'https://api.roninchain.com/rpc',
    apiChainName: 'ronin',
    nativeCurrency: {
      symbol: 'RON',
      name: 'Ronin',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000'
    }
  },
  polygon: {
    name: 'polygon',
    chain: Chain.Polygon,
    wethAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    chainId: 137,
    alchemyNetwork: 'matic',
    rpcUrl: 'https://polygon-mainnet.g.alchemy.com/v2/',
    apiChainName: 'matic',  // OpenSea uses 'matic' for Polygon
    nativeCurrency: {
      symbol: 'MATIC',
      name: 'Polygon',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000'
    }
  },
  apechain: {
    name: 'apechain',
    chain: Chain.ApeChain,
    wethAddress: '0x48b62137EdfA95a428D35C09E44256a739F6B557',
    chainId: 33139,
    rpcUrl: 'https://apechain.calderachain.xyz/http',
    apiChainName: 'ape_chain',  // OpenSea uses 'ape_chain' for ApeChain
    nativeCurrency: {
      symbol: 'APE',
      name: 'ApeCoin',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000'
    }
  },
  sepolia: {
    name: 'sepolia',
    chain: Chain.Sepolia,
    wethAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    chainId: 11155111,
    alchemyNetwork: 'sepolia',
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/',
    apiChainName: 'sepolia',
    nativeCurrency: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      address: '0x0000000000000000000000000000000000000000'
    }
  }
};

// Get chain configuration by chain identifier
export function getChainConfig(chainIdentifier) {
  // Try to find by apiChainName, name, or key
  for (const [key, config] of Object.entries(SUPPORTED_CHAINS)) {
    if (config.apiChainName === chainIdentifier ||
            config.name === chainIdentifier ||
            key === chainIdentifier) {
      return config;
    }
  }
  return null;
}

// Get native currency symbol for a chain
export function getNativeCurrencySymbol(chainIdentifier) {
  const config = getChainConfig(chainIdentifier);
  return config?.nativeCurrency?.symbol || 'ETH';
}

// Fallback default chain
export const FALLBACK_DEFAULT_CHAIN = 'ethereum';
