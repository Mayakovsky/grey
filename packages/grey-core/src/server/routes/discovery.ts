// Bazaar discovery surface (E1-B): GET /v1/discovery/services lists every discoverable offering's
// EvaluationKit projection (Invariant #33 — the SAME source every 402 response embeds via
// @grey/x402-middleware/challenge.ts). Free, unauthenticated — a crawler/evaluating agent reads
// this before ever hitting a paid route. GET /v1/discovery/services/:slug returns one entry (the
// public capability page E1-C's evaluation artifacts extend with a sample).
import type { FastifyInstance } from 'fastify';
import type { OfferingSlug } from '@grey/schemas/responses';
import { buildEvaluationKit } from '@grey/schemas/evaluationKit';
import { offeringHandlers } from '../../handlers';

/** Registry-driven: only offerings actually present in `offeringHandlers` are listed, so a
 *  disable-flagged offering (E1-C's trust rung) that isn't registered there is structurally
 *  absent from discovery too — not a separate flag to keep in sync. */
function listableSlugs(): OfferingSlug[] {
  return Object.keys(offeringHandlers) as OfferingSlug[];
}

export function registerDiscoveryRoutes(app: FastifyInstance): void {
  app.get('/v1/discovery/services', async (_req, reply) => {
    const services = listableSlugs()
      .map((slug) => buildEvaluationKit(slug))
      .filter((kit) => kit.discoverable);
    reply.send({ services });
  });

  app.get<{ Params: { slug: string } }>('/v1/discovery/services/:slug', async (req, reply) => {
    const slug = req.params.slug;
    if (!listableSlugs().includes(slug as OfferingSlug)) {
      reply.code(404).send({ error: `not found or not discoverable: ${slug}` });
      return;
    }
    reply.send(buildEvaluationKit(slug as OfferingSlug));
  });
}
