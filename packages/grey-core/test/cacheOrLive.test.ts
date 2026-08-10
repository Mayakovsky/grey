// @grey/core — cacheOrLive unit tests (M3.5 Phase B, spec §6.2). The pipeline run variants are
// mocked (Q7) so these assert grey-core's orchestration only: FDQ-8 routing + builder selection,
// the §2.10 discovery step, subject derivation, and the failure/miss → typed-empty sentinel.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { runL1, runL1L2, runFullPipeline, withTimeout } = vi.hoisted(() => ({
  runL1: vi.fn(),
  runL1L2: vi.fn(),
  runFullPipeline: vi.fn(),
  withTimeout: vi.fn(),
}));

vi.mock('@grey/pipeline', async (importActual) => {
  const actual = await importActual<typeof import('@grey/pipeline')>();
  return { ...actual, runL1, runL1L2, runFullPipeline, withTimeout };
});

import { cacheOrLive } from '../src/orchestration/cacheOrLive';
import { createHandlerDeps } from '../src/deps';
import { fakeDeps } from './_helpers';
import type { TieredDiscoveryResult } from '@grey/pipeline';

const TOKEN = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';

const discovered = {
  resolved: { text: 'x', pageCount: 1, isImageOnly: false, isPasswordProtected: false, source: 'direct', originalUrl: 'u', resolvedUrl: 'u' },
  documentUrl: 'https://x/wp.pdf',
  documentSource: 'pdf',
  tier: 1,
} as unknown as TieredDiscoveryResult;

const legitReport = { projectName: 'Aave', tokenAddress: TOKEN, verdict: 'PASS', structuralScore: 4, hypeTechRatio: 1, claimCount: 0, claimsMicaCompliance: 'NOT_MENTIONED', micaCompliant: 'NO', micaSummary: '', generatedAt: 'T' };
const fullReport = { ...legitReport, claims: [], claimScores: {}, logicSummary: 's', confidenceScore: 80, evaluations: [], focusAreaScores: {}, llmTokensUsed: 1, computeCostUsd: 0 };
const tokReport = { ...legitReport, claims: [], claimScores: {}, logicSummary: 's' };
const ceReport = { whitepaper: { id: 'wp', projectName: 'Aave', tokenAddress: TOKEN, documentUrl: 'u', pageCount: 1 }, structuralAnalysis: {}, claims: [], tokenAddress: TOKEN };

beforeEach(() => {
  runL1.mockReset().mockResolvedValue(legitReport);
  runL1L2.mockReset().mockResolvedValue(ceReport);
  runFullPipeline.mockReset().mockResolvedValue(fullReport);
  // withTimeout defaults to pass-through (return the variant promise); timeout tests override.
  withTimeout.mockReset().mockImplementation((p: Promise<unknown>) => p);
});

// §17: runMetadata built from the `discovered` fixture (tier 1 → 'primary'), passed as the
// variant's 4th arg for persistence.
const EXPECTED_META = { discoveryStatus: 'primary', discoverySourceTier: '1', discoveryAttempts: [{ tier: 1, status: 'primary' }] };

describe('cacheOrLive — FDQ-8 routing + builder selection + §17 runMetadata', () => {
  it('legitimacy_scan → runL1 (builder: legitimacy) + runMetadata', async () => {
    const deps = fakeDeps({ discover: discovered });
    const r = await cacheOrLive('legitimacy_scan', { token_address: TOKEN } as never, deps);
    expect(runL1).toHaveBeenCalledTimes(1);
    expect(runL1.mock.calls[0][2]).toEqual({ builder: 'legitimacy' });
    expect(runL1.mock.calls[0][3]).toEqual(EXPECTED_META);
    expect(runFullPipeline).not.toHaveBeenCalled();
    expect(r.payload).toBe(legitReport);
    expect(r.cacheHit).toBe(false);
    expect(r.subject).toEqual({ tokenAddress: TOKEN, projectName: 'Aave' });
  });

  it('verify_whitepaper → runFullPipeline (builder: tokenomics) + runMetadata', async () => {
    runFullPipeline.mockResolvedValue(tokReport);
    const deps = fakeDeps({ discover: discovered });
    await cacheOrLive('verify_whitepaper', { token_address: TOKEN } as never, deps);
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
    expect(runFullPipeline.mock.calls[0][2]).toEqual({ builder: 'tokenomics' });
    expect(runFullPipeline.mock.calls[0][3]).toEqual(EXPECTED_META);
  });

  it('verify_full_tech → runFullPipeline (builder: full) + runMetadata', async () => {
    const deps = fakeDeps({ discover: discovered });
    await cacheOrLive('verify_full_tech', { token_address: TOKEN } as never, deps);
    expect(runFullPipeline).toHaveBeenCalledTimes(1);
    expect(runFullPipeline.mock.calls[0][2]).toEqual({ builder: 'full' });
    expect(runFullPipeline.mock.calls[0][3]).toEqual(EXPECTED_META);
  });

  it('claim_extraction → runL1L2, skips discovery (URL supplied) → runMetadata undefined', async () => {
    const deps = fakeDeps({}); // no discover stub — must not be needed
    const r = await cacheOrLive('claim_extraction', { whitepaperUrl: 'https://x/wp.pdf' } as never, deps);
    expect(runL1L2).toHaveBeenCalledTimes(1);
    expect(runL1L2.mock.calls[0][2]).toEqual({ builder: 'claim_extraction' });
    expect(runL1L2.mock.calls[0][3]).toBeUndefined();
    // subject derived from the POST-run whitepaper row
    expect(r.subject).toEqual({ tokenAddress: TOKEN, projectName: 'Aave' });
    expect(r.payload).toBe(ceReport);
  });
});

