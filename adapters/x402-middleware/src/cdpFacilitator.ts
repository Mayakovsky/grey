// CDP Facilitator (Phase 2) — a PARALLEL settlement path, not a replacement. Grey's self-hosted
// verify()/settle() (verify.ts/settle.ts) stays the primary revenue rail for the 7 offerings +
// trust rung; this file is additive, built specifically so at least one real settlement can flow
// through CDP's hosted facilitator — the only way a resource gets indexed into CDP's Bazaar
// discovery (confirmed empirically: `GET /platform/v2/x402/discovery/resources` is unauthenticated
// and lists resources CDP has itself seen settle, independent of what a 402 body advertises).
//
// v2-shaped challenge (CDP-route-only revision, see CDP-PHASE2-v2-challenge-CDP-route-only-KOV-
// directive.md): `POST /v2/x402/validate` against the live route revealed that CDP's Bazaar
// indexer requires the SELLER-FACING 402 response itself to be x402 protocol v2, not just the
// CDP-facing verify/settle call — confirmed against @x402/core's own compiled source (not
// guessed): "Create HTTP payment required response (v1 puts in body, v2 puts in header)". v2
// puts the full PaymentRequired payload (base64 JSON) in a `PAYMENT-REQUIRED` response header and
// leaves the JSON body empty; settlement success uses a `PAYMENT-RESPONSE` header (not
// `X-PAYMENT-RESPONSE`). This is scoped ENTIRELY to this file / the `/v1/cdp/offerings/<slug>`
// route — challenge.ts's buildPaymentRequirements (v1) and the primary/trust-rung routes are
// untouched, per the directive's explicit scope ruling. The buyer's REQUEST header ALSO changes in
// v2 — confirmed against the same compiled source (encodePaymentSignatureHeader switches on
// x402Version: case 2 -> `PAYMENT-SIGNATURE`, case 1 -> `X-PAYMENT`) — an earlier revision of this
// file wrongly assumed `X-PAYMENT` was unchanged and read that header on this route; fixed to read
// `payment-signature`, per CDP-PHASE2-fix-payment-signature-header-KOV-directive.md. A v2-native
// buyer signs against this route's v2-shaped `accepts[]` entry, so their payload is v2-shaped too
// (`{x402Version:2, accepted, payload, ...}`) — decoded natively below, no v1-decode-then-translate
// step needed anymore (that translation is gone from this file).
//
// Wire-shape note (load-bearing, verified live 2026-08-02/03): CDP's discovery endpoint returns
// `x402Version: 2` items whose `accepts[]` entries match @x402/core's (non-V1) `PaymentRequirements`
// shape (`scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra`). `extra.credentialTypes:
// ["authorization"]` on live "exact"-scheme entries is included below on the same empirical basis.
//
// Auth: CDP_API_KEY_ID/CDP_API_KEY_SECRET are read ONCE by loadX402Config (cfg.cdp) — this file
// does not re-read process.env itself, keeping Grey's own config loader the single source, even
// though @coinbase/x402's createFacilitatorConfig() is *capable* of reading the env directly.
import { createFacilitatorConfig } from '@coinbase/x402';
import {
  HTTPFacilitatorClient,
  type FacilitatorClient,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
  decodePaymentSignatureHeader,
} from '@x402/core/http';
import {
  VerifyError,
  SettleError,
  type PaymentPayload as CdpPaymentPayload,
  type PaymentRequirements as CdpPaymentRequirements,
  type PaymentRequired as CdpPaymentRequired,
} from '@x402/core/types';
import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
  preValidationHookHandler,
} from 'fastify';
import type { Hex } from 'viem';
import type { OfferingSlug } from '@grey/schemas/responses';
import { buildEvaluationArtifact } from '@grey/schemas/evaluationKit';
import type { EvaluationKitEntry } from '@grey/schemas/evaluationKit';
import type { X402Config } from './types.js';
import type { SettleOutcome } from './settle.js';
import { isPaidSlug, priceAtomicFor } from './prices.js';
import { buildCdpBazaarExtension } from './challenge.js';

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

/** The single `accepts[]` entry — same shape used both in the 402 challenge and handed to
 *  verify/settle, so what's advertised and what's checked can never drift apart. */
export function buildCdpPaymentRequirementsEntry(
  cfg: X402Config,
  slug: string,
): CdpPaymentRequirements {
  return {
    scheme: 'exact',
    network: cfg.network,
    asset: cfg.usdc.address,
    amount: priceAtomicFor(slug).toString(),
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds,
    // name/version: EIP-712 domain hints (unchanged need from v1). credentialTypes: observed live
    // on CDP's own discovery entries for "exact"-scheme accepts — empirical, not from docs.
    extra: { name: cfg.usdc.name, version: cfg.usdc.version, credentialTypes: ['authorization'] },
  };
}

