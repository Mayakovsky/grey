// E1-C: the $0.10 trust rung is BUILT BUT BLOCKED (Forces ruling B-1, Invariant #34) — these tests
// assert it's actually unreachable by default, on both surfaces this channel exposes it through
// (the offering route itself, and the discovery/capability listing), and that flipping the
// explicit opt-in makes it correctly reachable (proving the block is a real gate, not dead code).
import { describe, it, expect } from 'vitest';
import {
  makeTrustRungPreHandler,
  makeTrustRungPaymentPresenceCheck,
  loadX402Config,
} from '@grey/x402-middleware';
import { makeApp, passThroughX402Gate } from './_helpers';

const cfg = loadX402Config({
  X402_NETWORK: 'eip155:84532',
  BASE_X402_PAY_TO: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  BASE_RPC_URL: 'http://127.0.0.1:8545',
  X402_RELAYER_PRIVATE_KEY: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
});
// CDP/Bazaar alignment Phase 1 revision: the gate is two hooks — see offerings.ts's header
// comment. The new preValidation half + the unchanged preHandler half.
const trustRungGate = {
  preValidation: makeTrustRungPaymentPresenceCheck(cfg),
  preHandler: makeTrustRungPreHandler(cfg, {
    wallet: { writeContract: async () => ('0x' + 'ee'.repeat(32)) as `0x${string}` },
    publicClient: {
      readContract: async () => false,
      simulateContract: async () => ({ request: {} }),
      waitForTransactionReceipt: async () => ({ status: 'success' as const }),
    },
  }),
};

describe('trust rung — unreachable by default (E1-C, Invariant #34, B-1)', () => {
  it('POST /v1/offerings/legitimacy_scan_trust_rung 404s — the route does not exist', async () => {
    const app = makeApp(); // default opts: trustRungEnabled undefined -> false
    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan_trust_rung',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('is absent from GET /v1/discovery/services', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/v1/discovery/services' });
    const body = res.json() as { services: Array<{ slug: string }> };
    expect(body.services.map((s) => s.slug)).not.toContain('legitimacy_scan_trust_rung');
    expect(body.services).toHaveLength(9); // 11 built offerings minus the 2 not-yet-offered (merge-prep); e3-b2 adds 2
  });

  it('its own discovery/capability detail page also 404s while disabled', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/discovery/services/legitimacy_scan_trust_rung',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('trust rung — correctly reachable when explicitly enabled (proves the block is real)', () => {
  it('POST without payment returns 402 with the $0.10 price, not 404 — route genuinely mounted', async () => {
    const app = makeApp({}, passThroughX402Gate, {
      trustRungEnabled: true,
      trustRungGate,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan_trust_rung',
      payload: { token_address: '0x1111111111111111111111111111111111111111' },
    });
    expect(res.statusCode).toBe(402);
    const body = res.json();
    expect(body.accepts[0].maxAmountRequired).toBe('100000');
  });

  it('CDP/Bazaar alignment Phase 1: an empty body with no payment still gets a 402, not a 400 (same fix as the normal 7 routes)', async () => {
    const app = makeApp({}, passThroughX402Gate, {
      trustRungEnabled: true,
      trustRungGate,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/offerings/legitimacy_scan_trust_rung',
      payload: {},
    });
    expect(res.statusCode, JSON.stringify(res.json())).toBe(402);
    const body = res.json();
    expect(body.accepts[0].maxAmountRequired).toBe('100000');
  });

  it('is listed in discovery once enabled', async () => {
    const app = makeApp({}, passThroughX402Gate, {
      trustRungEnabled: true,
      trustRungGate,
    });
    const res = await app.inject({ method: 'GET', url: '/v1/discovery/services' });
    const body = res.json() as { services: Array<{ slug: string }> };
    expect(body.services.map((s) => s.slug)).toContain('legitimacy_scan_trust_rung');
    expect(body.services).toHaveLength(10); // 9 enabled + the trust rung, still minus the 2 not-yet-offered
  });

  it('buildServer throws if trustRungEnabled is true without a trustRungGate (fail closed on misconfiguration)', async () => {
    const { buildServer } = await import('../src/server');
    const { fakeDeps } = await import('./_helpers');
    expect(() => buildServer(fakeDeps(), passThroughX402Gate, { trustRungEnabled: true })).toThrow(
      /trustRungGate/,
    );
  });
});
