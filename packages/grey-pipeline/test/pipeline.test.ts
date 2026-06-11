import { describe, it, expect } from 'vitest';
import {
  analyzeStructure,
  extractClaims,
  evaluateClaims,
  synthesize,
  runFullPipeline,
} from '../src/pipeline';
import type { PipelineDeps } from '../src/deps';
import type { GreyDb } from '../src/persistence/client';
import * as schema from '../src/persistence/schema';
import { createLogger } from '../src/logger';
import { Verdict } from '../src/types';
import { mockClient, tracker, emptyAnalysis, fixtureWhitepaper, makeClaims } from './_helpers';

// Stage functions don't touch the db; runFullPipeline's persistence is exercised by
// the Phase D smoke against the live grey_two schema, not here (audit §11.2: this is a
// structured unit test of the composition, NOT end-to-end).
function deps(toolInput: Record<string, unknown>): PipelineDeps {
  return {
    anthropic: mockClient(toolInput),
    db: {} as unknown as GreyDb,
    cost: tracker(),
    logger: createLogger(),
  };
}

describe('pipeline stage functions', () => {
  it('analyzeStructure returns a bounded structural score + numeric ratio', async () => {
    const text = ('Abstract. This protocol uses consensus and tokenomics. ').repeat(20);
    const out = await analyzeStructure({ text }, deps({}));
    expect(out.structuralScore).toBeGreaterThanOrEqual(1);
    expect(out.structuralScore).toBeLessThanOrEqual(5);
    expect(typeof out.hypeTechRatio).toBe('number');
  });

  it('extractClaims wraps the extractor', async () => {
    const d = deps({
      claims: [
        { category: 'TOKENOMICS', claimText: 'c', statedEvidence: '', mathematicalProofPresent: false, sourceSection: '', regulatoryRelevance: false },
      ],
    });
    const claims = await extractClaims({ text: 'x'.repeat(300), projectName: 'P' }, d);
    expect(claims).toHaveLength(1);
  });

  it('evaluateClaims wraps the evaluator', async () => {
    const d = deps({ results: [{ claimId: 'claim-1', consistent: true }, { claimId: 'claim-2', consistent: true }] });
    const { evaluations, scores } = await evaluateClaims({ claims: makeClaims(2), text: 't' }, d);
    expect(evaluations).toHaveLength(2);
    expect(scores.size).toBe(2);
  });

  it('synthesize composes verification + report (PASS at avg 75)', () => {
    const out = synthesize({
      analysis: emptyAnalysis(),
      structuralScore: 3,
      hypeTechRatio: 1,
      claims: makeClaims(3),
      evaluations: [],
      scores: new Map([
        ['claim-1', 80],
        ['claim-2', 70],
        ['claim-3', 75],
      ]),
      whitepaper: fixtureWhitepaper,
      llmTokensUsed: 150,
      computeCostUsd: 0.01,
    });
    expect(out.verification.verdict).toBe(Verdict.PASS);
    expect(out.verification.confidenceScore).toBe(75);
    expect(out.report.confidenceScore).toBe(75);
    expect(out.report.focusAreaScores.tokenomics).toBe(75);
  });
});

// A minimal GreyDb stand-in: every insert(...).values(data).returning() echoes the
// row back with an id; update(...).set(...).where(...) resolves. It captures the data
// passed to the verifications insert so we can inspect the persisted verdict.
function capturingDb(): { db: GreyDb; captured: { verification?: Record<string, unknown> } } {
  const captured: { verification?: Record<string, unknown> } = {};
  const db = {
    insert(table: unknown) {
      return {
        values(data: Record<string, unknown>) {
          if (table === schema.verifications) captured.verification = data;
          return { returning: async () => [{ id: 'mock-id', ...data }] };
        },
      };
    },
    update() {
      return { set: () => ({ where: async () => undefined }) };
    },
  };
  return { db: db as unknown as GreyDb, captured };
}

describe('runFullPipeline persistence', () => {
  // Regression: A1 — runFullPipeline must persist the delivered report verdict
  // (post-MiCA-adjustment), not the pre-adjustment ScoreAggregator verdict.
  // This input forces a divergence: every claim scores 90 (VALID math + HIGH
  // plausibility + CONSISTENT → aggregator PASS at confidence 90), but the text
  // claims MiCA ("mica") with zero MiCA sections present, so ReportGenerator
  // downgrades PASS → FAIL/CONDITIONAL. Pre-fix the column held PASS while the
  // report held the downgrade; post-fix they match.
  it('persists post-MiCA-adjustment report verdict, not aggregator verdict (A1)', async () => {
    const toolInput = {
      // L2 ClaimExtractor reads `claims`
      claims: [1, 2, 3].map((n) => ({
        category: 'CONSENSUS',
        claimText: `participants coordinate state transitions via rule ${n} of the protocol`,
        statedEvidence: '',
        mathematicalProofPresent: true, // → math-sanity LLM call → VALID below
        sourceSection: 'Design',
        regulatoryRelevance: false,
      })),
      validity: 'VALID', // L3 math_verdict tool reads `validity`
      results: [], // L3 consistency tool reads `results`; empty → all default CONSISTENT
    };

    // Non-MiCA-compliant body that nonetheless mentions "mica" (claimsMica=YES,
    // 0 sections → micaCompliant=NO). Avoids utility-token + section keywords.
    const text =
      'This overview mentions mica only in passing. ' +
      'The system processes records and coordinates participants across the network in a plain manner. '.repeat(
        8,
      );

    const { db, captured } = capturingDb();
    const deps: PipelineDeps = {
      anthropic: mockClient(toolInput),
      db,
      cost: tracker(),
      logger: createLogger(),
    };

    const report = await runFullPipeline(
      { projectName: 'TestProto', text, documentUrl: 'https://example.com/wp' },
      deps,
    );

    // A downgrade actually occurred (aggregator was PASS at high confidence)...
    expect(report.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(report.verdict).not.toBe(Verdict.PASS);
    // ...and the persisted column matches the delivered report verdict (the fix).
    expect(captured.verification).toBeDefined();
    expect(captured.verification!.verdict).toBe(report.verdict);
  });
});
