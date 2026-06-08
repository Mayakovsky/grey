import { defineConfig } from 'vitest/config';

// Shared root config. Per-package `vitest run` resolves this by walking up.
// passWithNoTests keeps Step-1 empty packages green until real tests land.
export default defineConfig({
  test: {
    passWithNoTests: true,
  },
});
