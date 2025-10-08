import { keyCommand } from '../../commands/keyCommand.js';

describe('keyCommand', () => {
    it('should have correct name and description', () => {
        expect(keyCommand.name()).toBe('key');
        expect(keyCommand.description()).toBe('Manage private keys');
    });

    it('should have add subcommand', () => {
        const addCommand = keyCommand.commands.find(cmd => cmd.name() === 'add');
        expect(addCommand).toBeDefined();
        expect(addCommand.description()).toBe('Add a new private key');
        expect(typeof addCommand._actionHandler).toBe('function');
    });

    it('should have list subcommand', () => {
        const listCommand = keyCommand.commands.find(cmd => cmd.name() === 'list');
        expect(listCommand).toBeDefined();
        expect(listCommand.description()).toBe('List all stored keys');
        expect(typeof listCommand._actionHandler).toBe('function');
    });

    it('should have use subcommand', () => {
        const useCommand = keyCommand.commands.find(cmd => cmd.name() === 'use');
        expect(useCommand).toBeDefined();
        expect(useCommand.description()).toBe('Set active key');
        expect(typeof useCommand._actionHandler).toBe('function');
    });

    it('should have remove subcommand', () => {
        const removeCommand = keyCommand.commands.find(cmd => cmd.name() === 'remove');
        expect(removeCommand).toBeDefined();
        expect(removeCommand.description()).toBe('Remove a stored key');
        expect(typeof removeCommand._actionHandler).toBe('function');
    });

    it('should have test subcommand', () => {
        const testCommand = keyCommand.commands.find(cmd => cmd.name() === 'test');
        expect(testCommand).toBeDefined();
        expect(testCommand.description()).toBe('Test key decryption');
        expect(typeof testCommand._actionHandler).toBe('function');
    });

    it('should have migrate subcommand', () => {
        const migrateCommand = keyCommand.commands.find(cmd => cmd.name() === 'migrate');
        expect(migrateCommand).toBeDefined();
        expect(migrateCommand.description()).toBe('Migrate old private key to new format');
        expect(typeof migrateCommand._actionHandler).toBe('function');
    });

    it('add command should have debug option', () => {
        const addCommand = keyCommand.commands.find(cmd => cmd.name() === 'add');
        const debugOption = addCommand.options.find(opt => opt.flags.includes('--debug'));
        expect(debugOption).toBeDefined();
    });

    it('test command should have debug option', () => {
        const testCommand = keyCommand.commands.find(cmd => cmd.name() === 'test');
        const debugOption = testCommand.options.find(opt => opt.flags.includes('--debug'));
        expect(debugOption).toBeDefined();
    });

    it('migrate command should have debug option', () => {
        const migrateCommand = keyCommand.commands.find(cmd => cmd.name() === 'migrate');
        const debugOption = migrateCommand.options.find(opt => opt.flags.includes('--debug'));
        expect(debugOption).toBeDefined();
    });
});
