import { chainCommand } from '../../commands/chainCommand.js';

describe('chainCommand', () => {
    it('should have correct name and description', () => {
        expect(chainCommand.name()).toBe('chain');
        expect(chainCommand.description()).toBe('Manage default chain configuration');
    });

    it('should have all subcommands', () => {
        const subcommands = chainCommand.commands.map(cmd => cmd.name());
        expect(subcommands).toContain('get');
        expect(subcommands).toContain('set');
        expect(subcommands).toContain('list');
    });

    describe('get subcommand', () => {
        it('should have correct name and description', () => {
            const getCommand = chainCommand.commands.find(cmd => cmd.name() === 'get');
            expect(getCommand).toBeDefined();
            expect(getCommand.description()).toBe('Display current default chain');
        });

        it('should have an action function', () => {
            const getCommand = chainCommand.commands.find(cmd => cmd.name() === 'get');
            expect(typeof getCommand._actionHandler).toBe('function');
        });

        it('should not have any options', () => {
            const getCommand = chainCommand.commands.find(cmd => cmd.name() === 'get');
            expect(getCommand.options.length).toBe(0);
        });

        it('should not require arguments', () => {
            const getCommand = chainCommand.commands.find(cmd => cmd.name() === 'get');
            expect(getCommand._args.length).toBe(0);
        });
    });

    describe('set subcommand', () => {
        it('should have correct name and description', () => {
            const setCommand = chainCommand.commands.find(cmd => cmd.name() === 'set');
            expect(setCommand).toBeDefined();
            expect(setCommand.description()).toBe('Set default chain');
        });

        it('should have an action function', () => {
            const setCommand = chainCommand.commands.find(cmd => cmd.name() === 'set');
            expect(typeof setCommand._actionHandler).toBe('function');
        });

        it('should require chain argument', () => {
            const setCommand = chainCommand.commands.find(cmd => cmd.name() === 'set');
            expect(setCommand._args.length).toBe(1);
            expect(setCommand._args[0].name()).toBe('chain');
        });

        it('should have chain argument with description', () => {
            const setCommand = chainCommand.commands.find(cmd => cmd.name() === 'set');
            const chainArg = setCommand._args[0];
            expect(chainArg.description).toBe('Chain name (ethereum, base, sepolia)');
        });

        it('should require mandatory chain argument', () => {
            const setCommand = chainCommand.commands.find(cmd => cmd.name() === 'set');
            const chainArg = setCommand._args[0];
            expect(chainArg.required).toBe(true);
        });
    });

    describe('list subcommand', () => {
        it('should have correct name and description', () => {
            const listCommand = chainCommand.commands.find(cmd => cmd.name() === 'list');
            expect(listCommand).toBeDefined();
            expect(listCommand.description()).toBe('List all supported chains');
        });

        it('should have an action function', () => {
            const listCommand = chainCommand.commands.find(cmd => cmd.name() === 'list');
            expect(typeof listCommand._actionHandler).toBe('function');
        });

        it('should not have any options', () => {
            const listCommand = chainCommand.commands.find(cmd => cmd.name() === 'list');
            expect(listCommand.options.length).toBe(0);
        });

        it('should not require arguments', () => {
            const listCommand = chainCommand.commands.find(cmd => cmd.name() === 'list');
            expect(listCommand._args.length).toBe(0);
        });
    });

    describe('command structure', () => {
        it('should export a command instance', () => {
            expect(chainCommand).toBeDefined();
            expect(chainCommand.commands).toBeDefined();
            expect(Array.isArray(chainCommand.commands)).toBe(true);
        });

        it('should have exactly 3 subcommands', () => {
            expect(chainCommand.commands.length).toBe(3);
        });

        it('should have all subcommands with action handlers', () => {
            chainCommand.commands.forEach(cmd => {
                expect(typeof cmd._actionHandler).toBe('function');
            });
        });

        it('should have all subcommands with descriptions', () => {
            chainCommand.commands.forEach(cmd => {
                expect(cmd.description()).toBeTruthy();
                expect(typeof cmd.description()).toBe('string');
            });
        });
    });
});
