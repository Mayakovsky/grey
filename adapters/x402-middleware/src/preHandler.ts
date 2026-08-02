// The Fastify hooks (FDQ-29) grey-core installs on the 7 paid routes — drop-in for the old
// no-op x402Placeholder. Orchestrates: challenge (402) → verify → settle → gate the handler.
//
// CDP/Bazaar alignment Phase 1 revision: this is now TWO hooks, not one, because Fastify's
// request lifecycle runs preValidation -> [body-schema validation] -> preHandler -> handler.
// `makeX402PaymentPresenceCheck` is body-independent (checks only that X-PAYMENT is present) and
// belongs on `preValidation`, BEFORE schema validation — that's what lets a probe with no known
// body shape still get a 402-with-Bazaar-metadata instead of a bare schema 400. The real
// decode/verify/settle logic stays in `makeX402PreHandler`, wired to `preHandler`, AFTER schema
// validation — so a buyer with a valid payment but a malformed body still 400s before being
// charged, same protection as before this whole change.
//
// Failure semantics (spec exit-criterion 3):
//  - no X-PAYMENT → 402 + PaymentRequirements, from the preValidation hook, NO settlement.
//  - invalid/unverifiable X-PAYMENT → 402 + PaymentRequirements, from the preHandler hook (only
//    reached once the body has already passed schema validation), NO settlement.
//  - settle throws (submit error OR reverted receipt) → 502, NO handler, payment not consumed.
//  - settle succeeds → X-PAYMENT-RESPONSE header set (persists even if the handler later throws),
//    handler runs; a post-settlement handler error still leaves the payment standing.
import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
  preValidationHookHandler,
} from 'fastify';
import type { X402Config } from './types.js';
import type { PublicClientLike, WalletClientLike } from './clients.js';
import { isPaidSlug, priceAtomicFor } from './prices.js';
import { buildPaymentRequirements } from './challenge.js';
import { decodePaymentHeader, verifyPayment } from './verify.js';
import { settle } from './settle.js';

export interface X402PreHandlerDeps {
  wallet: WalletClientLike;
  publicClient: PublicClientLike;
  /** Injectable ms clock for deterministic tests. */
  now?: () => number;
  logger?: {
    warn(msg: string, meta?: unknown): void;
    error(msg: string, meta?: unknown): void;
  };
}

/** Extract the paid slug from `/v1/offerings/<slug>[?query]`, or null if not a paid route. */
export function slugFromUrl(url: string): string | null {
  const path = url.split('?')[0];
  const m = /^\/v1\/offerings\/([a-z_]+)$/.exec(path);
  return m && isPaidSlug(m[1]) ? m[1] : null;
}

function encodePaymentResponse(txHash: string, network: string): string {
  return Buffer.from(
    JSON.stringify({ success: true, transaction: txHash, network }),
    'utf8',
  ).toString('base64');
}

/** `preValidation` half of the split gate — see this file's header comment. Body-independent: only
 *  checks that X-PAYMENT is present, before Fastify's schema validation runs. */
export function makeX402PaymentPresenceCheck(cfg: X402Config): preValidationHookHandler {
  return async function x402PaymentPresenceCheck(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const slug = slugFromUrl(req.url);
    if (!slug) return; // installed only on paid routes; defensive no-op otherwise.

    const header = req.headers['x-payment'];
    if (typeof header !== 'string' || header.length === 0) {
      reply.code(402).send(buildPaymentRequirements(cfg, slug, req.url, 'payment required'));
    }
  };
}

/** `preHandler` half of the split gate — decode/verify/settle, unchanged from before the split.
 *  Runs after Fastify's schema validation (see header comment); its own header-presence check
 *  below is now redundant with makeX402PaymentPresenceCheck when both hooks are wired together,
 *  but keeps this function correct and self-contained for direct unit-test/call-site use. */
export function makeX402PreHandler(
  cfg: X402Config,
  deps: X402PreHandlerDeps,
): preHandlerHookHandler {
  return async function x402PreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const slug = slugFromUrl(req.url);
    if (!slug) return; // installed only on paid routes; defensive no-op otherwise.

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

    const nowSec = BigInt(Math.floor((deps.now?.() ?? Date.now()) / 1000));
    const verdict = await verifyPayment(
      cfg,
      decoded.payload,
      priceAtomicFor(slug),
      deps.publicClient,
      nowSec,
    );
    if (!verdict.ok) {
      reply.code(402).send(buildPaymentRequirements(cfg, slug, resource, verdict.reason));
      return;
    }

    let outcome;
    try {
      outcome = await settle(cfg, verdict.authorization, verdict.signature, {
        wallet: deps.wallet,
        publicClient: deps.publicClient,
      });
    } catch (err) {
      // Genuine infra/post-simulation failure (RPC error, race revert) → 502.
      deps.logger?.error('x402: settlement infra error', {
        slug,
        reason: err instanceof Error ? err.message : String(err),
      });
      reply.code(502).send({ x402Version: 1, error: 'settlement failed' });
      return;
    }
    if (!outcome.ok) {
      // FDQ-40: pre-broadcast simulation caught a doomed settlement (e.g., a replayed/spent nonce) —
      // nothing was broadcast and no relayer gas was spent. Return a clean 402.
      reply.code(402).send(buildPaymentRequirements(cfg, slug, resource, outcome.reason));
      return;
    }

    // Settlement stands. Header persists through a later handler error → payment survives.
    reply.header('X-PAYMENT-RESPONSE', encodePaymentResponse(outcome.txHash, cfg.network));
  };
}
