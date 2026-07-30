// @grey/schemas/pricing — the canonical price + computeClass table (E1-A). Supersedes
// adapters/x402-middleware/src/prices.ts's PRICE_TABLE as the single source (Invariant #31);
// that file now derives its (byte-identical) output from here instead of holding literals.
//
// Canonicalizes EXISTING values as-is (E1-A directive): no repricing on this phase. The 7 priced
// values below are carried over unchanged from the prior PRICE_TABLE. `daily_greenlight_list` and
// `scam_alert_feed` have no existing canonical price — canonicalUsd is `null`, flagged here for
// Desktop to source before merge, not invented.
import type { OfferingSlug } from '../responses/types';
import type { Channel, ComputeClass, OfferingPricing } from './types';

export const PRICING_TABLE: Record<OfferingSlug, OfferingPricing> = {
  // LIVE_ALLOWED — resolve through cacheOrLive on a cache miss (grey-core/src/handlers/index.ts).
  legitimacy_scan: { slug: 'legitimacy_scan', canonicalUsd: 0.25, computeClass: 'LIVE_ALLOWED' },

  // CACHE_ONLY, BUILT BUT BLOCKED (E1-C, spec §2.4, Forces ruling B-1, Invariant #34): $0.10
  // trust rung. Never live-computed regardless of the disable flag's state — the flag controls
  // whether the ROUTE is reachable at all, not this offering's computeClass floor.
  legitimacy_scan_trust_rung: {
    slug: 'legitimacy_scan_trust_rung',
    canonicalUsd: 0.1,
    computeClass: 'CACHE_ONLY',
  },
  verify_whitepaper: { slug: 'verify_whitepaper', canonicalUsd: 1.5, computeClass: 'LIVE_ALLOWED' },
  verify_full_tech: { slug: 'verify_full_tech', canonicalUsd: 3.0, computeClass: 'LIVE_ALLOWED' },
  claim_extraction: { slug: 'claim_extraction', canonicalUsd: 0.75, computeClass: 'LIVE_ALLOWED' },

  // CACHE_ONLY — structurally never reach cacheOrLive today (no call site passes them).
  claim_history: { slug: 'claim_history', canonicalUsd: 0.25, computeClass: 'CACHE_ONLY' },
  quick_protocol_facts: {
    slug: 'quick_protocol_facts',
    canonicalUsd: 0.3,
    computeClass: 'CACHE_ONLY',
  },
  daily_tech_brief: { slug: 'daily_tech_brief', canonicalUsd: 8.0, computeClass: 'CACHE_ONLY' },
  // UNPRICED — flagged for Desktop (E1-A directive); do not invent a number.
  daily_greenlight_list: {
    slug: 'daily_greenlight_list',
    canonicalUsd: null,
    computeClass: 'CACHE_ONLY',
  },
  scam_alert_feed: { slug: 'scam_alert_feed', canonicalUsd: null, computeClass: 'CACHE_ONLY' },
};

/** Spec §2.3: x402/Base and Virtuals ACP are both grandfathered at 1.00× — no repricing. */
export const NETWORK_MULTIPLIER: Record<Channel, number> = {
  x402: 1.0,
  acp: 1.0,
};

export function computeClassFor(slug: OfferingSlug): ComputeClass {
  return PRICING_TABLE[slug].computeClass;
}

export function networkMultiplierFor(channel: Channel): number {
  return NETWORK_MULTIPLIER[channel];
}

/** Canonical USD price for a slug. Throws if unpriced (fail-closed — never silently 0/NaN). */
export function canonicalUsdFor(slug: OfferingSlug): number {
  const v = PRICING_TABLE[slug].canonicalUsd;
  if (v === null) {
    throw new Error(
      `pricing: "${slug}" has no canonical price yet (flagged for Desktop, see E1-A PR)`,
    );
  }
  return v;
}

/** Resolved USD price for a slug on a given channel: canonicalUsd × networkMultiplier. */
export function resolvePriceUsd(slug: OfferingSlug, channel: Channel): number {
  return canonicalUsdFor(slug) * networkMultiplierFor(channel);
}
