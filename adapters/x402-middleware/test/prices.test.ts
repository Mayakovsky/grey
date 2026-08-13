import { describe, it, expect } from 'vitest';
import {
  PRICE_TABLE,
  PAID_SLUGS,
  USDC_BY_NETWORK,
  priceAtomicFor,
  priceUsdFor,
  isPaidSlug,
} from '../src/prices.js';

// The authoritative 6 from OpenAPI x-x402-pricing (invariant #20 = ONE source). daily_tech_brief
// removed BION-DIRECTIVE-62 — held back entirely (Forces ruling), no longer a paid slug on x402.
const EXPECTED: Record<string, [string, bigint]> = {
  legitimacy_scan: ['0.25', 250_000n],
  verify_whitepaper: ['1.50', 1_500_000n],
  verify_full_tech: ['3.00', 3_000_000n],
  claim_extraction: ['0.75', 750_000n],
  claim_history: ['0.25', 250_000n],
  quick_protocol_facts: ['0.30', 300_000n],
};

describe('prices — single price source', () => {
  it('has exactly the 6 paid slugs', () => {
    expect([...PAID_SLUGS].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(PAID_SLUGS).toHaveLength(6);
  });

  it('BION-DIRECTIVE-62: daily_tech_brief is NOT a paid slug on x402 (held back)', () => {
    expect(isPaidSlug('daily_tech_brief')).toBe(false);
    expect(() => priceAtomicFor('daily_tech_brief')).toThrow();
    expect(() => priceUsdFor('daily_tech_brief')).toThrow();
  });

  it.each(Object.entries(EXPECTED))('%s: usd + atomic match OpenAPI', (slug, [usd, atomic]) => {
    expect(PRICE_TABLE[slug as keyof typeof PRICE_TABLE].usd).toBe(usd);
    expect(PRICE_TABLE[slug as keyof typeof PRICE_TABLE].atomic).toBe(atomic);
    expect(priceAtomicFor(slug)).toBe(atomic);
    expect(priceUsdFor(slug)).toBe(Number(usd));
  });

  it('atomic = usd * 1e6 for every slug (6-dec USDC)', () => {
    for (const [slug, { usd, atomic }] of Object.entries(PRICE_TABLE)) {
      expect(atomic, slug).toBe(BigInt(Math.round(Number(usd) * 1e6)));
    }
  });

  it('isPaidSlug + fail-closed lookups', () => {
    expect(isPaidSlug('legitimacy_scan')).toBe(true);
    expect(isPaidSlug('daily_greenlight_list')).toBe(false); // free resource, not paid
    expect(isPaidSlug('nope')).toBe(false);
    expect(() => priceAtomicFor('nope')).toThrow();
    expect(() => priceUsdFor('nope')).toThrow();
  });

  it('per-network USDC assets are distinct literals in ONE place', () => {
    expect(USDC_BY_NETWORK['eip155:8453'].address).toBe(
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    );
    expect(USDC_BY_NETWORK['eip155:84532'].address).toBe(
      '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    );
    expect(USDC_BY_NETWORK['eip155:8453'].decimals).toBe(6);
    expect(USDC_BY_NETWORK['eip155:84532'].decimals).toBe(6);
  });

  it('E2-BE: Kite mainnet USDC.e is a distinct literal, verified live against Kite RPC', () => {
    expect(USDC_BY_NETWORK['eip155:2366'].address).toBe(
      '0x7aB6f3ed87C42eF0aDb67Ed95090f8bF5240149e',
    );
    expect(USDC_BY_NETWORK['eip155:2366'].decimals).toBe(6);
    expect(USDC_BY_NETWORK['eip155:2366'].address.toLowerCase()).not.toBe(
      USDC_BY_NETWORK['eip155:8453'].address.toLowerCase(),
    );
    expect(USDC_BY_NETWORK['eip155:2366'].address.toLowerCase()).not.toBe(
      USDC_BY_NETWORK['eip155:84532'].address.toLowerCase(),
    );
  });
});
