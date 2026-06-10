// grey-pipeline — CostTracker.
// Ported verbatim from plugin-wpv/src/verification/CostTracker.ts (pure utility,
// no ElizaOS). Tracks LLM token usage + compute cost with per-stage (L1/L2/L3)
// breakdown. The DB-side `cost_events` writer is the CostRecorder in deps.ts.

export type PipelineStage = 'l1' | 'l2' | 'l3';
export type TriggerSource = 'cron' | 'acp_request' | 'manual' | 'seed';

export interface StageUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface VerificationMetrics {
  l1: StageUsage;
  l2: StageUsage;
  l3: StageUsage;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

export class CostTracker {
  // Legacy accumulator (backward compatibility)
  private inputTokens = 0;
  private outputTokens = 0;

  // Per-stage tracking for current verification
  private stages: Record<
    PipelineStage,
    { inputTokens: number; outputTokens: number; startTime: number; durationMs: number }
  > = {
    l1: { inputTokens: 0, outputTokens: 0, startTime: 0, durationMs: 0 },
    l2: { inputTokens: 0, outputTokens: 0, startTime: 0, durationMs: 0 },
    l3: { inputTokens: 0, outputTokens: 0, startTime: 0, durationMs: 0 },
  };

  constructor(
    private pricePerInputToken: number,
    private pricePerOutputToken: number,
  ) {}

  // ── Stage-aware API ─────────────────────

  /** Mark the start of a pipeline stage for timing. */
  startStage(stage: PipelineStage): void {
    this.stages[stage].startTime = Date.now();
  }

  /** Mark the end of a pipeline stage, recording tokens and duration. */
  endStage(stage: PipelineStage, inputTokens: number, outputTokens: number): void {
    const s = this.stages[stage];
    s.inputTokens += inputTokens;
    s.outputTokens += outputTokens;
    if (s.startTime > 0) {
      s.durationMs += Date.now() - s.startTime;
      s.startTime = 0;
    }
    // Also accumulate into legacy totals
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
  }

  /** Get per-stage breakdown of current verification. */
  getStageMetrics(): VerificationMetrics {
    const stageUsage = (stage: PipelineStage): StageUsage => {
      const s = this.stages[stage];
      return {
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        costUsd:
          s.inputTokens * this.pricePerInputToken + s.outputTokens * this.pricePerOutputToken,
        durationMs: s.durationMs,
      };
    };

    const l1 = stageUsage('l1');
    const l2 = stageUsage('l2');
    const l3 = stageUsage('l3');

    return {
      l1,
      l2,
      l3,
      totalCostUsd: l1.costUsd + l2.costUsd + l3.costUsd,
      totalInputTokens: l1.inputTokens + l2.inputTokens + l3.inputTokens,
      totalOutputTokens: l1.outputTokens + l2.outputTokens + l3.outputTokens,
    };
  }

  /** Reset per-stage tracking for a new verification (keeps legacy totals). */
  resetStages(): void {
    for (const stage of ['l1', 'l2', 'l3'] as PipelineStage[]) {
      this.stages[stage] = { inputTokens: 0, outputTokens: 0, startTime: 0, durationMs: 0 };
    }
  }

  // ── Legacy API (backward compatible) ────

  /** Record token usage (legacy — not stage-aware). */
  recordUsage(input: number, output: number): void {
    this.inputTokens += input;
    this.outputTokens += output;
  }

  getTotalTokens(): { input: number; output: number } {
    return { input: this.inputTokens, output: this.outputTokens };
  }

  getTotalCostUsd(): number {
    return (
      this.inputTokens * this.pricePerInputToken + this.outputTokens * this.pricePerOutputToken
    );
  }

  reset(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.resetStages();
  }
}
