// CDP Facilitator Phase 2: POST /v1/cdp/offerings/<slug> × 7 — a PARALLEL route family to
// offerings.ts's `/v1/offerings/<slug>`, settling through CDP's hosted facilitator instead of the
// local relayer (@grey/x402-middleware's makeCdpX402PreHandler). Additive only: offerings.ts's
// routes, gate, and revenue channel are untouched. Only mounted when CDP is configured (mirrors
// trustRung.ts's conditional-mount pattern for an optional feature) — see server/index.ts.
//
// Same handler/envelope logic as offerings.ts (same 7 slugs, same price, same response shape) —
// the only differences are the URL prefix, the gate (CDP-routed vs local relayer), and the
// revenue ledger's `channel` label ('x402-cdp' vs 'x402'), so the two rails stay distinguishable
// in the margin report without needing a schema change (channel is a free-text column).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { priceUsdFor } from '@grey/x402-middleware';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';
import { PAID, type X402Gate } from './offerings';

export function registerCdpOfferingRoutes(
  app: FastifyInstance,
  deps: HandlerDeps,
  cdpGate: X402Gate,
): void {
  for (const slug of PAID) {
    app.post(
      `/v1/cdp/offerings/${slug}`,
      {
        schema: { body: { $grey: { kind: 'request', offering: slug } } },
        preValidation: cdpGate.preValidation,
        preHandler: cdpGate.preHandler,
      },
      async (req, reply) => {
        const start = deps.clock().getTime();
        try {
          await deps.revenueEvents.create({
            channel: 'x402-cdp',
            offering: slug,
            revenueUsd: priceUsdFor(slug),
          });
        } catch (err) {
          deps.logger.warn('revenue ledger write failed (non-fatal)', {
            slug,
            error: (err as Error).message,
          });
        }
        const result = await offeringHandlers[slug](
          { offeringId: slug, requirement: req.body },
          deps,
        );
        const env = buildEnvelope({
          offering: slug,
          payload: result.payload as never,
          requestId: randomUUID(),
          config: deps.config,
          subject: result.subject,
          metadata: {
            costUsd: priceUsdFor(slug),
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
