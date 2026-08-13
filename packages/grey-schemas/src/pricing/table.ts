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
// flagged for Desktop" framing from the E1-A PR, which is now resolved. Table reads as 6 priced +
// 3 disabled = 9, matching the full handler count (10th is the trust rung, gated separately by
// its own runtime disable flag — see below).
//
// `daily_tech_brief` is ALSO `enabled: false` as of BION-DIRECTIVE-62 — a different reason from
// the two above: held back entirely (Forces ruling) until there's revenue to justify rolling it
// into the continually-operating version of Grey, not an unpriced gap — `canonicalUsd` stays
// `8.0` (a real, already-decided price for when it's turned back on), unlike the two `null`
// entries above. D-61 found `enabled` alone only governs listing (MCP tools/discovery); real
// route/registration reachability is separately gated by grey-core's offerings.ts PAID array and
// x402-middleware's PAID_SLUG_ORDER — both edited alongside this flag, all three required.
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
    enabled: false,
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

  // e3-b2 (Olas Mech Marketplace, Base first per MEP §3 E3 OD-8). Both CACHE_ONLY, both ship
  // built-but-functionally-empty this phase (no cache-population pipeline for prediction-market
  // content exists yet — see packages/grey-core/src/handlers/, both always return
  // NOT_YET_ANALYSED). `enabled: true` regardless, same convention as legitimacy_scan_trust_rung:
  // the offering IS real and priced, a separate mechanism (whether it's ever populated) gates
  // whether it's *useful*, not whether it's *for sale*.
  prediction_market_research: {
    slug: 'prediction_market_research',
    // $0.10 canonical — RATIFIED, MEP §2.5. Realised at $0.065 on Olas via the 0.65× 'mech'
    // multiplier below (Invariant #31 — the multiplier resolves at the adapter boundary, not
    // baked into this canonical figure). Don't read the two numbers as a conflict.
    canonicalUsd: 0.1,
    computeClass: 'CACHE_ONLY',
    enabled: true,
  },
  resolution_evidence_compiler: {
    slug: 'resolution_evidence_compiler',
    // $0.20 canonical — NOT in the MEP or any prior document; priced here, not inherited from
    // prediction_market_research's $0.10 (per the e3-b2 task's explicit instruction). Reasoning:
    // this offering is a narrower, higher-precision DERIVATIVE of prediction_market_research —
    // compiled, structured evidence bearing on one specific resolution question, not a general
    // research pull — the same relationship claim_history ($0.25) has to a raw fact lookup like
    // quick_protocol_facts ($0.30): a compiled/structured product commands a premium over its
    // raw-research input. 2× prediction_market_research's $0.10 reflects that step up while
    // staying meaningfully below claim_history's $0.25 (claim_history compiles across an entire
    // verification history; this compiles evidence for one market) and far below the
    // LIVE_ALLOWED floor (claim_extraction $0.75) — it's still CACHE_ONLY and, this phase, ships
    // with no live compute path at all (§2.3's $0.05 floor is respected with margin either way).
    canonicalUsd: 0.2,
    computeClass: 'CACHE_ONLY',
    enabled: true,
  },
};

/** Spec §2.3: x402/Base and Virtuals ACP are both grandfathered at 1.00× — no repricing.
 *  Kite (E2) mirrors x402 exactly until Kite volume is legible — pricing constant only, added
 *  in E2-A; no Kite wallet/RPC/live surface exists yet (that's E2-B/D territory). `mech` (e3-b2)
 *  is the plan's only sub-1.00× multiplier — a deliberate volume play into cheap-to-serve
 *  CACHE_ONLY traffic (spec §2.3/§2.5), uniform across both chains E3 lists on (Base now,
 *  Gnosis later — the reasoning is about compute cost, not settlement chain, per MEP §2.3's
 *  2026-08-08 correction). Enforced ONLY on CACHE_ONLY offerings — never apply this multiplier
 *  to a LIVE_ALLOWED/LIVE_PRIORITY offering (Invariant #30/#31 still bind regardless of channel). */
export const NETWORK_MULTIPLIER: Record<Channel, number> = {
  x402: 1.0,
  acp: 1.0,
  kite: 1.0,
  mech: 0.65,
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
