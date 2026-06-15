import { describe, it, expect } from 'vitest';
import { whitepaperRow, verificationRow, claimRow, fakeDeps } from './_helpers';
import {
  buildLegitimacyHit,
  buildLegitimacyMiss,
  buildVerifyWhitepaperHit,
  buildVerifyFullTechHit,
  micaFrom,
} from '../src/orchestration/cacheRead';

describe('cacheRead builders', () => {
  it('buildLegitimacyHit maps row fields + cached provenance', () => {
    const p = buildLegitimacyHit(whitepaperRow(), verificationRow());
    expect(p.verdict).toBe('PASS');
    expect(p.discoveryStatus).toBe('cached');
    expect(p.structuralScore).toBe(4);
  });

  it('buildLegitimacyMiss → NOT_IN_DATABASE sentinel with fallback subject fields', () => {
    const p = buildLegitimacyMiss(fakeDeps(), { tokenAddress: '0xabc', projectName: 'X' });
    expect(p.verdict).toBe('NOT_IN_DATABASE');
    expect(p.structuralScore).toBe(0);
    expect(p.tokenAddress).toBe('0xabc');
    expect(p.projectName).toBe('X');
  });

  it('buildVerifyWhitepaperHit derives claimCount from claims length (not totalClaims)', () => {
    const p = buildVerifyWhitepaperHit(whitepaperRow(), verificationRow({ totalClaims: 99 }), [
      claimRow(),
      claimRow({ id: 'c-2' }),
    ]);
    expect(p.claimCount).toBe(2);
    expect(Object.keys(p.claimScores as Record<string, number>).length).toBe(2);
  });

  it('buildVerifyFullTechHit includes L3 fields', () => {
    const p = buildVerifyFullTechHit(whitepaperRow(), verificationRow(), [claimRow()]);
    expect(p.confidenceScore).toBe(82);
    expect((p.evaluations as unknown[]).length).toBe(1);
    expect(p.focusAreaScores).toEqual({ tokenomics: 4, performance: 3 });
  });

  it('micaFrom reads nested structuralAnalysisJson.mica, defaults when absent', () => {
    expect(micaFrom(verificationRow()).micaCompliant).toBe('YES');
    expect(micaFrom(verificationRow({ structuralAnalysisJson: null })).micaCompliant).toBe('NO');
  });
});
