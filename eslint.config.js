import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Jest globals
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly'
      }
    },
    rules: {
      // Enforce consistent use of logger instead of console.log (except in tests)
      'no-console': ['error', { allow: ['warn', 'error'] }],

      // Prevent unused variables
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // Enforce consistent indentation
      'indent': ['error', 2],

      // Enforce semicolons
      'semi': ['error', 'always'],

      // Enforce quotes style
      'quotes': ['error', 'single', { avoidEscape: true }],

      // Prevent trailing spaces
      'no-trailing-spaces': 'error',

      // Enforce consistent spacing before blocks
      'space-before-blocks': 'error',

      // Prevent multiple empty lines
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],

      // Enforce newline at end of file
      'eol-last': 'error',

      // Enforce consistent spacing around operators
      'space-infix-ops': 'error',

      // Require braces around blocks
      'curly': 'error',

      // Prevent use of undefined variable initialization
      'no-undef-init': 'error',

      // Prevent use of undefined when comparing to null
      'no-eq-null': 'error',

      // Enforce consistent brace style for blocks
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],

      // Prevent unreachable code after return, throw, continue, and break statements
      'no-unreachable': 'error',

      // Prevent use of undeclared variables
      'no-undef': 'error'
    }
  },
  // Override rules for test files
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js'],
    rules: {
      'no-console': 'off', // Allow console in tests
      'indent': 'off',      // Allow flexible indentation in tests
      'space-in-parens': 'off' // Allow flexible spacing in tests
    }
  },
  // Override rules for logger implementation
  {
    files: ['**/utils/logger.js'],
    rules: {
      'no-console': 'off' // Allow console in logger implementation
    }
  }
];
