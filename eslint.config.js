import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '_prototype/**',
      'server/migrations/**',
      'client/src/components/ui/**',
      // generated reports
      '**/coverage/**',
      'playwright-report/**',
      'test-results/**',
      // plain browser script loaded before the app (no bundler, no TypeScript)
      'client/public/theme-init.js'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error'
    }
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  },
  {
    files: ['server/**/*.ts', 'shared/**/*.ts'],
    languageOptions: { globals: globals.serviceworker }
  },
  {
    // Tests read loosely typed JSON responses.
    files: ['**/*.test.{ts,tsx}', '**/src/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  },
  {
    // Node-side tooling: config files, scripts the local seed and the e2e fixture
    files: [
      '*.{js,ts}',
      '**/*.config.{js,ts}',
      '**/scripts/**/*.{js,mjs}',
      'server/seed/**/*.ts',
      'server/e2e-fixture/**/*.ts'
    ],
    languageOptions: { globals: globals.node }
  },
  prettier
);
