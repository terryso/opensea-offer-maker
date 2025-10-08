import { scanCommand } from '../../commands/scanCommand.js';

describe('scanCommand', () => {
    it('should have correct name and description', () => {
        expect(scanCommand.name()).toBe('scan');
        expect(scanCommand.description()).toBe('Scan collections for trading opportunities');
    });

    it('should have all required options', () => {
        const options = scanCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        expect(optionFlags).toContain('-v, --volume <volume>');
        expect(optionFlags).toContain('-g, --gap <gap>');
        expect(optionFlags).toContain('-s, --sales <sales>');
        expect(optionFlags).toContain('-t, --top <number>');
        expect(optionFlags).toContain('--min-floor <price>');
        expect(optionFlags).toContain('--max-floor <price>');
        expect(optionFlags).toContain('--min-opportunities <number>');
        expect(optionFlags).toContain('--debug');
    });

    it('should have correct default values for options', () => {
        const topOption = scanCommand.options.find(opt => opt.flags.includes('--top'));
        const minOpportunitiesOption = scanCommand.options.find(opt => opt.flags.includes('--min-opportunities'));

        expect(topOption.defaultValue).toBe('100');
        expect(minOpportunitiesOption.defaultValue).toBe('10');
    });

    it('should have an action function', () => {
        expect(typeof scanCommand._actionHandler).toBe('function');
    });
});
