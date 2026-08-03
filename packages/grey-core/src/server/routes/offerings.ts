// Paid offering routes: POST /v1/offerings/<slug> × 7. Each validates its request body via the
// $grey marker (→ offeringRequestValidators), runs behind the x402 gate, calls the cache-read
// handler, and wraps the payload in a GreyResponseEnvelope.
//
// CDP/Bazaar alignment Phase 1 revision: the x402 gate is TWO hooks, not one. Fastify's request
// lifecycle is onRequest -> preParsing -> preValidation -> [body/query/params SCHEMA VALIDATION]
// -> preHandler -> handler. `preValidation` gets the lightweight, body-independent
// makeX402PaymentPresenceCheck (@grey/x402-middleware): no X-PAYMENT header -> 402 immediately,
// body content irrelevant — this is what lets a discovery crawler that doesn't already know the
// input shape still get a 402-with-Bazaar-metadata instead of a bare schema 400 (the exact
// scenario CDP's own validator hits — see CDP-BAZAAR-COMPATIBILITY-AUDIT-REPORT-KOV.md).
// `preHandler` gets the real makeX402PreHandler (decode/verify/settle), which runs AFTER schema
// validation — so a request that carries a payment header but an invalid body still 400s on
// schema BEFORE settlement, same buyer protection as before CDP/Bazaar alignment ever touched
// this file (see CDP-BAZAAR-PHASE1-REVISION-split-gate-KOV-directive.md for why the original
// single-hook `preValidation` move over-corrected: it moved settlement itself ahead of schema
// validation, charging buyers for requests that were always going to fail validation anyway).
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler, preValidationHookHandler } from 'fastify';
import type { PaidOfferingSlug } from '@grey/schemas/responses';
import { priceUsdFor } from '@grey/x402-middleware';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';

/** The x402 gate is two hooks, not one — see this file's header comment. `preValidation` is
 *  body-independent (header-presence only, runs before schema validation); `preHandler` carries
 *  the real verify+settle logic (runs after schema validation). Shared by offerings.ts and
 *  trustRung.ts — same shape, different underlying @grey/x402-middleware factories. */
export interface X402Gate {
  preValidation: preValidationHookHandler;
  preHandler: preHandlerHookHandler;
}

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
  x402Gate: X402Gate,
): void {
  for (const slug of PAID) {
    app.post(
      `/v1/offerings/${slug}`,
      {
        schema: { body: { $grey: { kind: 'request', offering: slug } } },
        preValidation: x402Gate.preValidation,
        preHandler: x402Gate.preHandler,
      },
      async (req, reply) => {
        const start = deps.clock().getTime();
        // E1-F: the x402PreHandler gate already settled payment before this handler runs (402/502
        // on any failure never reaches here) — record revenue now, not speculatively. A ledger
        // write failure must never cost the buyer their already-paid-for response (fail open, log).
        try {
          await deps.revenueEvents.create({
            channel: 'x402',
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