/** The `resource` object shared between the 402 challenge (`PaymentRequired.resource`) and the
 *  payment payload Grey forwards to CDP (`PaymentPayload.resource`) — same shape, same source,
 *  so they can never drift apart (mirrors buildCdpPaymentRequirementsEntry's rationale). */
function buildCdpResourceInfo(
  cfg: X402Config,
  resourcePath: string,
  kit: EvaluationKitEntry,
): CdpPaymentRequired['resource'] {
  return {
    url: (cfg.cdp?.resourceBaseUrl ?? '') + resourcePath,
    description: kit.description ?? undefined,
    mimeType: 'application/json',
    serviceName: kit.serviceName ?? undefined,
    tags: [...kit.tags],
    iconUrl: kit.iconUrl ?? undefined,
  };
}

/** The full v2 `PaymentRequired` 402 payload — CDP-route-only, never touches challenge.ts's v1
 *  buildPaymentRequirements. Reuses buildCdpBazaarExtension (already shared with trustRung.ts)
 *  for the discovery metadata, same EvaluationKit source as the primary route.
 *
 *  `resource.url` must be an ABSOLUTE `https://` URL — confirmed live against CDP's discovery
 *  validator ("resource must start with 'https://' when protocol type is http"), not guessed:
 *  `resourcePath` (Fastify's `req.url`, always just a path) is prefixed with `cfg.cdp
 *  .resourceBaseUrl` here, the one place this route's absolute-URL construction happens. Falls
 *  back to the bare path when `cfg.cdp` is null (cdp-unconfigured callers, e.g. this function's
 *  own unit tests using a plain TEST_CFG) rather than throwing — this function has never required
 *  CDP to be configured to build A challenge, just to build a CDP-DISCOVERABLE one. */
export function buildCdpChallenge(
  cfg: X402Config,
  slug: string,
  resourcePath: string,
  error?: string,
): CdpPaymentRequired {
  const kit = buildEvaluationArtifact(slug as OfferingSlug);
  const body: CdpPaymentRequired = {
    x402Version: 2,
    resource: buildCdpResourceInfo(cfg, resourcePath, kit),
    accepts: [buildCdpPaymentRequirementsEntry(cfg, slug)],
    // CdpBazaarExtension has no index signature, but is structurally a plain object — safe cast
    // to the v2 spec's generic `extensions?: Record<string, unknown>` field.
    extensions: buildCdpBazaarExtension(kit) as unknown as Record<string, unknown>,
  };
  if (error) body.error = error;
  return body;
}

/** Sends the v2 402: `PAYMENT-REQUIRED` header carries the full payload (base64 JSON); the JSON
 *  body stays empty — @x402/core's own resource-server code does exactly this ("v1 puts in body,
 *  v2 puts in header"), confirmed by reading its compiled source, not guessed. */
function sendCdpChallenge(
  reply: FastifyReply,
  cfg: X402Config,
  slug: string,
  resourcePath: string,
  error?: string,
): void {
  const challenge = buildCdpChallenge(cfg, slug, resourcePath, error);
  reply.header('PAYMENT-REQUIRED', encodePaymentRequiredHeader(challenge));
  reply.code(402).send({});
}

/** Decodes a buyer's PAYMENT-SIGNATURE header as a v2-native `PaymentPayload` (`{x402Version:2, accepted,
 *  payload, ...}`) — a v2-native buyer signs against this route's v2-shaped `accepts[]` entry, so
 *  there's no v1-decode-then-translate step here (unlike verify.ts's decodePaymentHeader, which
 *  this route deliberately does not use). Never throws — every rejection is a machine-readable
 *  reason so the caller always returns a clean 402, matching verify.ts's own discipline. */
function decodeCdpPaymentPayload(
  header: string,
): { ok: true; payload: CdpPaymentPayload } | { ok: false; reason: string } {
  let parsed: CdpPaymentPayload;
  try {
    parsed = decodePaymentSignatureHeader(header) as CdpPaymentPayload;
  } catch {
    return { ok: false, reason: 'PAYMENT-SIGNATURE is not valid base64 JSON' };
  }
  if (parsed?.x402Version !== 2) {
    return { ok: false, reason: 'unsupported x402 version (expected 2)' };
  }
  if (parsed.accepted?.scheme !== 'exact') {
    return { ok: false, reason: 'unsupported scheme (expected exact)' };
  }
  const inner = parsed.payload as
    | { signature?: unknown; authorization?: { from?: unknown; to?: unknown } }
    | undefined;
  if (!inner?.signature || !inner?.authorization?.from || !inner?.authorization?.to) {
    return { ok: false, reason: 'malformed payload' };
  }
  return { ok: true, payload: parsed };
}

