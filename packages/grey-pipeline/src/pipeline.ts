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
  TokenomicsAuditReport,
  LegitimacyScanReport,
  DiscoveryAttempt,
} from '@grey/schemas';
import { WhitepaperStatus, Verdict, ClaimCategory } from '@grey/schemas';
import type { WhitepaperRow } from './persistence/schema';
import { GREY_MODEL, LLM_PRICING } from './constants';
import { StructuralAnalyzer } from './structural/structuralAnalyzer';
import { ClaimExtractor } from './extraction/claimExtractor';
import { ClaimEvaluator } from './evaluation/claimEvaluator';
import { ScoreAggregator } from './synthesis/scoreAggregator';
import { ReportGenerator } from './synthesis/reportGenerator';
import type { ClaimExtractionReport } from './synthesis/reportGenerator';
import {
  extractVersion,
  hasViolationKeywords,
  normalizeGitHubUrl,
} from './discovery/helpers';
import { resolveTokenName } from './discovery/resolveTokenName';
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
export interface SynthesizeOutput<R = FullVerificationReport> {
  verification: VerificationResult;
  report: R;
}

/**
 * Compose the shared VerificationResult and dispatch to the requested report builder (M3.5 Q1
 * builder-selector / FDQ-8). `builder` defaults to 'full' (FullVerificationReport — verify_full_tech
 * + the daily-briefing/cron path); 'tokenomics' yields the TokenomicsAuditReport verify_whitepaper
 * needs. Overloaded so callers get the precise report type without a union.
 */
export function synthesize(
  input: SynthesizeInput,
  builder?: 'full',
): SynthesizeOutput<FullVerificationReport>;
export function synthesize(
  input: SynthesizeInput,
  builder: 'tokenomics',
): SynthesizeOutput<TokenomicsAuditReport>;
export function synthesize(
  input: SynthesizeInput,
  builder: 'tokenomics' | 'full' = 'full',
): SynthesizeOutput<TokenomicsAuditReport | FullVerificationReport> {
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
  const report =
    builder === 'tokenomics'
      ? reportGen.generateTokenomicsAudit(
          verification,
          input.claims,
          input.whitepaper,
          input.scores,
          input.analysis,
        )
      : reportGen.generateFullVerification(
          verification,
          input.claims,
          input.evaluations,
          input.whitepaper,
          input.scores,
          input.analysis,
        );

  return { verification, report };
}

// ── Composition (M3.5: tier-bounded variants + dedupe-on-address persistence) ──
//
// One depth per function (FDQ-8): runL1 = L1; runL1L2 = L1+L2; runFullPipeline = L1+L2+L3.
// All acquire whitepaper text live from `documentUrl` via deps.cryptoResolver (Q4; no text column)
// and persist via the shared dedupe-on-address upsert (Q6/Q6a — one persistence shape, ported from
// JobRouter runL1L2 510-610). Each returns its offering's report payload; the cacheOrLive caller
// (grey-core) derives the envelope subject from the report's projectName/tokenAddress fields.

/** Drizzle whitepaper row → WhitepaperRecord domain shape the report builders consume. */
function rowToRecord(row: WhitepaperRow): WhitepaperRecord {
  return {
    id: row.id,
    projectName: row.projectName,
    tokenAddress: row.tokenAddress,
    chain: row.chain,
    documentUrl: row.documentUrl,
    ipfsCid: row.ipfsCid,
    knowledgeItemId: row.knowledgeItemId,
    pageCount: row.pageCount,
    ingestedAt: row.ingestedAt,
    status: row.status as WhitepaperStatus,
    selectionScore: row.selectionScore,
    metadataJson: row.metadataJson ?? {},
  };
}

