import { buildPackage } from '../../scripts/esbuild-lib.mjs';

// Single entry. esbuild resolves the extensionless relative imports (the tsc-ESM blocker).
// All deps external — @grey/schemas (workspace, built first via ^build) and playwright-core
// (dynamically imported at runtime for SPA discovery) included.
await buildPackage({
  pkgDir: import.meta.dirname,
  entryPoints: ['src/index.ts'],
});
