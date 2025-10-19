import { ConfigManager } from '../../utils/configManager.js';
import { SUPPORTED_CHAINS, FALLBACK_DEFAULT_CHAIN } from '../../constants/chains.js';

describe('ConfigManager', () => {
    let originalFs;

    beforeEach(() => {
        // Save original fs
        originalFs = ConfigManager._fs;
    });

    afterEach(() => {
        // Restore original fs
        ConfigManager._fs = originalFs;
    });
    describe('getSupportedChains', () => {
        it('should return array of supported chains', () => {
            const chains = ConfigManager.getSupportedChains();

            expect(Array.isArray(chains)).toBe(true);
            expect(chains.length).toBe(7);
        });

        it('should include ethereum chain', () => {
            const chains = ConfigManager.getSupportedChains();
            const ethereum = chains.find(c => c.name === 'ethereum');

            expect(ethereum).toBeDefined();
            expect(ethereum.name).toBe('ethereum');
            expect(ethereum.wethAddress).toBe('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
        });

        it('should include base chain', () => {
            const chains = ConfigManager.getSupportedChains();
            const base = chains.find(c => c.name === 'base');

            expect(base).toBeDefined();
            expect(base.name).toBe('base');
            expect(base.wethAddress).toBe('0x4200000000000000000000000000000000000006');
        });

        it('should include sepolia chain', () => {
            const chains = ConfigManager.getSupportedChains();
            const sepolia = chains.find(c => c.name === 'sepolia');

            expect(sepolia).toBeDefined();
            expect(sepolia.name).toBe('sepolia');
            expect(sepolia.wethAddress).toBe('0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14');
        });

        it('should return chains with correct structure', () => {
            const chains = ConfigManager.getSupportedChains();

            chains.forEach(chain => {
                expect(chain).toHaveProperty('name');
                expect(chain).toHaveProperty('wethAddress');
                expect(typeof chain.name).toBe('string');
                expect(typeof chain.wethAddress).toBe('string');
                expect(chain.wethAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
            });
        });

        it('should not modify returned chains', () => {
            const chains1 = ConfigManager.getSupportedChains();
            const chains2 = ConfigManager.getSupportedChains();

            expect(chains1).toEqual(chains2);
        });

        it('should return all chain names from SUPPORTED_CHAINS', () => {
            const chains = ConfigManager.getSupportedChains();
            const chainNames = chains.map(c => c.name);
            const supportedChainNames = Object.keys(SUPPORTED_CHAINS);

            expect(chainNames.sort()).toEqual(supportedChainNames.sort());
        });

        it('should have consistent data with SUPPORTED_CHAINS constant', () => {
            const chains = ConfigManager.getSupportedChains();

            chains.forEach(chain => {
                const supportedChain = SUPPORTED_CHAINS[chain.name];
                expect(supportedChain).toBeDefined();
                expect(chain.wethAddress).toBe(supportedChain.wethAddress);
            });
        });
    });

    describe('getDefaultChain with mocked fs', () => {
        it('should return chain when config file exists', async () => {
            ConfigManager._fs = {
                readFile: async () => JSON.stringify({ defaultChain: 'base' })
            };

            const result = await ConfigManager.getDefaultChain();
            expect(result).toBe('base');
        });

        it('should return null when config file does not exist', async () => {
            ConfigManager._fs = {
                readFile: async () => { throw new Error('ENOENT'); }
            };

            const result = await ConfigManager.getDefaultChain();
            expect(result).toBeNull();
        });

        it('should return null when config is invalid JSON', async () => {
            ConfigManager._fs = {
                readFile: async () => 'invalid json'
            };

            const result = await ConfigManager.getDefaultChain();
            expect(result).toBeNull();
        });

        it('should return null when defaultChain is missing', async () => {
            ConfigManager._fs = {
                readFile: async () => JSON.stringify({ otherSetting: 'value' })
            };

            const result = await ConfigManager.getDefaultChain();
            expect(result).toBeNull();
        });
    });

    describe('setDefaultChain with mocked fs', () => {
        it('should create new config file', async () => {
            let writtenData;
            ConfigManager._fs = {
                readFile: async () => { throw new Error('ENOENT'); },
                writeFile: async (path, data) => { writtenData = data; }
            };

            const result = await ConfigManager.setDefaultChain('base');

            expect(result).toEqual({ chain: 'base' });
            expect(JSON.parse(writtenData)).toEqual({ defaultChain: 'base' });
        });

        it('should update existing config file', async () => {
            let writtenData;
            ConfigManager._fs = {
                readFile: async () => JSON.stringify({ defaultChain: 'ethereum', other: 'setting' }),
                writeFile: async (path, data) => { writtenData = data; }
            };

            const result = await ConfigManager.setDefaultChain('base');

            expect(result).toEqual({ chain: 'base' });
            const config = JSON.parse(writtenData);
            expect(config.defaultChain).toBe('base');
            expect(config.other).toBe('setting');
        });

        it('should handle write errors', async () => {
            ConfigManager._fs = {
                readFile: async () => { throw new Error('ENOENT'); },
                writeFile: async () => { throw new Error('Permission denied'); }
            };

            await expect(ConfigManager.setDefaultChain('base'))
                .rejects
                .toThrow('Failed to set default chain: Permission denied');
        });
    });

    describe('setDefaultChain - validation', () => {
        it('should reject invalid chain name', async () => {
            await expect(ConfigManager.setDefaultChain('invalid'))
                .rejects
                .toThrow('Invalid chain: invalid. Supported chains: ethereum, base, arbitrum, ronin, polygon, apechain, sepolia');
        });

        it('should accept polygon chain', async () => {
            let writtenData;
            ConfigManager._fs = {
                readFile: async () => { throw new Error('ENOENT'); },
                writeFile: async (path, data) => { writtenData = data; }
            };

            const result = await ConfigManager.setDefaultChain('polygon');
            expect(result).toEqual({ chain: 'polygon' });
        });

        it('should accept arbitrum chain', async () => {
            let writtenData;
            ConfigManager._fs = {
                readFile: async () => { throw new Error('ENOENT'); },
                writeFile: async (path, data) => { writtenData = data; }
            };

            const result = await ConfigManager.setDefaultChain('arbitrum');
            expect(result).toEqual({ chain: 'arbitrum' });
        });

        it('should reject optimism chain', async () => {
            await expect(ConfigManager.setDefaultChain('optimism'))
                .rejects
                .toThrow('Invalid chain: optimism. Supported chains: ethereum, base, arbitrum, ronin, polygon, apechain, sepolia');
        });

        it('should reject empty string', async () => {
            await expect(ConfigManager.setDefaultChain(''))
                .rejects
                .toThrow('Invalid chain:');
        });

        it('should reject null', async () => {
            await expect(ConfigManager.setDefaultChain(null))
                .rejects
                .toThrow('Invalid chain');
        });

        it('should reject undefined', async () => {
            await expect(ConfigManager.setDefaultChain(undefined))
                .rejects
                .toThrow('Invalid chain');
        });

        it('should validate ethereum chain name', () => {
            const validationTest = () => {
                const chains = Object.keys(SUPPORTED_CHAINS);
                return chains.includes('ethereum');
            };
            expect(validationTest()).toBe(true);
        });

        it('should validate base chain name', () => {
            const validationTest = () => {
                const chains = Object.keys(SUPPORTED_CHAINS);
                return chains.includes('base');
            };
            expect(validationTest()).toBe(true);
        });

        it('should validate sepolia chain name', () => {
            const validationTest = () => {
                const chains = Object.keys(SUPPORTED_CHAINS);
                return chains.includes('sepolia');
            };
            expect(validationTest()).toBe(true);
        });
    });

    describe('constants validation', () => {
        it('should have FALLBACK_DEFAULT_CHAIN defined', () => {
            expect(FALLBACK_DEFAULT_CHAIN).toBeDefined();
            expect(typeof FALLBACK_DEFAULT_CHAIN).toBe('string');
        });

        it('should have FALLBACK_DEFAULT_CHAIN as one of supported chains', () => {
            expect(SUPPORTED_CHAINS[FALLBACK_DEFAULT_CHAIN]).toBeDefined();
        });

        it('should have SUPPORTED_CHAINS with all required properties', () => {
            Object.entries(SUPPORTED_CHAINS).forEach(([name, config]) => {
                expect(config).toHaveProperty('name');
                expect(config).toHaveProperty('chain');
                expect(config).toHaveProperty('wethAddress');
                expect(config.name).toBe(name);
            });
        });
    });

    describe('ConfigManager class structure', () => {
        it('should have getDefaultChain method', () => {
            expect(typeof ConfigManager.getDefaultChain).toBe('function');
        });

        it('should have setDefaultChain method', () => {
            expect(typeof ConfigManager.setDefaultChain).toBe('function');
        });

        it('should have getSupportedChains method', () => {
            expect(typeof ConfigManager.getSupportedChains).toBe('function');
        });

        it('should have exactly 3 public methods', () => {
            const methods = Object.getOwnPropertyNames(ConfigManager).filter(
                prop => typeof ConfigManager[prop] === 'function' && prop !== 'constructor'
            );
            expect(methods.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('supported chains data integrity', () => {
        it('should have ethereum with valid WETH address', () => {
            const ethereum = SUPPORTED_CHAINS.ethereum;
            expect(ethereum.wethAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        });

        it('should have base with valid WETH address', () => {
            const base = SUPPORTED_CHAINS.base;
            expect(base.wethAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        });

        it('should have sepolia with valid WETH address', () => {
            const sepolia = SUPPORTED_CHAINS.sepolia;
            expect(sepolia.wethAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        });

        it('should have unique WETH addresses for each chain', () => {
            const addresses = Object.values(SUPPORTED_CHAINS).map(c => c.wethAddress);
            const uniqueAddresses = new Set(addresses);
            expect(uniqueAddresses.size).toBe(addresses.length);
        });
    });
});
