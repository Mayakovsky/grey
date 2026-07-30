// Bazaar discovery surface (E1-B): GET /v1/discovery/services lists every discoverable offering's
// EvaluationKit projection (Invariant #33 — the SAME source every 402 response embeds via
// @grey/x402-middleware/challenge.ts). Free, unauthenticated — a crawler/evaluating agent reads
// this before ever hitting a paid route. GET /v1/discovery/services/:slug returns one entry (the
// public capability page E1-C's evaluation artifacts extend with a sample).
import type { FastifyInstance } from 'fastify';
import type { OfferingSlug } from '@grey/schemas/responses';
import { buildEvaluationKit, buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import { TRUST_RUNG_SLUG } from '@grey/x402-middleware';
import { offeringHandlers } from '../../handlers';

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
    reply.send({ services });
  });

  app.get<{ Params: { slug: string } }>('/v1/discovery/services/:slug', async (req, reply) => {
    const slug = req.params.slug;
    if (!listableSlugs(opts).includes(slug as OfferingSlug)) {
      reply.code(404).send({ error: `not found or not discoverable: ${slug}` });
      return;
    }
    // E1-C: the detail/capability page carries the evaluation artifact (adds a sample); the list
    // route above stays lean (no sample) — this is the only difference between the two.
    reply.send(buildEvaluationArtifact(slug as OfferingSlug));
  });
}
