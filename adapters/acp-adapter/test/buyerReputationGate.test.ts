// M6 C′ — BuyerReputationGate (shadow reputation gate) tests. Two layers:
//  • gate logic against in-memory stores (state machine, shadow-never-blocks, fail-open),
//  • the raw-SQL data layer against a capturing mock pool (FDQ-65 grant compliance: no DELETE/TRUNCATE).
// Plus an adapter-level check that the earning path is unaffected with the gate wired.
import { describe, it, expect } from 'vitest';
import { offeringHandlers } from '@grey/core';
import { AcpAdapter } from '../src/acpAdapter.js';
import { BuyerReputationGateImpl, type BuyerGatingConfig } from '../src/reputation/buyerReputationGate.js';
import {
  PgBuyerRecordStore,
  PgTrackedJobsRepo,
  type BuyerRecord,
  type BuyerRecordStore,
  type CrossProviderWrite,
  type PoolLike,
  type StiffWrite,
  type TrackSubmittedInput,
  type TrackedJobsRepo,
  type TrackedTerminalStatus,
} from '../src/reputation/reputationDb.js';
import { silentLogger } from '../src/logger.js';
import type { AcpJobInfo, OfferingHandler } from '../src/acpTypes.js';
import { FakeSession, FakeAgent, fakeSdk, cachedDeps, testConfig, requirementEntry, systemEntry } from './_fakes.js';

const TOKEN = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';
const BUYER = '0xb94182dd57798c30596f6a858802010fea0be0e1';
const PROVIDER = '0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f';

const SHADOW: BuyerGatingConfig = {
  blockEnabled: false,
  timeout1hSec: 3600,
  timeout12hSec: 43200,
  crossProviderCacheTtlSec: 3600,
};
const ENFORCING: BuyerGatingConfig = { ...SHADOW, blockEnabled: true };

function emptyRec(w: string): BuyerRecord {
  return {
    walletAddress: w,
    status: 'clean',
    strikes: 0,
    timeoutUntil: null,
    lastStiffAt: null,
    crossProviderCompletesTotal: 0,
    crossProviderCreatesTotal: 0,
    crossProviderDataCachedAt: null,
  };
}
function jobInfo(over: Partial<AcpJobInfo> = {}): AcpJobInfo {
  return {
    jobId: '1',
    chainId: 8453,
    phase: 'created',
    buyerAddress: BUYER,
    providerAddress: PROVIDER,
    offeringName: 'legitimacy_scan',
    ...over,
  };
}

/** In-memory buyer store — records every write; can simulate a DB failure. */
class MemBuyerStore implements BuyerRecordStore {
  recs = new Map<string, BuyerRecord>();
  getCalls = 0;
  throwOnGet = false;
  stiffWrites: Array<{ wallet: string; w: StiffWrite }> = [];
  crossWrites: Array<{ wallet: string; w: CrossProviderWrite }> = [];
  stubs: string[] = [];
  async get(w: string): Promise<BuyerRecord | null> {
    this.getCalls++;
    if (this.throwOnGet) throw new Error('db down');
    return this.recs.get(w) ?? null;
  }
  async insertStubIfAbsent(w: string): Promise<void> {
    this.stubs.push(w);
    if (!this.recs.has(w)) this.recs.set(w, emptyRec(w));
  }
  async writeStiff(w: string, sw: StiffWrite): Promise<void> {
    this.stiffWrites.push({ wallet: w, w: sw });
    const cur = this.recs.get(w) ?? emptyRec(w);
    this.recs.set(w, { ...cur, status: sw.status, strikes: sw.strikes, timeoutUntil: sw.timeoutUntil, lastStiffAt: sw.lastStiffAt });
  }
  async writeCrossProvider(w: string, cw: CrossProviderWrite): Promise<void> {
    this.crossWrites.push({ wallet: w, w: cw });
    const cur = this.recs.get(w) ?? emptyRec(w);
    this.recs.set(w, { ...cur, crossProviderCompletesTotal: cw.completesTotal, crossProviderCreatesTotal: cw.createsTotal, crossProviderDataCachedAt: cw.cachedAt });
  }
}

/** In-memory tracked-jobs repo with the resolveIfSubmitted idempotency semantics. */
class MemTracked implements TrackedJobsRepo {
  jobs = new Map<string, { status: string; buyerAddress: string }>();
  tracked: TrackSubmittedInput[] = [];
  async trackSubmitted(i: TrackSubmittedInput): Promise<void> {
    this.tracked.push(i);
    const k = `${i.chainId}:${i.jobId}`;
    if (!this.jobs.has(k)) this.jobs.set(k, { status: 'submitted', buyerAddress: i.buyerAddress });
  }
  async resolveIfSubmitted(chainId: number, jobId: string, terminal: TrackedTerminalStatus): Promise<{ buyerAddress: string } | null> {
    const j = this.jobs.get(`${chainId}:${jobId}`);
    if (!j || j.status !== 'submitted') return null; // second observer / never tracked
    j.status = terminal;
    return { buyerAddress: j.buyerAddress };
  }
}

