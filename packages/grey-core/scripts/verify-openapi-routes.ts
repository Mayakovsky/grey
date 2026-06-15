// Invariant 13 (openapi-route-source-of-truth) verification.
// Asserts set-equality between the OpenAPI spec's /v1/offerings/<slug> + /v1/resources/<slug>
// path slugs and grey-core's registered offering handlers. Exit 0 on match, 1 on mismatch.
// Run: pnpm -C packages/grey-core exec tsx scripts/verify-openapi-routes.ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { offeringHandlers } from '../src/handlers/index';

const requireFrom = createRequire(import.meta.url);
const yaml = readFileSync(requireFrom.resolve('@grey/schemas/openapi'), 'utf8');

// OpenAPI path keys of the form `  /v1/offerings/<slug>:` / `  /v1/resources/<slug>:`.
const openapiSlugs = new Set(
  [...yaml.matchAll(/^\s*\/v1\/(?:offerings|resources)\/([a-z_]+)\s*:/gm)].map((m) => m[1]),
);
const handlerSlugs = new Set(Object.keys(offeringHandlers));

const missingHandler = [...openapiSlugs].filter((s) => !handlerSlugs.has(s)).sort();
const missingRoute = [...handlerSlugs].filter((s) => !openapiSlugs.has(s)).sort();

if (missingHandler.length > 0 || missingRoute.length > 0) {
  console.error('openapi-route-source-of-truth: MISMATCH');
  if (missingHandler.length > 0) {
    console.error('  OpenAPI paths with no grey-core handler:', missingHandler.join(', '));
  }
  if (missingRoute.length > 0) {
    console.error('  grey-core handlers not advertised in OpenAPI:', missingRoute.join(', '));
  }
  process.exit(1);
}

console.log(
  `openapi-route-source-of-truth: OK — ${openapiSlugs.size} OpenAPI offering/resource paths == ${handlerSlugs.size} grey-core handlers`,
);
