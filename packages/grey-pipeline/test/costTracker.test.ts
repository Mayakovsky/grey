import { describe, it, expect } from 'vitest';
import { CostTracker } from '../src/telemetry/costTracker';
import { LLM_PRICING } from '../src/constants';

describe('CostTracker', () => {
  it('accumulates legacy usage and computes USD cost', () => {
    const t = new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken);
    t.recordUsage(1_000_000, 1_000_000);
    expect(t.getTotalTokens()).toEqual({ input: 1_000_000, output: 1_000_000 });
    // $3 input + $15 output per 1M
    expect(t.getTotalCostUsd()).toBeCloseTo(18, 6);
  });

  it('tracks per-stage metrics with timing', () => {
    const t = new CostTracker(LLM_PRICING.inputPerToken, LLM_PRICING.outputPerToken);
    t.startStage('l2');
    t.endStage('l2', 2_000_000, 0);
    t.startStage('l3');
    t.endStage('l3', 0, 1_000_000);
    const m = t.getStageMetrics();
    expect(m.l2.inputTokens).toBe(2_000_000);
    expect(m.l2.costUsd).toBeCloseTo(6, 6);
    expect(m.l3.outputTokens).toBe(1_000_000);
    expect(m.l3.costUsd).toBeCloseTo(15, 6);
    expect(m.totalCostUsd).toBeCloseTo(21, 6);
  });

  it('reset clears legacy + stages', () => {
    const t = new CostTracker(1, 1);
    t.recordUsage(5, 5);
    t.endStage('l2', 3, 3);
    t.reset();
    expect(t.getTotalTokens()).toEqual({ input: 0, output: 0 });
    expect(t.getStageMetrics().l2.inputTokens).toBe(0);
  });

  it('honors custom pricing', () => {
    const t = new CostTracker(2, 4);
    t.recordUsage(10, 5);
    expect(t.getTotalCostUsd()).toBe(10 * 2 + 5 * 4);
  });
});
