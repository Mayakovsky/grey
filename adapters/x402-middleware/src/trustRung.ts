// The $0.10 legitimacy_scan_trust_rung offering (E1-C, spec §2.4) — BUILT BUT BLOCKED. Forces
// ruling B-1 (2026-07-26): no live exposure on any channel until Forces explicitly lifts this.
// Invariant #34: any offering under a standing block ships behind a default-off disable flag with
// tests asserting unreachability on every live channel. Single source (mirrors Bion directive-20's
// autoModeSetting() precedent): every caller reads `trustRungEnabled()`, nobody re-parses the env
// var. Deliberately kept OUT of prices.ts's PAID_SLUG_ORDER/PAID_SLUGS/PRICE_TABLE — those stay
// byte-identical to the 7 normal paid slugs; this file is fully isolated so the block can never be
// lifted by an accidental edit to the well-tested normal pricing path.
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { OfferingSlug } from '@grey/schemas/responses';
import { resolvePriceUsd } from '@grey/schemas/pricing';
import { buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import type { X402Config, PaymentRequirements } from './types.js';
import type { X402PreHandlerDeps } from './preHandler.js';
import { decodePaymentHeader, verifyPayment } from './verify.js';
import { settle } from './settle.js';
import { buildCdpBazaarExtension } from './challenge.js';

export const TRUST_RUNG_SLUG: OfferingSlug = 'legitimacy_scan_trust_rung';

/** Explicit opt-in only, never a default-on fallback. Unset/anything-but-'true' → disabled. */
export function trustRungEnabled(): boolean {
  return process.env.TRUST_RUNG_ENABLED === 'true';
}

function toAtomic(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

/** USDC atomic units for the trust rung on the x402 channel. Resolves regardless of the disable
 *  flag's state — the flag gates ROUTE REACHABILITY, not this pure price calculation. */
export function trustRungPriceAtomic(): bigint {
  return toAtomic(resolvePriceUsd(TRUST_RUNG_SLUG, 'x402'));
}

export function trustRungPriceUsd(): number {
  return resolvePriceUsd(TRUST_RUNG_SLUG, 'x402');
}

/** Same shape as challenge.ts's buildPaymentRequirements, scoped to the trust rung. Only ever
 *  called from a route that itself only exists when `trustRungEnabled()` is true (grey-core). */
export function buildTrustRungPaymentRequirements(
  cfg: X402Config,
  resource: string,
  error?: string,
): PaymentRequirements {
  const kit = buildEvaluationArtifact(TRUST_RUNG_SLUG);
  const body: PaymentRequirements = {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: cfg.network,
        maxAmountRequired: trustRungPriceAtomic().toString(),
        resource,
        description: `Grey ${TRUST_RUNG_SLUG} offering`,
        mimeType: 'application/json',
        payTo: cfg.payTo,
        maxTimeoutSeconds: cfg.maxTimeoutSeconds,
        asset: cfg.usdc.address,
        extra: {
          name: cfg.usdc.name,
          version: cfg.usdc.version,
          bazaar: {
            discoverable: kit.discoverable,
            serviceName: kit.serviceName,
            tags: kit.tags,
            description: kit.description,
            inputSchema: kit.inputSchema,
            outputSchema: kit.outputSchema,
            iconUrl: kit.iconUrl,
          },
        },
      },
    ],
    extensions: buildCdpBazaarExtension(kit),
  };
  if (error) body.error = error;
  return body;
}

function encodePaymentResponse(txHash: string, network: string): string {
  return Buffer.from(
    JSON.stringify({ success: true, transaction: txHash, network }),
    'utf8',
  ).toString('base64');
}

/**
 * A SEPARATE preHandler, not a variant dispatched by the normal `makeX402PreHandler`
 * (preHandler.ts's `slugFromUrl` deliberately does not recognize this slug, since it checks
 * against `isPaidSlug` / the normal 7-slug PRICE_TABLE). Only ever installed on the trust-rung
 * route, which itself is only mounted when `trustRungEnabled()` is true — so this function being
 * unreachable is a property of grey-core's route wiring, not of this function checking the flag
 * itself. Otherwise byte-identical verify→settle logic to the normal gate (same reused functions).
 */
export function makeTrustRungPreHandler(
  cfg: X402Config,
  deps: X402PreHandlerDeps,
): preHandlerHookHandler {
  return async function trustRungPreHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const resource = req.url;
    const header = req.headers['x-payment'];
    if (typeof header !== 'string' || header.length === 0) {
      reply.code(402).send(buildTrustRungPaymentRequirements(cfg, resource, 'payment required'));
      return;
    }

    const decoded = decodePaymentHeader(header);
    if (!decoded.ok) {
      reply.code(402).send(buildTrustRungPaymentRequirements(cfg, resource, decoded.reason));
      return;
    }

    const nowSec = BigInt(Math.floor((deps.now?.() ?? Date.now()) / 1000));
    const verdict = await verifyPayment(
      cfg,
      decoded.payload,
      trustRungPriceAtomic(),
      deps.publicClient,
      nowSec,
    );
    if (!verdict.ok) {
      reply.code(402).send(buildTrustRungPaymentRequirements(cfg, resource, verdict.reason));
      return;
    }

    let outcome;
    try {
      outcome = await settle(cfg, verdict.authorization, verdict.signature, {
        wallet: deps.wallet,
        publicClient: deps.publicClient,
      });
    } catch (err) {
      deps.logger?.error('x402: trust-rung settlement infra error', {
        reason: err instanceof Error ? err.message : String(err),
      });
      reply.code(502).send({ x402Version: 1, error: 'settlement failed' });
      return;
    }
    if (!outcome.ok) {
      reply.code(402).send(buildTrustRungPaymentRequirements(cfg, resource, outcome.reason));
      return;
    }

    reply.header('X-PAYMENT-RESPONSE', encodePaymentResponse(outcome.txHash, cfg.network));
  };
}
