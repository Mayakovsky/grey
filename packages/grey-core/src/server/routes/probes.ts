// @grey/core probe routes (Q8): GET /health, GET /identity, GET /openapi, GET /openapi.json.
// No auth (Q9). /openapi serves @grey/schemas/openapi/openapi.yaml read once at module load
// (resolved via the package's "./openapi" export). dbReady is intentionally NOT included (see
// PHASE-B-PROGRESS): grey-core holds no direct DB-client handle for a `SELECT 1` without
// importing a transitive dep directly (which §3 Q10 discourages), so /health is liveness-only
// in M3 — SELFHOST-DISCOVERY-REPORT-KOV.md flags the same gap for the self-hosted x402
// discovery/availability work rather than silently expanding /health's scope here.
//
// /openapi.json (SELFHOST-DISCOVERY-KOV-directive.md item 2): x402scan/AgentCash's discovery
// runtime (@agentcash/discovery — confirmed by reading its shipped SPECIFICATION.md and the
// dist it actually executes, not just x402scan's docs/DISCOVERY.md, which is stale on this
// point) treats `GET /openapi.json` at the probed origin as the ONLY real discovery source as
// of the version x402scan has pinned (1.7.5) — `/.well-known/x402` is parsed by neither crawler
// anymore, just detected for a one-time migration warning. So this path/format match matters
// more than the directive's own framing suggested. one-time YAML->JSON parse at module load
// (same OPENAPI_YAML load as /openapi below, not a second file read) — js-yaml was already
// present in the workspace lockfile (pulled in transitively), so this pins to that same
// resolved version rather than adding a new one.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import type { FastifyInstance } from 'fastify';
import type { HandlerDeps } from '../../deps';

const requireFrom = createRequire(import.meta.url);
const OPENAPI_YAML = readFileSync(requireFrom.resolve('@grey/schemas/openapi'), 'utf8');
const OPENAPI_JSON = loadYaml(OPENAPI_YAML) as object;

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

  app.get('/openapi.json', (_req, reply) => {
    reply.send(OPENAPI_JSON);
  });
}
