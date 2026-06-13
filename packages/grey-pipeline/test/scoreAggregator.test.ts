import { describe, it, expect } from 'vitest';
import { ScoreAggregator } from '../src/synthesis/scoreAggregator';
import { ClaimCategory, Verdict } from '@grey/schemas';

const cs = (category: ClaimCategory, score: number) => ({ category, score });

describe('ScoreAggregator', () => {
  it('returns INSUFFICIENT_DATA below the minimum claim count', () => {
    const agg = new ScoreAggregator();
    const out = agg.aggregate([cs(ClaimCategory.TOKENOMICS, 80), cs(ClaimCategory.PERFORMANCE, 90)]);
    expect(out.verdict).toBe(Verdict.INSUFFICIENT_DATA);
    expect(out.confidenceScore).toBe(0);
    expect(out.focusAreaScores.TOKENOMICS).toBeNull();
  });

  it('derives PASS at >= 70', () => {
    const agg = new ScoreAggregator();
    const out = agg.aggregate([
      cs(ClaimCategory.TOKENOMICS, 80),
      cs(ClaimCategory.PERFORMANCE, 70),
      cs(ClaimCategory.CONSENSUS, 75),
    ]);
    expect(out.confidenceScore).toBe(75);
    expect(out.verdict).toBe(Verdict.PASS);
  });

  it('derives CONDITIONAL in [40,70)', () => {
    const agg = new ScoreAggregator();
    const out = agg.aggregate([cs(ClaimCategory.TOKENOMICS, 50), cs(ClaimCategory.TOKENOMICS, 50), cs(ClaimCategory.TOKENOMICS, 50)]);
    expect(out.verdict).toBe(Verdict.CONDITIONAL);
  });

  it('derives FAIL below 40', () => {
    const agg = new ScoreAggregator();
    const out = agg.aggregate([cs(ClaimCategory.SCIENTIFIC, 10), cs(ClaimCategory.SCIENTIFIC, 20), cs(ClaimCategory.SCIENTIFIC, 30)]);
    expect(out.verdict).toBe(Verdict.FAIL);
  });

  it('computes per-category averages and nulls absent categories', () => {
    const agg = new ScoreAggregator();
    const out = agg.aggregate([
      cs(ClaimCategory.TOKENOMICS, 60),
      cs(ClaimCategory.TOKENOMICS, 80),
      cs(ClaimCategory.PERFORMANCE, 90),
    ]);
    expect(out.focusAreaScores.TOKENOMICS).toBe(70);
    expect(out.focusAreaScores.PERFORMANCE).toBe(90);
    expect(out.focusAreaScores.CONSENSUS).toBeNull();
    expect(out.focusAreaScores.SCIENTIFIC).toBeNull();
  });
});
