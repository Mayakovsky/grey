// AcpAdapter — ChannelIngress conformance + the ported dispatch behaviors. All against fakes; the
// SDK is never loaded. The funded-delivery test drives the REAL grey-core offeringHandlers offline
// (cache hit) — that IS the tier-1 wiring proof, also runnable via scripts/tier1-offline-smoke.ts.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { offeringHandlers } from '@grey/core';
import { AcpAdapter } from '../src/acpAdapter.js';
import type { ChannelIngress } from '@grey/core';
import type { AcpJob, OfferingHandler } from '../src/acpTypes.js';
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
