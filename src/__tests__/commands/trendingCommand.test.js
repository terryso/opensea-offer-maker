import { trendingCommand } from '../../commands/trendingCommand.js';

describe('trendingCommand', () => {
    it('should have correct name and description', () => {
        expect(trendingCommand.name()).toBe('trending');
        expect(trendingCommand.description()).toBe('Scan trending collections for trading opportunities');
    });

    it('should have all required options', () => {
        const options = trendingCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        expect(optionFlags).toContain('-v, --volume <volume>');
        expect(optionFlags).toContain('-g, --gap <gap>');
        expect(optionFlags).toContain('-p, --period <period>');
        expect(optionFlags).toContain('-l, --limit <limit>');
        expect(optionFlags).toContain('--debug');
    });

    it('should have correct default values for options', () => {
        const volumeOption = trendingCommand.options.find(opt => opt.flags.includes('--volume'));
        const gapOption = trendingCommand.options.find(opt => opt.flags.includes('--gap'));
        const periodOption = trendingCommand.options.find(opt => opt.flags.includes('--period'));
        const limitOption = trendingCommand.options.find(opt => opt.flags.includes('--limit'));

        expect(volumeOption.defaultValue).toBe('1');
        expect(gapOption.defaultValue).toBe('20');
        expect(periodOption.defaultValue).toBe('24h');
        expect(limitOption.defaultValue).toBe('20');
    });

    it('should have an action function', () => {
        expect(typeof trendingCommand._actionHandler).toBe('function');
    });
});
