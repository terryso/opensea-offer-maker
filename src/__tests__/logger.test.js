import { LogLevel, logger } from '../utils/logger.js';

describe('Logger', () => {
    let originalLevel;

    beforeEach(() => {
        // Save original level
        originalLevel = logger.level;
    });

    afterEach(() => {
        // Restore original level
        logger.setLevel(originalLevel);
    });

    describe('LogLevel', () => {
        it('should define correct log levels', () => {
            expect(LogLevel.ERROR).toBe(0);
            expect(LogLevel.WARN).toBe(1);
            expect(LogLevel.INFO).toBe(2);
            expect(LogLevel.DEBUG).toBe(3);
        });
    });

    describe('initialization', () => {
        it('should have a level property', () => {
            expect(logger).toHaveProperty('level');
            expect(typeof logger.level).toBe('number');
        });

        it('should initialize with ERROR level in test environment by default', () => {
            // In test environment, logger should default to ERROR level
            expect(logger.level).toBe(LogLevel.ERROR);
        });
    });

    describe('setLevel', () => {
        it('should set log level', () => {
            logger.setLevel(LogLevel.DEBUG);
            expect(logger.level).toBe(LogLevel.DEBUG);

            logger.setLevel(LogLevel.ERROR);
            expect(logger.level).toBe(LogLevel.ERROR);
        });
    });

    describe('error', () => {
        it('should be callable and not throw', () => {
            logger.setLevel(LogLevel.ERROR);
            expect(() => logger.error('Test error')).not.toThrow();
        });

        it('should handle multiple arguments', () => {
            logger.setLevel(LogLevel.ERROR);
            expect(() => logger.error('Error:', { code: 500 }, 'details')).not.toThrow();
        });
    });

    describe('warn', () => {
        it('should be callable and not throw', () => {
            logger.setLevel(LogLevel.WARN);
            expect(() => logger.warn('Test warning')).not.toThrow();
        });

        it('should handle multiple arguments', () => {
            logger.setLevel(LogLevel.WARN);
            expect(() => logger.warn('Warning:', 'Something might be wrong')).not.toThrow();
        });
    });

    describe('info', () => {
        it('should be callable and not throw', () => {
            logger.setLevel(LogLevel.INFO);
            expect(() => logger.info('Test info')).not.toThrow();
        });

        it('should handle multiple arguments', () => {
            logger.setLevel(LogLevel.INFO);
            expect(() => logger.info('Info:', 'Operation completed', { status: 'success' })).not.toThrow();
        });
    });

    describe('debug', () => {
        it('should be callable and not throw', () => {
            logger.setLevel(LogLevel.DEBUG);
            expect(() => logger.debug('Test debug')).not.toThrow();
        });

        it('should handle multiple arguments', () => {
            logger.setLevel(LogLevel.DEBUG);
            expect(() => logger.debug('Debug:', 'Variable value:', 42)).not.toThrow();
        });
    });

    describe('debugObject', () => {
        it('should be callable and not throw', () => {
            logger.setLevel(LogLevel.DEBUG);
            const testObject = { key: 'value', nested: { prop: 123 } };
            expect(() => logger.debugObject('Test Object', testObject)).not.toThrow();
        });

        it('should handle complex objects', () => {
            logger.setLevel(LogLevel.DEBUG);
            const complexObject = {
                level1: {
                    level2: {
                        level3: 'deep value'
                    }
                }
            };

            expect(() => logger.debugObject('Complex', complexObject)).not.toThrow();
        });
    });

    describe('logger singleton', () => {
        it('should export a logger instance', () => {
            expect(logger).toBeDefined();
            expect(logger).toHaveProperty('error');
            expect(logger).toHaveProperty('warn');
            expect(logger).toHaveProperty('info');
            expect(logger).toHaveProperty('debug');
        });

        it('should have all required methods', () => {
            expect(typeof logger.error).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.debug).toBe('function');
            expect(typeof logger.setLevel).toBe('function');
            expect(typeof logger.debugObject).toBe('function');
        });
    });
});
