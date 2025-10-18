import { balanceCommand } from '../../commands/balanceCommand.js';

describe('balanceCommand', () => {
    it('should have correct name and description', () => {
        expect(balanceCommand.name()).toBe('balance');
        expect(balanceCommand.description()).toBe('Check wallet balance for supported tokens');
    });

    it('should have all options', () => {
        const options = balanceCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        expect(optionFlags).toContain('-t, --token <token>');
        expect(optionFlags).toContain('--debug');
        expect(optionFlags).toContain('--chain <chain>');
        expect(optionFlags).toContain('--private-key <key>');
    });

    it('should have token option', () => {
        const tokenOption = balanceCommand.options.find(opt => opt.flags.includes('--token'));
        expect(tokenOption).toBeDefined();
    });

    it('should have chain option', () => {
        const chainOption = balanceCommand.options.find(opt => opt.flags.includes('--chain'));
        expect(chainOption).toBeDefined();
    });

    it('should have debug option', () => {
        const debugOption = balanceCommand.options.find(opt => opt.flags.includes('--debug'));
        expect(debugOption).toBeDefined();
    });

    it('should have an action function', () => {
        expect(typeof balanceCommand._actionHandler).toBe('function');
    });
});
