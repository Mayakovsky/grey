import { describe, it, expect } from 'vitest';
import { ClaimEvaluator } from '../src/evaluation/claimEvaluator';
import { ClaimCategory, type ExtractedClaim } from '@grey/schemas';
import { mockClient, tracker } from './_helpers';

const tpsClaim: ExtractedClaim = {
  claimId: 'c1',
  category: ClaimCategory.PERFORMANCE,
  claimText: '500000 TPS sustained',
  statedEvidence: 'benchmark',
  mathematicalProofPresent: false,
  sourceSection: 'Perf',
  regulatoryRelevance: false,
};

describe('ClaimEvaluator', () => {
  it('benchmarks a suspicious TPS claim and derives LOW plausibility', async () => {
    const ev = new ClaimEvaluator({ client: mockClient({ validity: 'VALID' }), costTracker: tracker() });
    const e = await ev.evaluateClaim(tpsClaim, 'full text');
    expect(e.benchmarkDelta).toBe(-20);
    expect(e.plausibility).toBe('LOW');
    expect(e.citationSupportsClaim).toBeNull(); // no semanticScholar client
    expect(e.originality).toBe('NOVEL');
  });

  it('treats a single claim as CONSISTENT without an LLM call', async () => {
    const ev = new ClaimEvaluator({ client: mockClient({ results: [] }), costTracker: tracker() });
    const m = await ev.evaluateConsistency([tpsClaim]);
    expect(m.get('c1')).toBe('CONSISTENT');
  });

  it('evaluateAll returns one evaluation + score per claim', async () => {
    const ev = new ClaimEvaluator({
      client: mockClient({
        results: [
          { claimId: 'c1', consistent: true },
          { claimId: 'c2', consistent: false },
        ],
      }),
      costTracker: tracker(),
    });
    const claims = [tpsClaim, { ...tpsClaim, claimId: 'c2', claimText: 'fast finality' }];
    const { evaluations, scores } = await ev.evaluateAll(claims, 'text');
    expect(evaluations).toHaveLength(2);
    expect(scores.get('c1')).toBeTypeOf('number');
    expect(evaluations.find((e) => e.claimId === 'c2')?.consistency).toBe('CONTRADICTED');
  });
});
