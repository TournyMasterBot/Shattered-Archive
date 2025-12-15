// eslint.config.mjs
// TODO : Make rules more strict.
// Initial pass to help get linting in
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

const clientGlobs = ['**/*-client/**', 'apps/**/src/**/*.{ts,tsx,js,jsx}', 'sdks/**/src/**/*.{ts,tsx,js,jsx}'];

const serverGlobs = [
  '**/*-server/**',
  'services/**/src/**/*.{ts,js}',
  'apps/game-server/**',
  'apps/web-server/**',
  'scripts/**/*.{js,cjs,mjs,ts}',
  '*.config.{js,cjs,mjs}',
  'jest.config.{js,cjs,mjs}',
];

export default [
  // Ignore build output + generated stuff
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.d.ts', // (optional) comment this out if you want to lint .d.ts
      // If these are generated outputs in src, ignore them:
      '**/*.js',
      '**/*.cjs',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared TS rules baseline
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      // Make the repo livable first; tighten later
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // ANSI regex patterns; don’t fight them
      'no-control-regex': 'off',
    },
  },

  // CLIENT (browser) globals + React rules
  {
    files: ['**/*.{tsx,jsx}', ...clientGlobs],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/set-state-in-effect': 'warn',

      '@typescript-eslint/no-unused-vars': 'warn',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // SERVER (node) globals
  {
    files: serverGlobs,
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Many node scripts still use require; don’t block repo
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
];
