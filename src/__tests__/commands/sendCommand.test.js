import { sendCommand } from '../../commands/sendCommand.js';

describe('sendCommand', () => {
    it('should have correct name and description', () => {
        expect(sendCommand.name()).toBe('send');
        expect(sendCommand.description()).toBe('Send tokens to an address');
    });

    it('should have all required options', () => {
        const options = sendCommand.options;
        const optionFlags = options.map(opt => opt.flags);

        expect(optionFlags).toContain('-t, --token <token>');
        expect(optionFlags).toContain('-a, --amount <amount>');
        expect(optionFlags).toContain('-r, --recipient <address>');
        expect(optionFlags).toContain('--debug');
    });

    it('should have token as required option', () => {
        const tokenOption = sendCommand.options.find(opt => opt.flags.includes('--token'));
        expect(tokenOption.required).toBe(true);
    });

    it('should have amount as required option', () => {
        const amountOption = sendCommand.options.find(opt => opt.flags.includes('--amount'));
        expect(amountOption.required).toBe(true);
    });

    it('should have recipient as required option', () => {
        const recipientOption = sendCommand.options.find(opt => opt.flags.includes('--recipient'));
        expect(recipientOption.required).toBe(true);
    });

    it('should have an action function', () => {
        expect(typeof sendCommand._actionHandler).toBe('function');
    });
});
