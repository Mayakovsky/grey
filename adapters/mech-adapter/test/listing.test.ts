import { describe, it, expect } from 'vitest';
import { buildMechListing } from '../src/listing.js';
import { MECH_OFFERING_SLUGS } from '../src/prices.js';

describe('buildMechListing — e3-b3 EvaluationKit render (Base)', () => {
  const listing = buildMechListing();

  it('renders exactly the three mech offerings, in MECH_OFFERING_SLUGS order', () => {
    expect(listing.map((l) => l.slug)).toEqual([...MECH_OFFERING_SLUGS]);
  });

  it('every entry is discoverable, CACHE_ONLY, and carries real branding/schemas (no hand-authored per-platform metadata — Invariant #33)', () => {
    for (const entry of listing) {
      expect(entry.discoverable).toBe(true);
      expect(entry.computeClass).toBe('CACHE_ONLY');
      expect(entry.serviceName).toBeTruthy();
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(entry.outputSchema).toBeTruthy();
      expect(entry.dropped).toEqual([]); // real branding passes validation as-authored
    }
  });

  it('priceUsd is the 0.65×-resolved mech price, not the canonical @grey/schemas figure', () => {
    const byPrice = Object.fromEntries(listing.map((l) => [l.slug, l.priceUsd]));
    expect(byPrice.prediction_market_research).toBeCloseTo(0.065, 10);
    expect(byPrice.resolution_evidence_compiler).toBeCloseTo(0.13, 10);
    expect(byPrice.daily_tech_brief).toBeCloseTo(5.2, 10);
  });

  it('every entry carries a schema-valid sample (evaluation-friction answer, spec §0.2)', () => {
    for (const entry of listing) {
      expect(entry.sample).toBeTruthy();
      expect(entry.sample?.request).toBeTruthy();
      expect(entry.sample?.response).toBeTruthy();
    }
  });

  it('inputSchema is present for all three (all paid offerings)', () => {
    for (const entry of listing) {
      expect(entry.inputSchema).toBeTruthy();
    }
  });
});