/** In-memory record for violation-keyword names that must NOT be persisted (JobRouter 505-508). */
function tmpRecord(args: {
  projectName: string;
  tokenAddress: string | null;
  chain: string;
  documentUrl: string;
  pageCount: number;
}): WhitepaperRecord {
  return {
    id: `tmp-${Date.now()}`,
    projectName: args.projectName,
    tokenAddress: args.tokenAddress,
    chain: args.chain,
    documentUrl: args.documentUrl,
    ipfsCid: null,
    knowledgeItemId: null,
    pageCount: args.pageCount,
    ingestedAt: new Date(),
    status: WhitepaperStatus.VERIFIED,
    selectionScore: 0,
    metadataJson: {},
  };
}

/** All-categories-null focus map (JobRouter handleLegitimacyScan 458) — L1 has no claim scores. */
function emptyFocusAreaScores(): Record<ClaimCategory, number | null> {
  return {
    [ClaimCategory.TOKENOMICS]: null,
    [ClaimCategory.PERFORMANCE]: null,
    [ClaimCategory.CONSENSUS]: null,
    [ClaimCategory.SCIENTIFIC]: null,
  };
}

/** Default chain inference (JobRouter): EVM 0x → base; else unknown. */
function inferChain(tokenAddress: string | null | undefined, explicit?: string): string {
  return explicit ?? (tokenAddress?.startsWith('0x') ? 'base' : 'unknown');
}

/**
 * Production-parity project-name resolution (§16): when the caller's name is missing/'Unknown'
 * and a token address is present, resolve it via DexScreener/on-chain (JobRouter 1786-1789).
 * Lives in the pipeline (not grey-core) so grey-core never references `resolveTokenName`
 * (invariant #14). Called at the top of each run variant.
 */
async function resolveProjectName(
  rawName: string | undefined,
  tokenAddress: string | null | undefined,
): Promise<string> {
  let projectName = rawName?.trim() ?? '';
  if ((!projectName || projectName === 'Unknown') && tokenAddress) {
    const resolved = await resolveTokenName(tokenAddress);
    if (resolved) projectName = resolved;
  }
  return projectName || 'Unknown';
}

// ── Dedupe decision (pure — unit-tested directly; the DB-touching upsert wraps it) ──

/** Address-path candidate filter: keep only rows in the same version-family as the request. */
export function filterSameVersionFamily<T extends { projectName: string }>(
  rows: T[],
  requestedName: string,
): T[] {
  const requestedVersion = extractVersion(requestedName) ?? '';
  return rows.filter((row) => (extractVersion(row.projectName) ?? '') === requestedVersion);
}

export interface UpsertCandidate {
  id: string;
  projectName: string;
  claimCount: number;
}
export type UpsertDecision =
  | { action: 'reuse'; id: string }
  | { action: 'create'; canonicalName: string; deleteIds: string[] };

/**
 * Decide reuse-vs-create from the merged candidate set (name-path priority, version-filtered
 * address-path, dedup by id). Pure port of JobRouter runL1L2 547-586: the first candidate WITH
 * claims wins; reuse it if it has >= the new claim count, else replace it (preserving its canonical
 * name) — and if no candidate has claims, clean up the stale 0-claim rows and create fresh.
 */
export function chooseWhitepaperUpsert(
  candidates: UpsertCandidate[],
  newClaimCount: number,
  projectName: string,
): UpsertDecision {
  const existingWithClaims = candidates.find((c) => c.claimCount > 0) ?? null;
  if (existingWithClaims && existingWithClaims.claimCount >= newClaimCount) {
    return { action: 'reuse', id: existingWithClaims.id };
  }
  const canonicalName = existingWithClaims ? existingWithClaims.projectName : projectName;
  const deleteIds = existingWithClaims ? [existingWithClaims.id] : candidates.map((c) => c.id);
  return { action: 'create', canonicalName, deleteIds };
}

