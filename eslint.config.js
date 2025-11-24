import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser
    }
  },
  {
    ignores: ['build/', 'dist/', 'node_modules/', '**/config.js']
  },
  {
    rules: {
      // General JavaScript/TypeScript rules
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
			'@typescript-eslint/no-explicit-any': 'off',
      // 'no-console': ['warn', { allow: ['error'] }],
      'prefer-const': 'error',
      'no-var': 'error',

      // Style preferences
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'never'],
      'indent': ['error', 2],
      'object-curly-spacing': ['error', 'always'],
      'array-bracket-spacing': ['error', 'never']
    }
  },
  prettier
];
