// x402's price resolver (E1-A / Invariant #31). @grey/schemas/pricing is THE single canonical
// price source (supersedes this file's old PRICE_TABLE literal, invariant #20 → #31); this file
// resolves x402's networkMultiplier (1.00× today) at the adapter boundary and converts the
// resolved USD to USDC atomic units. No price literal lives here anymore — PRICE_TABLE below is
// derived, kept only so existing consumers (route registration, tests) don't need to change
// shape. Every route price, the 402 `maxAmountRequired`, and grey-core's envelope `costUsd`
// derive from this resolution. Atomic units are USDC (6 decimals).
import type { PaidOfferingSlug } from '@grey/schemas/responses';
import { resolvePriceUsd } from '@grey/schemas/pricing';
import type { X402Network, UsdcAsset } from './types.js';
import { NETWORK_REGISTRY } from './registry.js';

export type PaidSlug = PaidOfferingSlug;

const CHANNEL = 'x402' as const;

/** USD → USDC atomic units (6-dec), rounded to avoid float drift (e.g. 0.30 * 1e6 in IEEE754). */
function toAtomic(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

function usdLabel(usd: number): string {
  return usd.toFixed(2);
}

const PAID_SLUG_ORDER: PaidSlug[] = [
  'legitimacy_scan',
  'verify_whitepaper',
  'verify_full_tech',
  'claim_extraction',
  'claim_history',
  'quick_protocol_facts',
  'daily_tech_brief',
];

/** Derived from @grey/schemas/pricing — NOT the source. Kept as a stable {usd,atomic} shape for
 *  existing consumers/tests; recomputed from the canonical table + x402's networkMultiplier. */
export const PRICE_TABLE: Record<PaidSlug, { readonly usd: string; readonly atomic: bigint }> =
  Object.fromEntries(
    PAID_SLUG_ORDER.map((slug) => {
      const usd = resolvePriceUsd(slug, CHANNEL);
      return [slug, { usd: usdLabel(usd), atomic: toAtomic(usd) }];
    }),
  ) as Record<PaidSlug, { readonly usd: string; readonly atomic: bigint }>;

export const PAID_SLUGS = [...PAID_SLUG_ORDER];

export function isPaidSlug(slug: string): slug is PaidSlug {
  return Object.prototype.hasOwnProperty.call(PRICE_TABLE, slug);
}

/** USDC atomic units (6-dec) required for a slug. Throws on unknown slug (fail-closed). */
export function priceAtomicFor(slug: string): bigint {
  if (!isPaidSlug(slug)) throw new Error(`x402: no price for slug ${slug}`);
  return toAtomic(resolvePriceUsd(slug, CHANNEL));
}

/** USD price for a slug (grey-core envelope `costUsd`). Throws on unknown slug (fail-closed). */
export function priceUsdFor(slug: string): number {
  if (!isPaidSlug(slug)) throw new Error(`x402: no price for slug ${slug}`);
  return resolvePriceUsd(slug as PaidSlug, CHANNEL);
}

/** Per-network USDC asset — derived from `registry.ts` (E2-A), NOT the source anymore. Base
 *  mainnet name/version are the well-known FiatToken values; Base Sepolia must be re-verified
 *  against the live contract before the Phase D testnet round-trip. Kept as a named export with
 *  the same shape/values for existing consumers (this file's own resolvers below, tests). */
export const USDC_BY_NETWORK: Record<X402Network, UsdcAsset> = {
  'eip155:8453': NETWORK_REGISTRY['eip155:8453'].usdc,
  'eip155:84532': NETWORK_REGISTRY['eip155:84532'].usdc,
};
