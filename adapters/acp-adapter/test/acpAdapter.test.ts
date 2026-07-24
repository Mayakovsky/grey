// AcpAdapter — ChannelIngress conformance + the ported dispatch behaviors. All against fakes; the
// SDK is never loaded. The funded-delivery test drives the REAL grey-core offeringHandlers offline
// (cache hit) — that IS the tier-1 wiring proof, also runnable via scripts/tier1-offline-smoke.ts.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { offeringHandlers } from '@grey/core';
import { AcpAdapter } from '../src/acpAdapter.js';
import type { ChannelIngress } from '@grey/core';
import type { AcpJob, AcpRoomEntry, OfferingHandler } from '../src/acpTypes.js';
import {
  FakeSession,
  FakeAgent,
  fakeSdk,
  throwingSdk,
  cachedDeps,
  testConfig,
  requirementEntry,
  systemEntry,
} from './_fakes.js';
import { silentLogger } from '../src/logger.js';

const TOKEN = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984';

function fundedJob(over: Partial<AcpJob> = {}): AcpJob {
  return {
    description: 'legitimacy_scan',
    clientAddress: '0xbuyer0000000000000000000000000000000001',
    status: 'funded',
    expiredAt: 4102444800, // 2100-01-01 (far future, unix seconds)
    ...over,
  };
}

function makeAdapter(opts: {
  observeOnly?: boolean;
  handlers?: Record<string, OfferingHandler>;
  pollIntervalMs?: number;
  agent?: FakeAgent;
}) {
  const agent = opts.agent ?? new FakeAgent();
  const adapter = new AcpAdapter({
    config: testConfig({ observeOnly: opts.observeOnly ?? false, pollIntervalMs: opts.pollIntervalMs ?? 30_000 }),
    sdk: opts.agent || opts.pollIntervalMs ? fakeSdk(agent) : throwingSdk,
    deps: cachedDeps(TOKEN),
    handlers: opts.handlers ?? (offeringHandlers as unknown as Record<string, OfferingHandler>),
    logger: silentLogger(),
  });
  return { adapter, agent };
}

let running: AcpAdapter | null = null;
afterEach(async () => {
  if (running) await running.stop();
  running = null;
  vi.useRealTimers();
});

describe('AcpAdapter — ChannelIngress conformance', () => {
  it('satisfies the interface + identity() returns 0xa966… receiving address and the DID', () => {
    const { adapter } = makeAdapter({});
    const ci: ChannelIngress = adapter;
    expect(typeof ci.start).toBe('function');
    expect(typeof ci.stop).toBe('function');
    expect(adapter.identity()).toEqual({
      receivingAddress: '0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f',
      did: 'did:erc8004:8453:58618',
    });
  });

  it('registerOffering records the catalog (observability)', () => {
    const { adapter } = makeAdapter({});
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    adapter.registerOffering({ slug: 'verify_full_tech', priceUsd: 3 });
    expect(adapter.listOfferings()).toEqual([
      { slug: 'legitimacy_scan', priceUsd: 0.25 },
      { slug: 'verify_full_tech', priceUsd: 3 },
    ]);
  });

  it('start() creates + starts the agent through the injected SDK; stop() stops it', async () => {
    const agent = new FakeAgent();
    const { adapter } = makeAdapter({ agent });
    running = adapter;
    await adapter.start();
    expect(agent.started).toBe(true);
    expect(agent.onEntry).toBeTypeOf('function');
    await expect(adapter.start()).rejects.toThrow(/already started/);
    await adapter.stop();
    expect(agent.stopped).toBe(true);
    running = null;
  });
});

