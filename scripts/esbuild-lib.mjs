// Shared build driver for the esbuild-class packages (grey-schemas, grey-pipeline, grey-core).
// M5 Phase B (FDQ-27): replaces echo-stubs with real dist builds. The tsc-class packages
// (grey-sweeper, grey-x402-middleware, grey-ceremony [FDQ-36]) do NOT use this — they emit via tsc.
//
// Contract: bundle relative imports + inline JSON; leave ALL bare specifiers external
// (node_modules AND @grey/* — the latter are workspace-linked and resolve to their own dist
// at runtime, so build order matters: turbo `^build` gives schemas -> pipeline -> core).
// Declarations are emitted separately by tsc (--emitDeclarationOnly) so types stay authoritative.

import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const TSC = require.resolve('typescript/bin/tsc');

/**
 * @param {object} opts
 * @param {string} opts.pkgDir           Absolute package root (pass import.meta.dirname).
 * @param {string[]} opts.entryPoints    Package-relative entry files (e.g. 'src/index.ts').
 * @param {{from:string,to:string}[]} [opts.assets]  Package-relative asset copies into dist/.
 * @param {boolean} [opts.dts=true]      Emit .d.ts via tsc --emitDeclarationOnly.
 * @param {string}  [opts.dtsProject='tsconfig.json']
 * @param {boolean} [opts.splitting]     Enable ESM code-splitting (default: entryPoints.length > 1).
 * @param {Record<string,string>} [opts.alias]  Specifier rewrites applied before the external
 *   pass — used to append the explicit `.js` to extensionless deep imports into exports-less
 *   deps (e.g. ajv 8.x has no `exports` map, so `ajv/dist/2020` must become `ajv/dist/2020.js`
 *   for Node ESM to resolve it once it's left external). Rewritten target stays external.
 */
export async function buildPackage({
  pkgDir,
  entryPoints,
  assets = [],
  dts = true,
  dtsProject = 'tsconfig.json',
  splitting,
  alias = {},
}) {
  rmSync(join(pkgDir, 'dist'), { recursive: true, force: true });

  await build({
    absWorkingDir: pkgDir,
    entryPoints,
    outdir: 'dist',
    outbase: 'src',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    packages: 'external',
    // esbuild reads tsconfig `paths` (which point @grey/* at SOURCE for typecheck/test). Without
    // this, esbuild would follow those paths and INLINE a sibling package's source into the bundle
    // (dragging in its transitive deps). Force every @grey/* workspace import to stay external so it
    // resolves to the sibling's own dist at runtime — `packages:'external'` alone misses them once
    // paths rewrite them from bare specifiers to file paths.
    external: ['@grey/*'],
    alias,
    sourcemap: true,
    splitting: splitting ?? entryPoints.length > 1,
    logLevel: 'warning',
  });

  for (const a of assets) {
    const to = join(pkgDir, 'dist', a.to);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(pkgDir, a.from), to);
  }

  if (dts) {
    execFileSync(
      process.execPath,
      [TSC, '--emitDeclarationOnly', '--outDir', 'dist', '-p', dtsProject],
      { cwd: pkgDir, stdio: 'inherit' },
    );
  }
}
