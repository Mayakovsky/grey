import { buildPackage } from '../../scripts/esbuild-lib.mjs';

// Two entries: the library surface (index) + the runtime process entry (start, systemd ExecStart
// target for Phase D). @grey/* and fastify external. splitting keeps shared modules single-instance.
// probes.ts resolves '@grey/schemas/openapi' at runtime via createRequire — the schemas ./openapi
// export stays a source-dir asset, so that resolve survives this dist relocation unchanged.
await buildPackage({
  pkgDir: import.meta.dirname,
  entryPoints: ['src/index.ts', 'src/start.ts'],
});
