// claim_history (pure DB read). Resolve the whitepaper from `projectIdentifier`, then return its
// verification + claim history. Empty (no match) → {project:{query}, verifications:[], claims:[]}.
import type { OfferingHandler } from './types';
import { resolveWhitepaper, subjectFrom } from './subjectMapping';
import { iso } from '../orchestration/cacheRead';

export const claimHistory: OfferingHandler = async (input, deps) => {
  const body = (input.requirement ?? {}) as { projectIdentifier?: string };
  const id = body.projectIdentifier ?? '';
  const wp = await resolveWhitepaper(deps.whitepapers, { identifier: id });
  const subject = subjectFrom(wp, { tokenAddress: null, projectName: id });

  if (!wp) {
    return {
      payload: {
        project: { query: id },
        verifications: [],
        claims: [],
        note: 'No prior verifications found for this identifier.',
      },
      subject,
      cacheHit: false,
    };
  }

  const v = await deps.verifications.findByWhitepaperId(wp.id);
  const claimRows = await deps.claims.findByWhitepaperId(wp.id);

  const verifications = v
    ? [
        {
          whitepaperId: wp.id,
          verdict: v.verdict,
          structuralScore: v.structuralScore,
          confidenceScore: v.confidenceScore,
          hypeTechRatio: v.hypeTechRatio,
          totalClaims: v.totalClaims,
          verifiedClaims: v.verifiedClaims,
          llmTokensUsed: v.llmTokensUsed,
          computeCostUsd: v.computeCostUsd,
          verifiedAt: iso(v.verifiedAt),
        },
      ]
    : [];

  const claims = claimRows.map((c) => ({
    whitepaperId: wp.id,
    claimId: c.id,
    category: c.category,
    claimText: c.claimText,
    statedEvidence: c.statedEvidence,
    sourceSection: c.sourceSection,
    mathProofPresent: c.mathProofPresent,
    claimScore: c.claimScore,
    evaluatedAt: c.evaluatedAt ? iso(c.evaluatedAt) : null,
  }));

  return {
    payload: {
      project: { name: wp.projectName, tokenAddress: wp.tokenAddress, whitepaperUrl: wp.documentUrl },
      verifications,
      claims,
      note: verifications.length === 0 ? 'Whitepaper ingested but not yet verified.' : null,
    },
    subject,
    cacheHit: v != null,
  };
};