function makeGate(store: MemBuyerStore, tracked: MemTracked, gating: BuyerGatingConfig, clock?: () => Date): BuyerReputationGateImpl {
  return new BuyerReputationGateImpl({ buyerStore: store, trackedRepo: tracked, gating, logger: silentLogger(), clock });
}

describe('BuyerReputationGate — shadow-mode acceptance', () => {
  it('shadow never blocks: a seeded BLOCKED buyer still gets accept:true (flag=false)', async () => {
    const store = new MemBuyerStore();
    store.recs.set(BUYER, { ...emptyRec(BUYER), status: 'blocked', strikes: 4 });
    const gate = makeGate(store, new MemTracked(), SHADOW);
    const d = await gate.evaluateAcceptance(jobInfo());
    expect(d.accept).toBe(true);
  });

  it('shadow never blocks: a buyer in ACTIVE timeout still gets accept:true (flag=false)', async () => {
    const store = new MemBuyerStore();
    store.recs.set(BUYER, { ...emptyRec(BUYER), status: 'timeout_1h', strikes: 2, timeoutUntil: new Date(Date.now() + 3_600_000) });
    const gate = makeGate(store, new MemTracked(), SHADOW);
    expect((await gate.evaluateAcceptance(jobInfo())).accept).toBe(true);
  });

  it('fail-open on empty tables: unknown buyer → clean → accept:true (+ reads buyer_records)', async () => {
    const store = new MemBuyerStore();
    const gate = makeGate(store, new MemTracked(), SHADOW);
    const d = await gate.evaluateAcceptance(jobInfo());
    expect(d.accept).toBe(true);
    expect(store.getCalls).toBe(1); // it DID read buyer_records
  });

  it('fail-open on DB error: buyer lookup throws → accept:true (never blocks earning)', async () => {
    const store = new MemBuyerStore();
    store.throwOnGet = true;
    const gate = makeGate(store, new MemTracked(), SHADOW);
    expect((await gate.evaluateAcceptance(jobInfo())).accept).toBe(true);
  });

  it('ENFORCING (post-flip) blocks a blocked buyer — proves shadow is the only suppressor', async () => {
    const store = new MemBuyerStore();
    store.recs.set(BUYER, { ...emptyRec(BUYER), status: 'blocked', strikes: 4 });
    const gate = makeGate(store, new MemTracked(), ENFORCING);
    const d = await gate.evaluateAcceptance(jobInfo());
    expect(d.accept).toBe(false);
    expect(d.rejectReasonStructured?.['reason']).toBe('buyer_blocked');
  });
});

describe('BuyerReputationGate — records fully in shadow', () => {
  it('onJobSubmitted writes tracked_jobs; onJobTerminal(expired) resolves + advances buyer clean→warned', async () => {
    const store = new MemBuyerStore();
    const tracked = new MemTracked();
    const gate = makeGate(store, tracked, SHADOW);

    await gate.onJobSubmitted('70350', 8453, BUYER, 'legitimacy_scan', new Date(), new Date(Date.now() + 300_000));
    expect(tracked.tracked).toHaveLength(1);
    expect(tracked.jobs.get('8453:70350')?.status).toBe('submitted');

    await gate.onJobTerminal('70350', 8453, 'expired');
    expect(tracked.jobs.get('8453:70350')?.status).toBe('expired'); // resolved via UPDATE
    const rec = await store.get(BUYER);
    expect(rec?.status).toBe('warned'); // stiff transition applied
    expect(rec?.strikes).toBe(1);
    expect(store.stiffWrites).toHaveLength(1); // via writeStiff (UPDATE/upsert), not delete-reinsert
  });

  it('onJobTerminal(completed) resolves with NO stiff (protocol used correctly)', async () => {
    const store = new MemBuyerStore();
    const tracked = new MemTracked();
    const gate = makeGate(store, tracked, SHADOW);
    await gate.onJobSubmitted('1', 8453, BUYER, 'legitimacy_scan', new Date(), new Date());
    await gate.onJobTerminal('1', 8453, 'completed');
    expect(store.stiffWrites).toHaveLength(0);
    expect(tracked.jobs.get('8453:1')?.status).toBe('completed');
  });

  it('onJobTerminal is idempotent: a second observer (socket+poll race) applies no second stiff', async () => {
    const store = new MemBuyerStore();
    const tracked = new MemTracked();
    const gate = makeGate(store, tracked, SHADOW);
    await gate.onJobSubmitted('1', 8453, BUYER, 'legitimacy_scan', new Date(), new Date());
    await gate.onJobTerminal('1', 8453, 'expired');
    await gate.onJobTerminal('1', 8453, 'expired'); // second observer → resolveIfSubmitted returns null
    expect(store.stiffWrites).toHaveLength(1);
  });

  it('full ladder over four stiffs: clean→warned→timeout_1h→timeout_12h→blocked', async () => {
    const store = new MemBuyerStore();
    const tracked = new MemTracked();
    const gate = makeGate(store, tracked, SHADOW);
    const ladder = ['warned', 'timeout_1h', 'timeout_12h', 'blocked'];
    for (let i = 0; i < 4; i++) {
      const jid = `job${i}`;
      await gate.onJobSubmitted(jid, 8453, BUYER, 'legitimacy_scan', new Date(), new Date());
      await gate.onJobTerminal(jid, 8453, 'expired');
      expect((await store.get(BUYER))?.status).toBe(ladder[i]);
    }
    expect((await store.get(BUYER))?.strikes).toBe(4);
  });
});

