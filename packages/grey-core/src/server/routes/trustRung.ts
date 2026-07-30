// POST /v1/offerings/legitimacy_scan_trust_rung (E1-C) — mounted ONLY when
// @grey/x402-middleware's trustRungEnabled() is true. Deliberately a SEPARATE route registrar
// from registerOfferingRoutes (offerings.ts): the normal 7 paid routes must stay byte-identical
// and unconditional, so this file is the entire blast radius of the disable flag on the x402
// channel. When the caller doesn't invoke `registerTrustRungRoute`, the route simply does not
// exist — a request to this path 404s before Fastify has any handler to dispatch to (Invariant
// #34: unreachable, not merely gated inside a reachable handler).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { TRUST_RUNG_SLUG, trustRungPriceUsd } from '@grey/x402-middleware';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';

export function registerTrustRungRoute(
  app: FastifyInstance,
  deps: HandlerDeps,
  // NOT the general x402PreHandler — preHandler.ts's slugFromUrl deliberately doesn't recognize
  // this slug, so this MUST be @grey/x402-middleware's makeTrustRungPreHandler(...) output.
  trustRungPreHandler: preHandlerHookHandler,
): void {
  app.post(
    `/v1/offerings/${TRUST_RUNG_SLUG}`,
    {
      schema: { body: { $grey: { kind: 'request', offering: TRUST_RUNG_SLUG } } },
      preHandler: trustRungPreHandler,
    },
    async (req, reply) => {
      const start = deps.clock().getTime();
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
