// ESLint 9 flat config for the `grey` monorepo.
// Step 1: non-type-checked recommended rules (packages are empty scaffolds).
// Type-aware rules (e.g. no-floating-promises) are layered in when the money
// code lands in grey-core (Step 4) and grey-sweeper (Step 6) — they require
// parserOptions.project wired to each package's tsconfig.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Conventional underscore-ignore for deliberately-unused args/vars/caught errors
    // (e.g. ported placeholder params). Standard typescript-eslint convention; not a
    // blanket disable.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  // Keep ESLint out of formatting's lane — Prettier owns formatting.
  eslintConfigPrettier,
);
