import { describe, it, expect } from 'vitest';
import type { OfferingSlug } from '../src/responses/types';
import {
  PRICING_TABLE,
  NETWORK_MULTIPLIER,
  computeClassFor,
  isEnabled,
  networkMultiplierFor,
  canonicalUsdFor,
  resolvePriceUsd,
} from '../src/pricing';

const ALL_SLUGS: OfferingSlug[] = [
  'legitimacy_scan',
  'legitimacy_scan_trust_rung',
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

// E1-C: legitimacy_scan_trust_rung is CACHE_ONLY too — BUILT BUT BLOCKED (Forces ruling B-1),
// never live-computed regardless of the disable flag's state (see @grey/x402-middleware/trustRung).
const CACHE_ONLY: OfferingSlug[] = [
  'legitimacy_scan_trust_rung',
  'claim_history',
  'quick_protocol_facts',
  'daily_tech_brief',
  'daily_greenlight_list',
  'scam_alert_feed',
];

const UNPRICED: OfferingSlug[] = ['daily_greenlight_list', 'scam_alert_feed'];

describe('pricing — computeClass + canonical table (E1-A, Invariant #30/#31)', () => {
  it('classifies all 10 offerings, matching cacheOrLive reachability', () => {
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

  it('the trust rung canonicalizes at $0.10, CACHE_ONLY (E1-C, spec §2.4)', () => {
    expect(canonicalUsdFor('legitimacy_scan_trust_rung')).toBe(0.1);
    expect(computeClassFor('legitimacy_scan_trust_rung')).toBe('CACHE_ONLY');
  });

  it('leaves the 2 unpriced offerings flagged (null), not invented', () => {
    for (const slug of UNPRICED) {
      expect(PRICING_TABLE[slug].canonicalUsd).toBeNull();
      expect(() => canonicalUsdFor(slug)).toThrow(/no canonical price/);
    }
  });

  it('merge-prep ruling: the 2 unpriced offerings are enabled:false (not-yet-offered, not a pricing gap) — 7 priced + 2 disabled = 9', () => {
    const disabled = ALL_SLUGS.filter((slug) => !isEnabled(slug));
    expect(disabled.sort()).toEqual(['daily_greenlight_list', 'scam_alert_feed']);
    const enabled = ALL_SLUGS.filter((slug) => isEnabled(slug));
    expect(enabled).toHaveLength(8); // 7 priced + the trust rung (priced, gated by its own runtime flag)
    expect(isEnabled('legitimacy_scan_trust_rung')).toBe(true); // static table says "real offering"; route reachability is a separate runtime flag
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
