import { swapCommand } from '../../commands/swapCommand.js';

describe('swapCommand', () => {
    it('should have correct name and description', () => {
        expect(swapCommand.name()).toBe('swap');
        expect(swapCommand.description()).toBe('Swap between ETH and WETH');
    });

    it('should have all required options', () => {
        const options = swapCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        expect(optionFlags).toContain('-a, --amount <amount>');
        expect(optionFlags).toContain('-d, --direction <direction>');
        expect(optionFlags).toContain('--debug');
    });

    it('should have amount as required option', () => {
        const amountOption = swapCommand.options.find(opt => opt.flags.includes('--amount'));
        expect(amountOption.required).toBe(true);
    });

    it('should have direction as required option', () => {
        const directionOption = swapCommand.options.find(opt => opt.flags.includes('--direction'));
        expect(directionOption.required).toBe(true);
    });

    it('should have an action function', () => {
        expect(typeof swapCommand._actionHandler).toBe('function');
    });
});
