// ACP's own price resolver (E1-A / Invariant #31) — resolves the ACP channel's networkMultiplier
// (1.00×, grandfathered, no repricing) against @grey/schemas/pricing, the single canonical source.
// Mirrors adapters/x402-middleware/src/prices.ts's resolution, kept separate per-adapter so a
// future channel-specific multiplier (this file's `acp` vs. x402's `x402`) is a config entry in
// @grey/schemas, not new code in either adapter.
import type { PaidOfferingSlug } from '@grey/schemas/responses';
import { resolvePriceUsd } from '@grey/schemas/pricing';

const CHANNEL = 'acp' as const;

/** USD price for a paid offering on the ACP channel. Throws on an unpriced offering (fail-closed). */
export function priceUsdForAcp(slug: PaidOfferingSlug): number {
  return resolvePriceUsd(slug, CHANNEL);
}
