// Test doubles for the ACP adapter — a fake JobSession/agent/SDK bundle (no real SDK loaded) and a
// minimal cached HandlerDeps so the REAL grey-core offeringHandlers resolve offline (cache hit).
import type {
  AcpJob,
  AcpJobSession,
  AcpRoomEntry,
  AcpAgentLike,
  AcpJobRef,
  AcpSdkBundle,
} from '../src/acpTypes.js';
import type { HandlerDeps } from '@grey/core';

/** A recording fake session — captures every signing side effect. */
export class FakeSession implements AcpJobSession {
  jobId: string;
  chainId: number;
  roles: readonly string[] = ['provider'];
  entries: AcpRoomEntry[];
  job: AcpJob | null;

  budgets: unknown[] = [];
  submitted: string[] = [];
  rejected: string[] = [];
  messages: Array<{ content: string; contentType: string }> = [];
  fetchJobCalls = 0;

  constructor(opts: { jobId: string; chainId?: number; job: AcpJob | null; entries?: AcpRoomEntry[] }) {
    this.jobId = opts.jobId;
    this.chainId = opts.chainId ?? 8453;
    this.job = opts.job;
    this.entries = opts.entries ?? [];
  }

  async fetchJob(): Promise<AcpJob> {
    this.fetchJobCalls++;
    if (!this.job) throw new Error('FakeSession: no job');
    return this.job;
  }
  async setBudget(b: unknown): Promise<void> {
    this.budgets.push(b);
  }
  async submit(d: string): Promise<void> {
    this.submitted.push(d);
  }
  async sendMessage(content: string, contentType: string): Promise<void> {
    this.messages.push({ content, contentType });
  }
  async reject(reason: string): Promise<void> {
    this.rejected.push(reason);
  }

  /** Convenience: the single submitted deliverable, parsed. */
  deliverable(): { type: string; value: Record<string, unknown> } {
    if (this.submitted.length !== 1) throw new Error(`expected 1 submit, got ${this.submitted.length}`);
    return JSON.parse(this.submitted[0]) as { type: string; value: Record<string, unknown> };
  }
}

/** A requirement room entry carrying a JSON requirement. */
export function requirementEntry(requirement: Record<string, unknown>): AcpRoomEntry {
  return { kind: 'message', contentType: 'requirement', content: JSON.stringify(requirement) };
}

/** A system lifecycle entry. */
export function systemEntry(type: string): AcpRoomEntry {
  return { kind: 'system', event: { type } };
}

/** A configurable fake agent for start()/poll tests. */
export class FakeAgent implements AcpAgentLike {
  started = false;
  stopped = false;
  onEntry: ((s: AcpJobSession, e: AcpRoomEntry) => void) | null = null;
  activeJobs: AcpJobRef[] = [];
  jobsById = new Map<string, AcpJob>();
  sessions = new Map<string, AcpJobSession>();
  historyByJob = new Map<string, AcpRoomEntry[]>();

  on(_event: 'entry', cb: (s: AcpJobSession, e: AcpRoomEntry) => void): void {
    this.onEntry = cb;
  }
  async start(): Promise<void> {
    this.started = true;
  }
  async stop(): Promise<void> {
    this.stopped = true;
  }
  getSession(chainId: number, jobId: string): AcpJobSession | null | undefined {
    return this.sessions.get(`${chainId}:${jobId}`);
  }
  getTransport(): { getHistory(chainId: number, jobId: string): Promise<AcpRoomEntry[]> } {
    return {
      getHistory: async (chainId, jobId) => this.historyByJob.get(`${chainId}:${jobId}`) ?? [],
    };
  }
  getApi(): {
    getActiveJobs(): Promise<AcpJobRef[]>;
    getJob(chainId: number, jobId: string): Promise<AcpJob | null>;
  } {
    return {
      getActiveJobs: async () => this.activeJobs,
      getJob: async (_chainId, jobId) => this.jobsById.get(jobId) ?? null,
    };
  }
  async getAddress(): Promise<string> {
    return '0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f';
  }
}

/** A fake SDK bundle over a fake agent. assetUsdc returns a recognizable opaque token. */
export function fakeSdk(agent: AcpAgentLike, newSession?: AcpSdkBundle['newSession']): AcpSdkBundle {
  return {
    createAgent: async (_config, onEntry) => {
      (agent as FakeAgent).onEntry = onEntry;
      return agent;
    },
    assetUsdc: (amount, chainId) => ({ __usdc: amount, chainId }),
    newSession:
      newSession ??
      ((_agent, _addr, jobId, chainId) => new FakeSession({ jobId, chainId, job: null })),
  };
}

/** An SDK bundle whose ops throw — asserts a code path never touches the SDK. */
export const throwingSdk: AcpSdkBundle = {
  createAgent: async () => {
    throw new Error('SDK.createAgent should not be called');
  },
  assetUsdc: () => {
    throw new Error('SDK.assetUsdc should not be called');
  },
  newSession: () => {
    throw new Error('SDK.newSession should not be called');
  },
};

const TS = new Date('2026-06-14T00:00:00.000Z');

/** Minimal cached HandlerDeps so the REAL legitimacy_scan resolves a cache HIT offline. */
export function cachedDeps(token: string): HandlerDeps {
  const wp = {
    id: 'wp-1',
    projectName: 'Uniswap',
    tokenAddress: token,
  } as unknown;
  const v = {
    structuralScore: 4,
    verdict: 'PASS',
    hypeTechRatio: 1.2,
    totalClaims: 2,
    verifiedClaims: 2,
    confidenceScore: 82,
    structuralAnalysisJson: { mica: { claimsMicaCompliance: 'NO', micaCompliant: 'YES', micaSummary: 'ok' } },
    verifiedAt: TS,
  } as unknown;
  const deps = {
    whitepapers: {
      findByTokenAddress: async (a: string) => (a.toLowerCase() === token.toLowerCase() ? [wp] : []),
      findByProjectName: async () => [],
      findById: async () => wp,
    },
    verifications: {
      findByWhitepaperId: async () => v,
    },
    claims: { findByWhitepaperId: async () => [] },
    clock: () => TS,
    config: {
      version: '0.0.0-test',
      did: 'did:erc8004:8453:58618',
      name: 'Whitepaper Grey',
      runtime: 'acp-adapter-test',
      payTo: '0x0000000000000000000000000000000000000000',
      network: 'eip155:8453',
    },
  };
  return deps as unknown as HandlerDeps;
}

/** Standard test config. */
export function testConfig(over: Record<string, unknown> = {}): import('../src/config.js').AcpAdapterConfig {
  return {
    agentWalletAddress: '0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f',
    privyWalletId: 'wallet-id',
    privySignerKey: '0xsigner',
    databaseUrl: 'postgres://x',
    observeOnly: false,
    pollIntervalMs: 30_000,
    ...over,
  };
}
