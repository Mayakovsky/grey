import { describe, it, expect } from 'vitest';
import type { OfferingSlug } from '../src/responses/types';
import {
  PRICING_TABLE,
  NETWORK_MULTIPLIER,
  computeClassFor,
  networkMultiplierFor,
  canonicalUsdFor,
  resolvePriceUsd,
} from '../src/pricing';

const ALL_SLUGS: OfferingSlug[] = [
  'legitimacy_scan',
  'verify_whitepaper',
  'verify_full_tech',
  'claim_extraction',
  'claim_history',
  'quick_protocol_facts',
  'daily_tech_brief',
  'daily_greenlight_list',
  'scam_alert_feed',
];

const LIVE_ALLOWED: OfferingSlug[] = [
  'legitimacy_scan',
  'verify_whitepaper',
  'verify_full_tech',
  'claim_extraction',
];

const CACHE_ONLY: OfferingSlug[] = [
  'claim_history',
  'quick_protocol_facts',
  'daily_tech_brief',
  'daily_greenlight_list',
  'scam_alert_feed',
];

const UNPRICED: OfferingSlug[] = ['daily_greenlight_list', 'scam_alert_feed'];

describe('pricing — computeClass + canonical table (E1-A, Invariant #30/#31)', () => {
  it('classifies all 9 offerings, matching cacheOrLive reachability', () => {
    expect(Object.keys(PRICING_TABLE).sort()).toEqual([...ALL_SLUGS].sort());
    for (const slug of LIVE_ALLOWED) expect(computeClassFor(slug)).toBe('LIVE_ALLOWED');
    for (const slug of CACHE_ONLY) expect(computeClassFor(slug)).toBe('CACHE_ONLY');
  });

  it('no offering is LIVE_PRIORITY yet (no premium-queue variant exists)', () => {
    for (const slug of ALL_SLUGS) expect(computeClassFor(slug)).not.toBe('LIVE_PRIORITY');
  });

  it('canonicalizes the 7 existing prices as-is (no repricing on this phase)', () => {
    const expected: Record<string, number> = {
      legitimacy_scan: 0.25,
      verify_whitepaper: 1.5,
      verify_full_tech: 3.0,
      claim_extraction: 0.75,
      claim_history: 0.25,
      quick_protocol_facts: 0.3,
      daily_tech_brief: 8.0,
    };
    for (const [slug, usd] of Object.entries(expected)) {
      expect(canonicalUsdFor(slug as OfferingSlug)).toBe(usd);
    }
  });

  it('leaves the 2 unpriced offerings flagged (null), not invented', () => {
    for (const slug of UNPRICED) {
      expect(PRICING_TABLE[slug].canonicalUsd).toBeNull();
      expect(() => canonicalUsdFor(slug)).toThrow(/no canonical price/);
    }
  });

  it('networkMultiplier resolves to 1.00 for both live channels today (Invariant #31)', () => {
    expect(NETWORK_MULTIPLIER.x402).toBe(1.0);
    expect(NETWORK_MULTIPLIER.acp).toBe(1.0);
    expect(networkMultiplierFor('x402')).toBe(1.0);
    expect(networkMultiplierFor('acp')).toBe(1.0);
  });

  it('resolvePriceUsd = canonicalUsd × networkMultiplier (identity at 1.00×)', () => {
    expect(resolvePriceUsd('legitimacy_scan', 'x402')).toBe(0.25);
    expect(resolvePriceUsd('legitimacy_scan', 'acp')).toBe(0.25);
    expect(resolvePriceUsd('daily_tech_brief', 'x402')).toBe(8.0);
  });

  it('resolvePriceUsd fails closed for an unpriced offering', () => {
    expect(() => resolvePriceUsd('scam_alert_feed', 'x402')).toThrow(/no canonical price/);
  });
});
