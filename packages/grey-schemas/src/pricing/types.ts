// @grey/schemas/pricing — computeClass + canonical pricing types (E1-A, Invariant #30/#31).
import type { OfferingSlug } from '../responses/types';

/**
 * Anti-dilution class (spec §2.2, Invariant #30). CACHE_ONLY offerings may never trigger live
 * compute, including on a paid retry — enforced at the `cacheOrLive` boundary in @grey/core.
 * No offering currently carries LIVE_PRIORITY (no premium-queue variant exists yet).
 */
export type ComputeClass = 'CACHE_ONLY' | 'LIVE_ALLOWED' | 'LIVE_PRIORITY';

/**
 * One canonical USD price per offering (spec §2.3, Invariant #31) — channel-agnostic. `null`
 * means no canonical price has been sourced yet (flagged for Desktop, not a value to invent).
 */
export interface OfferingPricing {
  readonly slug: OfferingSlug;
  readonly canonicalUsd: number | null;
  readonly computeClass: ComputeClass;
}

/** A channel this canonical price is realised on. Grows with each expansion (E2 Kite, E3 Olas, ...). */
export type Channel = 'x402' | 'acp';
