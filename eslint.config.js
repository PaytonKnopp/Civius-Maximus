import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Packages whose code must stay deterministic (docs/01-architecture.md, "Determinism rules").
const DETERMINISTIC = ['packages/engine/src/**/*.ts', 'packages/content/src/**/*.ts'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: DETERMINISTIC,
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in engine/src/rng.ts.' },
        { object: 'Date', property: 'now', message: 'The engine must not depend on the clock.' },
        {
          object: 'performance',
          property: 'now',
          message: 'The engine must not depend on the clock.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The engine must not depend on the clock.',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The engine must run anywhere: no browser globals.' },
        { name: 'document', message: 'The engine must run anywhere: no browser globals.' },
        { name: 'fetch', message: 'The engine does no I/O.' },
      ],
    },
  },
  prettier,
);
