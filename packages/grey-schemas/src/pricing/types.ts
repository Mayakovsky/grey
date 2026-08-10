// @grey/schemas/pricing — computeClass + canonical pricing types (E1-A, Invariant #30/#31).
import type { OfferingSlug } from '../responses/types';

/**
 * Anti-dilution class (spec §2.2, Invariant #30). CACHE_ONLY offerings may never trigger live
 * compute, including on a paid retry — enforced at the `cacheOrLive` boundary in @grey/core.
 * No offering currently carries LIVE_PRIORITY (no premium-queue variant exists yet).
 */
export type ComputeClass = 'CACHE_ONLY' | 'LIVE_ALLOWED' | 'LIVE_PRIORITY';

/**
 * One canonical USD price per offering (spec §2.3, Invariant #31) — channel-agnostic.
 *
 * `enabled: false` (merge-prep ruling, Forces 2026-07-26 session) means the offering is not being
 * sold yet, period — a deliberate not-yet-offered status, not a pricing gap. `canonicalUsd` stays
 * `null` for a disabled offering; don't invent a price for one that isn't for sale. Toggle-on is a
 * separate, later Forces decision (needs daily-customer usage data first per the ruling) — this
 * field is not something Kov or Bion flips.
 */
export interface OfferingPricing {
  readonly slug: OfferingSlug;
  readonly canonicalUsd: number | null;
  readonly computeClass: ComputeClass;
  readonly enabled: boolean;
}

/** A channel this canonical price is realised on. Grows with each expansion (E2 Kite, E3 Olas, ...).
 *  E2-A adds 'kite' as a pricing constant only — no wallet, RPC, or live surface implied by its
 *  presence here (see MARKET-EXPANSION-PROJECT.md §3 E2-A). E3-B2 adds 'mech' — the Olas Mech
 *  Marketplace (Base first, Gnosis later per MEP §3 E3's OD-8 split); both chains share the
 *  0.65× multiplier (MEP §2.3/§2.5), so ONE 'mech' channel covers both rather than 'mech-base' +
 *  'mech-gnosis' — revisit only if Base/Gnosis pricing is ever forced to diverge. */
export type Channel = 'x402' | 'acp' | 'kite' | 'mech';
