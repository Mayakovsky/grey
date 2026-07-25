// M6 Phase C — TIER 1 offline handler smoke (free, zero chain, zero creds, no SDK). Drives a
// synthetic FUNDED entry through the adapter's real dispatch path → NL parse → the SHARED grey-core
// offeringHandlers['legitimacy_scan'] (resolved offline as a cache HIT via minimal fake deps) →
// the {type:'object', value} deliverable envelope. Proves wiring/parser/handler/envelope with no
// chain, no wallet, no registration. Mirrors test/acpAdapter.test.ts's tier-1 case; runnable by hand.
//
// Usage: pnpm -F @grey/acp-adapter tier1-smoke
import process from 'node:process';
import { offeringHandlers } from '@grey/core';
import type { HandlerDeps } from '@grey/core';
import { AcpAdapter } from '../src/acpAdapter.js';
import { silentLogger } from '../src/logger.js';
import type {
  AcpJob,
  AcpJobSession,
  AcpRoomEntry,
  AcpSdkBundle,
  OfferingHandler,
} from '../src/acpTypes.js';

const TOKEN = '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984'; // UNI
const TS = new Date('2026-06-14T00:00:00.000Z');

class RecordingSession implements AcpJobSession {
  jobId = 'tier1-1';
  chainId = 8453;
  roles = ['provider'] as const;
  entries: AcpRoomEntry[] = [
    { kind: 'message', contentType: 'requirement', content: JSON.stringify({ token_address: TOKEN }) },
  ];
  job: AcpJob = { description: 'legitimacy_scan', clientAddress: '0xbuyer', status: 'funded', expiredAt: 4102444800 };
  submitted: string[] = [];
  messages: string[] = [];
  async fetchJob(): Promise<AcpJob> {
    return this.job;
  }
  async setBudget(): Promise<void> {}
  async submit(d: string): Promise<void> {
    this.submitted.push(d);
  }
  async sendMessage(c: string): Promise<void> {
    this.messages.push(c);
  }
  async reject(): Promise<void> {}
}

const throwingSdk: AcpSdkBundle = {
  createAgent: async () => {
    throw new Error('tier-1 must not touch the SDK');
  },
  assetUsdc: () => {
    throw new Error('tier-1 must not touch the SDK');
  },
  newSession: () => {
    throw new Error('tier-1 must not touch the SDK');
  },
};

function cachedDeps(): HandlerDeps {
  const wp = { id: 'wp-1', projectName: 'Uniswap', tokenAddress: TOKEN } as unknown;
  const v = {
    structuralScore: 4,
    verdict: 'PASS',
    hypeTechRatio: 1.2,
    totalClaims: 2,
    structuralAnalysisJson: { mica: { claimsMicaCompliance: 'NO', micaCompliant: 'YES', micaSummary: 'ok' } },
    verifiedAt: TS,
  } as unknown;
  return {
    whitepapers: {
      findByTokenAddress: async (a: string) => (a.toLowerCase() === TOKEN ? [wp] : []),
      findByProjectName: async () => [],
      findById: async () => wp,
    },
    verifications: { findByWhitepaperId: async () => v },
    claims: { findByWhitepaperId: async () => [] },
    clock: () => TS,
    config: {
      version: '0.0.0',
      did: 'did:erc8004:8453:58618',
      name: 'Whitepaper Grey',
      runtime: 'acp-adapter-tier1',
      payTo: '0x0000000000000000000000000000000000000000',
      network: 'eip155:8453',
    },
  } as unknown as HandlerDeps;
}

function fail(msg: string): never {
  console.error(`[tier1-smoke] FAIL: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const adapter = new AcpAdapter({
    config: {
      agentWalletAddress: '0xa9667116b4f4e9f1bae85f93a21b4b8ea45de98f',
      privyWalletId: 'x',
      privySignerKey: 'x',
      databaseUrl: 'postgres://x',
      observeOnly: false,
      pollIntervalMs: 30_000,
      buyerGating: { blockEnabled: false, timeout1hSec: 3600, timeout12hSec: 43200, crossProviderCacheTtlSec: 3600 },
    },
    sdk: throwingSdk,
    deps: cachedDeps(),
    handlers: offeringHandlers as unknown as Record<string, OfferingHandler>,
    logger: silentLogger(),
  });

  const session = new RecordingSession();
  // Synthetic FUNDED entry — the same shape the SSE/poll paths deliver.
  await adapter.handleEntry(session, { kind: 'system', event: { type: 'job.funded' } });

  if (session.submitted.length !== 1) fail(`expected exactly 1 submit, got ${session.submitted.length}`);
  const d = JSON.parse(session.submitted[0]) as { type: string; value: Record<string, unknown> };
  if (d.type !== 'object') fail(`deliverable.type !== "object" (${d.type})`);
  if (d.value.verdict !== 'PASS') fail(`expected cache-hit verdict PASS, got ${String(d.value.verdict)}`);
  if (d.value.tokenAddress !== TOKEN) fail(`tokenAddress mismatch: ${String(d.value.tokenAddress)}`);
  if (session.messages.length !== 2) fail(`expected the 2-part nudge, got ${session.messages.length}`);

  console.log('[tier1-smoke] synthetic job.funded → parse → shared legitimacy_scan handler → deliverable:');
  console.log(
    `[tier1-smoke]   {type:${d.type}, value:{verdict:${String(d.value.verdict)}, projectName:${String(d.value.projectName)}, ` +
      `tokenAddress:${String(d.value.tokenAddress)}, structuralScore:${String(d.value.structuralScore)}}}`,
  );
  console.log('[tier1-smoke] PASS — offline wiring proven: no chain, no wallet, no SDK.');
  process.exit(0);
}

main().catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
