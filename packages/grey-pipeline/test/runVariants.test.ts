// grey-pipeline — M3.5 tier-bounded variants + dedupe-on-address decision (Phase A, spec §6.2).
// Pure dedupe logic (chooseWhitepaperUpsert / filterSameVersionFamily) is unit-tested directly;
// runL1 / runL1L2 are exercised against an in-memory db (empty selects → create path) + a stub
// cryptoResolver; generateClaimExtraction is tested as a pure builder.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runL1,
  runL1L2,
  runFullPipeline,
  chooseWhitepaperUpsert,
  filterSameVersionFamily,
} from '../src/pipeline';
import { ReportGenerator } from '../src/synthesis/reportGenerator';
import type { PipelineDeps } from '../src/deps';
import type { GreyDb } from '../src/persistence/client';
import * as schema from '../src/persistence/schema';
import { createLogger } from '../src/logger';
import { Verdict } from '@grey/schemas';
import { mockClient, tracker, emptyAnalysis, fixtureWhitepaper, makeClaims, fakeCryptoResolver } from './_helpers';

// In-memory db: selects resolve to [] (no existing rows → create path); inserts echo a row with an
// id and capture per-table rows; updates/deletes are no-ops.
function memDb(): { db: GreyDb; rows: Record<string, Record<string, unknown>[]> } {
  const rows: Record<string, Record<string, unknown>[]> = { whitepapers: [], verifications: [], claims: [] };
  const tableName = (t: unknown): string =>
    t === schema.whitepapers ? 'whitepapers' : t === schema.verifications ? 'verifications' : t === schema.claims ? 'claims' : 'other';
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'orderBy']) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown[]) => unknown) => resolve([]);
  let n = 0;
  const db = {
    select: () => chain,
    insert(t: unknown) {
      const name = tableName(t);
      return {
        values(data: Record<string, unknown>) {
          const row = { id: `${name}-${++n}`, ...data };
          (rows[name] ??= []).push(row);
          return { returning: async () => [row] };
        },
      };
    },
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    delete: () => ({ where: async () => undefined }),
  };
  return { db: db as unknown as GreyDb, rows };
}

const RICH = 'Abstract. This protocol defines consensus, tokenomics, and a validator set. '.repeat(40);

describe('chooseWhitepaperUpsert (dedupe decision)', () => {
  it('reuse-by-count: existing has >= claims than the new result → reuse', () => {
    const d = chooseWhitepaperUpsert([{ id: 'a', projectName: 'Aave', claimCount: 5 }], 3, 'Aave');
    expect(d).toEqual({ action: 'reuse', id: 'a' });
  });

  it('replace-by-count + name-preserve: new is richer → create, preserving the canonical name, deleting the stale row', () => {
    const d = chooseWhitepaperUpsert([{ id: 'a', projectName: 'Aave', claimCount: 2 }], 5, 'Aave Token');
    expect(d).toEqual({ action: 'create', canonicalName: 'Aave', deleteIds: ['a'] });
  });

  it('no existing candidate → create with the requested name, nothing to delete', () => {
    const d = chooseWhitepaperUpsert([], 4, 'Uniswap');
    expect(d).toEqual({ action: 'create', canonicalName: 'Uniswap', deleteIds: [] });
  });

  it('only 0-claim candidates → create fresh, cleaning up all stale rows', () => {
    const d = chooseWhitepaperUpsert(
      [{ id: 'a', projectName: 'X', claimCount: 0 }, { id: 'b', projectName: 'X', claimCount: 0 }],
      3,
      'X',
    );
    expect(d).toEqual({ action: 'create', canonicalName: 'X', deleteIds: ['a', 'b'] });
  });

  it('addr-vs-name: the first candidate WITH claims wins (name-path priority order)', () => {
    // name-path row (id 'name') listed first but 0 claims; address-path row 'addr' has claims →
    // addr wins reuse since it's the first WITH claims.
    const d = chooseWhitepaperUpsert(
      [{ id: 'name', projectName: 'Aave', claimCount: 0 }, { id: 'addr', projectName: 'Aave', claimCount: 4 }],
      2,
      'Aave',
    );
    expect(d).toEqual({ action: 'reuse', id: 'addr' });
  });
});

