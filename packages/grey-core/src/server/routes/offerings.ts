// Paid offering routes: POST /v1/offerings/<slug> × 7. Each validates its request body via the
// $grey marker (→ offeringRequestValidators), runs behind the x402 gate, calls the cache-read
// handler, and wraps the payload in a GreyResponseEnvelope.
//
// CDP/Bazaar alignment Phase 1, Task 2: the x402 gate is wired as `preValidation`, NOT
// `preHandler`. Fastify's request lifecycle is onRequest -> preParsing -> preValidation ->
// [body/query/params SCHEMA VALIDATION] -> preHandler -> handler — so a `preHandler`-wired gate
// runs AFTER schema validation, meaning a request without a schema-valid body 400s before ever
// reaching the point where a 402-with-Bazaar-metadata would be returned. That defeats any
// discovery crawler that doesn't already know the input shape (the exact scenario CDP's own
// validator hits — see CDP-BAZAAR-COMPATIBILITY-AUDIT-REPORT-KOV.md). `preValidation` runs
// BEFORE schema validation, so: no X-PAYMENT header -> 402 immediately, body content irrelevant.
// A request that DOES carry payment but an invalid body now settles first, then 400s on schema —
// consistent with this codebase's already-established "settlement stands even if something after
// it fails" posture (see preHandler.ts's own header comment: "a post-settlement handler error
// still leaves the payment standing"); this is the same posture, one step earlier.
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { PaidOfferingSlug } from '@grey/schemas/responses';
import { priceUsdFor } from '@grey/x402-middleware';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';

// Exported so other surfaces over the SAME x402 rail (e.g. server/routes/mcp.ts, E1-D) reuse this
// exact list instead of re-declaring it — one place names "the 7 normal paid offerings".
export const PAID: PaidOfferingSlug[] = [
  'legitimacy_scan',
  'verify_whitepaper',
  'verify_full_tech',
  'claim_extraction',
  'claim_history',
  'quick_protocol_facts',
  'daily_tech_brief',
];

export function registerOfferingRoutes(
  app: FastifyInstance,
  deps: HandlerDeps,
  x402PreHandler: preHandlerHookHandler,
): void {
  for (const slug of PAID) {
    app.post(
      `/v1/offerings/${slug}`,
      {
        schema: { body: { $grey: { kind: 'request', offering: slug } } },
        preValidation: x402PreHandler,
      },
      async (req, reply) => {
        const start = deps.clock().getTime();
        // E1-F: the x402PreHandler gate already settled payment before this handler runs (402/502
        // on any failure never reaches here) — record revenue now, not speculatively. A ledger
        // write failure must never cost the buyer their already-paid-for response (fail open, log).
        try {
          await deps.revenueEvents.create({ channel: 'x402', offering: slug, revenueUsd: priceUsdFor(slug) });
        } catch (err) {
          deps.logger.warn('revenue ledger write failed (non-fatal)', {
            slug,
            error: (err as Error).message,
          });
        }
        const result = await offeringHandlers[slug]({ offeringId: slug, requirement: req.body }, deps);
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