describe('cacheOrLive — discovery step (§2.10)', () => {
  it('passes the discovered documentUrl to the variant and attaches provenance to the payload', async () => {
    const deps = fakeDeps({ discover: discovered });
    const r = await cacheOrLive('legitimacy_scan', { token_address: TOKEN } as never, deps);
    expect(runL1.mock.calls[0][0]).toMatchObject({ documentUrl: 'https://x/wp.pdf', tokenAddress: TOKEN });
    const p = r.payload as Record<string, unknown>;
    expect(p.discoveryStatus).toBe('primary');
    expect(p.discoverySourceTier).toBe(1);
  });

  it('does NOT run discovery when a document_url is supplied', async () => {
    const deps = fakeDeps({ discover: discovered });
    await cacheOrLive('verify_whitepaper', { token_address: TOKEN, document_url: 'https://given/wp.pdf' } as never, deps);
    expect(runFullPipeline.mock.calls[0][0]).toMatchObject({ documentUrl: 'https://given/wp.pdf' });
  });
});

describe('cacheOrLive — discovery-miss → typed-empty sentinel', () => {
  for (const offering of ['legitimacy_scan', 'verify_whitepaper', 'verify_full_tech'] as const) {
    it(`${offering}: discovery returns null → INSUFFICIENT_DATA, no variant call`, async () => {
      const deps = fakeDeps({ discover: null });
      const r = await cacheOrLive(offering, { token_address: TOKEN } as never, deps);
      expect((r.payload as Record<string, unknown>).verdict).toBe('INSUFFICIENT_DATA');
      expect(r.cacheHit).toBe(false);
      expect(runL1).not.toHaveBeenCalled();
      expect(runFullPipeline).not.toHaveBeenCalled();
    });
  }

  it('claim_extraction: no URL + discovery null → typed-empty sentinel', async () => {
    const deps = fakeDeps({ discover: null });
    const r = await cacheOrLive('claim_extraction', {} as never, deps);
    expect(r.payload).toEqual({ whitepaper: {}, structuralAnalysis: {}, claims: [], tokenAddress: null });
    expect(runL1L2).not.toHaveBeenCalled();
  });
});

describe('cacheOrLive — pipeline failure → insufficientData (§2.10 step 6)', () => {
  for (const [offering, fn] of [
    ['legitimacy_scan', runL1],
    ['verify_whitepaper', runFullPipeline],
    ['verify_full_tech', runFullPipeline],
    ['claim_extraction', runL1L2],
  ] as const) {
    it(`${offering}: variant throws → insufficientData`, async () => {
      fn.mockRejectedValueOnce(new Error('boom'));
      const deps = fakeDeps({ discover: discovered });
      const body = offering === 'claim_extraction' ? { whitepaperUrl: 'https://x/wp.pdf' } : { token_address: TOKEN };
      const r = await cacheOrLive(offering, body as never, deps);
      expect(r.cacheHit).toBe(false);
      if (offering === 'claim_extraction') {
        expect((r.payload as Record<string, unknown>).claims).toEqual([]);
      } else {
        expect((r.payload as Record<string, unknown>).verdict).toBe('INSUFFICIENT_DATA');
      }
    });
  }
});

describe('cacheOrLive — withTimeout expiry → insufficientData (§19.2)', () => {
  for (const offering of ['legitimacy_scan', 'verify_whitepaper', 'verify_full_tech', 'claim_extraction'] as const) {
    it(`${offering}: withTimeout rejects (4-min expiry) → insufficientData`, async () => {
      withTimeout.mockRejectedValueOnce(new Error(`${offering} timeout after 240000ms`));
      const deps = fakeDeps({ discover: discovered });
      const body = offering === 'claim_extraction' ? { whitepaperUrl: 'https://x/wp.pdf' } : { token_address: TOKEN };
      const r = await cacheOrLive(offering, body as never, deps);
      expect(r.cacheHit).toBe(false);
      if (offering === 'claim_extraction') {
        expect((r.payload as Record<string, unknown>).claims).toEqual([]);
      } else {
        expect((r.payload as Record<string, unknown>).verdict).toBe('INSUFFICIENT_DATA');
      }
    });
  }
});