describe('BuyerReputationGate — data layer (FDQ-65 grant compliance)', () => {
  class CapturePool implements PoolLike {
    calls: Array<{ text: string; params?: ReadonlyArray<unknown> }> = [];
    rows: Array<Record<string, unknown>> = [];
    async query(text: string, params?: ReadonlyArray<unknown>): Promise<{ rows: Array<Record<string, unknown>> }> {
      this.calls.push({ text, params });
      return { rows: this.rows };
    }
  }

  it('every statement is SELECT/INSERT/UPDATE — never DELETE or TRUNCATE', async () => {
    const pool = new CapturePool();
    pool.rows = [{ buyer_address: BUYER }]; // for resolveIfSubmitted's RETURNING
    const bs = new PgBuyerRecordStore(pool);
    const tr = new PgTrackedJobsRepo(pool);
    await bs.get(BUYER);
    await bs.insertStubIfAbsent(BUYER);
    await bs.writeStiff(BUYER, { status: 'warned', strikes: 1, timeoutUntil: null, lastStiffAt: new Date() });
    await bs.writeCrossProvider(BUYER, { completesTotal: 1, createsTotal: 2, cachedAt: new Date() });
    await tr.trackSubmitted({ chainId: 8453, jobId: '1', buyerAddress: BUYER, providerOffering: 'legitimacy_scan', submittedAt: new Date(), expiresAt: new Date() });
    await tr.resolveIfSubmitted(8453, '1', 'expired');

    expect(pool.calls).toHaveLength(6);
    for (const c of pool.calls) {
      expect(c.text.trimStart()).toMatch(/^(SELECT|INSERT|UPDATE)\b/i);
      expect(c.text).not.toMatch(/\b(DELETE|TRUNCATE)\b/i);
    }
    // Both grey_two tables only.
    for (const c of pool.calls) expect(c.text).toMatch(/grey_two\.(buyer_records|tracked_jobs)/);
  });

  it('a status transition is an UPDATE (INSERT … ON CONFLICT DO UPDATE), not delete-reinsert', async () => {
    const pool = new CapturePool();
    const bs = new PgBuyerRecordStore(pool);
    await bs.writeStiff(BUYER, { status: 'warned', strikes: 1, timeoutUntil: null, lastStiffAt: new Date() });
    const sql = pool.calls[0]?.text ?? '';
    expect(sql).toMatch(/ON CONFLICT \(wallet_address\) DO UPDATE/i);
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  it('resolveIfSubmitted guards on status=submitted (idempotent UPDATE) and returns null when no row', async () => {
    const pool = new CapturePool();
    pool.rows = []; // no row updated (already resolved)
    const tr = new PgTrackedJobsRepo(pool);
    const res = await tr.resolveIfSubmitted(8453, '1', 'expired');
    expect(res).toBeNull();
    expect(pool.calls[0]?.text).toMatch(/status = 'submitted'/);
  });
});

describe('BuyerReputationGate — earning path unaffected when wired', () => {
  it('a normal job accepts (setBudget) + submits with the shadow gate injected, and records', async () => {
    const store = new MemBuyerStore();
    const tracked = new MemTracked();
    const gate = makeGate(store, tracked, SHADOW);
    const adapter = new AcpAdapter({
      config: testConfig({}),
      sdk: fakeSdk(new FakeAgent()),
      deps: cachedDeps(TOKEN),
      handlers: offeringHandlers as unknown as Record<string, OfferingHandler>,
      logger: silentLogger(),
      reputationGate: gate,
    });
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    const session = new FakeSession({
      jobId: '70350',
      job: { description: 'legitimacy_scan', clientAddress: BUYER, status: 'funded', expiredAt: 4102444800 },
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    // created → accept (gate evaluated, shadow-accept)
    await adapter.handleEntry(session, systemEntry('job.created'));
    expect(session.budgets).toHaveLength(1);
    expect(store.getCalls).toBeGreaterThan(0); // gate read buyer_records on accept
    // funded → deliver (gate records the submitted job)
    await adapter.handleEntry(session, systemEntry('job.funded'));
    expect(session.submitted).toHaveLength(1);
    expect(tracked.tracked).toHaveLength(1); // onJobSubmitted recorded in shadow
    expect(tracked.tracked[0]?.buyerAddress).toBe(BUYER);
  });
});
