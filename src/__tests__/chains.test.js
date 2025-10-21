import { SUPPORTED_CHAINS, getChainConfig, getNativeCurrencySymbol, FALLBACK_DEFAULT_CHAIN } from '../constants/chains.js';

describe('Chains Configuration', () => {
  describe('SUPPORTED_CHAINS', () => {
    it('should contain all expected chains', () => {
      expect(SUPPORTED_CHAINS).toHaveProperty('ethereum');
      expect(SUPPORTED_CHAINS).toHaveProperty('base');
      expect(SUPPORTED_CHAINS).toHaveProperty('arbitrum');
      expect(SUPPORTED_CHAINS).toHaveProperty('ronin');
      expect(SUPPORTED_CHAINS).toHaveProperty('polygon');
      expect(SUPPORTED_CHAINS).toHaveProperty('apechain');
      expect(SUPPORTED_CHAINS).toHaveProperty('sepolia');
    });

    it('should have correct configuration for ethereum', () => {
      const eth = SUPPORTED_CHAINS.ethereum;
      expect(eth.name).toBe('ethereum');
      expect(eth.chainId).toBe(1);
      expect(eth.apiChainName).toBe('ethereum');
      expect(eth.nativeCurrency.symbol).toBe('ETH');
      expect(eth.wethAddress).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
    });

    it('should have correct configuration for base', () => {
      const base = SUPPORTED_CHAINS.base;
      expect(base.name).toBe('base');
      expect(base.chainId).toBe(8453);
      expect(base.apiChainName).toBe('base');
      expect(base.nativeCurrency.symbol).toBe('ETH');
      expect(base.wethAddress).toBe('0x4200000000000000000000000000000000000006');
    });

    it('should have correct configuration for polygon', () => {
      const polygon = SUPPORTED_CHAINS.polygon;
      expect(polygon.name).toBe('polygon');
      expect(polygon.chainId).toBe(137);
      expect(polygon.apiChainName).toBe('matic'); // OpenSea uses 'matic'
      expect(polygon.nativeCurrency.symbol).toBe('MATIC');
      expect(polygon.wethAddress).toBe('0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619');
    });

    it('should have correct configuration for apechain', () => {
      const apechain = SUPPORTED_CHAINS.apechain;
      expect(apechain.name).toBe('apechain');
      expect(apechain.chainId).toBe(33139);
      expect(apechain.apiChainName).toBe('ape_chain'); // OpenSea uses 'ape_chain'
      expect(apechain.nativeCurrency.symbol).toBe('APE');
      expect(apechain.wethAddress).toBe('0x48b62137EdfA95a428D35C09E44256a739F6B557');
    });

    it('should have unique chain IDs', () => {
      const chainIds = Object.values(SUPPORTED_CHAINS).map(chain => chain.chainId);
      const uniqueChainIds = [...new Set(chainIds)];
      expect(chainIds).toHaveLength(uniqueChainIds.length);
    });

    it('should have unique API chain names', () => {
      const apiChainNames = Object.values(SUPPORTED_CHAINS).map(chain => chain.apiChainName);
      const uniqueApiChainNames = [...new Set(apiChainNames)];
      expect(apiChainNames).toHaveLength(uniqueApiChainNames.length);
    });
  });

  describe('getChainConfig', () => {
    it('should return config by key', () => {
      const config = getChainConfig('ethereum');
      expect(config).toBe(SUPPORTED_CHAINS.ethereum);
    });

    it('should return config by name', () => {
      const config = getChainConfig('ethereum');
      expect(config.name).toBe('ethereum');
    });

    it('should return config by API chain name', () => {
      const config = getChainConfig('matic'); // Polygon's API chain name
      expect(config).toBe(SUPPORTED_CHAINS.polygon);
    });

    it('should return config by alternative API chain name', () => {
      const config = getChainConfig('ape_chain'); // ApeChain's API chain name
      expect(config).toBe(SUPPORTED_CHAINS.apechain);
    });

    it('should return null for unknown chain', () => {
      const config = getChainConfig('unknown-chain');
      expect(config).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(getChainConfig('')).toBeNull();
      expect(getChainConfig(null)).toBeNull();
      expect(getChainConfig(undefined)).toBeNull();
    });

    it('should be case sensitive for chain names', () => {
      expect(getChainConfig('Ethereum')).toBeNull(); // Case sensitive
      expect(getChainConfig('ethereum')).not.toBeNull(); // Correct case
    });
  });

  describe('getNativeCurrencySymbol', () => {
    it('should return ETH for ethereum', () => {
      expect(getNativeCurrencySymbol('ethereum')).toBe('ETH');
    });

    it('should return ETH for base', () => {
      expect(getNativeCurrencySymbol('base')).toBe('ETH');
    });

    it('should return MATIC for polygon', () => {
      expect(getNativeCurrencySymbol('polygon')).toBe('MATIC');
    });

    it('should return APE for apechain', () => {
      expect(getNativeCurrencySymbol('apechain')).toBe('APE');
    });

    it('should return RON for ronin', () => {
      expect(getNativeCurrencySymbol('ronin')).toBe('RON');
    });

    it('should return ETH for sepolia', () => {
      expect(getNativeCurrencySymbol('sepolia')).toBe('ETH');
    });

    it('should return default ETH for unknown chain', () => {
      expect(getNativeCurrencySymbol('unknown-chain')).toBe('ETH');
    });

    it('should return default ETH for empty input', () => {
      expect(getNativeCurrencySymbol('')).toBe('ETH');
      expect(getNativeCurrencySymbol(null)).toBe('ETH');
      expect(getNativeCurrencySymbol(undefined)).toBe('ETH');
    });

    it('should work with API chain names', () => {
      expect(getNativeCurrencySymbol('matic')).toBe('MATIC'); // Polygon API name
      expect(getNativeCurrencySymbol('ape_chain')).toBe('APE'); // ApeChain API name
    });
  });

  describe('FALLBACK_DEFAULT_CHAIN', () => {
    it('should be ethereum', () => {
      expect(FALLBACK_DEFAULT_CHAIN).toBe('ethereum');
    });
  });
});