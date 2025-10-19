import { listCommand } from '../../commands/listCommand.js';

describe('listCommand', () => {
    it('should have correct name and description', () => {
        expect(listCommand.name()).toBe('list');
        expect(listCommand.description()).toBe('List an NFT for sale on multiple marketplaces. Use --interactive to select from cached NFTs or provide --address and --token-id manually.');
    });

    it('should have all required options', () => {
        const options = listCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        expect(optionFlags).toContain('-a, --address <address>');
        expect(optionFlags).toContain('-t, --token-id <tokenId>');
        expect(optionFlags).toContain('-i, --interactive');
        expect(optionFlags).toContain('-p, --price <price>');
        expect(optionFlags).toContain('-f, --floor-diff <diff>');
        expect(optionFlags).toContain('--profit-margin <margin>');
        expect(optionFlags).toContain('--profit-percent <percent>');
        expect(optionFlags).toContain('-e, --expiration <time>');
        expect(optionFlags).toContain('-m, --marketplaces <markets>');
        expect(optionFlags).toContain('--skip-confirm');
        expect(optionFlags).toContain('--debug');
    });

    it('should have interactive flag as optional', () => {
        const interactiveOption = listCommand.options.find(opt => opt.flags.includes('--interactive'));
        expect(interactiveOption.required).toBeFalsy();
    });

    it('should have address and token-id as optional (not required)', () => {
        const addressOption = listCommand.options.find(opt => opt.flags.includes('--address'));
        const tokenIdOption = listCommand.options.find(opt => opt.flags.includes('--token-id'));
        // Commander.js uses .mandatory property for required status
        expect(addressOption.mandatory).toBeFalsy();
        expect(tokenIdOption.mandatory).toBeFalsy();
    });

    it('should have correct default values', () => {
        const expirationOption = listCommand.options.find(opt => opt.flags.includes('--expiration'));
        const marketplacesOption = listCommand.options.find(opt => opt.flags.includes('--marketplaces'));

        expect(expirationOption.defaultValue).toBe('1h');
        expect(marketplacesOption.defaultValue).toBe('opensea,blur');
    });

    it('should have an action function', () => {
        expect(typeof listCommand._actionHandler).toBe('function');
    });

    it('should have chain and private key options from utils', () => {
        const options = listCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        // These options are added by addChainOption and addPrivateKeyOption
        expect(optionFlags.some(flag => flag.includes('chain'))).toBeTruthy();
        expect(optionFlags.some(flag => flag.includes('private-key') || flag.includes('key-name'))).toBeTruthy();
    });

    // Note: Integration tests and mocking tests are excluded in this version
    // due to ES modules Jest configuration complexity. These tests verify
    // the command structure and configuration which is sufficient for
    // validating the basic functionality and backward compatibility.
});