describe('AcpAdapter — accept + delivery', () => {
  it('job.created → parses requirement + accepts via setBudget at the registered price', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    const session = new FakeSession({
      jobId: '1',
      job: fundedJob({ status: 'created' }),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    await adapter.handleEntry(session, systemEntry('job.created'));
    expect(session.budgets).toEqual([{ __usdc: 0.25, chainId: 8453 }]);
    expect(session.rejected).toHaveLength(0);
  });

  it('job.created with an unparseable requirement → rejects pre-acceptance', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    const session = new FakeSession({
      jobId: '2',
      job: fundedJob({ status: 'created' }),
      entries: [requirementEntry({ note: 'no address' })],
    });
    await adapter.handleEntry(session, systemEntry('job.created'));
    expect(session.budgets).toHaveLength(0);
    expect(session.rejected).toHaveLength(1);
  });

  it('job.funded → runs the REAL shared handler + submits the {type:object,value} deliverable (tier-1)', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    const session = new FakeSession({
      jobId: '3',
      job: fundedJob(),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    await adapter.handleEntry(session, systemEntry('job.funded'));
    const d = session.deliverable();
    expect(d.type).toBe('object');
    // The cache-hit legitimacy payload from grey-core's shared handler.
    expect(d.value.verdict).toBe('PASS');
    expect(d.value.tokenAddress).toBe(TOKEN);
    expect(d.value.projectName).toBe('Uniswap');
    // Post-submit nudge fired (best-effort, two messages).
    expect(session.messages.map((m) => m.contentType)).toEqual(['text', 'structured']);
  });

  it('once funded, a handler throw still delivers an INSUFFICIENT_DATA envelope (never rejects)', async () => {
    const handlers = {
      legitimacy_scan: (async () => {
        throw new Error('boom');
      }) as unknown as OfferingHandler,
    };
    const { adapter } = makeAdapter({ handlers, agent: new FakeAgent() });
    const session = new FakeSession({
      jobId: '4',
      job: fundedJob(),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    await adapter.handleEntry(session, systemEntry('job.funded'));
    const d = session.deliverable();
    expect(d.value.verdict).toBe('INSUFFICIENT_DATA');
    expect(d.value.error).toBe('boom');
    expect(session.rejected).toHaveLength(0);
  });

  it('claimDispatch dedups a repeated job.funded (delivers exactly once)', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    const session = new FakeSession({
      jobId: '5',
      job: fundedJob(),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    await adapter.handleEntry(session, systemEntry('job.funded'));
    await adapter.handleEntry(session, systemEntry('job.funded'));
    expect(session.submitted).toHaveLength(1);
  });

  it('pre-submit re-check skips delivery when the job is no longer FUNDED', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    const session = new FakeSession({
      jobId: '6',
      job: fundedJob({ status: 'completed' }),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    await adapter.handleEntry(session, systemEntry('job.funded'));
    expect(session.submitted).toHaveLength(0);
  });
});

describe('AcpAdapter — FDQ-70b setBudget idempotency (accept race)', () => {
  // `job.created` and `requirement.message` are DISTINCT eventTypes that both trigger the accept
  // path. Fired concurrently (SSE double-fire, or hydration re-firing a created-phase job at
  // startup) they must still produce EXACTLY ONE setBudget. Deterministic: both handlers run to
  // their first `await` synchronously, so the second observes the synchronous accept claim — no
  // timers, no ordering luck.
  it('concurrent job.created + requirement.message → exactly one setBudget', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    const session = new FakeSession({
      jobId: 'race-1',
      job: fundedJob({ status: 'created' }),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    const p1 = adapter.handleEntry(session, systemEntry('job.created'));
    const p2 = adapter.handleEntry(session, requirementEntry({ token_address: TOKEN }));
    await Promise.all([p1, p2]);
    expect(session.budgets).toEqual([{ __usdc: 0.25, chainId: 8453 }]);
    expect(session.rejected).toHaveLength(0);
  });

  it('hydration-at-startup re-firing the accept pair via agent.on(entry) accepts exactly once', async () => {
    const agent = new FakeAgent();
    const { adapter } = makeAdapter({ agent });
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    running = adapter;
    await adapter.start(); // installs the real onEntry callback hydrateSessions() would fire
    const session = new FakeSession({
      jobId: 'hydra-1',
      job: fundedJob({ status: 'created' }),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    // hydrateSessions fires 'entry' (fire-and-forget) on the pre-existing created-phase job.
    agent.onEntry!(session, systemEntry('job.created'));
    agent.onEntry!(session, requirementEntry({ token_address: TOKEN }));
    await new Promise((r) => setTimeout(r, 0)); // drain the fire-and-forget handler chains
    expect(session.budgets).toHaveLength(1);
    running = null;
    await adapter.stop();
  });

  it('a fresh accept event AFTER a decided job does not re-budget (sequential + __decided)', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    const session = new FakeSession({
      jobId: 'seq-1',
      job: fundedJob({ status: 'created' }),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    await adapter.handleEntry(session, systemEntry('job.created'));
    await adapter.handleEntry(session, requirementEntry({ token_address: TOKEN }));
    expect(session.budgets).toHaveLength(1);
  });

  // Evidence that submit needs NO new guard: it is already claimed synchronously by claimDispatch
  // (recentJobs['jobId:job.funded'] + inFlight, both set before any await) and re-checked against a
  // fresh FUNDED status. Concurrent SSE + poll job.funded therefore delivers exactly once.
  it('concurrent job.funded (SSE + poll) → exactly one submit (submit already single-path)', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    const session = new FakeSession({
      jobId: 'fund-1',
      job: fundedJob(),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    const p1 = adapter.handleEntry(session, systemEntry('job.funded'));
    const p2 = adapter.handleEntry(session, systemEntry('job.funded'));
    await Promise.all([p1, p2]);
    expect(session.submitted).toHaveLength(1);
  });

  // Origin-independence of the ACCEPT guard. handleEntry is the SOLE entry to the accept path
  // (setBudget @acpAdapter.ts:312 ← handleJobCreated:214 ← handleEntry, behind claimAccept), and the
  // poll backstop routes THROUGH handleEntry too (dispatchPolledJob:551). Here a poll-SHAPED synthetic
  // system entry (identical shape to dispatchPolledJob:544-549) carrying an accept-triggering
  // job.created races an SSE requirement.message — a DISTINCT eventType that claimDispatch does NOT
  // dedup, so only claimAccept stands between them. (In production poll emits job.funded only, so it
  // cannot originate an accept; this proves the guard holds for that origin regardless.)
  it('accept guard is origin-independent: poll-shaped job.created + SSE requirement.message → one setBudget', async () => {
    const { adapter } = makeAdapter({ agent: new FakeAgent() });
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    const session = new FakeSession({
      jobId: 'xorigin-1',
      job: fundedJob({ status: 'created' }),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    const pollShaped: AcpRoomEntry = {
      kind: 'system',
      onChainJobId: 'xorigin-1',
      chainId: 8453,
      event: { type: 'job.created', jobId: 'xorigin-1' },
      timestamp: 0,
    };
    const p1 = adapter.handleEntry(session, pollShaped);
    const p2 = adapter.handleEntry(session, requirementEntry({ token_address: TOKEN }));
    await Promise.all([p1, p2]);
    expect(session.budgets).toHaveLength(1);
  });

  // The genuinely-reachable multi-path race: the REAL poll timer dispatching the same funded job the
  // SSE callback just fired. Both go through handleEntry → claimDispatch's synchronous job.funded
  // claim admits exactly one. This is the #70220-class "SSE racing poll" proof on the path poll
  // actually exercises.
  it('cross-origin funded race: SSE job.funded + REAL poll dispatch (same job) → exactly one submit', async () => {
    vi.useFakeTimers();
    const agent = new FakeAgent();
    const ourAddr = '0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f';
    agent.activeJobs = [{ chainId: 8453, onChainJobId: 'multi-1' }];
    agent.jobsById.set('multi-1', {
      description: 'legitimacy_scan',
      clientAddress: '0xbuyer',
      providerAddress: ourAddr,
      status: 'funded',
      ...({ jobStatus: 'funded' } as object),
    } as AcpJob);
    const session = new FakeSession({
      jobId: 'multi-1',
      job: fundedJob(),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    agent.sessions.set('8453:multi-1', session); // the session the poll's dispatchPolledJob will reuse

    const { adapter } = makeAdapter({ agent, pollIntervalMs: 1000 });
    running = adapter;
    await adapter.start(); // installs the SSE onEntry callback + starts the poll
    // SSE fires first (fire-and-forget, claims the synchronous job.funded slot before any await);
    // the poll tick then dispatches the SAME job through handleEntry and is deduped.
    agent.onEntry!(session, systemEntry('job.funded'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(session.submitted).toHaveLength(1);
    running = null;
    await adapter.stop();
  });
});

describe('AcpAdapter — OBSERVE_ONLY (FDQ-63 safety)', () => {
  it('job.created in observe-only signs NOTHING (no setBudget, no reject)', async () => {
    const { adapter } = makeAdapter({ observeOnly: true, agent: new FakeAgent() });
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    const session = new FakeSession({
      jobId: '7',
      job: fundedJob({ status: 'created' }),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    await adapter.handleEntry(session, systemEntry('job.created'));
    expect(session.budgets).toHaveLength(0);
    expect(session.rejected).toHaveLength(0);
    expect(session.submitted).toHaveLength(0);
    expect(session.messages).toHaveLength(0);
    // It DID read the job for observation (read-only, no signing).
    expect(session.fetchJobCalls).toBeGreaterThan(0);
  });

  it('job.funded in observe-only submits NOTHING (suppression covers the delivery path)', async () => {
    const { adapter } = makeAdapter({ observeOnly: true, agent: new FakeAgent() });
    const session = new FakeSession({
      jobId: '8',
      job: fundedJob(),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    await adapter.handleEntry(session, systemEntry('job.funded'));
    expect(session.submitted).toHaveLength(0);
    expect(session.messages).toHaveLength(0);
  });
});

describe('AcpAdapter — poll backstop', () => {
  it('a FUNDED job for our wallet, seen only by the poll, is dispatched + delivered', async () => {
    vi.useFakeTimers();
    const agent = new FakeAgent();
    const ourAddr = '0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f';
    agent.activeJobs = [{ chainId: 8453, onChainJobId: '99' }];
    agent.jobsById.set('99', {
      description: 'legitimacy_scan',
      clientAddress: '0xbuyer',
      providerAddress: ourAddr,
      status: 'funded',
      ...({ jobStatus: 'funded' } as object),
    } as AcpJob);
    const polledSession = new FakeSession({
      jobId: '99',
      job: fundedJob(),
      entries: [requirementEntry({ token_address: TOKEN })],
    });
    agent.sessions.set('8453:99', polledSession);

    const { adapter } = makeAdapter({ agent, pollIntervalMs: 1000 });
    running = adapter;
    await adapter.start();
    await vi.advanceTimersByTimeAsync(1000);

    expect(polledSession.submitted).toHaveLength(1);
    expect(polledSession.deliverable().value.verdict).toBe('PASS');
  });
});