/** Acquire whitepaper text from a documentUrl (Q4). GitHub blob URLs normalized to raw. */
async function acquireText(
  deps: PipelineDeps,
  documentUrl: string,
): Promise<{ text: string; pageCount: number }> {
  const resolved = await deps.cryptoResolver.resolveWhitepaper(normalizeGitHubUrl(documentUrl));
  return { text: resolved.text, pageCount: resolved.pageCount };
}

/**
 * Dedupe-on-address upsert + claim persistence (Q6/Q6a). Ported from JobRouter runL1L2 510-610:
 * version-family matching via extractVersion, name-path priority, preserve the canonical
 * first-seen name, reuse-or-replace by claim count. Violation-keyword names are never persisted
 * (returns an in-memory tmp record). When creating, claims persist with their evaluation/score
 * data if provided (L3) or just regulatoryRelevance (L2). Returns the resolved WhitepaperRecord.
 */
/**
 * Discovery provenance threaded into persistence (§17). Persisted onto the whitepaper row's
 * `metadata_json` (grey_two has no dedicated discovery columns); undefined → no discovery key.
 * Carried symmetrically with the live response so a row's origin is auditable.
 */
export interface RunMetadata {
  discoveryStatus?: string;
  discoverySourceTier?: string;
  discoveryAttempts?: DiscoveryAttempt[];
}

async function upsertWhitepaperWithClaims(
  deps: PipelineDeps,
  args: {
    projectName: string;
    tokenAddress: string | null;
    chain: string;
    documentUrl: string;
    pageCount: number;
    claims: ExtractedClaim[];
    evaluations?: ClaimEvaluation[];
    scores?: Map<string, number>;
    runMetadata?: RunMetadata;
  },
): Promise<WhitepaperRecord> {
  const { projectName, tokenAddress, chain, documentUrl, pageCount, claims, runMetadata } = args;
  const evaluations = args.evaluations ?? [];
  const scores = args.scores ?? new Map<string, number>();

  if (hasViolationKeywords(projectName)) {
    deps.logger.warn('Skipping cache write — project name contains violation keywords', {
      projectName,
    });
    return tmpRecord({ projectName, tokenAddress, chain, documentUrl, pageCount });
  }

  const whitepapersRepo = new WhitepapersRepo(deps.db);
  const claimsRepo = new ClaimsRepo(deps.db);
  const verificationsRepo = new VerificationsRepo(deps.db);

  // Candidate set: name-path first, then same-version-family address-path (dedupe by id).
  const byName = await whitepapersRepo.findByProjectName(projectName);
  let byAddrCompatible: WhitepaperRow[] = [];
  if (tokenAddress) {
    const byAddr = await whitepapersRepo.findByTokenAddress(tokenAddress);
    byAddrCompatible = filterSameVersionFamily(byAddr, projectName);
  }
  const existing: WhitepaperRow[] = [...byName];
  const seenIds = new Set(existing.map((e) => e.id));
  for (const row of byAddrCompatible) {
    if (!seenIds.has(row.id)) {
      existing.push(row);
      seenIds.add(row.id);
    }
  }

  // Claim counts per candidate (name-path-priority order preserved), then the pure decision.
  const candidates: UpsertCandidate[] = [];
  for (const e of existing) {
    const eClaims = await claimsRepo.findByWhitepaperId(e.id);
    candidates.push({ id: e.id, projectName: e.projectName, claimCount: eClaims.length });
  }
  const decision = chooseWhitepaperUpsert(candidates, claims.length, projectName);

  if (decision.action === 'reuse') {
    const reused = existing.find((e) => e.id === decision.id);
    if (reused) return rowToRecord(reused);
  }

  // Create path — clean up the rows the decision marked for deletion (claims delete is a harmless
  // no-op for 0-claim rows), preserving the canonical first-seen name.
  const canonicalName = decision.action === 'create' ? decision.canonicalName : projectName;
  if (decision.action === 'create') {
    for (const id of decision.deleteIds) {
      await claimsRepo.deleteByWhitepaperId(id);
      await verificationsRepo.deleteByWhitepaperId(id);
      await whitepapersRepo.deleteById(id);
    }
  }

  const wpRow = await whitepapersRepo.create({
    projectName: canonicalName,
    tokenAddress: tokenAddress ?? null,
    chain,
    documentUrl,
    pageCount,
    status: WhitepaperStatus.VERIFIED,
    selectionScore: 0,
    // §17: persist discovery provenance onto metadata_json (grey_two has no dedicated discovery
    // columns). undefined runMetadata → no discovery key (parity with cache-seeded rows).
    metadataJson: runMetadata ? { discovery: { ...runMetadata } } : {},
  });

  for (const claim of claims) {
    const evaluation = evaluations.find((e) => e.claimId === claim.claimId);
    await claimsRepo.create({
      whitepaperId: wpRow.id,
      category: claim.category,
      claimText: claim.claimText,
      statedEvidence: claim.statedEvidence,
      sourceSection: claim.sourceSection,
      mathProofPresent: claim.mathematicalProofPresent,
      evaluationJson: evaluation
        ? (evaluation as unknown as Record<string, unknown>)
        : claim.regulatoryRelevance
          ? { regulatoryRelevance: true }
          : undefined,
      claimScore: scores.get(claim.claimId) ?? null,
      evaluatedAt: scores.has(claim.claimId) ? new Date() : null,
    });
  }

  return rowToRecord(wpRow);
}

