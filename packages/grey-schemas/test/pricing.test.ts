import { describe, it, expect } from 'vitest';
import type { OfferingSlug } from '../src/responses/types';
import type { Channel } from '../src/pricing';
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
  'prediction_market_research',
  'resolution_evidence_compiler',
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
  'prediction_market_research',
  'resolution_evidence_compiler',
];

const UNPRICED: OfferingSlug[] = ['daily_greenlight_list', 'scam_alert_feed'];

describe('pricing — computeClass + canonical table (E1-A, Invariant #30/#31)', () => {
  it('classifies all 12 offerings, matching cacheOrLive reachability', () => {
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

  it('merge-prep ruling + BION-DIRECTIVE-62: 3 offerings are enabled:false — 9 enabled + 3 disabled = 12', () => {
    const disabled = ALL_SLUGS.filter((slug) => !isEnabled(slug));
    expect(disabled.sort()).toEqual(['daily_greenlight_list', 'daily_tech_brief', 'scam_alert_feed'].sort());
    const enabled = ALL_SLUGS.filter((slug) => isEnabled(slug));
    // 6 priced (daily_tech_brief moved to disabled) + the trust rung (priced, gated by its own
    // runtime flag) + the 2 e3-b2 offerings.
    expect(enabled).toHaveLength(9);
    expect(isEnabled('legitimacy_scan_trust_rung')).toBe(true); // static table says "real offering"; route reachability is a separate runtime flag
  });

  it('BION-DIRECTIVE-62: daily_tech_brief is disabled but keeps its real canonicalUsd (unlike the two null-priced offerings — held back, not unpriced)', () => {
    expect(isEnabled('daily_tech_brief')).toBe(false);
    expect(PRICING_TABLE.daily_tech_brief.canonicalUsd).toBe(8.0);
  });

  it('networkMultiplier resolves to 1.00 for both live channels today (Invariant #31)', () => {
    expect(NETWORK_MULTIPLIER.x402).toBe(1.0);
    expect(NETWORK_MULTIPLIER.acp).toBe(1.0);
    expect(networkMultiplierFor('x402')).toBe(1.0);
    expect(networkMultiplierFor('acp')).toBe(1.0);
  });

  it('E2-A: Channel accepts "kite", mirroring x402 at 1.00x (spec §2.3, no Kite surface live yet)', () => {
    const kite: Channel = 'kite';
    expect(NETWORK_MULTIPLIER[kite]).toBe(1.0);
    expect(networkMultiplierFor('kite')).toBe(1.0);
    expect(resolvePriceUsd('legitimacy_scan', 'kite')).toBe(0.25);
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
