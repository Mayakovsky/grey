// @grey/core cache-READ builders (FDQ-1). M3 is cache-read-only: handlers read grey_two rows and
// shape the offering's response payload directly (no ReportGenerator, no pipeline-type
// reconstruction — cached verdicts are already MiCA-adjusted at write time, so re-running the
// generator would double-adjust). On cache-miss (always, while grey_two is empty) the tiered
// offerings return a flat NOT_IN_DATABASE sentinel. NO runFullPipeline, NO Anthropic, NO live stage.
import type { HandlerDeps } from '../deps';
import type { VerificationRow, ClaimRow, WhitepaperRow } from '../handlers/types';

export const iso = (d: unknown): string => new Date(d as string | number | Date).toISOString();

// ── shared row → response-field helpers ──

export function mapClaims(rows: ClaimRow[]): Array<Record<string, unknown>> {
  return rows.map((c) => ({
    claimId: c.id,
    category: c.category,
    claimText: c.claimText,
    statedEvidence: c.statedEvidence,
    mathematicalProofPresent: c.mathProofPresent,
    sourceSection: c.sourceSection,
    regulatoryRelevance:
      (c.evaluationJson as { regulatoryRelevance?: unknown } | null)?.regulatoryRelevance === true,
  }));
}

export function claimScoresFrom(rows: ClaimRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of rows) out[c.id] = c.claimScore ?? 0;
  return out;
}

export function evaluationsFrom(rows: ClaimRow[]): Array<Record<string, unknown>> {
  return rows.map((c) => ({ ...((c.evaluationJson as Record<string, unknown>) ?? {}), claimId: c.id }));
}

export function micaFrom(v: VerificationRow): {
  claimsMicaCompliance: string;
  micaCompliant: string;
  micaSummary: string;
} {
  const mica = (v.structuralAnalysisJson as { mica?: Record<string, unknown> } | null)?.mica ?? {};
  return {
    claimsMicaCompliance: (mica.claimsMicaCompliance as string) ?? 'NOT_MENTIONED',
    micaCompliant: (mica.micaCompliant as string) ?? 'NO',
    micaSummary: (mica.micaSummary as string) ?? '',
  };
}

export function logicSummaryFrom(claimCount: number, verifiedClaims: number, hypeTechRatio: number, categoryCount: number): string {
  const parts = [`${claimCount} claims extracted across ${categoryCount} categories.`];
  if (verifiedClaims > 0) parts.push(`${Math.min(verifiedClaims, claimCount)}/${claimCount} claims verified.`);
  if (hypeTechRatio > 3.0) parts.push('WARNING: High hype-to-tech ratio detected.');
  return parts.join(' ');
}

// ── tier 1: legitimacy_scan ──

export function buildLegitimacyHit(wp: WhitepaperRow, v: VerificationRow): Record<string, unknown> {
  const mica = micaFrom(v);
  return {
    projectName: wp.projectName,
    tokenAddress: wp.tokenAddress,
    structuralScore: v.structuralScore ?? 0,
    verdict: v.verdict ?? 'INSUFFICIENT_DATA',
    hypeTechRatio: v.hypeTechRatio ?? 0,
    claimCount: v.totalClaims ?? 0,
    claimsMicaCompliance: mica.claimsMicaCompliance,
    micaCompliant: mica.micaCompliant,
    micaSummary: mica.micaSummary,
    generatedAt: iso(v.verifiedAt),
    discoveryStatus: 'cached',
    discoverySourceTier: 0,
    discoveryAttempts: [
      { tier: 0, status: 'cached', structuralScore: v.structuralScore ?? 0, claimCount: v.totalClaims ?? 0 },
    ],
  };
}

export function buildLegitimacyMiss(
  deps: HandlerDeps,
  fallback: { tokenAddress?: string | null; projectName?: string },
): Record<string, unknown> {
  return {
    projectName: fallback.projectName ?? 'Unknown',
    tokenAddress: fallback.tokenAddress ?? null,
    structuralScore: 0,
    verdict: 'NOT_IN_DATABASE',
    hypeTechRatio: 0,
    claimCount: 0,
    claimsMicaCompliance: 'NOT_MENTIONED',
    micaCompliant: 'NOT_APPLICABLE',
    micaSummary: 'Project not found in the Grey verification cache.',
    generatedAt: iso(deps.clock()),
  };
}

// ── tier 0: legitimacy_scan_trust_rung (E1-C, $0.10 CACHE_ONLY — BUILT BUT BLOCKED) ──
// A cheap teaser of the tier-1 verdict, read from the SAME cache row legitimacy_scan reads —
// never a live-compute path (this offering is not in ComputeOfferingSlug; cacheOrLive cannot even
// be called with it). Reduced field set on purpose: it's meant to make the $0.25 offering's value
// self-evident, not substitute for it.

export function buildTrustRungHit(wp: WhitepaperRow, v: VerificationRow): Record<string, unknown> {
  return {
    projectName: wp.projectName,
    tokenAddress: wp.tokenAddress,
    verdict: v.verdict ?? 'INSUFFICIENT_DATA',
    generatedAt: iso(v.verifiedAt),
    note: 'Cache-only teaser — see legitimacy_scan for the full structural read.',
  };
}

export function buildTrustRungMiss(
  deps: HandlerDeps,
  fallback: { tokenAddress?: string | null; projectName?: string },
): Record<string, unknown> {
  return {
    projectName: fallback.projectName ?? 'Unknown',
    tokenAddress: fallback.tokenAddress ?? null,
    verdict: 'NOT_IN_DATABASE',
    generatedAt: iso(deps.clock()),
    note: 'Project not found in the Grey verification cache.',
  };
}

// ── tier 2: verify_whitepaper (legitimacy + claims) ──

export function buildVerifyWhitepaperHit(
  wp: WhitepaperRow,
  v: VerificationRow,
  claims: ClaimRow[],
): Record<string, unknown> {
  const categories = new Set(claims.map((c) => c.category));
  return {
    ...buildLegitimacyHit(wp, v),
    claimCount: claims.length,
    claims: mapClaims(claims),
    claimScores: claimScoresFrom(claims),
    logicSummary: logicSummaryFrom(claims.length, v.verifiedClaims ?? 0, v.hypeTechRatio ?? 0, categories.size),
  };
}

export function buildVerifyWhitepaperMiss(
  deps: HandlerDeps,
  fallback: { tokenAddress?: string | null; projectName?: string },
): Record<string, unknown> {
  return {
    ...buildLegitimacyMiss(deps, fallback),
    claims: [],
    claimScores: {},
    logicSummary: 'No cached verification for this project.',
  };
}

// ── tier 3: verify_full_tech (verify_whitepaper + L3) ──

export function buildVerifyFullTechHit(
  wp: WhitepaperRow,
  v: VerificationRow,
  claims: ClaimRow[],
): Record<string, unknown> {
  return {
    ...buildVerifyWhitepaperHit(wp, v, claims),
    confidenceScore: v.confidenceScore ?? 0,
    evaluations: evaluationsFrom(claims),
    focusAreaScores: v.focusAreaScores ?? {},
    llmTokensUsed: v.llmTokensUsed ?? 0,
    computeCostUsd: v.computeCostUsd ?? 0,
  };
}

export function buildVerifyFullTechMiss(
  deps: HandlerDeps,
  fallback: { tokenAddress?: string | null; projectName?: string },
): Record<string, unknown> {
  return {
    ...buildVerifyWhitepaperMiss(deps, fallback),
    confidenceScore: 0,
    evaluations: [],
    focusAreaScores: {},
    llmTokensUsed: 0,
    computeCostUsd: 0,
  };
}
