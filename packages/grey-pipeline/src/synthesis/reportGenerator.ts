// grey-pipeline — ReportGenerator.
// Ported verbatim from plugin-wpv/src/verification/ReportGenerator.ts. Pure; no
// ElizaOS. Generates tiered JSON reports (Legitimacy → Tokenomics → Full → Daily).

import type {
  VerificationResult,
  StructuralAnalysis,
  WhitepaperRecord,
  ExtractedClaim,
  ClaimEvaluation,
  LegitimacyScanReport,
  TokenomicsAuditReport,
  FullVerificationReport,
  DailyBriefingReport,
  DiscoveryStatus,
  DiscoveryAttempt,
  Verdict,
  MicaClaimStatus,
  MicaComplianceStatus,
} from '@grey/schemas';
import { KNOWN_PROTOCOL_PATTERN } from '../constants/protocols';

export interface DiscoveryProvenance {
  discoveryStatus: DiscoveryStatus;
  discoverySourceTier: number | null;
  discoveryAttempts: DiscoveryAttempt[];
}

const REGULATORY_PORTAL_NOTE =
  ' Note: ESMA register / national CASP filings / NCA portals were not consulted for this assessment — known protocols operating without explicit MiCA registration carry residual regulatory uncertainty.';

function adjustVerdictForMicaDiscrepancy(
  verdict: Verdict,
  claimsMica: MicaClaimStatus,
  micaCompliant: MicaComplianceStatus,
  structuralScore: number,
  projectName?: string,
): { verdict: Verdict; micaSummaryAppend?: string } {
  if (verdict !== ('PASS' as Verdict)) return { verdict }; // only ever downgrade PASS

  if (claimsMica === 'YES' && micaCompliant !== 'YES') {
    if (micaCompliant === 'NO') {
      return { verdict: structuralScore <= 3 ? ('FAIL' as Verdict) : ('CONDITIONAL' as Verdict) };
    }
    if (micaCompliant === 'PARTIAL') {
      return { verdict: 'CONDITIONAL' as Verdict };
    }
  }

  // Path B: KNOWN protocol that doesn't mention MiCA but also doesn't qualify
  if (
    claimsMica === 'NOT_MENTIONED' &&
    micaCompliant === 'NO' &&
    projectName &&
    KNOWN_PROTOCOL_PATTERN.test(projectName)
  ) {
    return { verdict: 'CONDITIONAL' as Verdict, micaSummaryAppend: REGULATORY_PORTAL_NOTE };
  }

  return { verdict };
}

export class ReportGenerator {
  generateLegitimacyScan(
    verification: VerificationResult,
    analysis: StructuralAnalysis,
    wp: WhitepaperRecord,
    provenance?: DiscoveryProvenance,
  ): LegitimacyScanReport {
    const claimsMica = analysis.mica?.claimsMicaCompliance ?? 'NOT_MENTIONED';
    const micaCompliant = analysis.mica?.micaCompliant ?? 'NO';
    const { verdict: adjustedVerdict, micaSummaryAppend } = adjustVerdictForMicaDiscrepancy(
      verification.verdict,
      claimsMica,
      micaCompliant,
      verification.structuralScore,
      wp.projectName,
    );

    const baseSummary = analysis.mica?.micaSummary ?? '';
    const finalSummary = micaSummaryAppend ? `${baseSummary}${micaSummaryAppend}` : baseSummary;

    const base: LegitimacyScanReport = {
      projectName: wp.projectName,
      tokenAddress: wp.tokenAddress,
      structuralScore: verification.structuralScore,
      verdict: adjustedVerdict,
      hypeTechRatio: verification.hypeTechRatio,
      claimCount: verification.totalClaims,
      claimsMicaCompliance: claimsMica,
      micaCompliant: micaCompliant,
      micaSummary: finalSummary,
      generatedAt: new Date().toISOString(),
    };
    if (provenance) {
      base.discoveryStatus = provenance.discoveryStatus;
      base.discoverySourceTier = provenance.discoverySourceTier;
      base.discoveryAttempts = provenance.discoveryAttempts;
    }
    return base;
  }

  generateTokenomicsAudit(
    verification: VerificationResult,
    claims: ExtractedClaim[],
    wp: WhitepaperRecord,
    claimScores?: Map<string, number>,
    analysis?: StructuralAnalysis,
  ): TokenomicsAuditReport {
    const scan = this.generateLegitimacyScan(
      verification,
      analysis ?? ({} as StructuralAnalysis),
      wp,
    );

    const scores: Record<string, number> = {};
    if (claimScores) {
      for (const [id, score] of claimScores) {
        scores[id] = score;
      }
    }

    // Fix 6 (2026-04-24): derive claimCount from the actual claims array, not the
    // cached verification.totalClaims. The L2 enrichment path can produce a claims
    // array longer than the stored totalClaims.
    return {
      ...scan,
      claimCount: claims.length,
      claims,
      claimScores: scores,
      logicSummary: this.generateLogicSummary(claims, verification),
    };
  }

  generateFullVerification(
    verification: VerificationResult,
    claims: ExtractedClaim[],
    evaluations: ClaimEvaluation[],
    wp: WhitepaperRecord,
    claimScores?: Map<string, number>,
    analysis?: StructuralAnalysis,
  ): FullVerificationReport {
    const audit = this.generateTokenomicsAudit(verification, claims, wp, claimScores, analysis);

    // Transform focusAreaScores keys to lowercase for ACP deliverable compliance.
    // Preserve null for absent categories (vs. 0 which misleadingly implies "scored but failed").
    const lowercaseScores: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(verification.focusAreaScores)) {
      lowercaseScores[key.toLowerCase()] = value;
    }

    return {
      ...audit,
      confidenceScore: verification.confidenceScore,
      evaluations,
      focusAreaScores: lowercaseScores,
      llmTokensUsed: verification.llmTokensUsed,
      computeCostUsd: verification.computeCostUsd,
    };
  }

  generateDailyBriefing(reports: FullVerificationReport[]): DailyBriefingReport {
    return {
      date: new Date().toISOString().split('T')[0],
      totalVerified: reports.length,
      whitepapers: reports,
    };
  }

  private generateLogicSummary(claims: ExtractedClaim[], verification: VerificationResult): string {
    const categories = new Set(claims.map((c) => c.category));
    const parts: string[] = [];

    // Fix 6 (2026-04-24): use claims.length (actual array size) for extracted-count text.
    const extracted = claims.length;
    const verified = Math.min(verification.verifiedClaims, extracted);

    parts.push(`${extracted} claims extracted across ${categories.size} categories.`);

    if (verified > 0) {
      parts.push(`${verified}/${extracted} claims verified.`);
    }

    if (verification.hypeTechRatio > 3.0) {
      parts.push('WARNING: High hype-to-tech ratio detected.');
    }

    return parts.join(' ');
  }
}