// ── runL1 (legitimacy_scan) ──

export interface RunL1Input {
  projectName: string;
  tokenAddress?: string | null;
  chain?: string;
  documentUrl?: string;
}

/**
 * L1-only live compute for legitimacy_scan. Acquires text, runs structural analysis, persists an
 * L1-only verification (triggerSource 'acp_live_l1', 0 claims) via dedupe-upsert, returns the
 * LegitimacyScanReport. Verdict per JobRouter handleLegitimacyScan 427-431
 * (TIER_ROBUST_THRESHOLD.structuralScore = 2).
 */
export async function runL1(
  input: RunL1Input,
  deps: PipelineDeps,
  _opts: { builder: 'legitimacy' } = { builder: 'legitimacy' },
  runMetadata?: RunMetadata,
): Promise<LegitimacyScanReport> {
  deps.cost.reset();
  const projectName = await resolveProjectName(input.projectName, input.tokenAddress);
  const documentUrl = input.documentUrl ?? '';
  const chain = inferChain(input.tokenAddress, input.chain);
  const { text, pageCount } = await acquireText(deps, documentUrl);

  const { analysis, structuralScore, hypeTechRatio } = await analyzeStructure(
    { text, pageCount },
    deps,
  );
  const verdict: Verdict =
    structuralScore < 2
      ? Verdict.INSUFFICIENT_DATA
      : structuralScore >= 3
        ? Verdict.PASS
        : Verdict.CONDITIONAL;

  const whitepaper = await upsertWhitepaperWithClaims(deps, {
    projectName,
    tokenAddress: input.tokenAddress ?? null,
    chain,
    documentUrl,
    runMetadata,
    pageCount,
    claims: [],
  });

  const verification: VerificationResult = {
    structuralScore,
    confidenceScore: 0,
    hypeTechRatio,
    verdict,
    focusAreaScores: emptyFocusAreaScores(),
    totalClaims: 0,
    verifiedClaims: 0,
    llmTokensUsed: 0,
    computeCostUsd: 0,
  };

  if (!whitepaper.id.startsWith('tmp-')) {
    const verificationsRepo = new VerificationsRepo(deps.db);
    await verificationsRepo.deleteByWhitepaperId(whitepaper.id);
    await verificationsRepo.create({
      whitepaperId: whitepaper.id,
      structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
      structuralScore,
      confidenceScore: 0,
      hypeTechRatio,
      verdict,
      totalClaims: 0,
      verifiedClaims: 0,
      llmTokensUsed: 0,
      computeCostUsd: 0,
      triggerSource: 'acp_live_l1',
      cacheHit: false,
    });
  }

  return new ReportGenerator().generateLegitimacyScan(verification, analysis, whitepaper);
}

