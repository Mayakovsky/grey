// M6 Phase A conformance: X402Adapter satisfies ChannelIngress and, when started, runs the SAME
// server the pre-adapter start.ts ran inline — /health→200 and a paid route→402 through a real
// bound socket. identity() surfaces the configured payTo/DID; registerOffering records the catalog
// (FDQ-66(a) boot-wrapper — it does NOT drive route mounting). The real HTTP byte-identity proof
// over the built dist lives in scripts/dist-boot-smoke.mjs.
import { describe, it, expect, afterEach } from 'vitest';
import { loadX402Config, makeX402PreHandler } from '@grey/x402-middleware';
import { X402Adapter } from '../../src/channels/x402Adapter';
import type { ChannelIngress } from '../../src/channels/ingress';
import { fakeDeps, TEST_CONFIG } from '../_helpers';

const cfg = loadX402Config({
  X402_NETWORK: 'eip155:84532',
  BASE_X402_PAY_TO: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  BASE_RPC_URL: 'http://127.0.0.1:8545',
  X402_RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
});

// Mock relayer clients — never reached on the no-payment paths (402 precedes settle).
const gate = makeX402PreHandler(cfg, {
  wallet: { writeContract: async () => ('0x' + 'ee'.repeat(32)) as `0x${string}` },
  publicClient: {
    readContract: async () => false,
    simulateContract: async () => ({ request: {} }),
    waitForTransactionReceipt: async () => ({ status: 'success' as const }),
  },
  now: () => 1_000_000_000_000,
});

function makeAdapter(): X402Adapter {
  // Port 0 → the OS assigns a free ephemeral port (no collisions across parallel tests). fakeDeps
  // has no live DB/Anthropic handles, so start/stop leave no open resources.
  return new X402Adapter({ deps: fakeDeps(), gate, port: 0, host: '127.0.0.1' });
}

let started: X402Adapter | null = null;
afterEach(async () => {
  if (started) await started.stop();
  started = null;
});

describe('X402Adapter — ChannelIngress conformance (M6 Phase A)', () => {
  it('satisfies the ChannelIngress interface', () => {
    const adapter: ChannelIngress = makeAdapter();
    expect(typeof adapter.start).toBe('function');
    expect(typeof adapter.stop).toBe('function');
    expect(typeof adapter.registerOffering).toBe('function');
    expect(typeof adapter.identity).toBe('function');
  });

  it('identity() returns the configured receiving address (payTo) + DID', () => {
    const adapter = makeAdapter();
    expect(adapter.identity()).toEqual({
      receivingAddress: TEST_CONFIG.payTo,
      did: TEST_CONFIG.did,
    });
  });

  it('registerOffering records the catalog (boot-wrapper; no route change)', () => {
    const adapter = makeAdapter();
    expect(adapter.listOfferings()).toHaveLength(0);
    adapter.registerOffering({ slug: 'legitimacy_scan', priceUsd: 0.25 });
    adapter.registerOffering({ slug: 'verify_full_tech', priceUsd: 3.0 });
    expect(adapter.listOfferings()).toEqual([
      { slug: 'legitimacy_scan', priceUsd: 0.25 },
      { slug: 'verify_full_tech', priceUsd: 3.0 },
    ]);
  });

  it('start() runs the real server through the seam: /health→200 and a paid route→402', async () => {
    const adapter = makeAdapter();
    started = adapter;
    await adapter.start();
    const base = adapter.address();
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(((await health.json()) as { status: string }).status).toBe('ok');

    const paid = await fetch(`${base}/v1/offerings/legitimacy_scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token_address: '0x1111111111111111111111111111111111111111' }),
    });
    expect(paid.status).toBe(402);
    const body = (await paid.json()) as {
      x402Version: number;
      accepts: { scheme: string; network: string; maxAmountRequired: string; payTo: string }[];
    };
    expect(body.x402Version).toBe(1);
    expect(body.accepts[0].scheme).toBe('exact');
    expect(body.accepts[0].network).toBe('eip155:84532');
    expect(body.accepts[0].maxAmountRequired).toBe('250000');
    expect(body.accepts[0].payTo).toBe(cfg.payTo);
  });

  it('stop() releases the socket; double-start is rejected', async () => {
    const adapter = makeAdapter();
    started = adapter;
    await adapter.start();
    await expect(adapter.start()).rejects.toThrow(/already started/);
    await adapter.stop();
    expect(adapter.address()).toBeNull();
    // idempotent stop
    await expect(adapter.stop()).resolves.toBeUndefined();
    started = null;
  });
});
