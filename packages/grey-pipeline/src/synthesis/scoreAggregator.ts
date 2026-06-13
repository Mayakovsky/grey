// grey-pipeline — ScoreAggregator.
// Ported verbatim from plugin-wpv/src/verification/ScoreAggregator.ts. Pure;
// no ElizaOS, no deps. Aggregates per-claim scores → confidence + focus areas + verdict.

import type { ClaimCategory, Verdict, ScoreWeights } from '@grey/schemas';
import { DEFAULT_SCORE_WEIGHTS, VERDICT_THRESHOLDS, MIN_EVALUABLE_CLAIMS } from '../constants';

export class ScoreAggregator {
  private weights: ScoreWeights;

  constructor(weights?: ScoreWeights) {
    this.weights = weights ?? DEFAULT_SCORE_WEIGHTS;
  }

  /** Aggregate claim scores into a final verdict. */
  aggregate(claimScores: { category: ClaimCategory; score: number }[]): {
    confidenceScore: number;
    focusAreaScores: Record<ClaimCategory, number | null>;
    verdict: Verdict;
  } {
    // Insufficient data check
    if (claimScores.length < MIN_EVALUABLE_CLAIMS) {
      return {
        confidenceScore: 0,
        focusAreaScores: this.emptyFocusScores(),
        verdict: 'INSUFFICIENT_DATA' as Verdict,
      };
    }

    const focusAreaScores = this.computeFocusAreaScores(claimScores);
    const confidenceScore = this.computeConfidenceScore(claimScores);
    const verdict = this.deriveVerdict(confidenceScore);

    return { confidenceScore, focusAreaScores, verdict };
  }

  private computeFocusAreaScores(
    claimScores: { category: ClaimCategory; score: number }[],
  ): Record<ClaimCategory, number | null> {
    const scores: Record<string, number[]> = {
      TOKENOMICS: [],
      PERFORMANCE: [],
      CONSENSUS: [],
      SCIENTIFIC: [],
    };

    for (const cs of claimScores) {
      if (scores[cs.category]) {
        scores[cs.category].push(cs.score);
      }
    }

    // Return null for categories with zero claims (absent).
    // Prevents misleading "0" scores on categories that were never assessed.
    return {
      TOKENOMICS: scores.TOKENOMICS.length > 0 ? this.avg(scores.TOKENOMICS) : null,
      PERFORMANCE: scores.PERFORMANCE.length > 0 ? this.avg(scores.PERFORMANCE) : null,
      CONSENSUS: scores.CONSENSUS.length > 0 ? this.avg(scores.CONSENSUS) : null,
      SCIENTIFIC: scores.SCIENTIFIC.length > 0 ? this.avg(scores.SCIENTIFIC) : null,
    } as Record<ClaimCategory, number | null>;
  }

  private computeConfidenceScore(claimScores: { category: ClaimCategory; score: number }[]): number {
    // Simple average of all claim scores
    if (claimScores.length === 0) return 0;

    const total = claimScores.reduce((sum, cs) => sum + cs.score, 0);
    return Math.round(total / claimScores.length);
  }

  private deriveVerdict(confidenceScore: number): Verdict {
    if (confidenceScore >= VERDICT_THRESHOLDS.PASS) return 'PASS' as Verdict;
    if (confidenceScore >= VERDICT_THRESHOLDS.CONDITIONAL) return 'CONDITIONAL' as Verdict;
    return 'FAIL' as Verdict;
  }

  private avg(nums: number[]): number {
    if (nums.length === 0) return 0;
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  }

  private emptyFocusScores(): Record<ClaimCategory, number | null> {
    // All categories null when no claims were evaluated (INSUFFICIENT_DATA path).
    return {
      TOKENOMICS: null,
      PERFORMANCE: null,
      CONSENSUS: null,
      SCIENTIFIC: null,
    } as Record<ClaimCategory, number | null>;
  }
}