describe('filterSameVersionFamily', () => {
  it('keeps only rows whose version matches the requested name (version-family)', () => {
    const rows = [
      { id: '1', projectName: 'Aave V2' },
      { id: '2', projectName: 'Aave V3' },
      { id: '3', projectName: 'Aave' },
    ];
    const kept = filterSameVersionFamily(rows, 'Aave V3');
    expect(kept.map((r) => r.id)).toEqual(['2']);
    // versionless request keeps only versionless rows
    expect(filterSameVersionFamily(rows, 'Aave').map((r) => r.id)).toEqual(['3']);
  });
});

describe('runL1 (legitimacy_scan, L1-only)', () => {
  it('returns a LegitimacyScanReport and persists an L1-only verification (create path)', async () => {
    const { db, rows } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    const report = await runL1({ projectName: 'Aave', tokenAddress: '0xabc', documentUrl: 'https://x/wp.pdf' }, d, { builder: 'legitimacy' });
    expect(report.projectName).toBe('Aave');
    expect(report.tokenAddress).toBe('0xabc');
    expect(['PASS', 'CONDITIONAL', 'FAIL', 'INSUFFICIENT_DATA']).toContain(report.verdict);
    expect(report.claimCount).toBe(0);
    expect(rows.verifications).toHaveLength(1);
    expect(rows.verifications[0].triggerSource).toBe('acp_live_l1');
  });

  it('thin content → INSUFFICIENT_DATA verdict', async () => {
    const { db } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver('too short') };
    const report = await runL1({ projectName: 'Tiny', documentUrl: 'https://x/y' }, d, { builder: 'legitimacy' });
    expect(report.verdict).toBe(Verdict.INSUFFICIENT_DATA);
  });

  it('violation-keyword project name is NOT persisted (tmp record, no verification row)', async () => {
    const { db, rows } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    const report = await runL1({ projectName: 'obvious scam token', documentUrl: 'https://x/y' }, d, { builder: 'legitimacy' });
    expect(report.projectName).toBe('obvious scam token');
    expect(rows.whitepapers).toHaveLength(0);
    expect(rows.verifications).toHaveLength(0);
  });
});

describe('runL1L2 (claim_extraction, L1+L2)', () => {
  it('returns a ClaimExtractionReport with extracted claims (no verification row persisted)', async () => {
    const { db, rows } = memDb();
    const toolInput = {
      claims: [
        { category: 'TOKENOMICS', claimText: 'fixed supply of 1M', statedEvidence: 'sec 3', mathematicalProofPresent: false, sourceSection: 'Tokenomics', regulatoryRelevance: false },
        { category: 'CONSENSUS', claimText: 'BFT finality', statedEvidence: 'sec 4', mathematicalProofPresent: true, sourceSection: 'Consensus', regulatoryRelevance: false },
      ],
    };
    const d: PipelineDeps = { anthropic: mockClient(toolInput), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    const report = await runL1L2({ projectName: 'Aave', tokenAddress: '0xabc', documentUrl: 'https://x/wp.pdf' }, d, { builder: 'claim_extraction' });
    expect(report.whitepaper.projectName).toBe('Aave');
    expect(report.tokenAddress).toBe('0xabc');
    expect(report.claims).toHaveLength(2);
    expect(report.claims[0]).toHaveProperty('claimId');
    expect(report.claims[0]).toHaveProperty('mathematicalProofPresent');
    expect(typeof report.structuralAnalysis.structuralScore).toBe('number');
    // claim_extraction seeds whitepaper + claims but NOT a verification row
    expect(rows.whitepapers).toHaveLength(1);
    expect(rows.verifications).toHaveLength(0);
  });
});

describe('runL1 — §16 internal project-name resolution', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves the name via tokenAddress (DexScreener) when none is supplied', async () => {
    const TOK = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ pairs: [{ baseToken: { address: TOK, name: 'Wonderland' } }] }) }) as unknown as Response),
    );
    const { db, rows } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    const report = await runL1({ tokenAddress: TOK, documentUrl: 'https://x/wp.pdf' }, d, { builder: 'legitimacy' });
    expect(report.projectName).toBe('Wonderland');
    expect(rows.whitepapers[0].projectName).toBe('Wonderland');
  });

  it('passes a supplied project name through (resolveTokenName NOT invoked → no fetch)', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('fetch should not be called when project_name is supplied');
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { db } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    const report = await runL1({ projectName: 'Uniswap', tokenAddress: '0xabc', documentUrl: 'https://x/y' }, d, { builder: 'legitimacy' });
    expect(report.projectName).toBe('Uniswap');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to 'Unknown' when neither name nor tokenAddress is present", async () => {
    const { db } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    const report = await runL1({ documentUrl: 'https://x/y' }, d, { builder: 'legitimacy' });
    expect(report.projectName).toBe('Unknown');
  });
});

