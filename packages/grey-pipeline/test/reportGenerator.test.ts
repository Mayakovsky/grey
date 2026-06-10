import { describe, it, expect } from 'vitest';
import { ReportGenerator } from '../src/synthesis/reportGenerator';
import { Verdict, ClaimCategory, type VerificationResult } from '../src/types';
import { emptyAnalysis, fixtureWhitepaper } from './_helpers';

const verification: VerificationResult = {
  structuralScore: 4,
  confidenceScore: 75,
  hypeTechRatio: 1,
  verdict: Verdict.PASS,
  focusAreaScores: {
    [ClaimCategory.TOKENOMICS]: 70,
    [ClaimCategory.PERFORMANCE]: null,
    [ClaimCategory.CONSENSUS]: null,
    [ClaimCategory.SCIENTIFIC]: null,
  },
  totalClaims: 3,
  verifiedClaims: 3,
  llmTokensUsed: 150,
  computeCostUsd: 0.01,
};

describe('ReportGenerator', () => {
  it('lowercases focus-area keys and preserves null for absent categories', () => {
    const rg = new ReportGenerator();
    const r = rg.generateFullVerification(verification, [], [], fixtureWhitepaper, new Map(), emptyAnalysis());
    expect(r.focusAreaScores.tokenomics).toBe(70);
    expect(r.focusAreaScores.performance).toBeNull();
    expect(r.confidenceScore).toBe(75);
    expect(r.verdict).toBe(Verdict.PASS);
  });

  it('downgrades PASS → FAIL when MiCA is claimed but fails with low structural score', () => {
    const rg = new ReportGenerator();
    const analysis = emptyAnalysis();
    analysis.mica.claimsMicaCompliance = 'YES';
    analysis.mica.micaCompliant = 'NO';
    const r = rg.generateLegitimacyScan({ ...verification, structuralScore: 2 }, analysis, fixtureWhitepaper);
    expect(r.verdict).toBe(Verdict.FAIL);
  });

  it('tokenomics audit derives claimCount from the claims array', () => {
    const rg = new ReportGenerator();
    const claims = [
      { claimId: 'a', category: ClaimCategory.TOKENOMICS, claimText: 'x', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '', regulatoryRelevance: false },
    ];
    const r = rg.generateTokenomicsAudit(verification, claims, fixtureWhitepaper, new Map([['a', 80]]), emptyAnalysis());
    expect(r.claimCount).toBe(1);
    expect(r.claimScores.a).toBe(80);
  });
});
