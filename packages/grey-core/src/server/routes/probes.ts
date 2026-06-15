// @grey/core probe routes (Q8): GET /health, GET /identity, GET /openapi. No auth (Q9).
// /openapi serves @grey/schemas/openapi/openapi.yaml read once at module load (resolved via the
// package's "./openapi" export). dbReady is intentionally NOT included (see PHASE-B-PROGRESS):
// grey-core holds no direct DB-client handle for a `SELECT 1` without importing a transitive
// dep directly (which §3 Q10 discourages), so /health is liveness-only in M3.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { HandlerDeps } from '../../deps';

const requireFrom = createRequire(import.meta.url);
const OPENAPI_YAML = readFileSync(requireFrom.resolve('@grey/schemas/openapi'), 'utf8');

export function registerProbes(app: FastifyInstance, deps: HandlerDeps): void {
  const bootMs = deps.clock().getTime();

  app.get('/health', async () => ({
    status: 'ok' as const,
    version: deps.config.version,
    uptimeSec: Math.floor((deps.clock().getTime() - bootMs) / 1000),
  }));

  app.get('/identity', async () => ({
    did: deps.config.did,
    name: deps.config.name,
    runtime: deps.config.runtime,
    version: deps.config.version,
  }));

  app.get('/openapi', (_req, reply) => {
    reply.type('application/yaml').send(OPENAPI_YAML);
  });
}
