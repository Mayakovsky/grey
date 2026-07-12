// The Fastify preHandler (FDQ-29) grey-core installs on the 7 paid routes — drop-in for the old
// no-op x402Placeholder. Orchestrates: challenge (402) → verify → settle → gate the handler.
//
// Failure semantics (spec exit-criterion 3):
//  - no/invalid X-PAYMENT or any verify failure → 402 + PaymentRequirements, NO settlement.
//  - settle throws (submit error OR reverted receipt) → 502, NO handler, payment not consumed.
//  - settle succeeds → X-PAYMENT-RESPONSE header set (persists even if the handler later throws),
//    handler runs; a post-settlement handler error still leaves the payment standing.
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
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

export function makeX402PreHandler(cfg: X402Config, deps: X402PreHandlerDeps): preHandlerHookHandler {
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

    let txHash: string;
    try {
      ({ txHash } = await settle(cfg, verdict.authorization, verdict.signature, {
        wallet: deps.wallet,
        publicClient: deps.publicClient,
      }));
    } catch (err) {
      deps.logger?.error('x402: settlement failed', {
        slug,
        reason: err instanceof Error ? err.message : String(err),
      });
      reply.code(502).send({ x402Version: 1, error: 'settlement failed' });
      return;
    }

    // Settlement stands. Header persists through a later handler error → payment survives.
    reply.header('X-PAYMENT-RESPONSE', encodePaymentResponse(txHash, cfg.network));
  };
}