// ── runL1L2 (claim_extraction) ──

export interface RunL1L2Input {
  projectName: string;
  tokenAddress?: string | null;
  chain?: string;
  documentUrl?: string;
  requirementText?: string | null;
}

/**
 * L1+L2 live compute for claim_extraction (no L3 evaluation). Acquires text, runs structural +
 * claim extraction, persists whitepaper + claims via dedupe-upsert (NO verification row — matches
 * production claim_extraction, which doesn't seed the verify cache), returns the bespoke
 * ClaimExtractionReport.
 */
export async function runL1L2(
  input: RunL1L2Input,
  deps: PipelineDeps,
  _opts: { builder: 'claim_extraction' } = { builder: 'claim_extraction' },
  runMetadata?: RunMetadata,
): Promise<ClaimExtractionReport> {
  deps.cost.reset();
  const projectName = await resolveProjectName(input.projectName, input.tokenAddress);
  const documentUrl = input.documentUrl ?? '';
  const chain = inferChain(input.tokenAddress, input.chain);
  const { text, pageCount } = await acquireText(deps, documentUrl);

  const { analysis, structuralScore, hypeTechRatio } = await analyzeStructure(
    { text, pageCount },
    deps,
  );
  const claims = await extractClaims(
    { text, projectName, requirementText: input.requirementText },
    deps,
  );

  const whitepaper = await upsertWhitepaperWithClaims(deps, {
    projectName,
    tokenAddress: input.tokenAddress ?? null,
    chain,
    runMetadata,
    documentUrl,
    pageCount,
    claims,
  });

  const tokenAddress = whitepaper.tokenAddress ?? input.tokenAddress ?? null;
  return new ReportGenerator().generateClaimExtraction(
    whitepaper,
    analysis,
    structuralScore,
    hypeTechRatio,
    claims,
    tokenAddress,
  );
}

// ── runFullPipeline (verify_whitepaper → tokenomics / verify_full_tech → full) ──

export interface RunFullPipelineInput {
  projectName: string;
  tokenAddress?: string | null;
  chain?: string;
  documentUrl?: string;
  offering?: string;
  requirementText?: string | null;
}

/**
 * Run the full L1→L2→L3→synthesis pipeline and persist to grey_two (retrofitted M3.5: text
 * acquired from documentUrl; whitepaper + claims via dedupe-on-address upsert; builder selects the
 * report — 'tokenomics' for verify_whitepaper, 'full' for verify_full_tech). Writes: requests (1),
 * whitepapers (1, upsert), verifications (1), claims (N), cost_events (per stage). Per-stage token
 * deltas come from the shared CostTracker. MiCA guard: persists the post-adjustment report.verdict.
 */
