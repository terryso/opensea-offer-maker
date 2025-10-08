import { checkOffersCommand } from '../../commands/checkOffersCommand.js';

describe('checkOffersCommand', () => {
    it('should have correct name and description', () => {
        expect(checkOffersCommand.name()).toBe('check');
        expect(checkOffersCommand.description()).toBe('Check collection offers');
    });

    it('should have all required options', () => {
        const options = checkOffersCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        expect(optionFlags).toContain('-c, --collection <slug>');
        expect(optionFlags).toContain('--debug');
    });

    it('should have collection as required option', () => {
        const collectionOption = checkOffersCommand.options.find(opt => opt.flags.includes('--collection'));
        expect(collectionOption.required).toBe(true);
    });

    it('should have an action function', () => {
        expect(typeof checkOffersCommand._actionHandler).toBe('function');
    });
});