describe('cacheOrLive — subject derivation', () => {
  it('derives subject from the report fields (token from report, name from report)', async () => {
    runL1.mockResolvedValue({ ...legitReport, projectName: 'Compound', tokenAddress: '0xc0' });
    const deps = fakeDeps({ discover: discovered });
    const r = await cacheOrLive('legitimacy_scan', { token_address: '0xreq' } as never, deps);
    expect(r.subject).toEqual({ tokenAddress: '0xc0', projectName: 'Compound' });
  });

  it('claim_extraction subject comes from the post-run whitepaper row', async () => {
    runL1L2.mockResolvedValue({ ...ceReport, whitepaper: { ...ceReport.whitepaper, projectName: 'Lido' }, tokenAddress: '0xli' });
    const deps = fakeDeps({});
    const r = await cacheOrLive('claim_extraction', { whitepaperUrl: 'https://x/y' } as never, deps);
    expect(r.subject).toEqual({ tokenAddress: '0xli', projectName: 'Lido' });
  });
});

describe('cacheOrLive — Invariant #30 (CACHE_ONLY never triggers live compute)', () => {
  // e3-b2 (Olas Mech Marketplace, Base): prediction_market_research + resolution_evidence_compiler
  // added — both CACHE_ONLY, both must be structurally unreachable here same as every other
  // cache-only slug (G3 acceptance criterion for e3-b2).
  const CACHE_ONLY_SLUGS = [
    'claim_history',
    'quick_protocol_facts',
    'daily_tech_brief',
    'daily_greenlight_list',
    'scam_alert_feed',
    'prediction_market_research',
    'resolution_evidence_compiler',
  ] as const;

  for (const slug of CACHE_ONLY_SLUGS) {
    it(`${slug} is structurally unreachable from cacheOrLive() — compile-time AND runtime rejection`, async () => {
      const deps = fakeDeps({ discover: discovered });
      // The type system already makes this uncallable (O extends ComputeOfferingSlug excludes
      // every CACHE_ONLY slug) — the cast below simulates a bypass to prove the runtime
      // fail-closed assertion is the actual backstop, not just the type constraint.
      await expect(
        cacheOrLive(slug as never, { token_address: TOKEN } as never, deps),
      ).rejects.toThrow(/CACHE_ONLY/);
      expect(runL1).not.toHaveBeenCalled();
      expect(runL1L2).not.toHaveBeenCalled();
      expect(runFullPipeline).not.toHaveBeenCalled();
    });
  }

  it('rejects before any discovery/pipeline side effect runs, even on a "paid retry" shape', async () => {
    const deps = fakeDeps({ discover: discovered });
    await expect(cacheOrLive('scam_alert_feed' as never, {} as never, deps)).rejects.toThrow(/Invariant #30/);
  });
});

describe('createHandlerDeps — M3.5 wiring sanity', () => {
  it('constructs HandlerDeps carrying pipeline + discovery (§15)', () => {
    const deps = createHandlerDeps({ databaseUrl: '' });
    expect(deps.pipeline).toBeDefined();
    expect(deps.pipeline.anthropic).toBeDefined();
    expect(deps.pipeline.cryptoResolver).toBeDefined();
    expect(typeof deps.discovery.discover).toBe('function');
    expect(deps.whitepapers).toBeDefined();
  });

  describe('E2-A — config.payTo/network resolve through CHANNEL_IDENTITY_REGISTRY, byte-identical to the pre-refactor direct env reads', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('surfaces BASE_X402_PAY_TO / X402_NETWORK unchanged when set', () => {
      vi.stubEnv('BASE_X402_PAY_TO', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      vi.stubEnv('X402_NETWORK', 'eip155:8453');
      const deps = createHandlerDeps({ databaseUrl: '' });
      expect(deps.config.payTo).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      expect(deps.config.network).toBe('eip155:8453');
    });

    it('falls back to "" for both fields when unset, same as pre-refactor', () => {
      vi.stubEnv('BASE_X402_PAY_TO', undefined);
      vi.stubEnv('X402_NETWORK', undefined);
      const deps = createHandlerDeps({ databaseUrl: '' });
      expect(deps.config.payTo).toBe('');
      expect(deps.config.network).toBe('');
    });
  });
});
