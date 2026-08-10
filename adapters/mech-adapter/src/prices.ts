// mech-adapter's price resolver (Invariant #31 — adapters never hold hardcoded prices). Mirrors
// x402-middleware/src/prices.ts's role: resolve the 'mech' channel's networkMultiplier (0.65×,
// CACHE_ONLY offerings only — spec §2.3/§2.5) at the adapter boundary, not baked into the
// canonical @grey/schemas table. e3-b2's offering set only — Base and Gnosis share this
// resolution (uniform 0.65× per MEP §2.3's 2026-08-08 correction), so this file doesn't need a
// chain parameter.
import { resolvePriceUsd, computeClassFor } from '@grey/schemas/pricing';
import type { OfferingSlug } from '@grey/schemas/responses';

const CHANNEL = 'mech' as const;

export const MECH_OFFERING_SLUGS = [
  'prediction_market_research',
  'resolution_evidence_compiler',
  'daily_tech_brief',
] as const satisfies readonly OfferingSlug[];

export type MechOfferingSlug = (typeof MECH_OFFERING_SLUGS)[number];

/** Resolved USD price for a mech-channel offering. Fails closed (throws) on a LIVE_ALLOWED/
 *  LIVE_PRIORITY offering — the 0.65× multiplier only ever applies to CACHE_ONLY (spec §2.3);
 *  this is a second, adapter-side backstop on top of cacheOrLive's own Invariant #30 enforcement,
 *  not a substitute for it. */
export function mechPriceUsdFor(slug: MechOfferingSlug): number {
  if (computeClassFor(slug) !== 'CACHE_ONLY') {
    throw new Error(`mech-adapter: refusing to price non-CACHE_ONLY offering "${slug}" on the mech channel`);
  }
  return resolvePriceUsd(slug, CHANNEL);
}
