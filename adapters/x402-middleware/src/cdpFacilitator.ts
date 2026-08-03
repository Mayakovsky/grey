// CDP Facilitator (Phase 2) — a PARALLEL settlement path, not a replacement. Grey's self-hosted
// verify()/settle() (verify.ts/settle.ts) stays the primary revenue rail for the 7 offerings +
// trust rung; this file is additive, built specifically so at least one real settlement can flow
// through CDP's hosted facilitator — the only way a resource gets indexed into CDP's Bazaar
// discovery (confirmed empirically: `GET /platform/v2/x402/discovery/resources` is unauthenticated
// and lists resources CDP has itself seen settle, independent of what a 402 body advertises).
//
// Buyer-facing wire format is UNCHANGED: the 402 challenge on the CDP-routed route
// (`/v1/cdp/offerings/<slug>`) is byte-identical to the primary route's (same buildPaymentRequirements,
// same X-PAYMENT header shape the buyer signs). Only the SERVER-SIDE call differs — instead of
// Grey's own verify.ts/settle.ts against the local relayer, this file translates the decoded
// payload into CDP's wire format and calls CDP's hosted /verify + /settle over HTTP.
//
// Wire-shape note (load-bearing, verified live 2026-08-02): CDP's discovery endpoint returns
// `x402Version: 2` items whose `accepts[]` entries match @x402/core's (non-V1) `PaymentRequirements`
// shape almost exactly (`scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra` — NOT the
// v1 `maxAmountRequired`/`resource`/`description` shape Grey's own types.ts uses for the buyer-facing
// challenge). This confirms CDP's live facilitator speaks x402 protocol v2, so this file builds v2
// PaymentPayload/PaymentRequirements for the CDP call specifically, translating from Grey's own
// (unchanged, buyer-facing) v1 PaymentPayload. The INNER payload contents (EIP-3009
// `{signature, authorization}`) are kept as-is — discovery's `extra.credentialTypes: ["authorization"]`
// on "exact"-scheme entries indicates the same EIP-3009 credential shape carries through unchanged.
//
// Auth: CDP_API_KEY_ID/CDP_API_KEY_SECRET are read ONCE by loadX402Config (cfg.cdp) — this file
// does not re-read process.env itself, keeping Grey's own config loader the single source, even
// though @coinbase/x402's createFacilitatorConfig() is *capable* of reading the env directly.
import { createFacilitatorConfig } from '@coinbase/x402';
import { HTTPFacilitatorClient, type FacilitatorClient } from '@x402/core/http';
import {
  VerifyError,
  SettleError,
  type PaymentPayload as CdpPaymentPayload,
  type PaymentRequirements as CdpPaymentRequirements,
} from '@x402/core/types';
import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
  preValidationHookHandler,
} from 'fastify';
import type { Hex } from 'viem';
import type { X402Config, PaymentPayload } from './types.js';
import type { SettleOutcome } from './settle.js';
import { isPaidSlug, priceAtomicFor } from './prices.js';
import { buildPaymentRequirements } from './challenge.js';
import { decodePaymentHeader } from './verify.js';

/** Extract the paid slug from `/v1/cdp/offerings/<slug>[?query]` — the CDP-routed mirror of
 *  preHandler.ts's slugFromUrl, deliberately a separate route family from `/v1/offerings/<slug>`
 *  so the primary path's routes/wiring are never touched by this feature. */
export function cdpSlugFromUrl(url: string): string | null {
  const path = url.split('?')[0];
  const m = /^\/v1\/cdp\/offerings\/([a-z_]+)$/.exec(path);
  return m && isPaidSlug(m[1]) ? m[1] : null;
}

/** Builds an `HTTPFacilitatorClient` pointed at CDP's hosted facilitator. Fails closed — throws
 *  immediately (at construction, i.e. at boot when the route is wired) — if CDP routing is invoked
 *  without CDP_API_KEY_ID/CDP_API_KEY_SECRET configured, rather than a silent no-op or a hook that
 *  only fails per-request. */
export function makeCdpFacilitatorClient(cfg: X402Config): FacilitatorClient {
  if (!cfg.cdp) {
    throw new Error(
      'x402: CDP Facilitator routing requires CDP_API_KEY_ID and CDP_API_KEY_SECRET (X402Config.cdp is null)',
    );
  }
  const facilitatorConfig = createFacilitatorConfig(cfg.cdp.apiKeyId, cfg.cdp.apiKeySecret);
  return new HTTPFacilitatorClient(facilitatorConfig);
}

function toCdpPaymentRequirements(cfg: X402Config, slug: string): CdpPaymentRequirements {
  return {
    scheme: 'exact',
    network: cfg.network,
    asset: cfg.usdc.address,
    amount: priceAtomicFor(slug).toString(),
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    extra: { name: cfg.usdc.name, version: cfg.usdc.version },
  };
}

function toCdpPaymentPayload(
  decoded: PaymentPayload,
  requirements: CdpPaymentRequirements,
  resourceUrl: string,
): CdpPaymentPayload {
  return {
    x402Version: 2,
    resource: { url: resourceUrl },
    accepted: requirements,
    payload: {
      signature: decoded.payload.signature,
      authorization: decoded.payload.authorization,
    },
  };
}

