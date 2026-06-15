// @grey/schemas — shared domain types for the verification pipeline.
// Movement 2: promoted from @grey/pipeline/src/types.ts (was M1 ported from plugin-wpv).
// Anti-cycle constraint: this package MUST NOT import from @grey/pipeline.

// ── Enums ────────────────────────────────────

export enum WhitepaperStatus {
  DISCOVERED = 'DISCOVERED',
  INGESTED = 'INGESTED',
  VERIFYING = 'VERIFYING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
}

export enum ClaimCategory {
  TOKENOMICS = 'TOKENOMICS',
  PERFORMANCE = 'PERFORMANCE',
  CONSENSUS = 'CONSENSUS',
  SCIENTIFIC = 'SCIENTIFIC',
}

export enum Verdict {
  PASS = 'PASS',
  CONDITIONAL = 'CONDITIONAL',
  FAIL = 'FAIL',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  NOT_IN_DATABASE = 'NOT_IN_DATABASE',
}

export enum MathValidity {
  VALID = 'VALID',
  FLAWED = 'FLAWED',
  UNVERIFIABLE = 'UNVERIFIABLE',
}
export enum Plausibility {
  HIGH = 'HIGH',
  LOW = 'LOW',
  OUTLIER = 'OUTLIER',
}
export enum Originality {
  NOVEL = 'NOVEL',
  DERIVATIVE = 'DERIVATIVE',
  PLAGIARIZED = 'PLAGIARIZED',
}
export enum Consistency {
  CONSISTENT = 'CONSISTENT',
  CONTRADICTED = 'CONTRADICTED',
}

// ── Core data interfaces ─────────────────────

export interface WhitepaperRecord {
  id: string;
  projectName: string;
  tokenAddress: string | null;
  chain: string;
  documentUrl: string;
  ipfsCid: string | null;
  knowledgeItemId: string | null;
  pageCount: number;
  ingestedAt: Date;
  status: WhitepaperStatus;
  selectionScore: number;
  metadataJson: Record<string, unknown>;
}

export interface ExtractedClaim {
  claimId: string;
  category: ClaimCategory;
  claimText: string;
  statedEvidence: string;
  mathematicalProofPresent: boolean;
  sourceSection: string;
  /** True if the claim relates to regulatory compliance (MiCA, KYC/AML, ESMA, etc.) */
  regulatoryRelevance: boolean;
}

export interface ClaimEvaluation {
  claimId: string;
  mathValidity?: MathValidity;
  benchmarkDelta?: number;
  plausibility?: Plausibility;
  citationSupportsClaim?: boolean | null;
  originality?: Originality;
  consistency?: Consistency;
}

export type MicaClaimStatus = 'YES' | 'NO' | 'NOT_MENTIONED';
export type MicaComplianceStatus = 'YES' | 'NO' | 'PARTIAL' | 'NOT_APPLICABLE';

export interface MicaAnalysis {
  claimsMicaCompliance: MicaClaimStatus;
  micaCompliant: MicaComplianceStatus;
  micaSummary: string;
  /** Which of the 7 required MiCA sections were found */
  micaSectionsFound: string[];
  /** Which of the 7 required MiCA sections are missing */
  micaSectionsMissing: string[];
}

export interface StructuralAnalysis {
  hasAbstract: boolean;
  hasMethodology: boolean;
  hasTokenomics: boolean;
  hasReferences: boolean;
  citationCount: number;
  verifiedCitationRatio: number;
  hasMath: boolean;
  mathDensityScore: number;
  coherenceScore: number;
  similarityTopMatch: string | null;
  similarityScore: number;
  hasAuthors: boolean;
  hasDates: boolean;
  mica: MicaAnalysis;
}

export interface VerificationResult {
  structuralScore: number; // 0–5 (0 = not analyzed, 1–5 = real score)
  confidenceScore: number; // 0–100
  hypeTechRatio: number;
  verdict: Verdict;
  focusAreaScores: Record<ClaimCategory, number | null>; // null = no claims in that category
  totalClaims: number;
  verifiedClaims: number;
  llmTokensUsed: number;
  computeCostUsd: number;
}

// ── Content resolution (for DocsSiteCrawler) ─

export interface ResolvedContent {
  text: string;
  contentType: string;
  source: string;
  resolvedUrl: string;
  pageCount?: number;
  diagnostics: string[];
}

// ── Report interfaces (tiered — each a superset of the one below) ──

/**
 * Tier selection outcome, user-facing label in the deliverable.
 * Maps to tiers 0-4, or "failed" when all tiers exhausted.
 */
export type DiscoveryStatus =
  | 'cached'
  | 'provided'
  | 'primary'
  | 'community'
  | 'aggregator'
  | 'failed';

/** Per-tier record for the `discoveryAttempts` array in deliverables */
export interface DiscoveryAttempt {
  tier: number; // 0..4
  status: DiscoveryStatus | 'skipped' | 'error';
  structuralScore?: number;
  claimCount?: number;
  note?: string;
}

export interface LegitimacyScanReport {
  projectName: string;
  tokenAddress: string | null;
  structuralScore: number; // 0–5 (0 = not analyzed / NOT_IN_DATABASE)
  verdict: Verdict;
  hypeTechRatio: number;
  claimCount: number;
  claimsMicaCompliance: MicaClaimStatus;
  micaCompliant: MicaComplianceStatus;
  micaSummary: string;
  generatedAt: string; // ISO timestamp
  discoveryStatus?: DiscoveryStatus;
  discoverySourceTier?: number | null;
  discoveryAttempts?: DiscoveryAttempt[];
}

export interface TokenomicsAuditReport extends LegitimacyScanReport {
  claims: ExtractedClaim[];
  claimScores: Record<string, number>; // claimId → score
  logicSummary: string;
}

export interface FullVerificationReport extends TokenomicsAuditReport {
  confidenceScore: number; // 0–100
  evaluations: ClaimEvaluation[];
  focusAreaScores: Record<string, number | null>; // lowercase keys; null = category absent
  llmTokensUsed: number;
  computeCostUsd: number;
  discoveryStatus?: DiscoveryStatus;
  discoverySourceTier?: number | null;
  discoveryAttempts?: DiscoveryAttempt[];
}

export interface DailyBriefingReport {
  date: string;
  totalVerified: number;
  whitepapers: FullVerificationReport[];
}

// ── Score weights (configurable) ─────────────

export interface ScoreWeights {
  mathValidity: number; // default 0.35
  benchmarks: number; // default 0.20
  citations: number; // default 0.20
  originality: number; // default 0.15
  consistency: number; // default 0.10
}

// ── M3 (Q6/FDQ-9): offering slug taxonomy + ResponseFor<O> type map ──
// Additive type-only re-export (verbatimModuleSyntax: true, Invariant 7). Does NOT modify any
// existing M2-promoted type above (bug-preservation).
export type { OfferingSlug, ResponseFor } from './responses/types';
