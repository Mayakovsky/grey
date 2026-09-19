// Bankr Bridge — thin, non-x402 internal proxy for Bankr's x402 Cloud (integrations/bankr-bridge/).
// See BANKR-BRIDGE-BUILD-KOV-directive.md. Mounted ADDITIVELY, same posture as the CDP gate in
// server/index.ts (`cdpGate` only mounts when configured) — this route only mounts when
// GREY_BANKR_BRIDGE_SECRET is set (see start.ts). No x402 gate, no wallet, no relayer, no signing
// key anywhere in this file's path: auth is a single static bearer secret, compared constant-time.
// The actual USDC settles directly to Grey's existing wallet via Bankr's own facilitator — it never
// touches grey-core on this path (see the directive's Architecture section).
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { HandlerDeps } from '../../deps';
import { offeringHandlers } from '../../handlers';
import { buildEnvelope } from '../../envelope/build';

/** Slug allowlist for this pass — legitimacy_scan only. Deliberately not the full PAID array
 *  (offerings.ts) — scope stays tight per the directive; more slugs are a follow-up directive. */
export const BANKR_BRIDGE_SLUGS = ['legitimacy_scan'] as const;
export type BankrBridgeSlug = (typeof BANKR_BRIDGE_SLUGS)[number];

const BANKR_BRIDGE_HEADER = 'x-grey-bridge-secret';

/** Constant-time secret compare. No timingSafeEqual precedent existed elsewhere in this codebase
 *  to reuse (checked adapters/x402-middleware first, per the directive) — this is the first one.
 *  Buffers of unequal length short-circuit before reaching timingSafeEqual (which throws on a
 *  length mismatch rather than comparing) — this leaks the secret's length via timing, not its
 *  content, the standard accepted tradeoff for this kind of check. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function unauthorized(reply: FastifyReply): void {
  // Same shape as a normal auth failure — no payment semantics at all on this path.
  reply.code(403).send({ error: { code: 'FORBIDDEN', message: 'invalid or missing bridge secret', retryable: false } });
}

/** Registers POST /v1/bridge/bankr/<slug> for each BANKR_BRIDGE_SLUGS entry. Call only when
 *  GREY_BANKR_BRIDGE_SECRET is set — the caller (server/index.ts) is the enable signal, mirroring
 *  cdpGate's "presence IS the enable signal" posture (offerings.ts's X402Gate doc comment). */
export function registerBankrBridgeRoutes(
  app: FastifyInstance,
  deps: HandlerDeps,
  secret: string,
): void {
  for (const slug of BANKR_BRIDGE_SLUGS) {
    app.post(
      `/v1/bridge/bankr/${slug}`,
      {
        // Same $grey request marker / offeringRequestValidators the PAID route uses
        // (offerings.ts:64) — a malformed body still 400s, same as today.
        schema: { body: { $grey: { kind: 'request', offering: slug } } },
      },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const header = req.headers[BANKR_BRIDGE_HEADER];
        const provided = Array.isArray(header) ? header[0] : header;
        if (!provided || !secretsMatch(provided, secret)) {
          unauthorized(reply);
          return;
        }

        const start = deps.clock().getTime();
        // Observability only, not blocking — a usage event distinct from the real revenue ledger
        // (revenueUsd: 0) so Kov/Desktop can see bridge call volume without polluting real x402
        // settlement numbers. Same fail-open discipline as offerings.ts:73-84.
        try {
          await deps.revenueEvents.create({
            channel: 'bankr-bridge',
            offering: slug,
            revenueUsd: 0,
          });
        } catch (err) {
          deps.logger.warn('bankr-bridge usage ledger write failed (non-fatal)', {
            slug,
            error: (err as Error).message,
          });
        }

        // Byte-for-byte the existing offering logic minus the payment gate — same handler +
        // envelope builder the PAID route uses (offerings.ts:85-102), not forked or reimplemented.
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