describe('§17 runMetadata persistence (discovery provenance → metadata_json)', () => {
  const meta = {
    discoveryStatus: 'primary',
    discoverySourceTier: '2',
    discoveryAttempts: [{ tier: 2, status: 'primary' }],
  };

  it('runL1 persists runMetadata onto the whitepaper metadata_json', async () => {
    const { db, rows } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    await runL1({ projectName: 'Aave', tokenAddress: '0xabc', documentUrl: 'https://x/y' }, d, { builder: 'legitimacy' }, meta as never);
    expect(rows.whitepapers[0].metadataJson).toEqual({ discovery: meta });
  });

  it('runL1L2 persists runMetadata onto the whitepaper metadata_json', async () => {
    const { db, rows } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    await runL1L2({ projectName: 'Aave', tokenAddress: '0xabc', documentUrl: 'https://x/y' }, d, { builder: 'claim_extraction' }, meta as never);
    expect(rows.whitepapers[0].metadataJson).toEqual({ discovery: meta });
  });

  it('runFullPipeline persists runMetadata; omitting it persists no discovery key', async () => {
    const { db, rows } = memDb();
    const d: PipelineDeps = { anthropic: mockClient({}), db, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    await runFullPipeline({ projectName: 'Aave', tokenAddress: '0xabc', documentUrl: 'https://x/y' }, d, { builder: 'full' }, meta as never);
    expect(rows.whitepapers[0].metadataJson).toEqual({ discovery: meta });

    const { db: db2, rows: rows2 } = memDb();
    const d2: PipelineDeps = { anthropic: mockClient({}), db: db2, cost: tracker(), logger: createLogger(), cryptoResolver: fakeCryptoResolver(RICH) };
    await runFullPipeline({ projectName: 'Aave', tokenAddress: '0xabc', documentUrl: 'https://x/y' }, d2, { builder: 'full' });
    expect(rows2.whitepapers[0].metadataJson).toEqual({});
  });
});

describe('ReportGenerator.generateClaimExtraction', () => {
  const gen = new ReportGenerator();

  it('maps ExtractedClaim fields and whitepaper/structural metadata into the deliverable', () => {
    const out = gen.generateClaimExtraction(fixtureWhitepaper, emptyAnalysis(), 3, 1.5, makeClaims(2), '0xABC');
    expect(out.whitepaper).toEqual({
      id: fixtureWhitepaper.id,
      projectName: fixtureWhitepaper.projectName,
      tokenAddress: fixtureWhitepaper.tokenAddress,
      documentUrl: fixtureWhitepaper.documentUrl,
      pageCount: fixtureWhitepaper.pageCount,
    });
    expect(out.structuralAnalysis.structuralScore).toBe(3);
    expect(out.structuralAnalysis.hypeTechRatio).toBe(1.5);
    expect(out.claims).toHaveLength(2);
    expect(out.claims[0]).toEqual({
      claimId: 'claim-1',
      category: 'TOKENOMICS',
      claimText: 'claim 1',
      statedEvidence: '',
      sourceSection: '',
      mathematicalProofPresent: false,
      regulatoryRelevance: false,
    });
    expect(out.tokenAddress).toBe('0xABC');
  });

  it('handles an empty claim set', () => {
    const out = gen.generateClaimExtraction(fixtureWhitepaper, emptyAnalysis(), 0, 0, [], null);
    expect(out.claims).toEqual([]);
    expect(out.tokenAddress).toBeNull();
  });
});
