import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Packages whose code must stay deterministic (docs/01-architecture.md, "Determinism rules").
const DETERMINISTIC = ['packages/engine/src/**/*.ts', 'packages/content/src/**/*.ts'];

// These may round differently across JS engines, which would desync games and break replays.
const FLOAT_MESSAGE =
  'Results can differ between browsers. Use integer/fixed-point math or a lookup table (see engine/src/fixed.ts).';
const FLOAT_FUNCTIONS = ['pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'sqrt', 'cbrt'];
const TRIG_FUNCTIONS = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh'];
const restrictedMath = [...FLOAT_FUNCTIONS, ...TRIG_FUNCTIONS, 'tanh', 'hypot'].map((property) => ({
  object: 'Math',
  property,
  message: FLOAT_MESSAGE,
}));

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-artifact/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: DETERMINISTIC,
    ignores: ['**/*.test.ts', '**/src/testing/**'],
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
        ...restrictedMath,
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The engine must not depend on the clock.',
        },
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message: FLOAT_MESSAGE,
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
