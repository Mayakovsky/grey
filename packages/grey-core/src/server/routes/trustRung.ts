// POST /v1/offerings/legitimacy_scan_trust_rung (E1-C) — mounted ONLY when
// @grey/x402-middleware's trustRungEnabled() is true. Deliberately a SEPARATE route registrar
// from registerOfferingRoutes (offerings.ts): the normal 7 paid routes must stay byte-identical
// and unconditional, so this file is the entire blast radius of the disable flag on the x402
// channel. When the caller doesn't invoke `registerTrustRungRoute`, the route simply does not
// exist — a request to this path 404s before Fastify has any handler to dispatch to (Invariant
// #34: unreachable, not merely gated inside a reachable handler).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { TRUST_RUNG_SLUG, trustRungPriceUsd } from '@grey/x402-middleware';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';
import type { X402Gate } from './offerings';

export function registerTrustRungRoute(
  app: FastifyInstance,
  deps: HandlerDeps,
  // NOT the general offerings.ts gate — preHandler.ts's slugFromUrl deliberately doesn't
  // recognize this slug, so this MUST be built from @grey/x402-middleware's trust-rung-scoped
  // makeTrustRungPaymentPresenceCheck(...)/makeTrustRungPreHandler(...) factories.
  trustRungGate: X402Gate,
): void {
  app.post(
    `/v1/offerings/${TRUST_RUNG_SLUG}`,
    {
      schema: { body: { $grey: { kind: 'request', offering: TRUST_RUNG_SLUG } } },
      // CDP/Bazaar alignment Phase 1 revision — see offerings.ts's header comment: the gate is
      // two hooks, `preValidation` (body-independent) + `preHandler` (verify+settle).
      preValidation: trustRungGate.preValidation,
      preHandler: trustRungGate.preHandler,
    },
    async (req, reply) => {
      const start = deps.clock().getTime();
      // E1-F: same fail-open ledger posture as offerings.ts — settlement already happened in the
      // preHandler; a ledger write failure must never cost the buyer their paid-for response.
      try {
        await deps.revenueEvents.create({
          channel: 'x402',
          offering: TRUST_RUNG_SLUG,
          revenueUsd: trustRungPriceUsd(),
        });
      } catch (err) {
        deps.logger.warn('revenue ledger write failed (non-fatal)', {
          slug: TRUST_RUNG_SLUG,
          error: (err as Error).message,
        });
      }
      const result = await offeringHandlers[TRUST_RUNG_SLUG](
        { offeringId: TRUST_RUNG_SLUG, requirement: req.body },
        deps,
      );
      const env = buildEnvelope({
        offering: TRUST_RUNG_SLUG,
        payload: result.payload as never,
        requestId: randomUUID(),
        config: deps.config,
        subject: result.subject,
        metadata: {
          costUsd: trustRungPriceUsd(),
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
