import { describe, it, expect } from 'vitest';
import { MECH_OFFERING_SLUGS, mechPriceUsdFor } from '../src/prices.js';

describe('mech-adapter prices — Invariant #31 (0.65× resolved at the adapter boundary)', () => {
  it('resolves prediction_market_research at $0.065 (0.10 canonical × 0.65)', () => {
    expect(mechPriceUsdFor('prediction_market_research')).toBeCloseTo(0.065, 10);
  });

  it('resolves resolution_evidence_compiler at $0.13 (0.20 canonical × 0.65)', () => {
    expect(mechPriceUsdFor('resolution_evidence_compiler')).toBeCloseTo(0.13, 10);
  });

  it('MECH_OFFERING_SLUGS is exactly the two real mech-registered offerings (BION-DIRECTIVE-62: daily_tech_brief excluded)', () => {
    expect([...MECH_OFFERING_SLUGS].sort()).toEqual(
      ['prediction_market_research', 'resolution_evidence_compiler'].sort(),
    );
  });
});
