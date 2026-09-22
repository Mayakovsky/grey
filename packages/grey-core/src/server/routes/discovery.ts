// Bazaar discovery surface (E1-B): GET /v1/discovery/services lists every discoverable offering's
// EvaluationKit projection (Invariant #33 — the SAME source every 402 response embeds via
// @grey/x402-middleware/challenge.ts). Free, unauthenticated — a crawler/evaluating agent reads
// this before ever hitting a paid route. GET /v1/discovery/services/:slug returns one entry (the
// public capability page E1-C's evaluation artifacts extend with a sample).
//
// GET /.well-known/x402 (SELFHOST-DISCOVERY-KOV-directive.md item 1): the x402scan-documented
// compatibility fan-out shape (docs/DISCOVERY.md, section B — `{ version: 1, resources: [...] }`).
// Sourced from `offerings.ts`'s PAID array, the single reachability source of truth (its own
// header comment already names 3 places that must agree — this makes a 4th reader, not a 4th
// hand-authored copy). Real finding, not a guess: x402scan/AgentCash's actual discovery runtime
// (@agentcash/discovery@1.7.5, the exact version x402scan's own package.json pins) no longer
// parses this document at all as of that version — its own shipped SPECIFICATION.md says so
// verbatim ("Legacy `/.well-known/x402` ... are no longer parsed") and `GET /openapi.json`
// (probes.ts) is the only discovery source that version's crawler actually reads. This route is
// still worth having (cheap, matches the still-published x402scan docs/DISCOVERY.md compat
// shape, harmless to any other/older consumer that does read it) but should not be treated as
// the load-bearing piece for indexing — see the report for the full finding.
import type { FastifyInstance } from 'fastify';
import type { OfferingSlug } from '@grey/schemas/responses';
import { buildEvaluationKit, buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import { TRUST_RUNG_SLUG } from '@grey/x402-middleware';
import { offeringHandlers } from '../../handlers';
import { PAID } from './offerings';

// Fixed, not env-configurable — same posture as deps/index.ts's CHANNEL_IDENTITY_REGISTRY literal
// entries: this is the one real production origin api.whitepapergrey.com's Caddy block proxies to
// (CDP-BAZAAR-LOG-CONFIRM-AND-CRAWLER-CHECK-REPORT-KOV.md), not a per-deployment value: a
// discovery manifest describing a locally-run dev server's own resources would be meaningless.
const LIVE_ORIGIN = 'https://api.whitepapergrey.com';

export interface DiscoveryRouteOptions {
  /** E1-C, Invariant #34: the trust rung is registered in `offeringHandlers` unconditionally (the
   *  handler itself is harmless), but must not be LISTED unless Forces' disable flag is on —
   *  explicit here, not inferred from registry membership alone. */
  trustRungEnabled: boolean;
}

function listableSlugs(opts: DiscoveryRouteOptions): OfferingSlug[] {
  const all = Object.keys(offeringHandlers) as OfferingSlug[];
  if (opts.trustRungEnabled) return all;
  return all.filter((slug) => slug !== TRUST_RUNG_SLUG);
}

export function registerDiscoveryRoutes(app: FastifyInstance, opts: DiscoveryRouteOptions): void {
  app.get('/v1/discovery/services', async (_req, reply) => {
    const services = listableSlugs(opts)
      .map((slug) => buildEvaluationKit(slug))
      .filter((kit) => kit.discoverable);
    // E1-D: "List in Bazaar as MCP" — the same offering set is also reachable as paid MCP tools
    // over one JSON-RPC endpoint (POST /v1/mcp), not one route per offering like the HTTP surface.
    // SELFHOST-DISCOVERY item 3: surface the existing /health liveness check here too, so an
    // evaluating agent reading this response doesn't need a second guess about availability.
    reply.send({ services, mcpEndpoint: '/v1/mcp', health: `${LIVE_ORIGIN}/health` });
  });

  // SELFHOST-DISCOVERY-KOV-directive.md item 1 — see header comment for the sourcing/finding.
  app.get('/.well-known/x402', async (_req, reply) => {
    reply.send({
      version: 1,
      resources: PAID.map((slug) => `${LIVE_ORIGIN}/v1/offerings/${slug}`),
      health: `${LIVE_ORIGIN}/health`,
    });
  });

  app.get<{ Params: { slug: string } }>('/v1/discovery/services/:slug', async (req, reply) => {
    const slug = req.params.slug;
    if (!listableSlugs(opts).includes(slug as OfferingSlug)) {
      reply.code(404).send({ error: `not found or not discoverable: ${slug}` });
      return;
    }
    // E1-C: the detail/capability page carries the evaluation artifact (adds a sample); the list
    // route above stays lean (no sample) — this is the only difference between the two.
    const artifact = buildEvaluationArtifact(slug as OfferingSlug);
    // Merge-prep: listableSlugs() only excludes the trust rung when disabled — a not-yet-offered
    // offering (enabled:false in PRICING_TABLE) is still registry-present, so the DETAIL route
    // needs its own discoverable check too, or it'd 200 with a full artifact for something the
    // list route already hides. Same field, same source, second surface.
    if (!artifact.discoverable) {
      reply.code(404).send({ error: `not found or not discoverable: ${slug}` });
      return;
    }
    reply.send(artifact);
  });
}
