// E1-F: pure margin-report aggregation (Expansion Round 2, sub-unit 4). Unit-tested against
// fixture arrays — no live DB — mirroring VerificationsRepo.getMonthlyCostSummary's
// fetch-then-reduce-in-JS convention.
import { describe, it, expect } from 'vitest';
import { computeMarginReport } from '../src/persistence/repositories';

describe('computeMarginReport — E1-F margin instrumentation', () => {
  it('attributes revenue per channel x offering, cost per offering, and computes margin = revenue - cost', () => {
    const revenueRows = [
      { channel: 'x402', offering: 'legitimacy_scan', revenueUsd: 0.25 },
      { channel: 'x402', offering: 'legitimacy_scan', revenueUsd: 0.25 },
      { channel: 'acp', offering: 'legitimacy_scan', revenueUsd: 0.25 },
    ];
    const costByOffering = new Map([['legitimacy_scan', 0.1]]);

    const report = computeMarginReport(revenueRows, costByOffering);

    expect(report).toHaveLength(1);
    const row = report[0];
    expect(row.offering).toBe('legitimacy_scan');
    expect(row.revenueByChannelUsd).toEqual({ x402: 0.5, acp: 0.25 });
    expect(row.totalRevenueUsd).toBeCloseTo(0.75, 6);
    expect(row.totalCostUsd).toBe(0.1);
    expect(row.realizedMarginUsd).toBeCloseTo(0.65, 6);
  });

  it('CACHE_ONLY offerings show margin == revenue (zero cost, no cost_events rows exist for them)', () => {
    const revenueRows = [{ channel: 'x402', offering: 'quick_protocol_facts', revenueUsd: 0.3 }];
    const report = computeMarginReport(revenueRows, new Map());
    expect(report[0].totalCostUsd).toBe(0);
    expect(report[0].realizedMarginUsd).toBe(0.3);
  });

  it('an offering with cost but no settled revenue yet still surfaces (negative margin), not dropped', () => {
    const costByOffering = new Map([['verify_full_tech', 3.5]]);
    const report = computeMarginReport([], costByOffering);
    expect(report).toHaveLength(1);
    expect(report[0].totalRevenueUsd).toBe(0);
    expect(report[0].realizedMarginUsd).toBe(-3.5);
  });

  it('is sorted by offering slug for stable output', () => {
    const revenueRows = [
      { channel: 'x402', offering: 'verify_whitepaper', revenueUsd: 1.5 },
      { channel: 'x402', offering: 'claim_extraction', revenueUsd: 0.75 },
    ];
    const report = computeMarginReport(revenueRows, new Map());
    expect(report.map((r) => r.offering)).toEqual(['claim_extraction', 'verify_whitepaper']);
  });

  it('returns an empty report for no activity', () => {
    expect(computeMarginReport([], new Map())).toEqual([]);
  });
});
