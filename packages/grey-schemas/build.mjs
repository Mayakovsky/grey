import { buildPackage } from '../../scripts/esbuild-lib.mjs';

// Five entry points, one per JS subpath export. esbuild inlines the ~28 *.schema.json
// (imported relatively) into the bundle, resolving the JSON-as-ESM blocker. The ./openapi
// export stays a source-dir asset (not relocated) so probes' createRequire.resolve works
// both in the src test suite and from a git-pulled dist deploy. splitting: shared enums/types
// live in one chunk (single runtime instance across subpaths).
await buildPackage({
  pkgDir: import.meta.dirname,
  entryPoints: [
    'src/index.ts',
    'src/responses/index.ts',
    'src/requests/index.ts',
    'src/envelope/index.ts',
    'src/validators/index.ts',
  ],
  // ajv 8.x has no `exports` map; its extensionless deep import must carry `.js` for Node ESM.
  alias: { 'ajv/dist/2020': 'ajv/dist/2020.js' },
});
