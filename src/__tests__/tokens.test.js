import { ERC20_ABI, SUPPORTED_TOKENS } from '../config/tokens.js';

describe('tokens', () => {
    describe('ERC20_ABI', () => {
        it('should be an array', () => {
            expect(Array.isArray(ERC20_ABI)).toBe(true);
        });

        it('should contain transfer function', () => {
            expect(ERC20_ABI).toContain('function transfer(address to, uint256 amount) returns (bool)');
        });

        it('should contain balanceOf function', () => {
            expect(ERC20_ABI).toContain('function balanceOf(address) view returns (uint256)');
        });

        it('should contain decimals function', () => {
            expect(ERC20_ABI).toContain('function decimals() view returns (uint8)');
        });

        it('should contain symbol function', () => {
            expect(ERC20_ABI).toContain('function symbol() view returns (string)');
        });

        it('should have exactly 4 functions', () => {
            expect(ERC20_ABI).toHaveLength(4);
        });
    });

    describe('SUPPORTED_TOKENS', () => {
        it('should have tokens for seven chains', () => {
            expect(Object.keys(SUPPORTED_TOKENS)).toEqual(['ethereum', 'base', 'arbitrum', 'ronin', 'polygon', 'apechain', 'sepolia']);
        });

        describe('ethereum tokens', () => {
            it('should define ETH', () => {
                expect(SUPPORTED_TOKENS.ethereum.eth).toEqual({
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18,
                    isNative: true
                });
            });

            it('should define WETH', () => {
                expect(SUPPORTED_TOKENS.ethereum.weth).toEqual({
                    name: 'Wrapped Ether',
                    symbol: 'WETH',
                    decimals: 18,
                    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
                });
            });

            it('should have two tokens', () => {
                expect(Object.keys(SUPPORTED_TOKENS.ethereum)).toHaveLength(2);
            });

            it('should mark ETH as native', () => {
                expect(SUPPORTED_TOKENS.ethereum.eth.isNative).toBe(true);
            });

            it('should not mark WETH as native', () => {
                expect(SUPPORTED_TOKENS.ethereum.weth.isNative).toBeUndefined();
            });
        });

        describe('base tokens', () => {
            it('should define ETH', () => {
                expect(SUPPORTED_TOKENS.base.eth).toEqual({
                    name: 'Base ETH',
                    symbol: 'ETH',
                    decimals: 18,
                    isNative: true
                });
            });

            it('should define WETH', () => {
                expect(SUPPORTED_TOKENS.base.weth).toEqual({
                    name: 'Wrapped Ether',
                    symbol: 'WETH',
                    decimals: 18,
                    address: '0x4200000000000000000000000000000000000006'
                });
            });

            it('should have two tokens', () => {
                expect(Object.keys(SUPPORTED_TOKENS.base)).toHaveLength(2);
            });

            it('should have different WETH address than ethereum', () => {
                expect(SUPPORTED_TOKENS.base.weth.address).not.toBe(
                    SUPPORTED_TOKENS.ethereum.weth.address
                );
            });
        });

        describe('sepolia tokens', () => {
            it('should define ETH', () => {
                expect(SUPPORTED_TOKENS.sepolia.eth).toEqual({
                    name: 'Sepolia ETH',
                    symbol: 'ETH',
                    decimals: 18,
                    isNative: true
                });
            });

            it('should define WETH', () => {
                expect(SUPPORTED_TOKENS.sepolia.weth).toEqual({
                    name: 'Wrapped Ether',
                    symbol: 'WETH',
                    decimals: 18,
                    address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'
                });
            });

            it('should have two tokens', () => {
                expect(Object.keys(SUPPORTED_TOKENS.sepolia)).toHaveLength(2);
            });
        });

        describe('token properties', () => {
            it('all tokens should have 18 decimals', () => {
                Object.values(SUPPORTED_TOKENS).forEach(chainTokens => {
                    Object.values(chainTokens).forEach(token => {
                        expect(token.decimals).toBe(18);
                    });
                });
            });

            it('all WETH tokens should have an address', () => {
                Object.values(SUPPORTED_TOKENS).forEach(chainTokens => {
                    expect(chainTokens.weth.address).toBeDefined();
                    expect(chainTokens.weth.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
                });
            });

            it('all chains should have a native token', () => {
                // ethereum, base, arbitrum, sepolia use ETH as native
                ['ethereum', 'base', 'arbitrum', 'sepolia'].forEach(chain => {
                    expect(SUPPORTED_TOKENS[chain].eth.isNative).toBe(true);
                });
                
                // ronin uses RON as native
                expect(SUPPORTED_TOKENS.ronin.ron.isNative).toBe(true);
                
                // polygon uses MATIC as native
                expect(SUPPORTED_TOKENS.polygon.matic.isNative).toBe(true);
                
                // apechain uses APE as native
                expect(SUPPORTED_TOKENS.apechain.ape.isNative).toBe(true);
            });

            it('all tokens should have name and symbol', () => {
                Object.values(SUPPORTED_TOKENS).forEach(chainTokens => {
                    Object.values(chainTokens).forEach(token => {
                        expect(token.name).toBeDefined();
                        expect(token.symbol).toBeDefined();
                        expect(typeof token.name).toBe('string');
                        expect(typeof token.symbol).toBe('string');
                    });
                });
            });
        });
    });
});
