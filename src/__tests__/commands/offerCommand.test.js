import { offerCommand } from '../../commands/offerCommand.js';

describe('offerCommand', () => {
    it('should have correct name and description', () => {
        expect(offerCommand.name()).toBe('offer');
        expect(offerCommand.description()).toBe('Create an offer for a single NFT or collection');
    });

    it('should have all required options', () => {
        const options = offerCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        expect(optionFlags).toContain('-a, --address <address>');
        expect(optionFlags).toContain('-t, --token-id <tokenId>');
        expect(optionFlags).toContain('-c, --collection <slug>');
        expect(optionFlags).toContain('-o, --offer-amount <offerAmount>');
        expect(optionFlags).toContain('-e, --expiration-minutes <expirationMinutes>');
        expect(optionFlags).toContain('--trait-type <traitType>');
        expect(optionFlags).toContain('--trait-value <traitValue>');
    });

    it('should have offer-amount as required option', () => {
        const offerAmountOption = offerCommand.options.find(opt => opt.flags.includes('--offer-amount'));
        expect(offerAmountOption.required).toBe(true);
    });

    it('should have correct default value for expiration-minutes', () => {
        const expirationOption = offerCommand.options.find(opt => opt.flags.includes('--expiration-minutes'));
        expect(expirationOption.defaultValue).toBe('15');
    });

    it('should have an action function', () => {
        expect(typeof offerCommand._actionHandler).toBe('function');
    });
});
