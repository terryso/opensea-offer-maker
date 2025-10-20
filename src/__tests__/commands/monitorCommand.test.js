/**
 * @jest-environment node
 */

import { monitorCommand } from '../../commands/monitorCommand.js';

describe('monitorCommand', () => {
    it('should have correct name and description', () => {
        expect(monitorCommand.name()).toBe('monitor');
        expect(monitorCommand.description()).toBe('Monitor NFT events in real-time');
    });

    it('should have three subcommands: start, history, stats', () => {
        const subcommands = monitorCommand.commands.map(cmd => cmd.name());
        expect(subcommands).toContain('start');
        expect(subcommands).toContain('history');
        expect(subcommands).toContain('stats');
        expect(subcommands.length).toBe(3);
    });

    describe('start subcommand', () => {
        let startCommand;

        beforeAll(() => {
            startCommand = monitorCommand.commands.find(cmd => cmd.name() === 'start');
        });

        it('should exist with correct description', () => {
            expect(startCommand).toBeDefined();
            expect(startCommand.description()).toBe('Start monitoring wallet NFTs');
        });

        it('should have all required options', () => {
            const options = startCommand.options;
            const optionFlags = options.map(opt => opt.flags);

            expect(optionFlags).toContain('--collections <slugs>');
            expect(optionFlags).toContain('--all-collections');
            expect(optionFlags).toContain('--verbosity <level>');
            expect(optionFlags).toContain('--chain <chain>');
        });

        it('should have default verbosity value', () => {
            const verbosityOption = startCommand.options.find(opt => opt.flags.includes('--verbosity'));
            expect(verbosityOption.defaultValue).toBe('normal');
        });

        it('should have an action function', () => {
            expect(typeof startCommand._actionHandler).toBe('function');
        });
    });

    describe('history subcommand', () => {
        let historyCommand;

        beforeAll(() => {
            historyCommand = monitorCommand.commands.find(cmd => cmd.name() === 'history');
        });

        it('should exist with correct description', () => {
            expect(historyCommand).toBeDefined();
            expect(historyCommand.description()).toBe('Show event history from logs');
        });

        it('should have all required options', () => {
            const options = historyCommand.options;
            const optionFlags = options.map(opt => opt.flags);

            expect(optionFlags).toContain('--type <eventType>');
            expect(optionFlags).toContain('--days <number>');
            expect(optionFlags).toContain('--nft <contract:tokenId>');
            expect(optionFlags).toContain('--limit <number>');
            expect(optionFlags).toContain('--chain <chain>');
        });

        it('should have correct default values', () => {
            const daysOption = historyCommand.options.find(opt => opt.flags.includes('--days'));
            expect(daysOption.defaultValue).toBe('7');

            const limitOption = historyCommand.options.find(opt => opt.flags.includes('--limit'));
            expect(limitOption.defaultValue).toBe('50');
        });

        it('should have an action function', () => {
            expect(typeof historyCommand._actionHandler).toBe('function');
        });
    });

    describe('stats subcommand', () => {
        let statsCommand;

        beforeAll(() => {
            statsCommand = monitorCommand.commands.find(cmd => cmd.name() === 'stats');
        });

        it('should exist with correct description', () => {
            expect(statsCommand).toBeDefined();
            expect(statsCommand.description()).toBe('Show monitoring statistics');
        });

        it('should have all required options', () => {
            const options = statsCommand.options;
            const optionFlags = options.map(opt => opt.flags);

            expect(optionFlags).toContain('--days <number>');
            expect(optionFlags).toContain('--chain <chain>');
        });

        it('should have correct default value for days', () => {
            const daysOption = statsCommand.options.find(opt => opt.flags.includes('--days'));
            expect(daysOption.defaultValue).toBe('30');
        });

        it('should have an action function', () => {
            expect(typeof statsCommand._actionHandler).toBe('function');
        });
    });
});
