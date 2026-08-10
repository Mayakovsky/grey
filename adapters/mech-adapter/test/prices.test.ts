import { describe, it, expect } from 'vitest';
import { MECH_OFFERING_SLUGS, mechPriceUsdFor } from '../src/prices.js';

describe('mech-adapter prices — Invariant #31 (0.65× resolved at the adapter boundary)', () => {
  it('resolves prediction_market_research at $0.065 (0.10 canonical × 0.65)', () => {
    expect(mechPriceUsdFor('prediction_market_research')).toBeCloseTo(0.065, 10);
  });

  it('resolves resolution_evidence_compiler at $0.13 (0.20 canonical × 0.65)', () => {
    expect(mechPriceUsdFor('resolution_evidence_compiler')).toBeCloseTo(0.13, 10);
  });

  it('resolves daily_tech_brief at $5.20 (8.00 canonical × 0.65) — exposed, not re-authored', () => {
    expect(mechPriceUsdFor('daily_tech_brief')).toBeCloseTo(5.2, 10);
  });

  it('MECH_OFFERING_SLUGS is exactly the three e3-b2 offerings', () => {
    expect([...MECH_OFFERING_SLUGS].sort()).toEqual(
      ['daily_tech_brief', 'prediction_market_research', 'resolution_evidence_compiler'].sort(),
    );
  });
});
