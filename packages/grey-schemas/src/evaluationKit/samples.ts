// @grey/schemas/evaluationKit — sample request/response pairs (E1-C evaluation artifacts). Every
// sample here is schema-valid (asserted in test/evaluationKit.samples.test.ts against the SAME
// ajv validators the live routes use) — an evaluating agent that reads these gets a real,
// checkable preview, not an illustrative-but-wrong shape.
import type { OfferingSlug } from '../responses/types';
import type { SampleExchange } from './types';

const legitimacyScanResponse = {
  projectName: 'Example Protocol',
  tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
  structuralScore: 4,
  verdict: 'PASS',
  hypeTechRatio: 0.5,
  claimCount: 3,
  claimsMicaCompliance: 'NOT_MENTIONED',
  micaCompliant: 'NOT_APPLICABLE',
  micaSummary: 'No MiCA-relevant claims found.',
  generatedAt: '2026-06-13T00:00:00.000Z',
  discoveryStatus: 'cached',
  discoverySourceTier: 0,
  discoveryAttempts: [
    { tier: 0, status: 'cached', structuralScore: 4, claimCount: 3, note: 'hit' },
  ],
};

const claimSample = {
  claimId: 'c1',
  category: 'TOKENOMICS',
  claimText: 'Total supply is fixed at 1,000,000,000 tokens.',
  statedEvidence: 'Whitepaper §3.1',
  mathematicalProofPresent: false,
  sourceSection: 'Tokenomics',
  regulatoryRelevance: false,
};

const fullTechResponse = {
  ...legitimacyScanResponse,
  claims: [claimSample],
  claimScores: { c1: 0.8 },
  logicSummary: 'Tokenomics claims are internally consistent with the stated supply schedule.',
  confidenceScore: 82,
  evaluations: [
    {
      claimId: 'c1',
      mathValidity: 'VALID',
      plausibility: 'HIGH',
      citationSupportsClaim: true,
      originality: 'NOVEL',
      consistency: 'CONSISTENT',
    },
  ],
  focusAreaScores: { tokenomics: 82, performance: null, consensus: null, scientific: null },
  llmTokensUsed: 2400,
  computeCostUsd: 0.04,
};

export const EVALUATION_SAMPLES: Record<OfferingSlug, SampleExchange> = {
  legitimacy_scan: {
    request: {
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      project_name: 'Example Protocol',
    },
    response: legitimacyScanResponse,
  },
  legitimacy_scan_trust_rung: {
    request: {
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      project_name: 'Example Protocol',
    },
    response: {
      projectName: 'Example Protocol',
      tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      verdict: 'PASS',
      generatedAt: '2026-06-13T00:00:00.000Z',
      note: 'Cache-only teaser — see legitimacy_scan for the full structural read.',
    },
  },
  verify_whitepaper: {
    request: {
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      project_name: 'Example Protocol',
    },
    response: {
      ...legitimacyScanResponse,
      claims: [claimSample],
      claimScores: { c1: 0.8 },
      logicSummary: 'Tokenomics claims are internally consistent with the stated supply schedule.',
    },
  },
  verify_full_tech: {
    request: {
      token_address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      project_name: 'Example Protocol',
    },
    response: fullTechResponse,
  },
  claim_extraction: {
    request: { whitepaperUrl: 'https://example.org/whitepaper.pdf' },
    response: {
      whitepaper: {
        id: 'wp-sample',
        projectName: 'Example Protocol',
        tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
        documentUrl: 'https://example.org/whitepaper.pdf',
        pageCount: 12,
      },
      structuralAnalysis: { hasAbstract: true, hasTokenomics: true },
      claims: [claimSample],
      tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    },
  },
  claim_history: {
    request: { projectIdentifier: 'Example Protocol' },
    response: {
      project: { name: 'Example Protocol' },
      verifications: [{ id: 'v-sample' }],
      claims: [claimSample],
      note: 'One prior verification on file.',
    },
  },
  quick_protocol_facts: {
    request: { projectQuery: 'Example Protocol' },
    response: {
      project: { name: 'Example Protocol' },
      type: 'DeFi',
      miCAStatus: 'PARTIAL',
      headlineVerdict: 'CONDITIONAL',
      lastVerified: '2026-06-13T00:00:00.000Z',
      sources: ['https://example.org/whitepaper.pdf'],
      note: 'Served from cache — no live compute.',
    },
  },
  daily_tech_brief: {
    request: { date: '2026-06-13' },
    response: { date: '2026-06-13', totalVerified: 1, whitepapers: [fullTechResponse] },
  },
  daily_greenlight_list: {
    request: {},
    response: {
      date: '2026-06-13',
      totalVerified: 1,
      projects: [{ projectName: 'Example Protocol' }],
    },
  },
  scam_alert_feed: {
    request: {},
    response: {
      date: '2026-06-13',
      flagged: [
        { projectName: 'Suspicious Token', redFlags: ['unverifiable team', 'unsourced claims'] },
      ],
    },
  },
  prediction_market_research: {
    request: { marketQuery: 'Will BTC close above $150k by 2026-12-31? (Polymarket)' },
    response: {
      market: { query: 'Will BTC close above $150k by 2026-12-31? (Polymarket)' },
      status: 'NOT_YET_ANALYSED',
      analysis: null,
      lastAnalysed: null,
      note: 'e3-b2: no cache-population pipeline for prediction-market content yet — always returns NOT_YET_ANALYSED this phase.',
    },
  },
  resolution_evidence_compiler: {
    request: {
      marketQuery: 'Will BTC close above $150k by 2026-12-31? (Polymarket)',
      resolutionCriteria: 'Resolves YES if Coinbase BTC-USD close >= $150,000 on 2026-12-31 UTC.',
    },
    response: {
      market: { query: 'Will BTC close above $150k by 2026-12-31? (Polymarket)' },
      status: 'NOT_YET_ANALYSED',
      evidence: [],
      compiledAt: null,
      note: 'e3-b2: no evidence-compilation pipeline yet — always returns NOT_YET_ANALYSED this phase.',
    },
  },
};
