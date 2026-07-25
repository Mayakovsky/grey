// M6 FDQ-73 — ReputationReconciler sweep tests. Deterministic: injected clock, a fake tracked
// repo, an injected job-status fetcher. Covers the terminal discrimination (expired→stiff;
// rejected/completed→resolve no stiff; still-live→untouched), idempotency, fail-soft, and (via the
// Pg repo over a capturing pool) the new SELECT's grant compliance.
import { describe, it, expect } from 'vitest';
import { ReputationReconciler, toTerminal } from '../src/reputation/reputationReconciler.js';
import { BuyerReputationGateImpl, type BuyerGatingConfig } from '../src/reputation/buyerReputationGate.js';
import {
  PgTrackedJobsRepo,
  type BuyerRecord,
  type BuyerRecordStore,
  type ExpiredSubmittedRow,
  type PoolLike,
  type StiffWrite,
  type TrackSubmittedInput,
  type TrackedJobsRepo,
  type TrackedTerminalStatus,
} from '../src/reputation/reputationDb.js';
import type { JobTerminalStatus } from '../src/acpTypes.js';
import { silentLogger } from '../src/logger.js';

const BUYER = '0xb94182dd57798c30596f6a858802010fea0be0e1';
const NOW = new Date('2026-07-25T18:00:00.000Z');
const PAST = new Date('2026-07-25T17:00:00.000Z'); // expires_at in the past
const FUTURE = new Date('2026-07-25T19:00:00.000Z'); // not yet expired

const SHADOW: BuyerGatingConfig = { blockEnabled: false, timeout1hSec: 3600, timeout12hSec: 43200, crossProviderCacheTtlSec: 3600 };

interface Row {
  chainId: number;
  jobId: string;
  buyerAddress: string;
  status: string;
  expiresAt: Date;
}

/** Fake tracked repo with expires-aware listExpiredSubmitted + the resolveIfSubmitted guard. */
class FakeTracked implements TrackedJobsRepo {
  rows = new Map<string, Row>();
  throwOnList = false;
  seed(r: Row): void {
    this.rows.set(`${r.chainId}:${r.jobId}`, r);
  }
  async trackSubmitted(i: TrackSubmittedInput): Promise<void> {
    this.seed({ chainId: i.chainId, jobId: i.jobId, buyerAddress: i.buyerAddress, status: 'submitted', expiresAt: i.expiresAt });
  }
  async resolveIfSubmitted(chainId: number, jobId: string, terminal: TrackedTerminalStatus): Promise<{ buyerAddress: string } | null> {
    const r = this.rows.get(`${chainId}:${jobId}`);
    if (!r || r.status !== 'submitted') return null;
    r.status = terminal;
    return { buyerAddress: r.buyerAddress };
  }
  async listExpiredSubmitted(nowIso: string, limit: number): Promise<ExpiredSubmittedRow[]> {
    if (this.throwOnList) throw new Error('list failed');
    const now = new Date(nowIso).getTime();
    return [...this.rows.values()]
      .filter((r) => r.status === 'submitted' && r.expiresAt.getTime() < now)
      .slice(0, limit)
      .map((r) => ({ chainId: r.chainId, jobId: r.jobId, buyerAddress: r.buyerAddress }));
  }
}

/** Minimal in-memory buyer store (for the end-to-end stiff assertion via a real gate). */
class MemBuyerStore implements BuyerRecordStore {
  recs = new Map<string, BuyerRecord>();
  async get(w: string): Promise<BuyerRecord | null> {
    return this.recs.get(w) ?? null;
  }
  async insertStubIfAbsent(): Promise<void> {}
  async writeStiff(w: string, sw: StiffWrite): Promise<void> {
    const cur = this.recs.get(w) ?? { walletAddress: w, status: 'clean', strikes: 0, timeoutUntil: null, lastStiffAt: null, crossProviderCompletesTotal: 0, crossProviderCreatesTotal: 0, crossProviderDataCachedAt: null };
    this.recs.set(w, { ...cur, status: sw.status, strikes: sw.strikes, timeoutUntil: sw.timeoutUntil, lastStiffAt: sw.lastStiffAt });
  }
  async writeCrossProvider(): Promise<void> {}
}

