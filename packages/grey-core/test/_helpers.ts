// Shared test helpers: fake deps with stub repos + row fixtures + envelope-validation assertion.
// The strong correctness check is envelopeValidator(body) — it validates the full wire envelope
// AND binds the payload to the offering's response schema (allOf[if/then]). So a malformed handler
// payload fails here. (Internal-impl test organization per Pattern 1 Tier B / spec §4.3 fixtures.)
import { expect } from 'vitest';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { envelopeValidator } from '@grey/schemas/validators';
import { buildServer } from '../src/server';
import type { HandlerDeps, GreyCoreConfig } from '../src/deps';
import type { WhitepaperRow, VerificationRow, ClaimRow } from '../src/handlers/types';
import type { TieredDiscoveryResult } from '@grey/pipeline';

export const TEST_CONFIG: GreyCoreConfig = {
  version: '0.1.0-test',
  did: 'did:erc8004:8453:58618',
  name: 'Whitepaper Grey',
  runtime: 'grey-core',
  payTo: '0x0000000000000000000000000000000000000000',
  network: 'eip155:84532',
};

/** Pass-through x402 gate for handler-logic tests — lets paid routes through so they test the
 *  handler/envelope, not payment. The real gate is exercised separately in x402-routes.test.ts. */
export const passThroughX402: preHandlerHookHandler = async () => {};

const TS = new Date('2026-06-14T00:00:00.000Z');

export function whitepaperRow(over: Partial<WhitepaperRow> = {}): WhitepaperRow {
  return {
    id: 'wp-1',
    projectName: 'Uniswap',
    tokenAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
    chain: 'base',
    documentUrl: 'https://uniswap.org/whitepaper.pdf',
    ipfsCid: null,
    knowledgeItemId: null,
    pageCount: 10,
    ingestedAt: TS,
    status: 'VERIFIED',
    selectionScore: 0,
    metadataJson: {},
    ...over,
  } as unknown as WhitepaperRow;
}

export function verificationRow(over: Partial<VerificationRow> = {}): VerificationRow {
  return {
    id: 'v-1',
    whitepaperId: 'wp-1',
    structuralAnalysisJson: { mica: { claimsMicaCompliance: 'NO', micaCompliant: 'YES', micaSummary: 'compliant' } },
    structuralScore: 4,
    confidenceScore: 82,
    hypeTechRatio: 1.2,
    verdict: 'PASS',
    focusAreaScores: { tokenomics: 4, performance: 3 },
    totalClaims: 2,
    verifiedClaims: 2,
    llmTokensUsed: 1000,
    computeCostUsd: 0.01,
    cacheHit: false,
    verifiedAt: TS,
    ...over,
  } as unknown as VerificationRow;
}

export function claimRow(over: Partial<ClaimRow> = {}): ClaimRow {
  return {
    id: 'c-1',
    whitepaperId: 'wp-1',
    category: 'TOKENOMICS',
    claimText: 'Fixed supply of 1B tokens.',
    statedEvidence: 'Section 3.1',
    sourceSection: '3.1',
    mathProofPresent: false,
    evaluationJson: { claimId: 'c-1', plausibility: 'HIGH' },
    claimScore: 0.8,
    evaluatedAt: TS,
    ...over,
  } as unknown as ClaimRow;
}

export interface RepoStubs {
  whitepapersByToken?: WhitepaperRow[];
  whitepapersByName?: WhitepaperRow[];
  whitepaperById?: WhitepaperRow | null;
  verification?: VerificationRow | null;
  claims?: ClaimRow[];
  greenlight?: VerificationRow[];
  scamAlerts?: VerificationRow[];
  byDate?: VerificationRow[];
  latestBatch?: VerificationRow[];
  /** M3.5: discovery result for the cache-miss live path. Default null → cacheOrLive returns the
   *  typed-empty miss sentinel (preserves the M3 cache-miss test expectations). */
  discover?: TieredDiscoveryResult | null;
}

export function fakeDeps(stubs: RepoStubs = {}): HandlerDeps {
  const noop = (): void => {};
  const logger = { debug: noop, info: noop, warn: noop, error: noop, child: (): unknown => logger };
  const whitepapers = {
    findByTokenAddress: async (): Promise<WhitepaperRow[]> => stubs.whitepapersByToken ?? [],
    findByProjectName: async (): Promise<WhitepaperRow[]> => stubs.whitepapersByName ?? [],
    findById: async (): Promise<WhitepaperRow | null> => stubs.whitepaperById ?? null,
  };
  const verifications = {
    findByWhitepaperId: async (): Promise<VerificationRow | null> => stubs.verification ?? null,
    getGreenlightList: async (): Promise<VerificationRow[]> => stubs.greenlight ?? [],
    getScamAlerts: async (): Promise<VerificationRow[]> => stubs.scamAlerts ?? [],
    getVerificationsByDate: async (): Promise<VerificationRow[]> => stubs.byDate ?? [],
    getLatestDailyBatch: async (): Promise<VerificationRow[]> => stubs.latestBatch ?? [],
  };
  const claims = {
    findByWhitepaperId: async (): Promise<ClaimRow[]> => stubs.claims ?? [],
  };
  // M3.5: minimal live-compute DI. `discovery.discover` defaults to null (→ typed-empty miss).
  // `pipeline` is a bare stub — the cache-miss tests don't reach a run variant (discover null →
  // missResult), and the cacheOrLive live-path tests mock the variants directly (cacheOrLive.test.ts).
  const discovery = {
    discover: async (): Promise<TieredDiscoveryResult | null> => stubs.discover ?? null,
  };
  return {
    db: {} as HandlerDeps['db'],
    whitepapers: whitepapers as unknown as HandlerDeps['whitepapers'],
    verifications: verifications as unknown as HandlerDeps['verifications'],
    claims: claims as unknown as HandlerDeps['claims'],
    logger: logger as unknown as HandlerDeps['logger'],
    clock: () => new Date('2026-06-14T12:00:00.000Z'),
    config: TEST_CONFIG,
    pipeline: {} as unknown as HandlerDeps['pipeline'],
    discovery: discovery as unknown as HandlerDeps['discovery'],
  };
}

export function makeApp(
  stubs: RepoStubs = {},
  gate: preHandlerHookHandler = passThroughX402,
): FastifyInstance {
  return buildServer(fakeDeps(stubs), gate);
}

/** Loose envelope shape for reading inject() response bodies in tests. */
export interface EnvBody {
  offering: string;
  payload: Record<string, unknown>;
  metadata: { cacheHit: boolean };
}

/** Assert a response body is a valid GreyResponseEnvelope (binds payload to the offering schema). */
export function expectValidEnvelope(body: unknown, offering: string): void {
  const ok = envelopeValidator(body);
  expect(ok, JSON.stringify(envelopeValidator.errors)).toBe(true);
  expect((body as { offering: string }).offering).toBe(offering);
}
