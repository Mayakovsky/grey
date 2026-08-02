// @grey/schemas/pricing — the canonical price + computeClass table (E1-A). Supersedes
// adapters/x402-middleware/src/prices.ts's PRICE_TABLE as the single source (Invariant #31);
// that file now derives its (byte-identical) output from here instead of holding literals.
//
// Canonicalizes EXISTING values as-is (E1-A directive): no repricing on this phase. The 7 priced
// entries below are carried over unchanged from the prior PRICE_TABLE.
//
// `daily_greenlight_list` and `scam_alert_feed` are `enabled: false` — merge-prep ruling (Forces,
// 2026-07-30 session): these are NOT priced gaps to fill, they are not being offered yet, period,
// pending daily-customer usage data. `canonicalUsd` stays `null` (don't invent a price for
// something not for sale); `enabled: false` is the actual reason, replacing the earlier "UNPRICED,
// flagged for Desktop" framing from the E1-A PR, which is now resolved. Table reads as 7 priced +
// 2 disabled = 9, matching the full handler count (10th is the trust rung, gated separately by
// its own runtime disable flag — see below).
import type { OfferingSlug } from '../responses/types';
import type { Channel, ComputeClass, OfferingPricing } from './types';

export const PRICING_TABLE: Record<OfferingSlug, OfferingPricing> = {
  // LIVE_ALLOWED — resolve through cacheOrLive on a cache miss (grey-core/src/handlers/index.ts).
  legitimacy_scan: {
    slug: 'legitimacy_scan',
    canonicalUsd: 0.25,
    computeClass: 'LIVE_ALLOWED',
    enabled: true,
  },

  // CACHE_ONLY, BUILT BUT BLOCKED (E1-C, spec §2.4, Forces ruling B-1, Invariant #34): $0.10
  // trust rung. Never live-computed regardless of the disable flag's state — the flag controls
  // whether the ROUTE is reachable at all, not this offering's computeClass floor. `enabled: true`
  // here is deliberate — it IS a real, priced offering; its own separate runtime flag
  // (@grey/x402-middleware's trustRungEnabled()) is what gates route/listing reachability, not
  // this static table. Don't conflate the two disable mechanisms.
  legitimacy_scan_trust_rung: {
    slug: 'legitimacy_scan_trust_rung',
    canonicalUsd: 0.1,
    computeClass: 'CACHE_ONLY',
    enabled: true,
  },
  verify_whitepaper: {
    slug: 'verify_whitepaper',
    canonicalUsd: 1.5,
    computeClass: 'LIVE_ALLOWED',
    enabled: true,
  },
  verify_full_tech: {
    slug: 'verify_full_tech',
    canonicalUsd: 3.0,
    computeClass: 'LIVE_ALLOWED',
    enabled: true,
  },
  claim_extraction: {
    slug: 'claim_extraction',
    canonicalUsd: 0.75,
    computeClass: 'LIVE_ALLOWED',
    enabled: true,
  },

  // CACHE_ONLY — structurally never reach cacheOrLive today (no call site passes them).
  claim_history: {
    slug: 'claim_history',
    canonicalUsd: 0.25,
    computeClass: 'CACHE_ONLY',
    enabled: true,
  },
  quick_protocol_facts: {
    slug: 'quick_protocol_facts',
    canonicalUsd: 0.3,
    computeClass: 'CACHE_ONLY',
    enabled: true,
  },
  daily_tech_brief: {
    slug: 'daily_tech_brief',
    canonicalUsd: 8.0,
    computeClass: 'CACHE_ONLY',
    enabled: true,
  },
  // NOT YET OFFERED (merge-prep ruling) — no price, not for sale, pending usage data.
  daily_greenlight_list: {
    slug: 'daily_greenlight_list',
    canonicalUsd: null,
    computeClass: 'CACHE_ONLY',
    enabled: false,
  },
  scam_alert_feed: {
    slug: 'scam_alert_feed',
    canonicalUsd: null,
    computeClass: 'CACHE_ONLY',
    enabled: false,
  },
};

/** Spec §2.3: x402/Base and Virtuals ACP are both grandfathered at 1.00× — no repricing. */
export const NETWORK_MULTIPLIER: Record<Channel, number> = {
  x402: 1.0,
  acp: 1.0,
};

export function computeClassFor(slug: OfferingSlug): ComputeClass {
  return PRICING_TABLE[slug].computeClass;
}

/** Merge-prep: whether this offering is actually for sale. `false` means "not yet offered,
 *  period" (not a pricing gap) — the single source every listing/discovery surface checks. */
export function isEnabled(slug: OfferingSlug): boolean {
  return PRICING_TABLE[slug].enabled;
}

export function networkMultiplierFor(channel: Channel): number {
  return NETWORK_MULTIPLIER[channel];
}

/** Canonical USD price for a slug. Throws if unpriced (fail-closed — never silently 0/NaN). */
export function canonicalUsdFor(slug: OfferingSlug): number {
  const v = PRICING_TABLE[slug].canonicalUsd;
  if (v === null) {
    throw new Error(
      `pricing: "${slug}" has no canonical price (not yet offered — see PRICING_TABLE.enabled)`,
    );
  }
  return v;
}

/** Resolved USD price for a slug on a given channel: canonicalUsd × networkMultiplier. */
export function resolvePriceUsd(slug: OfferingSlug, channel: Channel): number {
  return canonicalUsdFor(slug) * networkMultiplierFor(channel);
}
