// THE single price source (invariant #20). Every route price, the 402 `maxAmountRequired`,
// and grey-core's envelope `costUsd` derive from this one table. No price literal lives
// anywhere else. USD values are the authoritative OpenAPI `x-x402-pricing`; atomic units are
// USDC (6 decimals). Kept as a string USD label + bigint atomic so no float rounding creeps in.
import type { X402Network, UsdcAsset } from './types.js';

export type PaidSlug =
  | 'legitimacy_scan'
  | 'verify_whitepaper'
  | 'verify_full_tech'
  | 'claim_extraction'
  | 'claim_history'
  | 'quick_protocol_facts'
  | 'daily_tech_brief';

export const PRICE_TABLE: Record<PaidSlug, { readonly usd: string; readonly atomic: bigint }> = {
  legitimacy_scan: { usd: '0.25', atomic: 250_000n },
  verify_whitepaper: { usd: '1.50', atomic: 1_500_000n },
  verify_full_tech: { usd: '3.00', atomic: 3_000_000n },
  claim_extraction: { usd: '0.75', atomic: 750_000n },
  claim_history: { usd: '0.25', atomic: 250_000n },
  quick_protocol_facts: { usd: '0.30', atomic: 300_000n },
  daily_tech_brief: { usd: '8.00', atomic: 8_000_000n },
};

export const PAID_SLUGS = Object.keys(PRICE_TABLE) as PaidSlug[];

export function isPaidSlug(slug: string): slug is PaidSlug {
  return Object.prototype.hasOwnProperty.call(PRICE_TABLE, slug);
}

/** USDC atomic units (6-dec) required for a slug. Throws on unknown slug (fail-closed). */
export function priceAtomicFor(slug: string): bigint {
  if (!isPaidSlug(slug)) throw new Error(`x402: no price for slug ${slug}`);
  return PRICE_TABLE[slug].atomic;
}

/** USD price for a slug (grey-core envelope `costUsd`). Throws on unknown slug (fail-closed). */
export function priceUsdFor(slug: string): number {
  if (!isPaidSlug(slug)) throw new Error(`x402: no price for slug ${slug}`);
  return Number(PRICE_TABLE[slug].usd);
}

/** Per-network USDC asset literals — the ONE place addresses + EIP-712 domains live.
 *  Base mainnet name/version are the well-known FiatToken values; Base Sepolia must be
 *  re-verified against the live contract before the Phase D testnet round-trip. */
export const USDC_BY_NETWORK: Record<X402Network, UsdcAsset> = {
  'eip155:8453': {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    name: 'USD Coin',
    version: '2',
    decimals: 6,
  },
  'eip155:84532': {
    address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    name: 'USDC',
    version: '2',
    decimals: 6,
  },
};
