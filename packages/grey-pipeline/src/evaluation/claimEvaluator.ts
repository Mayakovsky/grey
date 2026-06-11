// grey-pipeline — ClaimEvaluator (Layer 3).
// Ported from plugin-wpv/src/verification/ClaimEvaluator.ts. Five evaluation methods
// (math sanity via LLM, benchmark, citation via SemanticScholar, originality, consistency).
// Only imports repointed + WPV_MODEL→GREY_MODEL (D-MODEL); the unused originality stub
// param is underscored. Prompts, tools, parsing, and scoring are verbatim.

import type {
  ExtractedClaim,
  ClaimEvaluation,
  MathValidity,
  Plausibility,
  Originality,
  Consistency,
} from '../types';
import type { CostTracker } from '../telemetry/costTracker';
import type { AnthropicClient } from '../clients/anthropic';
import { GREY_MODEL } from '../constants';
import { createLogger } from '../logger';

const log = createLogger({ operation: 'ClaimEvaluator' });

/** Minimal SemanticScholar interface for testability */
export interface SemanticScholarClient {
  lookupPaper(paperId: string): Promise<{ title: string; citationCount: number } | null>;
}

export class ClaimEvaluator {
  private client: AnthropicClient;
  private semanticScholar: SemanticScholarClient | null;
  private costTracker: CostTracker;
  private model: string;

  constructor(deps: {
    client: AnthropicClient;
    semanticScholar?: SemanticScholarClient;
    costTracker: CostTracker;
    model?: string;
  }) {
    this.client = deps.client;
    this.semanticScholar = deps.semanticScholar ?? null;
    this.costTracker = deps.costTracker;
    this.model = deps.model ?? GREY_MODEL;
  }

  /** Evaluate a single claim across all applicable methods. */
  async evaluateClaim(
    claim: ExtractedClaim,
    fullText: string,
    requirementText?: string | null,
    tracker?: CostTracker,
  ): Promise<ClaimEvaluation> {
    const evaluation: ClaimEvaluation = { claimId: claim.claimId };

    try {
      // Math sanity — triggers on proof present OR requirement-requested math analysis
      const requiresMathAnalysis = requirementText
        ? /\b(math|formula|quantitative|calcul|equation|model|simulat|stress.?test|volatil)/i.test(
            requirementText,
          )
        : false;

      if (
        claim.mathematicalProofPresent ||
        (requiresMathAnalysis && this.hasQuantitativeContent(claim))
      ) {
        evaluation.mathValidity = await this.evaluateMathSanity(
          claim,
          fullText,
          requirementText,
          tracker,
        );
      }

      // Benchmark comparison
      evaluation.benchmarkDelta = this.evaluateBenchmark(claim);
      evaluation.plausibility = this.derivePlausibility(evaluation.benchmarkDelta);

      // Citation verification
      if (claim.statedEvidence) {
        evaluation.citationSupportsClaim = await this.evaluateCitations(claim);
      }

      // Originality
      evaluation.originality = this.evaluateOriginality(claim);
    } catch (err) {
      log.warn('Claim evaluation partial failure', { claimId: claim.claimId }, err);
    }

    return evaluation;
  }

