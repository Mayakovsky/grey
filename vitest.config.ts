import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Shared root config. Per-package `vitest run` resolves this by walking up.
// passWithNoTests keeps empty packages green until real tests land.
//
// M5 Phase B: package `exports` now resolve to built `dist/` for production Node. These aliases
// (mirroring tsconfig.base.json `paths`) keep the test suite resolving @grey/* to SOURCE, so it
// stays green against src with no prior build. Exact-match regex — order-independent.
const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// FDQ-33 (M5 Phase B → reopened Phase C): an intermittent parallel-contention flake. Closed
// "environment-transient" at Phase B (survived 12 default + 5 forced 3-core runs), then REOPENED
// when it reproduced on CI during Phase C — the ceremony EIP-712 `recoverTypedDataAddress` test
// timed out at 5s. Root cause: under full-parallel `turbo run test` on a low-core CI runner, 6
// concurrent vitest processes each fork a worker pool; that oversubscribes CPU and starves the
// CPU-bound crypto (viem secp256k1 recover + Argon2id) past the 5s default — Phase C's viem-heavy
// x402 tests pushed the aggregate load over the edge. Fix (isolate the resource per-worker, not
// global serial): cap each process's fork pool IN CI (`maxForks` below) so the aggregate stays
// sane, and raise the timeouts so residual contention never trips a fast op. Dev keeps full
// parallelism. GREY_TEST_VERBOSE=1 remains the diagnostic tripwire.
const verbose = process.env.GREY_TEST_VERBOSE === '1';
const inCI = !!process.env.CI;

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@grey\/schemas$/, replacement: src('./packages/grey-schemas/src/index.ts') },
      { find: /^@grey\/schemas\/responses$/, replacement: src('./packages/grey-schemas/src/responses/index.ts') },
      { find: /^@grey\/schemas\/requests$/, replacement: src('./packages/grey-schemas/src/requests/index.ts') },
      { find: /^@grey\/schemas\/envelope$/, replacement: src('./packages/grey-schemas/src/envelope/index.ts') },
      { find: /^@grey\/schemas\/validators$/, replacement: src('./packages/grey-schemas/src/validators/index.ts') },
      { find: /^@grey\/schemas\/pricing$/, replacement: src('./packages/grey-schemas/src/pricing/index.ts') },
      { find: /^@grey\/schemas\/evaluationKit$/, replacement: src('./packages/grey-schemas/src/evaluationKit/index.ts') },
      { find: /^@grey\/pipeline$/, replacement: src('./packages/grey-pipeline/src/index.ts') },
      { find: /^@grey\/x402-middleware$/, replacement: src('./adapters/x402-middleware/src/index.ts') },
    ],
  },
  test: {
    passWithNoTests: true,
    reporters: verbose ? ['verbose'] : ['default'],
    logHeapUsage: verbose,
    // FDQ-33: absorb CPU-starvation slowdowns for the CPU-bound crypto tests (viem recover /
    // Argon2id) so a fast op never times out under parallel CI contention.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // FDQ-33: bound each vitest process's fork pool IN CI so 6 concurrent `turbo run test` tasks
    // don't oversubscribe the runner's cores. Dev machines (unset CI) keep full parallelism.
    ...(inCI ? { poolOptions: { forks: { maxForks: 2, minForks: 1 } } } : {}),
  },
});
