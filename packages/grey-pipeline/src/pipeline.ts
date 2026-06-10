// grey-pipeline — stage functions (FWD-4) + composition.
// Each stage is an individually-callable async function taking (input, deps), so
// Movement 3's grey-core room loop can expose them as ACP availableTools(). The
// classes do the work (ported verbatim from plugin-wpv); these are thin wrappers.
// runFullPipeline is plain sequential composition + persistence (the orchestration
// plugin-wpv did inside its ElizaOS service, authored fresh here — no ported logic).

import type { PipelineDeps } from './deps';
import type {
  StructuralAnalysis,
  ExtractedClaim,
  ClaimEvaluation,
  VerificationResult,
  WhitepaperRecord,
  FullVerificationReport,
} from './types';
import { WhitepaperStatus } from './types';
import { GREY_MODEL, LLM_PRICING } from './constants';
import { StructuralAnalyzer } from './structural/structuralAnalyzer';
import { ClaimExtractor } from './extraction/claimExtractor';
import { ClaimEvaluator } from './evaluation/claimEvaluator';
import { ScoreAggregator } from './synthesis/scoreAggregator';
import { ReportGenerator } from './synthesis/reportGenerator';
import {
  WhitepapersRepo,
  VerificationsRepo,
  ClaimsRepo,
  RequestsRepo,
  CostEventsRepo,
} from './persistence/repositories';

// ── L1: structural ───────────────────────────

export interface AnalyzeStructureInput {
  text: string;
  pageCount?: number;
}
export interface AnalyzeStructureOutput {
  analysis: StructuralAnalysis;
  structuralScore: number;
  hypeTechRatio: number;
}

export async function analyzeStructure(
  input: AnalyzeStructureInput,
  _deps: PipelineDeps,
): Promise<AnalyzeStructureOutput> {
  const analyzer = new StructuralAnalyzer();
  const analysis = await analyzer.analyze(input.text, input.pageCount ?? 0);
  return {
    analysis,
    structuralScore: analyzer.computeQuickFilterScore(analysis),
    hypeTechRatio: analyzer.computeHypeTechRatio(input.text),
  };
}

// ── L2: extraction ───────────────────────────

export interface ExtractClaimsInput {
  text: string;
  projectName: string;
  requirementText?: string | null;
}

export async function extractClaims(
  input: ExtractClaimsInput,
  deps: PipelineDeps,
): Promise<ExtractedClaim[]> {
  const extractor = new ClaimExtractor({
    client: deps.anthropic,
    costTracker: deps.cost,
    model: deps.model,
  });
  return extractor.extractClaims(input.text, input.projectName, {
    requirementText: input.requirementText ?? null,
  });
}

// ── L3: evaluation ───────────────────────────

export interface EvaluateClaimsInput {
  claims: ExtractedClaim[];
  text: string;
  requirementText?: string | null;
}
export interface EvaluateClaimsOutput {
  evaluations: ClaimEvaluation[];
  scores: Map<string, number>;
}

export async function evaluateClaims(
  input: EvaluateClaimsInput,
  deps: PipelineDeps,
): Promise<EvaluateClaimsOutput> {
  const evaluator = new ClaimEvaluator({
    client: deps.anthropic,
    costTracker: deps.cost,
    model: deps.model,
    semanticScholar: deps.semanticScholar,
  });
  return evaluator.evaluateAll(input.claims, input.text, {
    requirementText: input.requirementText ?? null,
  });
}

// ── Synthesis (pure) ─────────────────────────

export interface SynthesizeInput {
  analysis: StructuralAnalysis;
  structuralScore: number;
  hypeTechRatio: number;
  claims: ExtractedClaim[];
  evaluations: ClaimEvaluation[];
  scores: Map<string, number>;
  whitepaper: WhitepaperRecord;
  llmTokensUsed: number;
  computeCostUsd: number;
}
export interface SynthesizeOutput {
  verification: VerificationResult;
  report: FullVerificationReport;
}

export function synthesize(input: SynthesizeInput): SynthesizeOutput {
  const aggregator = new ScoreAggregator();
  const claimScores = input.claims.map((c) => ({
    category: c.category,
    score: input.scores.get(c.claimId) ?? 0,
  }));
  const { confidenceScore, focusAreaScores, verdict } = aggregator.aggregate(claimScores);

  const verification: VerificationResult = {
    structuralScore: input.structuralScore,
    confidenceScore,
    hypeTechRatio: input.hypeTechRatio,
    verdict,
    focusAreaScores,
    totalClaims: input.claims.length,
    verifiedClaims: input.evaluations.length,
    llmTokensUsed: input.llmTokensUsed,
    computeCostUsd: input.computeCostUsd,
  };

  const reportGen = new ReportGenerator();
  const report = reportGen.generateFullVerification(
    verification,
    input.claims,
    input.evaluations,
    input.whitepaper,
    input.scores,
    input.analysis,
  );

  return { verification, report };
}

// ── Composition ──────────────────────────────

export interface RunFullPipelineInput {
  projectName: string;
  text: string;
  tokenAddress?: string | null;
  chain?: string;
  documentUrl?: string;
  offering?: string;
  requirementText?: string | null;
  pageCount?: number;
}

/**
 * Run the full L1→L2→L3→synthesis pipeline and persist to grey_two.
 * Writes: requests (1), whitepapers (1), verifications (1), claims (N), cost_events
 * (per stage). Per-stage token deltas come from the shared CostTracker.
 */