  /**
   * Evaluate consistency across ALL claims (batch operation).
   * Checks for contradictions in the claim set.
   */
  async evaluateConsistency(
    claims: ExtractedClaim[],
    tracker?: CostTracker,
  ): Promise<Map<string, Consistency>> {
    const result = new Map<string, Consistency>();

    if (claims.length < 2) {
      for (const c of claims) {
        result.set(c.claimId, 'CONSISTENT' as Consistency);
      }
      return result;
    }

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: `You are checking claims for internal contradictions. Return a JSON array where each element has claimId (string) and consistent (boolean). A claim is inconsistent if it contradicts another claim in the set.`,
        messages: [
          {
            role: 'user',
            content: `Check these claims for contradictions:\n${claims
              .map((c) => `[${c.claimId}] ${c.claimText}`)
              .join('\n')}`,
          },
        ],
        tools: [
          {
            name: 'report_consistency',
            description: 'Report consistency check results',
            input_schema: {
              type: 'object',
              properties: {
                results: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      claimId: { type: 'string' },
                      consistent: { type: 'boolean' },
                    },
                    required: ['claimId', 'consistent'],
                  },
                },
              },
              required: ['results'],
            },
          },
        ],
      });

      (tracker ?? this.costTracker).recordUsage(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      // Parse response
      for (const block of response.content) {
        if (block.type === 'tool_use' && block.input) {
          const input = block.input as { results?: { claimId: string; consistent: boolean }[] };
          if (Array.isArray(input.results)) {
            for (const r of input.results) {
              result.set(
                r.claimId,
                r.consistent ? ('CONSISTENT' as Consistency) : ('CONTRADICTED' as Consistency),
              );
            }
          }
        }
      }
    } catch (err) {
      log.warn('Consistency check failed', {}, err);
    }

    // Default to CONSISTENT for any missing claims
    for (const c of claims) {
      if (!result.has(c.claimId)) {
        result.set(c.claimId, 'CONSISTENT' as Consistency);
      }
    }

    return result;
  }

  /**
   * Convenience: run full evaluation pipeline for a claim set.
   * Evaluates each claim individually, then runs consistency as a final pass.
   */
  async evaluateAll(
    claims: ExtractedClaim[],
    fullText: string,
    options?: { requirementText?: string | null; costTracker?: CostTracker },
  ): Promise<{
    evaluations: ClaimEvaluation[];
    scores: Map<string, number>;
  }> {
    const requirementText = options?.requirementText ?? null;
    const tracker = options?.costTracker ?? this.costTracker;

    // Individual evaluations
    const evaluations: ClaimEvaluation[] = [];
    for (const claim of claims) {
      const evaluation = await this.evaluateClaim(claim, fullText, requirementText, tracker);
      evaluations.push(evaluation);
    }

    // Batch consistency check (runs AFTER individual evaluations)
    const consistencyMap = await this.evaluateConsistency(claims, tracker);

    // Merge consistency into evaluations
    for (const evaluation of evaluations) {
      evaluation.consistency = consistencyMap.get(evaluation.claimId);
    }

    // Compute per-claim scores
    const scores = new Map<string, number>();
    for (const evaluation of evaluations) {
      scores.set(evaluation.claimId, this.computeClaimScore(evaluation));
    }

    return { evaluations, scores };
  }

  // ── Private evaluation methods ─────────────

  private hasQuantitativeContent(claim: ExtractedClaim): boolean {
    return /\d+%|\d+\.\d+|formula|equation|ratio|delta|hedge|rate|collateral|threshold|margin/i.test(
      claim.claimText + ' ' + claim.statedEvidence,
    );
  }

  private async evaluateMathSanity(
    claim: ExtractedClaim,
    fullText: string,
    requirementText?: string | null,
    tracker?: CostTracker,
  ): Promise<MathValidity> {
    const system = requirementText
      ? `You are a mathematical auditor for DeFi protocols. The buyer requested: "${requirementText}". Evaluate the mathematical validity of this claim in that context. Analyze whether the quantitative assertions hold and whether the mathematical model is sound. Reply with VALID, FLAWED, or UNVERIFIABLE, and explain your reasoning.`
      : 'Evaluate whether the mathematical proof in the document supports the claim. Reply with VALID, FLAWED, or UNVERIFIABLE.';

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system,
        messages: [
          {
            role: 'user',
            content: `Claim: ${claim.claimText}\nEvidence: ${claim.statedEvidence}\n\nRelevant text excerpt:\n${fullText.slice(0, 10000)}`,
          },
        ],
        tools: [
          {
            name: 'math_verdict',
            description: 'Report math validity',
            input_schema: {
              type: 'object',
              properties: {
                validity: { type: 'string', enum: ['VALID', 'FLAWED', 'UNVERIFIABLE'] },
              },
              required: ['validity'],
            },
          },
        ],
      });

      (tracker ?? this.costTracker).recordUsage(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      for (const block of response.content) {
        if (block.type === 'tool_use' && block.input) {
          const v = (block.input as { validity: string }).validity;
          if (v === 'VALID' || v === 'FLAWED' || v === 'UNVERIFIABLE') {
            return v as MathValidity;
          }
        }
      }
    } catch (err) {
      log.warn('Math sanity check failed', { claimId: claim.claimId }, err);
    }

    return 'UNVERIFIABLE' as MathValidity;
  }

  private evaluateBenchmark(claim: ExtractedClaim): number {
    // Simple heuristic: extract numeric claims and compare against known ranges
    const numbers = claim.claimText.match(/[\d,]+(?:\.\d+)?/g);
    if (!numbers || numbers.length === 0) return 0;

    // If TPS claim, check against known ranges
    if (
      claim.category === 'PERFORMANCE' &&
      /tps|transactions?\s*per\s*second/i.test(claim.claimText)
    ) {
      const tps = parseFloat(numbers[0].replace(/,/g, ''));
      if (tps > 1_000_000) return -50; // Implausible
      if (tps > 100_000) return -20; // Suspicious
      return 0; // Within range
    }

    // If APY claim, check sustainability
    if (claim.category === 'TOKENOMICS' && /apy|apr|yield|return/i.test(claim.claimText)) {
      const pct = parseFloat(numbers[0].replace(/,/g, ''));
      if (pct > 1000) return -50; // Implausible
      if (pct > 100) return -20; // Suspicious
      return 0;
    }

    return 0;
  }

  private derivePlausibility(benchmarkDelta: number | undefined): Plausibility {
    if (benchmarkDelta === undefined) return 'HIGH' as Plausibility;
    if (benchmarkDelta <= -50) return 'OUTLIER' as Plausibility;
    if (benchmarkDelta < -10) return 'LOW' as Plausibility;
    return 'HIGH' as Plausibility;
  }

  private async evaluateCitations(claim: ExtractedClaim): Promise<boolean | null> {
    if (!this.semanticScholar) return null;

    // Extract DOI from evidence
    const doiMatch = claim.statedEvidence.match(/10\.\d{4,}\/[^\s]+/);
    if (!doiMatch) return null;

    try {
      const paper = await this.semanticScholar.lookupPaper(doiMatch[0]);
      return paper !== null;
    } catch {
      return null;
    }
  }

  private evaluateOriginality(_claim: ExtractedClaim): Originality {
    // Placeholder: real implementation would use embedding similarity.
    // (plugin-wpv stub; embeddings are out of Step 2 scope.)
    return 'NOVEL' as Originality;
  }

  private computeClaimScore(evaluation: ClaimEvaluation): number {
    let score = 50; // base

    // Math validity (+/- 20)
    if (evaluation.mathValidity === 'VALID') score += 20;
    else if (evaluation.mathValidity === 'FLAWED') score -= 30;

    // Plausibility (+/- 15)
    if (evaluation.plausibility === 'HIGH') score += 15;
    else if (evaluation.plausibility === 'OUTLIER') score -= 25;
    else if (evaluation.plausibility === 'LOW') score -= 10;

    // Citations (+10)
    if (evaluation.citationSupportsClaim === true) score += 10;
    else if (evaluation.citationSupportsClaim === false) score -= 15;

    // Consistency (+/- 10)
    if (evaluation.consistency === 'CONSISTENT') score += 5;
    else if (evaluation.consistency === 'CONTRADICTED') score -= 20;

    return Math.max(0, Math.min(100, score));
  }
}
