// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];
const RENDERER_FILES = ['apps/desktop/src/{renderer,mobile}/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/coverage/**',
      '**/release*/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/cdk.out/**',
      '**/.aws-sam/**',
      'apps/cloud/lambda/**',
      'apps/desktop/build/native/**',
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },

  // Every JavaScript and TypeScript file.
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      // Sanitizers deliberately match control characters (\x00-\x1f).
      'no-control-regex': 'off',
      // Playwright fixtures take `({}, testInfo)` when they need no other fixture.
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
      // User-facing errors deliberately replace the underlying error (some cross IPC sanitized).
      'preserve-caught-error': 'off',
      // Late-bound `let` lets callbacks reference a service before it is constructed.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      'no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // TypeScript, type-aware through each workspace's tsconfig.
  {
    files: TS_FILES,
    extends: [tseslint.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['apps/desktop/vitest.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'separate-type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          // node:test registers tests from their returned promise; the runner awaits them.
          allowForKnownSafeCalls: [
            {
              from: 'package',
              package: 'node:test',
              name: ['test', 'it', 'describe', 'suite'],
            },
          ],
        },
      ],
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },

  // React renderers (desktop and phone remote).
  {
    files: RENDERER_FILES,
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // JSX handlers may be async; React ignores the returned promise.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // Electron main process and Node services log intentionally (captured in the app log).
  {
    files: [
      'apps/desktop/src/main/**',
      'apps/cloud/src/**',
      'packages/*/src/**',
      '**/scripts/**',
      'scripts/**',
      'apps/desktop/build/*.cjs',
    ],
    rules: { 'no-console': 'off' },
  },

  // Node CommonJS files.
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },

  // Static site scripts run as classic browser scripts.
  {
    files: ['apps/site/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },

  prettier,
);
