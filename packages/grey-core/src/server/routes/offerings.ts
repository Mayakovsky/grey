// Paid offering routes: POST /v1/offerings/<slug> × 7. Each validates its request body via the
// $grey marker (→ offeringRequestValidators), runs behind the x402 no-op preHandler, calls the
// cache-read handler, and wraps the payload in a GreyResponseEnvelope.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PaidOfferingSlug } from '@grey/schemas/responses';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';
import { x402Placeholder } from '../x402-placeholder';

const PAID: PaidOfferingSlug[] = [
  'legitimacy_scan',
  'verify_whitepaper',
  'verify_full_tech',
  'claim_extraction',
  'claim_history',
  'quick_protocol_facts',
  'daily_tech_brief',
];

export function registerOfferingRoutes(app: FastifyInstance, deps: HandlerDeps): void {
  for (const slug of PAID) {
    app.post(
      `/v1/offerings/${slug}`,
      {
        schema: { body: { $grey: { kind: 'request', offering: slug } } },
        preHandler: x402Placeholder,
      },
      async (req, reply) => {
        const start = deps.clock().getTime();
        const result = await offeringHandlers[slug]({ offeringId: slug, requirement: req.body }, deps);
        const env = buildEnvelope({
          offering: slug,
          payload: result.payload as never,
          requestId: randomUUID(),
          config: deps.config,
          subject: result.subject,
          metadata: {
            costUsd: 0,
            model: 'none',
            latencyMs: deps.clock().getTime() - start,
            timestamp: deps.clock().toISOString(),
            cacheHit: result.cacheHit,
          },
        });
        reply.send(env);
      },
    );
  }
}