/**
 * Verify + settle a decoded X-PAYMENT payload through CDP's facilitator instead of Grey's local
 * relayer. CDP's `/verify` does its own signature/nonce/chain-state checks server-side (that's the
 * facilitator's job in the x402 protocol) — this does NOT duplicate verify.ts's local checks.
 *
 * Failure classification (mirrors settle.ts's local posture, adapted for CDP's error shape):
 *  - `VerifyError`/`SettleError` (CDP returned a well-formed rejection) -> clean {ok:false}, no
 *    infra alarm — same category as a local 402 (buyer-fault or a doomed settlement CDP itself
 *    declined, not a Grey-side fault).
 *  - any other thrown error (network fault, unexpected response shape) -> re-thrown, so the caller
 *    maps it to a 502, same as settle.ts's own infra-fault posture.
 */
export async function verifyAndSettleViaCdp(
  cfg: X402Config,
  client: FacilitatorClient,
  slug: string,
  resourceUrl: string,
  decoded: PaymentPayload,
): Promise<SettleOutcome> {
  const requirements = toCdpPaymentRequirements(cfg, slug);
  const payload = toCdpPaymentPayload(decoded, requirements, resourceUrl);

  let verifyResult;
  try {
    verifyResult = await client.verify(payload, requirements);
  } catch (err) {
    if (err instanceof VerifyError) {
      return {
        ok: false,
        reason: err.invalidReason ?? err.invalidMessage ?? 'CDP verify rejected',
      };
    }
    throw err;
  }
  if (!verifyResult.isValid) {
    return { ok: false, reason: verifyResult.invalidReason ?? 'CDP verify rejected' };
  }

  let settleResult;
  try {
    settleResult = await client.settle(payload, requirements);
  } catch (err) {
    if (err instanceof SettleError) {
      return { ok: false, reason: err.errorReason ?? err.errorMessage ?? 'CDP settle rejected' };
    }
    throw err;
  }
  if (!settleResult.success) {
    return {
      ok: false,
      reason: settleResult.errorReason ?? settleResult.errorMessage ?? 'CDP settle failed',
    };
  }
  return { ok: true, txHash: settleResult.transaction as Hex };
}

function encodePaymentResponse(txHash: string, network: string): string {
  return Buffer.from(
    JSON.stringify({ success: true, transaction: txHash, network }),
    'utf8',
  ).toString('base64');
}

/** `preValidation` half of the CDP-routed gate — identical shape/intent to preHandler.ts's
 *  makeX402PaymentPresenceCheck, scoped to the `/v1/cdp/offerings/<slug>` route family. */
export function makeCdpX402PaymentPresenceCheck(cfg: X402Config): preValidationHookHandler {
  return async function cdpX402PaymentPresenceCheck(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const slug = cdpSlugFromUrl(req.url);
    if (!slug) return;
    const header = req.headers['x-payment'];
    if (typeof header !== 'string' || header.length === 0) {
      reply.code(402).send(buildPaymentRequirements(cfg, slug, req.url, 'payment required'));
    }
  };
}

/** `preHandler` half of the CDP-routed gate — decode (Grey's own decodePaymentHeader, unchanged)
 *  then verify+settle THROUGH CDP instead of the local relayer. Builds its FacilitatorClient once,
 *  at hook-construction time (boot), so a missing CDP config fails closed immediately rather than
 *  on the first request — unless `deps.client` is injected (tests), in which case that fail-closed
 *  construction is skipped entirely, mirroring how makeX402PreHandler takes wallet/publicClient as
 *  injectable deps rather than building real viem clients internally. */
export interface CdpX402PreHandlerDeps {
  logger?: {
    error(msg: string, meta?: unknown): void;
  };
  /** Injectable FacilitatorClient (tests). Production omits this — makeCdpFacilitatorClient(cfg)
   *  builds the real CDP-pointed HTTPFacilitatorClient, failing closed if cfg.cdp is null. */
  client?: FacilitatorClient;
}

export function makeCdpX402PreHandler(
  cfg: X402Config,
  deps: CdpX402PreHandlerDeps = {},
): preHandlerHookHandler {
  const client = deps.client ?? makeCdpFacilitatorClient(cfg);
  return async function cdpX402PreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const slug = cdpSlugFromUrl(req.url);
    if (!slug) return;

    const resource = req.url;
    const header = req.headers['x-payment'];
    if (typeof header !== 'string' || header.length === 0) {
      reply.code(402).send(buildPaymentRequirements(cfg, slug, resource, 'payment required'));
      return;
    }

    const decoded = decodePaymentHeader(header);
    if (!decoded.ok) {
      reply.code(402).send(buildPaymentRequirements(cfg, slug, resource, decoded.reason));
      return;
    }

    let outcome: SettleOutcome;
    try {
      outcome = await verifyAndSettleViaCdp(cfg, client, slug, resource, decoded.payload);
    } catch (err) {
      deps.logger?.error('x402: CDP settlement infra error', {
        slug,
        reason: err instanceof Error ? err.message : String(err),
      });
      reply.code(502).send({ x402Version: 1, error: 'settlement failed' });
      return;
    }
    if (!outcome.ok) {
      reply.code(402).send(buildPaymentRequirements(cfg, slug, resource, outcome.reason));
      return;
    }

    reply.header('X-PAYMENT-RESPONSE', encodePaymentResponse(outcome.txHash, cfg.network));
  };
}
