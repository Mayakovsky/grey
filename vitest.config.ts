import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Shared root config. Per-package `vitest run` resolves this by walking up.
// passWithNoTests keeps empty packages green until real tests land.
//
// M5 Phase B: package `exports` now resolve to built `dist/` for production Node. These aliases
// (mirroring tsconfig.base.json `paths`) keep the test suite resolving @grey/* to SOURCE, so it
// stays green against src with no prior build. Exact-match regex — order-independent.
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// FDQ-33 tripwire (M5 Phase B): an intermittent parallel-contention flake was reported in PR #12
// (Argon2id-heavy @grey/ceremony suspected of starving vitest worker pools under full-parallel
// `turbo run test` on Windows). It did NOT reproduce in 12 default + 5 forced-contention runs
// (3-core processor affinity, --concurrency=100%) — closed as environment-transient. If it ever
// recurs, run with GREY_TEST_VERBOSE=1 for the verbose reporter + heap logging so the offending
// spec/worker/memory is captured instead of a bare task failure.
const verbose = process.env.GREY_TEST_VERBOSE === '1';

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@grey\/schemas$/, replacement: src('./packages/grey-schemas/src/index.ts') },
      { find: /^@grey\/schemas\/responses$/, replacement: src('./packages/grey-schemas/src/responses/index.ts') },
      { find: /^@grey\/schemas\/requests$/, replacement: src('./packages/grey-schemas/src/requests/index.ts') },
      { find: /^@grey\/schemas\/envelope$/, replacement: src('./packages/grey-schemas/src/envelope/index.ts') },
      { find: /^@grey\/schemas\/validators$/, replacement: src('./packages/grey-schemas/src/validators/index.ts') },
      { find: /^@grey\/pipeline$/, replacement: src('./packages/grey-pipeline/src/index.ts') },
    ],
  },
  test: {
    passWithNoTests: true,
    reporters: verbose ? ['verbose'] : ['default'],
    logHeapUsage: verbose,
  },
});
