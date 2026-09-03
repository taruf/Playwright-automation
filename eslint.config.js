// @ts-check
const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const playwright = require('eslint-plugin-playwright');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['tests/**/*.ts'],
    plugins: { playwright },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
    },
  },
  {
    // Every real automation test (as opposed to the fundamentals/
    // teaching files, which exist specifically to demonstrate raw Playwright
    // locator APIs) should drive the app through a page object, not a
    // hand-rolled selector - one place to fix when the DOM changes, instead
    // of hunting every spec that copy-pasted the same CSS chain. See
    // docs/ai-validation-process.md and the "enterprise resilience"
    // discussion that led to this rule.
    files: [
      'tests/fundamentals/flows/**/*.spec.ts',
      'tests/fundamentals/hybrid/**/*.spec.ts',
      'tests/quality-and-migration/**/*.spec.ts',
      'tests/advanced/**/*.spec.ts',
    ],
    plugins: { playwright },
    rules: {
      'playwright/no-restricted-locators': [
        'error',
        [
          {
            message:
              'Raw page.locator(...) calls belong in a page object (src/pages/**). Add or reuse a method there instead of selecting elements directly in a test.',
            type: 'locator',
          },
        ],
      ],
    },
  },
  {
    files: ['*.config.js'],
    languageOptions: {
      globals: { require: 'readonly', module: 'writable', __dirname: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  prettier,
  {
    ignores: ['playwright-report/**', 'test-results/**', 'node_modules/**'],
  },
);