/**
 * Verify + settle an already-v2 payload/requirements pair through CDP's facilitator instead of
 * Grey's local relayer. Purely mechanical (protocol-version-agnostic) — the caller is responsible
 * for building v2-shaped inputs; this does no translation. CDP's `/verify` does its own
 * signature/nonce/chain-state checks server-side (that's the facilitator's job in the x402
 * protocol) — this does NOT duplicate verify.ts's local checks.
 *
 * Failure classification (mirrors settle.ts's local posture, adapted for CDP's error shape):
 *  - `VerifyError`/`SettleError` (CDP returned a well-formed rejection) -> clean {ok:false}, no
 *    infra alarm — same category as a local 402 (buyer-fault or a doomed settlement CDP itself
 *    declined, not a Grey-side fault).
 *  - any other thrown error (network fault, unexpected response shape) -> re-thrown, so the caller
 *    maps it to a 502, same as settle.ts's own infra-fault posture.
 */
export async function verifyAndSettleViaCdp(
  client: FacilitatorClient,
  requirements: CdpPaymentRequirements,
  payload: CdpPaymentPayload,
): Promise<SettleOutcome> {
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

/** `preValidation` half of the CDP-routed gate — identical shape/intent to preHandler.ts's
 *  makeX402PaymentPresenceCheck, scoped to the `/v1/cdp/offerings/<slug>` route family. */
export function makeCdpX402PaymentPresenceCheck(cfg: X402Config): preValidationHookHandler {
  return async function cdpX402PaymentPresenceCheck(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const slug = cdpSlugFromUrl(req.url);
    if (!slug) return;
    // v2's request header is PAYMENT-SIGNATURE, not X-PAYMENT (that's v1-only) — confirmed
    // against @x402/core's own compiled source: encodePaymentSignatureHeader switches on
    // x402Version, case 2 -> "PAYMENT-SIGNATURE", case 1 -> "X-PAYMENT".
    const header = req.headers['payment-signature'];
    if (typeof header !== 'string' || header.length === 0) {
      sendCdpChallenge(reply, cfg, slug, req.url, 'payment required');
    }
  };
}

/** `preHandler` half of the CDP-routed gate — decode (v2-native, this file's own
 *  decodeCdpPaymentPayload) then verify+settle THROUGH CDP instead of the local relayer. Builds
 *  its FacilitatorClient once, at hook-construction time (boot), so a missing CDP config fails
 *  closed immediately rather than on the first request — unless `deps.client` is injected (tests),
 *  in which case that fail-closed construction is skipped entirely, mirroring how makeX402PreHandler
 *  takes wallet/publicClient as injectable deps rather than building real viem clients internally. */
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
    // Same PAYMENT-SIGNATURE-not-X-PAYMENT note as makeCdpX402PaymentPresenceCheck above.
    const header = req.headers['payment-signature'];
    if (typeof header !== 'string' || header.length === 0) {
      sendCdpChallenge(reply, cfg, slug, resource, 'payment required');
      return;
    }

    const decoded = decodeCdpPaymentPayload(header);
    if (!decoded.ok) {
      sendCdpChallenge(reply, cfg, slug, resource, decoded.reason);
      return;
    }

    // `paymentPayload.resource` is not part of the base x402 spec and settlement succeeds
    // without it — but CDP's indexer requires it populated to submit the discovery job at all
    // (confirmed directly by Coinbase's own indexing-pipeline engineer, x402-foundation/x402#2112
    // — exactly Grey's observed symptom: clean validate, confirmed settlements, never indexed).
    // A spec-compliant buyer client (`@x402/core`'s own `x402Client`) copies this from the 402
    // challenge automatically, but Grey never relied on that — it re-derives its own canonical
    // resource here and overwrites whatever (if anything) the buyer's payload carried, since Grey
    // is the authoritative source and no buyer client should be trusted to carry it correctly.
    decoded.payload.resource = buildCdpResourceInfo(
      cfg,
      resource,
      buildEvaluationArtifact(slug as OfferingSlug),
    );

    const requirements = buildCdpPaymentRequirementsEntry(cfg, slug);
    let outcome: SettleOutcome;
    try {
      outcome = await verifyAndSettleViaCdp(client, requirements, decoded.payload);
    } catch (err) {
      deps.logger?.error('x402: CDP settlement infra error', {
        slug,
        reason: err instanceof Error ? err.message : String(err),
      });
      reply.code(502).send({ x402Version: 2, error: 'settlement failed' });
      return;
    }
    if (!outcome.ok) {
      sendCdpChallenge(reply, cfg, slug, resource, outcome.reason);
      return;
    }

    reply.header(
      'PAYMENT-RESPONSE',
      encodePaymentResponseHeader({
        success: true,
        transaction: outcome.txHash,
        network: cfg.network,
      }),
    );
  };
}