export async function runFullPipeline(
  input: RunFullPipelineInput,
  deps: PipelineDeps,
  opts?: { builder?: 'full' },
  runMetadata?: RunMetadata,
): Promise<FullVerificationReport>;
export async function runFullPipeline(
  input: RunFullPipelineInput,
  deps: PipelineDeps,
  opts: { builder: 'tokenomics' },
  runMetadata?: RunMetadata,
): Promise<TokenomicsAuditReport>;
export async function runFullPipeline(
  input: RunFullPipelineInput,
  deps: PipelineDeps,
  opts: { builder?: 'tokenomics' | 'full' } = {},
  runMetadata?: RunMetadata,
): Promise<TokenomicsAuditReport | FullVerificationReport> {
  const builder = opts.builder ?? 'full';
  const requestsRepo = new RequestsRepo(deps.db);
  const verificationsRepo = new VerificationsRepo(deps.db);
  const costEventsRepo = new CostEventsRepo(deps.db);

  deps.cost.reset();
  const projectName = await resolveProjectName(input.projectName, input.tokenAddress);

  const request = await requestsRepo.create({
    offering: input.offering ?? (builder === 'tokenomics' ? 'verify_whitepaper' : 'verify_full_tech'),
    subject: { tokenAddress: input.tokenAddress ?? null, projectName },
  });

  try {
    const documentUrl = input.documentUrl ?? '';
    const chain = inferChain(input.tokenAddress, input.chain);
    const { text, pageCount } = await acquireText(deps, documentUrl);

    // L1 — structural (no LLM)
    const { analysis, structuralScore, hypeTechRatio } = await analyzeStructure(
      { text, pageCount },
      deps,
    );

    // L2 — extraction (token delta)
    const beforeL2 = deps.cost.getTotalTokens();
    const claims = await extractClaims(
      { text, projectName, requirementText: input.requirementText },
      deps,
    );
    const afterL2 = deps.cost.getTotalTokens();
    const l2In = afterL2.input - beforeL2.input;
    const l2Out = afterL2.output - beforeL2.output;
    const l2Cost = l2In * LLM_PRICING.inputPerToken + l2Out * LLM_PRICING.outputPerToken;

    // L3 — evaluation (token delta)
    const beforeL3 = deps.cost.getTotalTokens();
    const { evaluations, scores } = await evaluateClaims(
      { claims, text, requirementText: input.requirementText },
      deps,
    );
    const afterL3 = deps.cost.getTotalTokens();
    const l3In = afterL3.input - beforeL3.input;
    const l3Out = afterL3.output - beforeL3.output;
    const l3Cost = l3In * LLM_PRICING.inputPerToken + l3Out * LLM_PRICING.outputPerToken;

    // Persist whitepaper + claims (dedupe-on-address upsert; per-tier, after L2/L3 complete).
    const whitepaper = await upsertWhitepaperWithClaims(deps, {
      projectName,
      tokenAddress: input.tokenAddress ?? null,
      chain,
      documentUrl,
      pageCount,
      claims,
      evaluations,
      scores,
      runMetadata,
    });

    const totals = deps.cost.getTotalTokens();
    const synthInput = {
      analysis,
      structuralScore,
      hypeTechRatio,
      claims,
      evaluations,
      scores,
      whitepaper,
      llmTokensUsed: totals.input + totals.output,
      computeCostUsd: deps.cost.getTotalCostUsd(),
    };
    const { verification, report } =
      builder === 'tokenomics'
        ? synthesize(synthInput, 'tokenomics')
        : synthesize(synthInput, 'full');

    // Lowercase the focus-area scores for the verification column (builder-independent; matches
    // the ACP deliverable keys + grey-core cache-read expectations).
    const focusAreaScores: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(verification.focusAreaScores)) {
      focusAreaScores[k.toLowerCase()] = v;
    }

    // Persist verification + cost_events (skip for non-persisted tmp/violation names).
    if (!whitepaper.id.startsWith('tmp-')) {
      await verificationsRepo.deleteByWhitepaperId(whitepaper.id);
      const verRow = await verificationsRepo.create({
        whitepaperId: whitepaper.id,
        requestId: request.id,
        structuralAnalysisJson: analysis as unknown as Record<string, unknown>,
        structuralScore: verification.structuralScore,
        confidenceScore: verification.confidenceScore,
        hypeTechRatio: verification.hypeTechRatio,
        // A1: persist the delivered report verdict (post-MiCA-adjustment), not the
        // pre-adjustment aggregator verdict, so the column matches report_json.verdict.
        verdict: report.verdict,
        focusAreaScores,
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
    }

    await requestsRepo.markCompleted(request.id);
    return report;
  } catch (err) {
    await requestsRepo.markFailed(request.id, (err as Error).message);
    throw err;
  }
}