export async function runFullPipeline(
  input: RunFullPipelineInput,
  deps: PipelineDeps,
): Promise<FullVerificationReport> {
  const requestsRepo = new RequestsRepo(deps.db);
  const whitepapersRepo = new WhitepapersRepo(deps.db);
  const verificationsRepo = new VerificationsRepo(deps.db);
  const claimsRepo = new ClaimsRepo(deps.db);
  const costEventsRepo = new CostEventsRepo(deps.db);

  deps.cost.reset();

  const request = await requestsRepo.create({
    offering: input.offering ?? 'verify_full_tech',
    subject: { tokenAddress: input.tokenAddress ?? null, projectName: input.projectName },
  });

  try {
    // L1 — structural (no LLM)
    const { analysis, structuralScore, hypeTechRatio } = await analyzeStructure(
      { text: input.text, pageCount: input.pageCount },
      deps,
    );

    // L2 — extraction (token delta)
    const beforeL2 = deps.cost.getTotalTokens();
    const claims = await extractClaims(
      { text: input.text, projectName: input.projectName, requirementText: input.requirementText },
      deps,
    );
    const afterL2 = deps.cost.getTotalTokens();
    const l2In = afterL2.input - beforeL2.input;
    const l2Out = afterL2.output - beforeL2.output;
    const l2Cost = l2In * LLM_PRICING.inputPerToken + l2Out * LLM_PRICING.outputPerToken;

    // L3 — evaluation (token delta)
    const beforeL3 = deps.cost.getTotalTokens();
    const { evaluations, scores } = await evaluateClaims(
      { claims, text: input.text, requirementText: input.requirementText },
      deps,
    );
    const afterL3 = deps.cost.getTotalTokens();
    const l3In = afterL3.input - beforeL3.input;
    const l3Out = afterL3.output - beforeL3.output;
    const l3Cost = l3In * LLM_PRICING.inputPerToken + l3Out * LLM_PRICING.outputPerToken;

    // Persist whitepaper
    const wpRow = await whitepapersRepo.create({
      projectName: input.projectName,
      tokenAddress: input.tokenAddress ?? null,
      chain: input.chain ?? 'base',
      documentUrl: input.documentUrl ?? '',
      pageCount: input.pageCount ?? 0,
      status: WhitepaperStatus.VERIFIED,
    });

    const whitepaper: WhitepaperRecord = {
      id: wpRow.id,
      projectName: wpRow.projectName,
      tokenAddress: wpRow.tokenAddress,
      chain: wpRow.chain,
      documentUrl: wpRow.documentUrl,
      ipfsCid: wpRow.ipfsCid,
      knowledgeItemId: wpRow.knowledgeItemId,
      pageCount: wpRow.pageCount,
      ingestedAt: wpRow.ingestedAt,
      status: wpRow.status as WhitepaperStatus,
      selectionScore: wpRow.selectionScore,
      metadataJson: wpRow.metadataJson ?? {},
    };

    const totals = deps.cost.getTotalTokens();
    const { verification, report } = synthesize({
      analysis,
      structuralScore,
      hypeTechRatio,
      claims,
      evaluations,
      scores,
      whitepaper,
      llmTokensUsed: totals.input + totals.output,
      computeCostUsd: deps.cost.getTotalCostUsd(),
    });

    // Persist verification
    const verRow = await verificationsRepo.create({
      whitepaperId: wpRow.id,
      requestId: request.id,
      structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
      structuralScore: verification.structuralScore,
      confidenceScore: verification.confidenceScore,
      hypeTechRatio: verification.hypeTechRatio,
      // A1: persist the delivered report verdict (post-MiCA-adjustment from
      // ReportGenerator), not the pre-adjustment aggregator verdict, so the
      // verifications column matches report_json.verdict.
      verdict: report.verdict,
      focusAreaScores: report.focusAreaScores,
      totalClaims: verification.totalClaims,
      verifiedClaims: verification.verifiedClaims,
      reportJson: report as unknown as Record<string, unknown>,
      llmTokensUsed: verification.llmTokensUsed,
      computeCostUsd: verification.computeCostUsd,
      triggerSource: 'acp_request',
      cacheHit: false,
      l2InputTokens: l2In,
      l2OutputTokens: l2Out,
      l2CostUsd: l2Cost,
      l3InputTokens: l3In,
      l3OutputTokens: l3Out,
      l3CostUsd: l3Cost,
    });

    // Persist claims
    for (const claim of claims) {
      const evaluation = evaluations.find((e) => e.claimId === claim.claimId) ?? {};
      await claimsRepo.create({
        whitepaperId: wpRow.id,
        category: claim.category,
        claimText: claim.claimText,
        statedEvidence: claim.statedEvidence,
        sourceSection: claim.sourceSection,
        mathProofPresent: claim.mathematicalProofPresent,
        evaluationJson: evaluation as unknown as Record<string, unknown>,
        claimScore: scores.get(claim.claimId) ?? null,
        evaluatedAt: new Date(),
      });
    }

    // Persist cost_events (per-stage granularity; content-free)
    const model = deps.model ?? GREY_MODEL;
    if (l2In > 0 || l2Out > 0) {
      await costEventsRepo.create({
        requestId: request.id,
        verificationId: verRow.id,
        stage: 'l2',
        model,
        inputTokens: l2In,
        outputTokens: l2Out,
        costUsd: l2Cost,
        durationMs: 0,
      });
    }
    if (l3In > 0 || l3Out > 0) {
      await costEventsRepo.create({
        requestId: request.id,
        verificationId: verRow.id,
        stage: 'l3',
        model,
        inputTokens: l3In,
        outputTokens: l3Out,
        costUsd: l3Cost,
        durationMs: 0,
      });
    }

    await requestsRepo.markCompleted(request.id);
    return report;
  } catch (err) {
    await requestsRepo.markFailed(request.id, (err as Error).message);
    throw err;
  }
}