/** A status fetcher from a jobId→status map (undefined status → the fetcher throws for that job). */
function fetcher(map: Record<string, string | null>, throwFor: string[] = []) {
  return async (_chainId: number, jobId: string): Promise<string | null> => {
    if (throwFor.includes(jobId)) throw new Error('getJob failed');
    return map[jobId] ?? null;
  };
}

function makeReconciler(tracked: TrackedJobsRepo, onTerminal: (j: string, c: number, t: JobTerminalStatus) => Promise<void>) {
  return new ReputationReconciler({ trackedRepo: tracked, onTerminal, logger: silentLogger(), clock: () => NOW });
}

describe('ReputationReconciler — toTerminal discrimination', () => {
  it('maps only genuine terminals; still-live/unknown → null', () => {
    expect(toTerminal('expired')).toBe('expired');
    expect(toTerminal('COMPLETED')).toBe('completed');
    expect(toTerminal('Rejected')).toBe('rejected');
    expect(toTerminal('funded')).toBeNull();
    expect(toTerminal('open')).toBeNull();
    expect(toTerminal(null)).toBeNull();
  });
});

describe('ReputationReconciler — sweep', () => {
  it('expired-submitted + on-chain EXPIRED → one stiff (clean→warned), row resolved expired', async () => {
    const tracked = new FakeTracked();
    tracked.seed({ chainId: 8453, jobId: '1', buyerAddress: BUYER, status: 'submitted', expiresAt: PAST });
    const buyerStore = new MemBuyerStore();
    const gate = new BuyerReputationGateImpl({ buyerStore, trackedRepo: tracked, gating: SHADOW, logger: silentLogger(), clock: () => NOW });
    const rec = makeReconciler(tracked, (j, c, t) => gate.onJobTerminal(j, c, t));

    await rec.sweep(fetcher({ '1': 'expired' }));

    expect(tracked.rows.get('8453:1')?.status).toBe('expired');
    const buyer = await buyerStore.get(BUYER);
    expect(buyer?.status).toBe('warned');
    expect(buyer?.strikes).toBe(1);
  });

  it('expired-submitted + on-chain REJECTED → resolved rejected, NO stiff', async () => {
    const tracked = new FakeTracked();
    tracked.seed({ chainId: 8453, jobId: '2', buyerAddress: BUYER, status: 'submitted', expiresAt: PAST });
    const calls: TrackedTerminalStatus[] = [];
    const rec = makeReconciler(tracked, async (_j, _c, t) => {
      calls.push(t);
      await tracked.resolveIfSubmitted(8453, '2', t as TrackedTerminalStatus);
    });
    await rec.sweep(fetcher({ '2': 'rejected' }));
    expect(calls).toEqual(['rejected']);
    expect(tracked.rows.get('8453:2')?.status).toBe('rejected');
  });

  it('expired-submitted + on-chain COMPLETED → resolved completed, NO stiff', async () => {
    const tracked = new FakeTracked();
    tracked.seed({ chainId: 8453, jobId: '3', buyerAddress: BUYER, status: 'submitted', expiresAt: PAST });
    const calls: TrackedTerminalStatus[] = [];
    const rec = makeReconciler(tracked, async (_j, _c, t) => {
      calls.push(t);
      await tracked.resolveIfSubmitted(8453, '3', t as TrackedTerminalStatus);
    });
    await rec.sweep(fetcher({ '3': 'completed' }));
    expect(calls).toEqual(['completed']);
    expect(tracked.rows.get('8453:3')?.status).toBe('completed');
  });

  it('past-SLA but on-chain STILL FUNDED → untouched (still submitted), retried next tick', async () => {
    const tracked = new FakeTracked();
    tracked.seed({ chainId: 8453, jobId: '4', buyerAddress: BUYER, status: 'submitted', expiresAt: PAST });
    let onTerminalCalls = 0;
    const rec = makeReconciler(tracked, async () => {
      onTerminalCalls++;
    });
    await rec.sweep(fetcher({ '4': 'funded' }));
    expect(onTerminalCalls).toBe(0);
    expect(tracked.rows.get('8453:4')?.status).toBe('submitted');
  });

  it('not-yet-expired submitted row is never swept (expires_at in the future)', async () => {
    const tracked = new FakeTracked();
    tracked.seed({ chainId: 8453, jobId: '5', buyerAddress: BUYER, status: 'submitted', expiresAt: FUTURE });
    let calls = 0;
    const rec = makeReconciler(tracked, async () => {
      calls++;
    });
    await rec.sweep(fetcher({ '5': 'expired' })); // even if it were expired on-chain, listExpiredSubmitted excludes it
    expect(calls).toBe(0);
  });

  it('idempotent: two sweeps of the same expired row → one stiff (second finds no submitted row)', async () => {
    const tracked = new FakeTracked();
    tracked.seed({ chainId: 8453, jobId: '6', buyerAddress: BUYER, status: 'submitted', expiresAt: PAST });
    const buyerStore = new MemBuyerStore();
    const gate = new BuyerReputationGateImpl({ buyerStore, trackedRepo: tracked, gating: SHADOW, logger: silentLogger(), clock: () => NOW });
    const rec = makeReconciler(tracked, (j, c, t) => gate.onJobTerminal(j, c, t));
    await rec.sweep(fetcher({ '6': 'expired' }));
    await rec.sweep(fetcher({ '6': 'expired' }));
    expect((await buyerStore.get(BUYER))?.status).toBe('warned');
    expect((await buyerStore.get(BUYER))?.strikes).toBe(1); // not 2
  });

  it('fail-soft: listExpiredSubmitted throws → tick skipped, no throw, onTerminal untouched', async () => {
    const tracked = new FakeTracked();
    tracked.throwOnList = true;
    let calls = 0;
    const rec = makeReconciler(tracked, async () => {
      calls++;
    });
    await expect(rec.sweep(fetcher({}))).resolves.toBeUndefined();
    expect(calls).toBe(0);
  });

  it('fail-soft: a per-row getJob throw skips that row, the loop continues', async () => {
    const tracked = new FakeTracked();
    tracked.seed({ chainId: 8453, jobId: 'bad', buyerAddress: BUYER, status: 'submitted', expiresAt: PAST });
    tracked.seed({ chainId: 8453, jobId: 'good', buyerAddress: BUYER, status: 'submitted', expiresAt: PAST });
    const resolved: string[] = [];
    const rec = makeReconciler(tracked, async (j, c, t) => {
      resolved.push(j);
      await tracked.resolveIfSubmitted(c, j, t as TrackedTerminalStatus);
    });
    await rec.sweep(fetcher({ good: 'expired' }, ['bad']));
    expect(resolved).toEqual(['good']); // 'bad' threw, 'good' still processed
    expect(tracked.rows.get('8453:bad')?.status).toBe('submitted');
    expect(tracked.rows.get('8453:good')?.status).toBe('expired');
  });
});

describe('ReputationReconciler — listExpiredSubmitted grant compliance', () => {
  class CapturePool implements PoolLike {
    calls: Array<{ text: string; params?: ReadonlyArray<unknown> }> = [];
    async query(text: string, params?: ReadonlyArray<unknown>): Promise<{ rows: Array<Record<string, unknown>> }> {
      this.calls.push({ text, params });
      return { rows: [] };
    }
  }
  it('the new sweep source is a bounded SELECT — no DELETE/TRUNCATE, LIMIT-bound', async () => {
    const pool = new CapturePool();
    const repo = new PgTrackedJobsRepo(pool);
    await repo.listExpiredSubmitted(NOW.toISOString(), 100);
    const sql = pool.calls[0]?.text ?? '';
    expect(sql.trimStart()).toMatch(/^SELECT\b/i);
    expect(sql).toMatch(/status = 'submitted' AND expires_at < \$1/);
    expect(sql).toMatch(/LIMIT \$2/);
    expect(sql).not.toMatch(/\b(DELETE|TRUNCATE|UPDATE|INSERT)\b/i);
  });
});
