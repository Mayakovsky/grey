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
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Keep ESLint out of formatting's lane — Prettier owns formatting.
  eslintConfigPrettier,
);
